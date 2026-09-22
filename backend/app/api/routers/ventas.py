"""Módulo Ventas: POS, pedidos, promociones y pago mixto. Descuenta inventario."""
import json
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.tenancy import get_tenant_db, require_scope, get_current_user, CurrentUser
from app.models.tenant_models import Sale, SaleItem, SalePayment, Customer, Promotion
from app.services.inventory import move_stock

router = APIRouter(prefix="/api/ventas", tags=["ventas"])


def _ensure_sale_seq(db: Session):
    """Idempotent: create sale_seq + sale_no column."""
    db.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname=current_schema() AND sequencename='sale_seq') THEN
                CREATE SEQUENCE sale_seq START 1;
            END IF;
        END $$;
    """))
    db.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema=current_schema() AND table_name='sales' AND column_name='sale_no') THEN
                ALTER TABLE sales ADD COLUMN sale_no VARCHAR(20);
            END IF;
        END $$;
    """))
    db.execute(text("""
        UPDATE sales SET sale_no = 'FV-' || LPAD(id::text, 6, '0')
        WHERE sale_no IS NULL OR sale_no = '' OR sale_no NOT LIKE 'FV-%';
    """))
    db.commit()


# ============ CLIENTES ============
class CustomerIn(BaseModel):
    name: str
    tax_id: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    identification: str | None = None
    birthday: str | None = None


def _ensure_customer_cols(db: Session):
    db.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema=current_schema() AND table_name='customers' AND column_name='identification') THEN
                ALTER TABLE customers ADD COLUMN identification VARCHAR(40);
            END IF;
        END $$;
    """))
    db.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema=current_schema() AND table_name='customers' AND column_name='birthday') THEN
                ALTER TABLE customers ADD COLUMN birthday VARCHAR(10);
            END IF;
        END $$;
    """))
    db.commit()


@router.get("/clientes")
def list_customers(db: Session = Depends(get_tenant_db), _=Depends(require_scope("sales:read"))):
    _ensure_customer_cols(db)
    rows = db.execute(text("""
        SELECT id, name, tax_id, email, phone, address, identification, birthday, created_at
        FROM customers ORDER BY name
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.post("/clientes")
def create_customer(data: CustomerIn, db: Session = Depends(get_tenant_db),
                    _=Depends(require_scope("sales:write"))):
    _ensure_customer_cols(db)
    row = db.execute(text("""
        INSERT INTO customers (name, tax_id, email, phone, address, identification, birthday)
        VALUES (:name, :tax_id, :email, :phone, :address, :identification, :birthday)
        RETURNING id, name
    """), data.model_dump()).mappings().first()
    db.commit()
    return {"id": row["id"], "name": row["name"]}


# ============ PROMOCIONES ============
class PromotionIn(BaseModel):
    name: str
    type: str            # percentage | fixed | 2x1 | bundle
    value: float | None = None
    scope: str = "all"   # all | category | product | variant
    scope_ref_id: int | None = None
    starts_at: str | None = None
    ends_at: str | None = None


@router.get("/promociones")
def list_promotions(db: Session = Depends(get_tenant_db), _=Depends(require_scope("sales:read"))):
    return db.query(Promotion).order_by(Promotion.id.desc()).all()


@router.post("/promociones")
def create_promotion(data: PromotionIn, db: Session = Depends(get_tenant_db),
                     _=Depends(require_scope("sales:write"))):
    p = Promotion(**data.model_dump())
    db.add(p); db.commit(); db.refresh(p)
    return {"id": p.id, "name": p.name}


@router.patch("/promociones/{promo_id}/toggle")
def toggle_promotion(promo_id: int, db: Session = Depends(get_tenant_db),
                     _=Depends(require_scope("sales:write"))):
    p = db.get(Promotion, promo_id)
    if not p:
        raise HTTPException(404, "Promoción no encontrada")
    p.is_active = not p.is_active
    db.commit()
    return {"id": p.id, "is_active": p.is_active}


class ItemIn(BaseModel):
    variant_id: int
    quantity: float
    unit_price: float
    discount: float = 0
    promotion_id: int | None = None


class PaymentIn(BaseModel):
    method: str   # efectivo | tarjeta_credito | tarjeta_debito | transferencia | cheque
    amount: float
    reference: str | None = None


class SaleIn(BaseModel):
    branch_id: str
    customer_id: int | None = None
    kind: str = "sale"            # sale (POS) | order (pedido)
    currency: str
    exchange_rate: float | None = None
    tax: float = 0
    items: list[ItemIn]
    payments: list[PaymentIn] = []
    client_uuid: str | None = None  # idempotencia para ventas sincronizadas desde offline
    cashier_name: str | None = None
    seller_name: str | None = None


def _ensure_sale_extra_cols(db: Session):
    for col, typ in [("cashier_name", "VARCHAR(100)"), ("seller_name", "VARCHAR(100)")]:
        db.execute(text(f"""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_schema=current_schema() AND table_name='sales' AND column_name='{col}') THEN
                    ALTER TABLE sales ADD COLUMN {col} {typ};
                END IF;
            END $$;
        """))
    db.commit()


@router.post("")
def create_sale(data: SaleIn, db: Session = Depends(get_tenant_db),
                user: CurrentUser = Depends(require_scope("sales:write"))):
    _ensure_sale_extra_cols(db)
    # Idempotencia: si ya existe una venta con este client_uuid, la devolvemos tal cual
    if data.client_uuid:
        existing = db.execute(text("SELECT id, total, status FROM sales WHERE client_uuid=:c"),
                              {"c": data.client_uuid}).mappings().first()
        if existing:
            return {"sale_id": existing["id"], "total": float(existing["total"]),
                    "status": existing["status"], "duplicate": True}

    subtotal = sum(Decimal(str(i.unit_price)) * Decimal(str(i.quantity)) for i in data.items)
    discount = sum(Decimal(str(i.discount)) for i in data.items)
    total = subtotal - discount + Decimal(str(data.tax))

    paid = sum(Decimal(str(p.amount)) for p in data.payments)
    if data.kind == "sale" and paid < total:
        raise HTTPException(400, f"Pago insuficiente: {paid} < {total}")

    # --- Datos fiscales (demo; timbrado real requiere PAC/DIAN) ---
    tenant = db.execute(text("SELECT country, fiscal_config FROM public.tenants WHERE id=:t"),
                        {"t": user.tenant_id}).mappings().first()
    country = (tenant["country"] or "").upper() if tenant else ""
    fcfg = (tenant["fiscal_config"] or {}) if tenant else {}
    serie = fcfg.get("serie") or ("FE" if country == "CO" else "A")
    folio = db.execute(text("SELECT COALESCE(MAX(fiscal_folio),0)+1 FROM sales WHERE branch_id=:b"),
                       {"b": data.branch_id}).scalar()

    sale = Sale(branch_id=data.branch_id, customer_id=data.customer_id, kind=data.kind,
                status="completed" if data.kind == "sale" else "pending",
                currency=data.currency, exchange_rate=data.exchange_rate,
                subtotal=subtotal, discount=discount, tax=Decimal(str(data.tax)),
                total=total, sold_by=user.id,
                fiscal_country=country or None, fiscal_serie=serie, fiscal_folio=folio,
                fiscal_uuid=str(uuid.uuid4()), fiscal_status="no_timbrado",
                client_uuid=data.client_uuid)
    for i in data.items:
        line = Decimal(str(i.unit_price)) * Decimal(str(i.quantity)) - Decimal(str(i.discount))
        sale.items.append(SaleItem(variant_id=i.variant_id, quantity=i.quantity,
                                   unit_price=i.unit_price, discount=i.discount,
                                   promotion_id=i.promotion_id, line_total=line))
    for p in data.payments:
        sale.payments.append(SalePayment(method=p.method, amount=p.amount, reference=p.reference))
    db.add(sale)
    db.flush()  # obtiene sale.id
    if data.cashier_name or data.seller_name:
        db.execute(text("UPDATE sales SET cashier_name=:cn, seller_name=:sn WHERE id=:id"),
                   {"cn": data.cashier_name, "sn": data.seller_name, "id": sale.id})

    # Asignar sale_no con 6 dígitos mínimo
    _ensure_sale_seq(db)
    seq = db.execute(text("SELECT nextval('sale_seq')")).scalar()
    sale_no = f"FV-{seq:06d}"
    db.execute(text("UPDATE sales SET sale_no=:no WHERE id=:id"), {"no": sale_no, "id": sale.id})

    # Descuenta inventario y escribe kardex (solo ventas POS entregadas)
    if data.kind == "sale":
        try:
            for i in data.items:
                move_stock(db, variant_id=i.variant_id, branch_id=data.branch_id,
                           quantity=-Decimal(str(i.quantity)), movement_type="salida_venta",
                           ref_type="sale", ref_id=sale.id, user_id=user.id)
        except ValueError as exc:
            db.rollback()
            raise HTTPException(400, str(exc))
    db.commit()
    db.refresh(sale)

    # Auto-posting contable
    if data.kind == "sale":
        try:
            from app.services.auto_accounting import post_sale
            cost_total = db.execute(text("""
                SELECT COALESCE(SUM(si.quantity * v.cost_price), 0)
                FROM sale_items si JOIN product_variants v ON v.id=si.variant_id
                WHERE si.sale_id=:s
            """), {"s": sale.id}).scalar() or 0
            post_sale(
                db=db, sale_id=sale.id,
                total=sale.total, subtotal=sale.subtotal,
                tax=sale.tax, discount=sale.discount,
                cost=Decimal(str(cost_total)),
                payments=[{"method": p.method, "amount": float(p.amount)} for p in sale.payments],
                currency=sale.currency, user_id=str(user.id)
            )
            db.commit()
        except Exception:
            pass

    return {"sale_id": sale.id, "sale_no": sale_no, "total": float(sale.total), "status": sale.status}


@router.get("")
def list_sales(
    kind: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    cashier_name: str | None = None,
    seller_name: str | None = None,
    db: Session = Depends(get_tenant_db),
    _=Depends(require_scope("sales:read"))
):
    _ensure_sale_extra_cols(db)
    conditions = []
    params: dict = {}
    if kind:
        conditions.append("s.kind=:kind"); params["kind"] = kind
    if date_from:
        conditions.append("s.created_at >= :date_from"); params["date_from"] = date_from
    if date_to:
        conditions.append("s.created_at < :date_to"); params["date_to"] = date_to
    if cashier_name:
        conditions.append("s.cashier_name ILIKE :cn"); params["cn"] = f"%{cashier_name}%"
    if seller_name:
        conditions.append("s.seller_name ILIKE :sn"); params["sn"] = f"%{seller_name}%"
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = db.execute(text(f"""
        SELECT s.id, s.sale_no, s.kind, s.status, s.currency, s.total,
               s.subtotal, s.discount, s.tax, s.fiscal_folio,
               s.fiscal_serie, s.created_at, s.branch_id,
               s.cashier_name, s.seller_name,
               c.name AS customer_name
        FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
        {where}
        ORDER BY s.created_at DESC LIMIT 500
    """), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{sale_id}")
def get_sale(sale_id: int, db: Session = Depends(get_tenant_db),
             _=Depends(require_scope("sales:read"))):
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(404, "Venta no encontrada")
    return {
        "id": sale.id, "kind": sale.kind, "status": sale.status,
        "currency": sale.currency, "total": float(sale.total),
        "items": [{"variant_id": i.variant_id, "quantity": float(i.quantity),
                   "unit_price": float(i.unit_price), "line_total": float(i.line_total)}
                  for i in sale.items],
        "payments": [{"method": p.method, "amount": float(p.amount)} for p in sale.payments],
    }


@router.get("/{sale_id}/comprobante")
def comprobante(sale_id: int, db: Session = Depends(get_tenant_db),
                user: CurrentUser = Depends(require_scope("sales:read"))):
    """Datos completos para imprimir el ticket/factura con formato fiscal por país."""
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(404, "Venta no encontrada")

    items = db.execute(text("""
        SELECT si.quantity, si.unit_price, si.discount, si.line_total,
               v.variant_sku, v.ean13, v.size, v.color, p.name AS product_name
        FROM sale_items si
        JOIN product_variants v ON v.id = si.variant_id
        JOIN products p ON p.id = v.product_id
        WHERE si.sale_id = :s"""), {"s": sale_id}).mappings().all()

    customer = None
    if sale.customer_id:
        customer = db.execute(text("SELECT name, tax_id, email, phone, address FROM customers WHERE id=:c"),
                              {"c": sale.customer_id}).mappings().first()

    # Datos de tenant/sucursal desde public
    tenant = db.execute(text("SELECT name, country, base_currency, fiscal_config FROM public.tenants WHERE id=:t"),
                        {"t": user.tenant_id}).mappings().first()
    branch = db.execute(text("SELECT code, name, address, default_currency FROM public.branches WHERE id=:b"),
                        {"b": sale.branch_id}).mappings().first()

    sale_no = db.execute(text("SELECT sale_no FROM sales WHERE id=:s"), {"s": sale_id}).scalar() or f"FV-{sale_id:06d}"
    return {
        "country": sale.fiscal_country,
        "serie": sale.fiscal_serie,
        "folio": sale.fiscal_folio,
        "sale_no": sale_no,
        "uuid": sale.fiscal_uuid,       # CUFE (CO) / Folio Fiscal (MX)
        "fiscal_status": sale.fiscal_status,
        "sale": {
            "id": sale.id, "sale_no": sale_no, "kind": sale.kind, "status": sale.status,
            "currency": sale.currency, "created_at": str(sale.created_at),
            "subtotal": float(sale.subtotal), "discount": float(sale.discount),
            "tax": float(sale.tax), "total": float(sale.total),
        },
        "items": [dict(r) | {"quantity": float(r["quantity"]), "unit_price": float(r["unit_price"]),
                             "discount": float(r["discount"]), "line_total": float(r["line_total"])}
                  for r in items],
        "payments": [{"method": p.method, "amount": float(p.amount), "reference": p.reference}
                     for p in sale.payments],
        "customer": dict(customer) if customer else None,
        "tenant": dict(tenant) if tenant else {},
        "branch": dict(branch) if branch else {},
    }


@router.post("/{sale_id}/entregar")
def deliver_order(sale_id: int, db: Session = Depends(get_tenant_db),
                  user: CurrentUser = Depends(require_scope("sales:write"))):
    """Entrega un pedido: descuenta inventario y escribe kardex."""
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(404, "Pedido no encontrado")
    if sale.kind != "order":
        raise HTTPException(400, "Solo aplica a pedidos")
    if sale.status == "delivered":
        raise HTTPException(400, "El pedido ya fue entregado")
    try:
        for item in sale.items:
            move_stock(db, variant_id=item.variant_id, branch_id=str(sale.branch_id),
                       quantity=-Decimal(str(item.quantity)), movement_type="salida_venta",
                       ref_type="sale", ref_id=sale.id, user_id=user.id)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))
    sale.status = "delivered"
    db.commit()

    # Auto-posting contable
    try:
        from app.services.auto_accounting import post_sale
        cost_total = db.execute(text("""
            SELECT COALESCE(SUM(si.quantity * v.cost_price), 0)
            FROM sale_items si JOIN product_variants v ON v.id=si.variant_id
            WHERE si.sale_id=:s
        """), {"s": sale.id}).scalar() or 0
        payments_list = [{"method": p.method, "amount": float(p.amount)} for p in sale.payments]
        post_sale(
            db=db, sale_id=sale.id,
            total=sale.total, subtotal=sale.subtotal,
            tax=sale.tax, discount=sale.discount,
            cost=Decimal(str(cost_total)),
            payments=payments_list,
            currency=sale.currency, user_id=str(user.id)
        )
        db.commit()
    except Exception:
        pass

    return {"sale_id": sale.id, "status": sale.status}


# ============ CAJA (APERTURA / CORTE / CIERRE) ============

def _ensure_cash_tables(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS cash_sessions (
            id BIGSERIAL PRIMARY KEY,
            branch_id UUID NOT NULL,
            opened_by UUID,
            closed_by UUID,
            profile_name VARCHAR(100),
            opening_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            closing_amount NUMERIC(18,2),
            status VARCHAR(20) NOT NULL DEFAULT 'open',
            notes TEXT,
            opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            closed_at TIMESTAMPTZ
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS cash_cuts (
            id BIGSERIAL PRIMARY KEY,
            session_id BIGINT NOT NULL,
            branch_id UUID NOT NULL,
            cut_by UUID,
            sales_count INT NOT NULL DEFAULT 0,
            sales_total NUMERIC(18,2) NOT NULL DEFAULT 0,
            cash_counted NUMERIC(18,2),
            notes TEXT,
            details JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    db.commit()


class CashOpenIn(BaseModel):
    branch_id: str
    opening_amount: float = 0
    profile_name: str | None = None
    notes: str | None = None


class CashCutIn(BaseModel):
    session_id: int
    branch_id: str
    cash_counted: float | None = None
    notes: str | None = None


class CashCloseIn(BaseModel):
    session_id: int
    branch_id: str
    closing_amount: float | None = None
    notes: str | None = None


@router.post("/caja/apertura")
def open_cash_session(data: CashOpenIn, db: Session = Depends(get_tenant_db),
                      user: CurrentUser = Depends(require_scope("sales:write"))):
    _ensure_cash_tables(db)
    existing = db.execute(text(
        "SELECT id FROM cash_sessions WHERE branch_id=CAST(:b AS UUID) AND status='open'"
    ), {"b": data.branch_id}).first()
    if existing:
        raise HTTPException(400, "Ya hay una sesión de caja abierta. Ciérrala antes de abrir una nueva.")
    row = db.execute(text("""
        INSERT INTO cash_sessions (branch_id, opened_by, opening_amount, profile_name, notes, status)
        VALUES (CAST(:b AS UUID), CAST(:u AS UUID), :a, :p, :n, 'open') RETURNING id, opened_at
    """), {"b": data.branch_id, "u": str(user.id), "a": data.opening_amount,
           "p": data.profile_name, "n": data.notes}).mappings().first()
    db.commit()
    return {"session_id": row["id"], "opened_at": str(row["opened_at"]),
            "status": "open", "opening_amount": data.opening_amount,
            "profile_name": data.profile_name}


@router.get("/caja/sesion-activa")
def get_active_session(branch_id: str, db: Session = Depends(get_tenant_db),
                       _=Depends(require_scope("sales:read"))):
    _ensure_cash_tables(db)
    row = db.execute(text("""
        SELECT id AS session_id, branch_id, opened_by, opening_amount, profile_name,
               notes, status, opened_at
        FROM cash_sessions WHERE branch_id=CAST(:b AS UUID) AND status='open'
        ORDER BY opened_at DESC LIMIT 1
    """), {"b": branch_id}).mappings().first()
    return dict(row) if row else None


@router.post("/caja/corte")
def cut_cash(data: CashCutIn, db: Session = Depends(get_tenant_db),
             user: CurrentUser = Depends(require_scope("sales:write"))):
    _ensure_cash_tables(db)
    _ensure_sale_extra_cols(db)
    session = db.execute(text(
        "SELECT opened_at FROM cash_sessions WHERE id=:s"
    ), {"s": data.session_id}).mappings().first()
    if not session:
        raise HTTPException(404, "Sesión no encontrada")
    last_cut = db.execute(text(
        "SELECT created_at FROM cash_cuts WHERE session_id=:s ORDER BY created_at DESC LIMIT 1"
    ), {"s": data.session_id}).mappings().first()
    since = last_cut["created_at"] if last_cut else session["opened_at"]

    sales_data = db.execute(text("""
        SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total
        FROM sales WHERE branch_id=CAST(:b AS UUID) AND kind='sale' AND status='completed'
        AND created_at >= :since
    """), {"b": data.branch_id, "since": since}).mappings().first()

    pay_details = db.execute(text("""
        SELECT sp.method, SUM(sp.amount) as total
        FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id
        WHERE s.branch_id=CAST(:b AS UUID) AND s.kind='sale' AND s.status='completed'
        AND s.created_at >= :since
        GROUP BY sp.method
    """), {"b": data.branch_id, "since": since}).mappings().all()
    details = {r["method"]: float(r["total"]) for r in pay_details}

    cut = db.execute(text("""
        INSERT INTO cash_cuts (session_id, branch_id, cut_by, sales_count, sales_total,
                               cash_counted, notes, details)
        VALUES (:sid, CAST(:b AS UUID), CAST(:u AS UUID), :sc, :st, :cc, :n, CAST(:d AS JSONB))
        RETURNING id, created_at
    """), {"sid": data.session_id, "b": data.branch_id, "u": str(user.id),
           "sc": int(sales_data["cnt"]), "st": float(sales_data["total"]),
           "cc": data.cash_counted, "n": data.notes,
           "d": json.dumps(details)}).mappings().first()
    db.commit()
    return {"cut_id": cut["id"], "created_at": str(cut["created_at"]),
            "sales_count": int(sales_data["cnt"]), "sales_total": float(sales_data["total"]),
            "cash_counted": data.cash_counted, "details": details}


@router.post("/caja/cierre")
def close_cash_session(data: CashCloseIn, db: Session = Depends(get_tenant_db),
                       user: CurrentUser = Depends(require_scope("sales:write"))):
    _ensure_cash_tables(db)
    session = db.execute(text(
        "SELECT id, status, opened_at, opening_amount FROM cash_sessions WHERE id=:s"
    ), {"s": data.session_id}).mappings().first()
    if not session:
        raise HTTPException(404, "Sesión no encontrada")
    if session["status"] != "open":
        raise HTTPException(400, "La sesión ya está cerrada")

    sales_data = db.execute(text("""
        SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total
        FROM sales WHERE branch_id=CAST(:b AS UUID) AND kind='sale' AND status='completed'
        AND created_at >= :since
    """), {"b": data.branch_id, "since": session["opened_at"]}).mappings().first()

    pay_details = db.execute(text("""
        SELECT sp.method, SUM(sp.amount) as total
        FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id
        WHERE s.branch_id=CAST(:b AS UUID) AND s.kind='sale' AND s.status='completed'
        AND s.created_at >= :since
        GROUP BY sp.method
    """), {"b": data.branch_id, "since": session["opened_at"]}).mappings().all()
    details = {r["method"]: float(r["total"]) for r in pay_details}

    db.execute(text("""
        UPDATE cash_sessions
        SET status='closed', closed_by=CAST(:u AS UUID), closed_at=now(),
            closing_amount=:ca, notes=:n
        WHERE id=:s
    """), {"u": str(user.id), "ca": data.closing_amount, "n": data.notes, "s": data.session_id})
    db.commit()
    return {"session_id": data.session_id, "status": "closed",
            "sales_count": int(sales_data["cnt"]), "sales_total": float(sales_data["total"]),
            "opening_amount": float(session["opening_amount"]),
            "closing_amount": data.closing_amount, "details": details}


@router.get("/caja/sesiones")
def list_cash_sessions(branch_id: str | None = None, db: Session = Depends(get_tenant_db),
                       _=Depends(require_scope("sales:read"))):
    _ensure_cash_tables(db)
    where = "WHERE cs.branch_id=CAST(:b AS UUID)" if branch_id else ""
    rows = db.execute(text(f"""
        SELECT cs.id, cs.branch_id, cs.profile_name, cs.opening_amount, cs.closing_amount,
               cs.status, cs.notes, cs.opened_at, cs.closed_at,
               COALESCE(COUNT(cc.id),0) as cut_count
        FROM cash_sessions cs
        LEFT JOIN cash_cuts cc ON cc.session_id=cs.id
        {where}
        GROUP BY cs.id ORDER BY cs.opened_at DESC LIMIT 100
    """), {"b": branch_id} if branch_id else {}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/caja/sesiones/{session_id}/cortes")
def list_session_cuts(session_id: int, db: Session = Depends(get_tenant_db),
                      _=Depends(require_scope("sales:read"))):
    _ensure_cash_tables(db)
    rows = db.execute(text("""
        SELECT id, sales_count, sales_total, cash_counted, notes, details, created_at
        FROM cash_cuts WHERE session_id=:s ORDER BY created_at
    """), {"s": session_id}).mappings().all()
    return [dict(r) for r in rows]
