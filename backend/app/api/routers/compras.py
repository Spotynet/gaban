"""Módulo Compras: proveedores, órdenes, recepción (ingresa inventario) y cuentas por pagar."""
from decimal import Decimal
import csv, io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.tenancy import get_tenant_db, require_scope, CurrentUser, get_current_user
from app.models.tenant_models import Supplier, PurchaseOrder, PurchaseOrderItem
from app.services.inventory import move_stock
from app.services.replenishment import suggest_reorders

router = APIRouter(prefix="/api/compras", tags=["compras"])


def _ensure_doc_sequences(db: Session):
    """Idempotent: create sequences + po_no column if not present."""
    db.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname=current_schema() AND sequencename='purchase_order_seq') THEN
                CREATE SEQUENCE purchase_order_seq START 1;
            END IF;
        END $$;
    """))
    db.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema=current_schema() AND table_name='purchase_orders' AND column_name='po_no') THEN
                ALTER TABLE purchase_orders ADD COLUMN po_no VARCHAR(20);
            END IF;
        END $$;
    """))
    # back-fill: draft rows get SC- prefix, confirmed rows get OC- prefix
    db.execute(text("""
        UPDATE purchase_orders SET po_no = 'SC-' || LPAD(id::text, 6, '0')
        WHERE (po_no IS NULL OR po_no = '') AND status = 'draft';
    """))
    db.execute(text("""
        UPDATE purchase_orders SET po_no = 'OC-' || LPAD(id::text, 6, '0')
        WHERE (po_no IS NULL OR po_no = '') AND status != 'draft';
    """))
    db.commit()


class SupplierIn(BaseModel):
    name: str
    fiscal_person_type: str | None = None
    fiscal_id_type: str | None = None
    tax_id: str | None = None
    tax_dv: str | None = None
    email: str | None = None
    phone: str | None = None
    mobile: str | None = None
    city: str | None = None
    address: str | None = None
    currency: str = "USD"


def _supplier_dict(s: Supplier) -> dict:
    return {
        "id":                 s.id,
        "name":               s.name,
        "fiscal_person_type": s.fiscal_person_type,
        "fiscal_id_type":     s.fiscal_id_type,
        "tax_id":             s.tax_id,
        "tax_dv":             s.tax_dv,
        "email":              s.email,
        "phone":              s.phone,
        "mobile":             s.mobile,
        "city":               s.city,
        "address":            s.address,
        "currency":           s.currency.strip() if s.currency else "USD",
        "is_active":          s.is_active,
        "created_at":         s.created_at.isoformat() if s.created_at else None,
    }


@router.post("/proveedores")
def create_supplier(data: SupplierIn, db: Session = Depends(get_tenant_db),
                    _=Depends(require_scope("purchases:write"))):
    s = Supplier(**data.model_dump())
    db.add(s); db.commit(); db.refresh(s)
    return _supplier_dict(s)


@router.get("/proveedores")
def list_suppliers(db: Session = Depends(get_tenant_db), _=Depends(require_scope("purchases:read"))):
    return [_supplier_dict(s) for s in db.query(Supplier).order_by(Supplier.id).all()]


@router.patch("/proveedores/{supplier_id}/estado")
def toggle_supplier_estado(supplier_id: int, db: Session = Depends(get_tenant_db),
                           _=Depends(require_scope("purchases:write"))):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Proveedor no encontrado")
    s.is_active = not s.is_active
    db.commit(); db.refresh(s)
    return _supplier_dict(s)


@router.patch("/proveedores/{supplier_id}")
def update_supplier(supplier_id: int, data: SupplierIn, db: Session = Depends(get_tenant_db),
                    _=Depends(require_scope("purchases:write"))):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Proveedor no encontrado")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit(); db.refresh(s)
    return _supplier_dict(s)


@router.delete("/proveedores/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_tenant_db),
                    _=Depends(require_scope("purchases:write"))):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Proveedor no encontrado")
    n_pos = db.execute(text("SELECT COUNT(*) FROM purchase_orders WHERE supplier_id=:s"), {"s": supplier_id}).scalar() or 0
    if n_pos:
        raise HTTPException(400, f"No se puede eliminar el proveedor: tiene {n_pos} orden(es) de compra registradas. Elimine primero las órdenes o márquelo como inactivo.")
    n_inv = db.execute(text("SELECT COUNT(*) FROM supplier_invoices WHERE supplier_id=:s"), {"s": supplier_id}).scalar() or 0
    if n_inv:
        raise HTTPException(400, f"No se puede eliminar el proveedor: tiene {n_inv} factura(s) de compra registradas. Elimine primero las facturas o márquelo como inactivo.")
    db.delete(s); db.commit()
    return {"ok": True}


@router.get("/ordenes")
def list_pos(db: Session = Depends(get_tenant_db), _=Depends(require_scope("purchases:read"))):
    _ensure_doc_sequences(db)
    rows = db.execute(text("""
        SELECT po.id, po.po_no, po.status, po.currency, po.subtotal, po.tax, po.total,
               po.branch_id, po.expected_at, po.note, po.created_at,
               s.id AS supplier_id, s.name AS supplier_name,
               b.name AS branch_name,
               (SELECT count(*) FROM purchase_order_items i WHERE i.po_id = po.id) AS lines,
               (SELECT count(*) FROM purchase_order_items i WHERE i.po_id = po.id AND i.qty_received > 0) AS lines_received,
               (SELECT COALESCE(sum(i.qty_ordered),0) FROM purchase_order_items i WHERE i.po_id = po.id) AS qty_total,
               (SELECT COALESCE(sum(i.qty_received),0) FROM purchase_order_items i WHERE i.po_id = po.id) AS qty_received_total,
               (SELECT COALESCE(sum(i.qty_received * i.unit_cost),0) FROM purchase_order_items i WHERE i.po_id = po.id) AS total_received
        FROM purchase_orders po
        JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN branches b ON b.id = po.branch_id
        ORDER BY po.created_at DESC
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/ordenes/{po_id}")
def get_po(po_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("purchases:read"))):
    po = db.execute(text("""
        SELECT po.id, po.po_no, po.status, po.currency, po.subtotal, po.tax, po.total,
               po.branch_id, po.expected_at, po.note, po.created_at,
               s.id AS supplier_id, s.name AS supplier_name
        FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id
        WHERE po.id=:p"""), {"p": po_id}).mappings().first()
    if not po:
        raise HTTPException(404, "Orden no encontrada")
    items = db.execute(text("""
        SELECT i.id, i.variant_id, v.variant_sku, v.size, v.color, p.name as product_name,
               i.qty_ordered, i.qty_received, i.unit_cost, i.line_total, i.reception_note
        FROM purchase_order_items i
        JOIN product_variants v ON v.id = i.variant_id
        JOIN products p ON p.id = v.product_id
        WHERE i.po_id = :p ORDER BY p.name, v.variant_sku"""), {"p": po_id}).mappings().all()
    return {**dict(po), "items": [dict(r) for r in items]}


class POItemIn(BaseModel):
    variant_id: int
    qty_ordered: float
    unit_cost: float


class POIn(BaseModel):
    supplier_id: int
    branch_id: str
    currency: str
    exchange_rate: float | None = None
    expected_at: str | None = None
    note: str | None = None
    status: str = "sent"   # "draft" = solicitud de compra | "sent" = orden confirmada
    items: list[POItemIn]


@router.post("/ordenes")
def create_po(data: POIn, db: Session = Depends(get_tenant_db),
              user: CurrentUser = Depends(require_scope("purchases:write"))):
    subtotal = sum(Decimal(str(i.unit_cost)) * Decimal(str(i.qty_ordered)) for i in data.items)
    init_status = data.status if data.status in ("draft", "sent") else "sent"
    po = PurchaseOrder(supplier_id=data.supplier_id, branch_id=data.branch_id,
                       currency=data.currency, exchange_rate=data.exchange_rate,
                       subtotal=subtotal, total=subtotal, status=init_status, created_by=user.id)
    if data.expected_at:
        po.expected_at = data.expected_at
    if data.note:
        db.execute(text("SELECT 1"))  # ensure session active; note set below
    for i in data.items:
        po.items.append(PurchaseOrderItem(
            variant_id=i.variant_id, qty_ordered=i.qty_ordered, unit_cost=i.unit_cost,
            line_total=Decimal(str(i.unit_cost)) * Decimal(str(i.qty_ordered))))
    db.add(po); db.flush()
    _ensure_doc_sequences(db)
    seq = db.execute(text("SELECT nextval('purchase_order_seq')")).scalar()
    po_no = f"SC-{seq:06d}" if init_status == "draft" else f"OC-{seq:06d}"
    db.execute(text("UPDATE purchase_orders SET po_no=:no WHERE id=:id"), {"no": po_no, "id": po.id})
    if data.note:
        db.execute(text("UPDATE purchase_orders SET note=:n WHERE id=:id"), {"n": data.note, "id": po.id})
    db.commit(); db.refresh(po)
    return {"po_id": po.id, "po_no": po_no, "total": float(po.total)}


class POEditIn(BaseModel):
    note: str | None = None
    expected_at: str | None = None
    status: str | None = None   # draft→sent (confirmar solicitud)
    # Edición completa de borrador (solo cuando status=='draft')
    supplier_id: int | None = None
    branch_id: str | None = None
    currency: str | None = None
    items: list[POItemIn] | None = None


@router.patch("/ordenes/{po_id}")
def update_po(po_id: int, data: POEditIn, db: Session = Depends(get_tenant_db),
              _=Depends(require_scope("purchases:write"))):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Orden no encontrada")

    # Edición completa solo permitida en borradores
    if po.status == "draft":
        if data.supplier_id is not None:
            db.execute(text("UPDATE purchase_orders SET supplier_id=:v WHERE id=:id"), {"v": data.supplier_id, "id": po_id})
        if data.branch_id is not None:
            db.execute(text("UPDATE purchase_orders SET branch_id=:v WHERE id=:id"), {"v": data.branch_id, "id": po_id})
        if data.currency is not None:
            db.execute(text("UPDATE purchase_orders SET currency=:v WHERE id=:id"), {"v": data.currency, "id": po_id})
        if data.items is not None:
            # Reemplazar todos los ítems
            db.execute(text("DELETE FROM purchase_order_items WHERE po_id=:p"), {"p": po_id})
            subtotal = Decimal("0")
            for it in data.items:
                lt = Decimal(str(it.unit_cost)) * Decimal(str(it.qty_ordered))
                subtotal += lt
                db.execute(text("""
                    INSERT INTO purchase_order_items (po_id, variant_id, qty_ordered, unit_cost, line_total)
                    VALUES (:po, :v, :q, :c, :lt)
                """), {"po": po_id, "v": it.variant_id, "q": it.qty_ordered, "c": it.unit_cost, "lt": float(lt)})
            db.execute(text("UPDATE purchase_orders SET subtotal=:s, total=:s WHERE id=:id"), {"s": float(subtotal), "id": po_id})

    if data.note is not None:
        db.execute(text("UPDATE purchase_orders SET note=:n WHERE id=:id"), {"n": data.note or None, "id": po_id})
    if data.expected_at is not None:
        db.execute(text("UPDATE purchase_orders SET expected_at=:e WHERE id=:id"), {"e": data.expected_at or None, "id": po_id})

    # Confirmar solicitud → cambiar prefijo SC- → OC- (mismo número)
    if data.status == "sent" and po.status == "draft":
        current_no = db.execute(text("SELECT po_no FROM purchase_orders WHERE id=:id"), {"id": po_id}).scalar() or ""
        oc_no = current_no.replace("SC-", "OC-", 1) if current_no.startswith("SC-") else current_no
        db.execute(text("UPDATE purchase_orders SET status='sent', po_no=:no WHERE id=:id"), {"no": oc_no, "id": po_id})
        db.commit()
        return {"ok": True, "po_no": oc_no}

    db.commit()
    return {"ok": True}


@router.delete("/ordenes/{po_id}")
def delete_po(po_id: int, db: Session = Depends(get_tenant_db),
              _=Depends(require_scope("purchases:write"))):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Orden no encontrada")
    if po.status in ("closed", "received"):
        raise HTTPException(400, f"No se puede eliminar una OC en estado '{po.status}'. Solo se pueden eliminar solicitudes, OC enviadas o canceladas.")
    if po.status == "cancelled":
        raise HTTPException(400, "Una OC anulada no puede eliminarse. Es un documento histórico del sistema.")
    has_entries = db.execute(text("SELECT 1 FROM warehouse_entries WHERE po_id=:p LIMIT 1"), {"p": po_id}).first()
    if has_entries:
        raise HTTPException(400, "No se puede eliminar la OC: tiene entradas de almacén registradas. Elimine primero las entradas.")
    has_invoice = db.execute(text("SELECT 1 FROM supplier_invoice_pos WHERE po_id=:p LIMIT 1"), {"p": po_id}).first()
    if not has_invoice:
        has_invoice = db.execute(text("SELECT 1 FROM supplier_invoices WHERE po_id=:p AND is_manual=true LIMIT 1"), {"p": po_id}).first()
    if has_invoice:
        raise HTTPException(400, "No se puede eliminar la OC: tiene una factura de proveedor vinculada. Elimine primero la factura.")
    db.execute(text("DELETE FROM purchase_order_items WHERE po_id=:p"), {"p": po_id})
    db.execute(text("DELETE FROM purchase_orders WHERE id=:p"), {"p": po_id})
    db.commit()
    return {"ok": True}


class EntryEditIn(BaseModel):
    notes: str | None = None


@router.patch("/entradas/{entry_id}")
def update_entry(entry_id: int, data: EntryEditIn, db: Session = Depends(get_tenant_db),
                 _=Depends(require_scope("purchases:write"))):
    exists = db.execute(text("SELECT id FROM warehouse_entries WHERE id=:i"), {"i": entry_id}).first()
    if not exists:
        raise HTTPException(404, "Entrada no encontrada")
    db.execute(text("UPDATE warehouse_entries SET notes=:n WHERE id=:i"), {"n": data.notes, "i": entry_id})
    db.commit()
    return {"ok": True}


@router.delete("/entradas/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_tenant_db),
                 _=Depends(require_scope("purchases:write"))):
    entry = db.execute(text("SELECT id, status, po_id FROM warehouse_entries WHERE id=:i"),
                       {"i": entry_id}).mappings().first()
    if not entry:
        raise HTTPException(404, "Entrada no encontrada")
    # Bloquear si la OC está cerrada o anulada
    if entry["po_id"]:
        po_status = db.execute(text("SELECT status FROM purchase_orders WHERE id=:p"), {"p": entry["po_id"]}).scalar()
        if po_status in ("closed", "cancelled"):
            raise HTTPException(400, f"No se puede eliminar la entrada: la OC asociada está en estado '{po_status}'. Los documentos de OC cerradas o anuladas son históricos.")
    if entry["status"] == "posted":
        raise HTTPException(400, "No se puede eliminar una entrada contabilizada. Contacte al administrador del sistema.")
    n_journal = db.execute(text("SELECT COUNT(*) FROM journal_entries WHERE reference=:r"), {"r": f"EA-{entry_id}"}).scalar() or 0
    if n_journal:
        raise HTTPException(400, f"No se puede eliminar la entrada: tiene {n_journal} asiento(s) contable(s) registrados. Revierta primero los asientos en el módulo de contabilidad.")
    db.execute(text("DELETE FROM warehouse_entry_lines WHERE entry_id=:i"), {"i": entry_id})
    db.execute(text("DELETE FROM warehouse_entries WHERE id=:i"), {"i": entry_id})
    db.commit()
    return {"ok": True}


class InvoiceEditIn(BaseModel):
    supplier_ref: str | None = None
    invoice_date: str | None = None
    payment_days: int | None = None
    notes: str | None = None
    total: float | None = None


@router.patch("/facturas/{invoice_id}")
def update_invoice(invoice_id: int, data: InvoiceEditIn, db: Session = Depends(get_tenant_db),
                   _=Depends(require_scope("purchases:write"))):
    from datetime import date as _date, timedelta
    inv = db.execute(text("SELECT id, invoice_no, issued_at, payment_days, total, balance FROM supplier_invoices WHERE id=:i"),
                     {"i": invoice_id}).mappings().first()
    if not inv:
        raise HTTPException(404, "Factura no encontrada")
    updates = []
    params = {"i": invoice_id}
    if data.supplier_ref is not None:
        updates.append("supplier_ref=:ref"); params["ref"] = data.supplier_ref or None
    if data.notes is not None:
        updates.append("notes=:notes"); params["notes"] = data.notes or None
    if data.invoice_date is not None:
        updates.append("issued_at=:issued"); params["issued"] = data.invoice_date
        issued = _date.fromisoformat(data.invoice_date)
        days = data.payment_days if data.payment_days is not None else (inv["payment_days"] or 30)
        updates.append("due_at=:due"); params["due"] = issued + timedelta(days=days)
        updates.append("payment_days=:days"); params["days"] = days
    elif data.payment_days is not None:
        updates.append("payment_days=:days"); params["days"] = data.payment_days
        if inv["issued_at"]:
            updates.append("due_at=:due")
            params["due"] = inv["issued_at"] + timedelta(days=data.payment_days)
    old_total = Decimal(str(inv["total"]))
    new_total = None
    if data.total is not None and data.total > 0:
        new_total = Decimal(str(data.total))
        # Recalcular balance considerando pagos ya registrados
        paid = db.execute(text("SELECT COALESCE(SUM(amount),0) FROM supplier_payments WHERE invoice_id=:i"), {"i": invoice_id}).scalar() or 0
        new_balance = max(Decimal("0"), new_total - Decimal(str(paid)))
        new_status = "paid" if new_balance <= 0 else ("partial" if Decimal(str(paid)) > 0 else "open")
        updates.append("total=:total"); params["total"] = float(new_total)
        updates.append("balance=:balance"); params["balance"] = float(new_balance)
        updates.append("status=:st"); params["st"] = new_status
    if updates:
        db.execute(text(f"UPDATE supplier_invoices SET {', '.join(updates)} WHERE id=:i"), params)
        db.commit()
    # Asiento de ajuste contable si cambió el total
    if new_total is not None and new_total != old_total:
        try:
            from app.services.auto_accounting import _post, get_account
            c_inv  = get_account(db, "cuenta_inventario")
            c_prov = get_account(db, "cuenta_proveedores")
            if c_inv and c_prov:
                delta = float(new_total - old_total)
                if delta > 0:
                    lines = [
                        {"account_id": c_inv,  "debit": delta, "credit": 0,     "memo": f"Ajuste factura {inv['invoice_no']}"},
                        {"account_id": c_prov, "debit": 0,     "credit": delta, "memo": f"Ajuste CxP factura {inv['invoice_no']}"},
                    ]
                else:
                    lines = [
                        {"account_id": c_prov, "debit": abs(delta), "credit": 0,          "memo": f"Ajuste factura {inv['invoice_no']}"},
                        {"account_id": c_inv,  "debit": 0,          "credit": abs(delta), "memo": f"Ajuste CxP factura {inv['invoice_no']}"},
                    ]
                _post(db, description=f"Ajuste factura {inv['invoice_no']}", reference=f"ADJ-{invoice_id}",
                      source_type="supplier_invoice", source_id=invoice_id, lines=lines)
            db.commit()
        except Exception:
            db.rollback()
    return {"ok": True}


@router.delete("/facturas/{invoice_id}")
def delete_invoice(invoice_id: int, db: Session = Depends(get_tenant_db),
                   _=Depends(require_scope("purchases:write"))):
    inv = db.execute(text("SELECT id, invoice_no FROM supplier_invoices WHERE id=:i"), {"i": invoice_id}).mappings().first()
    if not inv:
        raise HTTPException(404, "Factura no encontrada")
    n_payments = db.execute(text("SELECT COUNT(*) FROM supplier_payments WHERE invoice_id=:i"), {"i": invoice_id}).scalar() or 0
    if n_payments:
        raise HTTPException(400, f"No se puede eliminar la factura {inv['invoice_no']}: tiene {n_payments} pago(s) registrado(s). Revierta primero los pagos.")
    n_journal = db.execute(text("SELECT COUNT(*) FROM journal_entries WHERE source_type='supplier_invoice' AND source_id=:i"), {"i": invoice_id}).scalar() or 0
    if n_journal:
        raise HTTPException(400, f"No se puede eliminar la factura {inv['invoice_no']}: tiene {n_journal} asiento(s) contable(s) registrados. Revierta primero los asientos en el módulo de contabilidad.")
    db.execute(text("DELETE FROM supplier_invoice_pos WHERE invoice_id=:i"), {"i": invoice_id})
    db.execute(text("DELETE FROM supplier_invoices WHERE id=:i"), {"i": invoice_id})
    db.commit()
    return {"ok": True}


def _next_entry_no(db) -> str:
    seq = db.execute(text("SELECT nextval('warehouse_entry_seq')")).scalar()
    return f"EA-{seq:06d}"


def _create_warehouse_entry(db, po, lines_received: list[dict], total: Decimal,
                            notes: str | None, user_id) -> int:
    """Crea documento Entrada de Almacén y sus líneas. Retorna el entry_id."""
    entry_no = _next_entry_no(db)
    entry_id = db.execute(text("""
        INSERT INTO warehouse_entries (entry_no, po_id, branch_id, total, notes, created_by)
        VALUES (:no, :po, :br, :tot, :nt, :u) RETURNING id
    """), {"no": entry_no, "po": po.id, "br": str(po.branch_id),
           "tot": float(total), "nt": notes, "u": user_id}).scalar()

    for ln in lines_received:
        db.execute(text("""
            INSERT INTO warehouse_entry_lines (entry_id, poi_id, variant_id, qty, unit_cost, line_total, note)
            VALUES (:e, :poi, :v, :q, :uc, :lt, :nt)
        """), {"e": entry_id, "poi": ln["poi_id"], "v": ln["variant_id"],
               "q": float(ln["qty"]), "uc": float(ln["unit_cost"]),
               "lt": float(ln["qty"] * ln["unit_cost"]), "nt": ln.get("note")})
    return entry_id


def _log_po_event(db, po_id, event_type, entry_id=None, qty=None, amount=None, notes=None, user_id=None):
    db.execute(text("""
        INSERT INTO po_events (po_id, event_type, entry_id, qty_total, amount, notes, created_by)
        VALUES (:p, :e, :ei, :q, :a, :n, :u)
    """), {"p": po_id, "e": event_type, "ei": entry_id, "q": qty,
           "a": float(amount) if amount else None, "n": notes, "u": user_id})


def _receive_items(db, po, items_to_receive: list[dict], user_id):
    """
    Procesa la recepción de ítems seleccionados. Crea Entrada de Almacén.
    items_to_receive: [{item_id, qty_to_receive, unit_cost, note}]
    Retorna (total_recibido, all_received, entry_id, lines_received).
    """
    total_recibido = Decimal("0")
    lines_received = []

    for entry in items_to_receive:
        item = next((i for i in po.items if i.id == entry["item_id"]), None)
        if not item:
            continue
        pending = Decimal(str(item.qty_ordered)) - Decimal(str(item.qty_received))
        qty = min(Decimal(str(entry["qty_to_receive"])), pending)
        if qty <= 0:
            continue
        unit_cost = Decimal(str(entry.get("unit_cost") or item.unit_cost))
        move_stock(db, variant_id=item.variant_id, branch_id=str(po.branch_id),
                   quantity=qty, movement_type="entrada_compra",
                   unit_cost=unit_cost, ref_type="purchase", ref_id=po.id, user_id=user_id)
        item.qty_received = float(Decimal(str(item.qty_received)) + qty)
        # Costo promedio ponderado — stock en tabla inventory, costo en product_variants
        current = db.execute(text("""
            SELECT COALESCE(i.quantity, 0) AS quantity, pv.cost_price
            FROM product_variants pv
            LEFT JOIN inventory i ON i.variant_id = pv.id AND i.branch_id = :br
            WHERE pv.id = :v
        """), {"v": item.variant_id, "br": str(po.branch_id)}).first()
        if current:
            old_qty = Decimal(str(current[0])) - qty
            old_cost = Decimal(str(current[1] or 0))
            avg = (old_qty * old_cost + qty * unit_cost) / (old_qty + qty) if old_qty > 0 else unit_cost
            db.execute(text("UPDATE product_variants SET cost_price=:c WHERE id=:v"),
                       {"c": avg, "v": item.variant_id})
        if entry.get("note"):
            db.execute(text("UPDATE purchase_order_items SET reception_note=:n WHERE id=:id"),
                       {"n": entry["note"], "id": item.id})
        total_recibido += qty * unit_cost
        lines_received.append({"poi_id": item.id, "variant_id": item.variant_id,
                                "qty": qty, "unit_cost": unit_cost, "note": entry.get("note")})

    all_received = all(
        Decimal(str(i.qty_received)) >= Decimal(str(i.qty_ordered)) for i in po.items
    )
    any_received = any(Decimal(str(i.qty_received)) > 0 for i in po.items)
    if all_received:
        po.status = "received"
    elif any_received:
        po.status = "partial"

    entry_id = None
    if lines_received:
        entry_id = _create_warehouse_entry(db, po, lines_received, total_recibido,
                                           None, user_id)

    return total_recibido, all_received, entry_id, lines_received


def _post_accounting_entry(db, po, amount: Decimal, entry_id: int, user_id):
    """Asiento contable: Dr Inventario / Cr CxP por el monto de la entrada."""
    try:
        from app.services.auto_accounting import _post, get_account
        c_inv = get_account(db, "cuenta_inventario")
        c_prov = get_account(db, "cuenta_proveedores")
        if not c_inv or not c_prov:
            return
        lines = [
            {"account_id": c_inv,  "debit": float(amount), "credit": 0,
             "memo": f"Entrada almacén EA#{entry_id} / OC#{po.id}"},
            {"account_id": c_prov, "debit": 0, "credit": float(amount),
             "memo": f"CxP Proveedor #{po.supplier_id}"},
        ]
        _post(db, f"Entrada almacén EA#{entry_id} - OC#{po.id}",
              f"EA-{entry_id}", "purchase", po.id, lines, str(user_id) if user_id else None)
    except Exception:
        pass


@router.post("/ordenes/{po_id}/recibir")
def receive_po(po_id: int, db: Session = Depends(get_tenant_db),
               user: CurrentUser = Depends(require_scope("purchases:write"))):
    """Recibe la orden completa (todos los ítems pendientes)."""
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Orden no encontrada")
    if po.status == "draft":
        raise HTTPException(400, "No se puede registrar recepción en una solicitud de compra. Confirme primero la OC.")
    if po.status in ("received", "closed"):
        raise HTTPException(400, "La orden ya está cerrada o recibida")

    items_to_receive = [
        {"item_id": i.id, "qty_to_receive": float(Decimal(str(i.qty_ordered)) - Decimal(str(i.qty_received)))}
        for i in po.items if Decimal(str(i.qty_ordered)) > Decimal(str(i.qty_received))
    ]
    total_recibido, all_received, entry_id, _ = _receive_items(db, po, items_to_receive, user.id)

    if entry_id:
        entry_no_str = db.execute(text("SELECT entry_no FROM warehouse_entries WHERE id=:id"), {"id": entry_id}).scalar()
        existing_inv = db.execute(text("SELECT id FROM supplier_invoices WHERE po_id=:p"), {"p": po.id}).first()
        if not existing_inv:
            db.execute(text("""INSERT INTO supplier_invoices (supplier_id, po_id, invoice_no, currency, total, balance, status)
                               VALUES (:s,:p,:no,:c,:t,:t,'open')"""),
                       {"s": po.supplier_id, "p": po.id, "no": entry_no_str,
                        "c": po.currency, "t": float(total_recibido)})
        else:
            db.execute(text("""UPDATE supplier_invoices
                               SET total=total+:a, balance=balance+:a,
                                   status=CASE WHEN balance+:a<=0 THEN 'paid' ELSE 'open' END
                               WHERE id=:id"""),
                       {"a": float(total_recibido), "id": existing_inv[0]})
        _log_po_event(db, po.id, "received" if all_received else "partial",
                      entry_id=entry_id, amount=total_recibido,
                      notes="Recepción completa", user_id=str(user.id))
        _post_accounting_entry(db, po, total_recibido, entry_id, user.id)
    db.commit()
    return {"po_id": po.id, "status": po.status,
            "total_recibido": float(total_recibido), "entry_id": entry_id}


class ReceiveItemIn(BaseModel):
    item_id: int
    qty_to_receive: float
    unit_cost: float | None = None
    note: str | None = None


class ReceivePartialIn(BaseModel):
    items: list[ReceiveItemIn]
    close_po: bool = False     # si True y queda pendiente → cerrar OC
    close_reason: str | None = None
    entry_notes: str | None = None


@router.post("/ordenes/{po_id}/recibir-parcial")
def receive_po_partial(po_id: int, data: ReceivePartialIn, db: Session = Depends(get_tenant_db),
                       user: CurrentUser = Depends(require_scope("purchases:write"))):
    """Recepción selectiva: procesa ítems indicados, crea Entrada de Almacén, opcionalmente cierra la OC."""
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Orden no encontrada")
    if po.status == "draft":
        raise HTTPException(400, "No se puede registrar recepción en una solicitud de compra. Confirme primero la OC.")
    if po.status in ("received", "closed"):
        raise HTTPException(400, "La orden ya está cerrada o completamente recibida")
    if not data.items:
        raise HTTPException(400, "Debes seleccionar al menos un ítem para recibir")

    items_to_receive = [
        {"item_id": i.item_id, "qty_to_receive": i.qty_to_receive,
         "unit_cost": i.unit_cost, "note": i.note}
        for i in data.items if i.qty_to_receive > 0
    ]
    total_recibido, all_received, entry_id, _ = _receive_items(
        db, po, items_to_receive, user.id)

    # Actualizar nota de entrada si se envió
    if entry_id and data.entry_notes:
        db.execute(text("UPDATE warehouse_entries SET notes=:n WHERE id=:id"),
                   {"n": data.entry_notes, "id": entry_id})

    # Cierre manual de OC si tiene pendientes y el usuario quiere cerrar
    if data.close_po and not all_received:
        po.status = "closed"
        db.execute(text("UPDATE purchase_orders SET closed_at=NOW(), close_reason=:r WHERE id=:id"),
                   {"r": data.close_reason or "Cierre manual", "id": po.id})
        _log_po_event(db, po.id, "closed", entry_id=entry_id, amount=total_recibido,
                      notes=data.close_reason or "Cerrada con ítems pendientes", user_id=str(user.id))
    else:
        event_type = "received" if all_received else "partial"
        _log_po_event(db, po.id, event_type, entry_id=entry_id, amount=total_recibido,
                      notes=data.entry_notes, user_id=str(user.id))

    # Factura CxP — acumular saldo en cada recepción parcial
    if total_recibido > 0:
        entry_no_str = db.execute(text("SELECT entry_no FROM warehouse_entries WHERE id=:id"), {"id": entry_id}).scalar() if entry_id else None
        existing_inv = db.execute(text("SELECT id FROM supplier_invoices WHERE po_id=:p"), {"p": po.id}).first()
        if not existing_inv:
            db.execute(text("""INSERT INTO supplier_invoices (supplier_id, po_id, invoice_no, currency, total, balance, status)
                               VALUES (:s,:p,:no,:c,:t,:t,'open')"""),
                       {"s": po.supplier_id, "p": po.id, "no": entry_no_str,
                        "c": po.currency, "t": float(total_recibido)})
        else:
            db.execute(text("""UPDATE supplier_invoices
                               SET total=total+:a, balance=balance+:a,
                                   status=CASE WHEN balance+:a<=0 THEN 'paid' ELSE 'open' END
                               WHERE id=:id"""),
                       {"a": float(total_recibido), "id": existing_inv[0]})

    if entry_id:
        _post_accounting_entry(db, po, total_recibido, entry_id, user.id)

    db.commit()
    return {
        "po_id": po.id, "status": po.status,
        "total_recibido": float(total_recibido),
        "all_received": all_received,
        "entry_id": entry_id,
        "entry_no": db.execute(text("SELECT entry_no FROM warehouse_entries WHERE id=:id"),
                               {"id": entry_id}).scalar() if entry_id else None,
    }


@router.post("/ordenes/{po_id}/cerrar")
def close_po(po_id: int, reason: str | None = None, db: Session = Depends(get_tenant_db),
             user: CurrentUser = Depends(require_scope("purchases:write"))):
    """Cierra manualmente una OC con ítems pendientes."""
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Orden no encontrada")
    if po.status == "draft":
        raise HTTPException(400, "Una solicitud de compra no puede cerrarse. Confírmela primero como OC.")
    if po.status in ("received", "closed"):
        raise HTTPException(400, "La orden ya está cerrada")
    po.status = "closed"
    db.execute(text("UPDATE purchase_orders SET closed_at=NOW(), close_reason=:r WHERE id=:id"),
               {"r": reason or "Cierre manual", "id": po.id})
    _log_po_event(db, po.id, "closed", notes=reason or "Cerrada manualmente", user_id=str(user.id))
    db.commit()
    return {"po_id": po.id, "status": "closed"}


@router.post("/ordenes/{po_id}/cancelar")
def cancel_po(po_id: int, reason: str | None = None, db: Session = Depends(get_tenant_db),
              user: CurrentUser = Depends(require_scope("purchases:write"))):
    """Cancela una OC que NO tiene ninguna entrada de almacén."""
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Orden no encontrada")
    if po.status in ("received", "closed", "cancelled"):
        raise HTTPException(400, "La orden no puede cancelarse en su estado actual")
    has_entries = db.execute(
        text("SELECT 1 FROM warehouse_entries WHERE po_id=:p LIMIT 1"), {"p": po.id}
    ).first()
    if has_entries:
        raise HTTPException(400, "No se puede cancelar una OC con entradas de almacén registradas")
    po.status = "cancelled"
    db.execute(text("UPDATE purchase_orders SET closed_at=NOW(), close_reason=:r WHERE id=:id"),
               {"r": reason or "Cancelación manual", "id": po.id})
    _log_po_event(db, po.id, "cancelled", notes=reason or "Cancelada", user_id=str(user.id))
    db.commit()
    return {"po_id": po.id, "status": "cancelled"}


@router.get("/ordenes/{po_id}/entradas")
def list_po_entries(po_id: int, db: Session = Depends(get_tenant_db),
                    _=Depends(require_scope("purchases:read"))):
    """Entradas de almacén de una OC."""
    entries = db.execute(text("""
        SELECT we.id, we.entry_no, to_char(we.entry_date,'YYYY-MM-DD HH24:MI') AS entry_date,
               we.status, we.total, we.notes,
               COUNT(wel.id) AS line_count,
               COALESCE(SUM(wel.qty),0) AS qty_total
        FROM warehouse_entries we
        LEFT JOIN warehouse_entry_lines wel ON wel.entry_id = we.id
        WHERE we.po_id = :p
        GROUP BY we.id ORDER BY we.entry_date DESC
    """), {"p": po_id}).mappings().all()
    return [dict(r) for r in entries]


@router.get("/ordenes/{po_id}/historial")
def get_po_history(po_id: int, db: Session = Depends(get_tenant_db),
                   _=Depends(require_scope("purchases:read"))):
    """Historial de eventos de una OC (recepciones, cierres, etc.)."""
    events = db.execute(text("""
        SELECT pe.id, pe.event_type, pe.entry_id,
               we.entry_no,
               to_char(pe.created_at,'YYYY-MM-DD HH24:MI') AS created_at,
               pe.qty_total, pe.amount, pe.notes
        FROM po_events pe
        LEFT JOIN warehouse_entries we ON we.id = pe.entry_id
        WHERE pe.po_id = :p
        ORDER BY pe.created_at DESC
    """), {"p": po_id}).mappings().all()
    return [dict(r) for r in events]


@router.get("/entradas")
def list_all_entries(
    po_id: int | None = None,
    branch_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_tenant_db),
    _=Depends(require_scope("purchases:read"))
):
    """Listado general de Entradas de Almacén."""
    conds = ["1=1"]
    params: dict = {}
    if po_id:     conds.append("we.po_id=:po");       params["po"] = po_id
    if branch_id: conds.append("we.branch_id=:br");   params["br"] = branch_id
    if date_from: conds.append("we.entry_date>=:df");  params["df"] = date_from
    if date_to:   conds.append("we.entry_date<=:dt");  params["dt"] = date_to

    rows = db.execute(text(f"""
        SELECT we.id, we.entry_no, to_char(we.entry_date,'YYYY-MM-DD HH24:MI') AS entry_date,
               we.status, we.total, we.notes, we.po_id,
               po.status AS po_status,
               s.name AS supplier_name,
               COUNT(wel.id) AS line_count
        FROM warehouse_entries we
        LEFT JOIN purchase_orders po ON po.id = we.po_id
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN warehouse_entry_lines wel ON wel.entry_id = we.id
        WHERE {' AND '.join(conds)}
        GROUP BY we.id, po.status, s.name
        ORDER BY we.entry_date DESC
        LIMIT 500
    """), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/entradas/{entry_id}")
def get_entry_detail(entry_id: int, db: Session = Depends(get_tenant_db),
                     _=Depends(require_scope("purchases:read"))):
    """Detalle de una Entrada de Almacén con sus líneas."""
    entry = db.execute(text("""
        SELECT we.id, we.entry_no, to_char(we.entry_date,'YYYY-MM-DD HH24:MI') AS entry_date,
               we.status, we.total, we.notes, we.po_id,
               s.name AS supplier_name, po.currency
        FROM warehouse_entries we
        LEFT JOIN purchase_orders po ON po.id = we.po_id
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE we.id = :id
    """), {"id": entry_id}).mappings().first()
    if not entry:
        raise HTTPException(404)
    lines = db.execute(text("""
        SELECT wel.id, wel.qty, wel.unit_cost, wel.line_total, wel.note,
               v.variant_sku, v.size, v.color, p.name AS product_name
        FROM warehouse_entry_lines wel
        JOIN product_variants v ON v.id = wel.variant_id
        JOIN products p ON p.id = v.product_id
        WHERE wel.entry_id = :id ORDER BY p.name, v.variant_sku
    """), {"id": entry_id}).mappings().all()
    return {**dict(entry), "lines": [dict(l) for l in lines]}


@router.get("/variantes")
def list_variants_for_po(
    supplier_id: int | None = None,
    db: Session = Depends(get_tenant_db),
    _=Depends(require_scope("purchases:read"))
):
    """
    Variantes disponibles para compras, enriquecidas con marca y proveedor.
    Si se pasa supplier_id, filtra solo variantes de marcas asociadas a ese proveedor.
    """
    cond = "AND b.supplier_id = :sid" if supplier_id else ""
    params = {"sid": supplier_id} if supplier_id else {}
    rows = db.execute(text(f"""
        SELECT v.id, v.variant_sku, v.ean13, v.size, v.color,
               v.cost_price, v.sale_price, v.currency AS variant_currency,
               p.id AS product_id, p.name AS product_name, p.sku AS product_sku,
               p.brand_id, b.name AS brand_name,
               b.supplier_id, s.name AS supplier_name, s.currency AS supplier_currency,
               sp.supplier_sku, sp.last_cost, sp.is_preferred
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN suppliers s ON s.id = b.supplier_id
        LEFT JOIN supplier_products sp ON sp.variant_id = v.id AND sp.supplier_id = b.supplier_id
        WHERE v.is_active AND p.is_active
        {cond}
        ORDER BY b.name NULLS LAST, p.name, v.variant_sku
    """), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/reabastecimiento/{branch_id}")
def replenishment(branch_id: str, db: Session = Depends(get_tenant_db),
                  _=Depends(require_scope("purchases:read"))):
    return suggest_reorders(db, branch_id)


@router.post("/reabastecimiento/{branch_id}/generar")
def generate_reorders(branch_id: str, db: Session = Depends(get_tenant_db),
                      user: CurrentUser = Depends(require_scope("purchases:write"))):
    """Genera órdenes de compra BORRADOR agrupando las sugerencias por proveedor preferido."""
    from collections import defaultdict
    sugerencias = suggest_reorders(db, branch_id)

    groups = defaultdict(list)
    sin_proveedor = []
    for s in sugerencias:
        if s.get("supplier_id") and s["suggested_qty"] > 0:
            groups[s["supplier_id"]].append(s)
        elif not s.get("supplier_id"):
            sin_proveedor.append(s["variant_sku"])

    creadas = []
    for supplier_id, rows in groups.items():
        currency = rows[0].get("supplier_currency") or "USD"
        po = PurchaseOrder(supplier_id=supplier_id, branch_id=branch_id, status="draft",
                           currency=currency, created_by=user.id)
        total = Decimal("0")
        for r in rows:
            qty = Decimal(str(r["suggested_qty"]))
            cost = Decimal(str(r["unit_cost"]))
            line = qty * cost
            total += line
            po.items.append(PurchaseOrderItem(variant_id=r["variant_id"], qty_ordered=qty,
                                              unit_cost=cost, line_total=line))
        po.subtotal = total
        po.total = total
        db.add(po)
        db.flush()
        creadas.append({"po_id": po.id, "supplier_id": supplier_id,
                        "supplier_name": rows[0].get("supplier_name"),
                        "lineas": len(rows), "total": float(total)})
    db.commit()
    return {"ordenes_creadas": creadas, "variantes_sin_proveedor": sin_proveedor}


# ============ ESTADO DE CUENTA / CUENTAS POR PAGAR ============
@router.get("/facturas")
def list_invoices(status: str | None = None, supplier_id: int | None = None,
                  db: Session = Depends(get_tenant_db),
                  _=Depends(require_scope("purchases:read"))):
    _ensure_invoice_schema(db)
    conds = []
    params: dict = {}
    if status:
        conds.append("si.status = :st"); params["st"] = status
    if supplier_id:
        conds.append("si.supplier_id = :sup"); params["sup"] = supplier_id
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    rows = db.execute(text(f"""
        SELECT si.id, si.invoice_no, si.supplier_ref, si.po_id, si.currency,
               si.total, si.balance, si.status, si.issued_at, si.due_at,
               COALESCE(si.payment_days, 30) AS payment_days,
               si.notes, COALESCE(si.is_manual, false) AS is_manual,
               s.id AS supplier_id, s.name AS supplier_name,
               GREATEST(0, CURRENT_DATE - si.due_at::date) AS days_overdue,
               CASE
                 WHEN si.status='paid' OR si.status='locked' THEN si.status
                 WHEN si.due_at IS NULL THEN 'sin_fecha'
                 WHEN si.due_at::date >= CURRENT_DATE THEN 'vigente'
                 WHEN (CURRENT_DATE - si.due_at::date) <= 30 THEN '1_30'
                 WHEN (CURRENT_DATE - si.due_at::date) <= 60 THEN '31_60'
                 WHEN (CURRENT_DATE - si.due_at::date) <= 90 THEN '61_90'
                 ELSE 'mas_90'
               END AS aging_bucket
        FROM supplier_invoices si JOIN suppliers s ON s.id = si.supplier_id
        {where}
        ORDER BY (si.status='paid'), si.due_at ASC NULLS LAST, si.id DESC
    """), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/estado-cuenta")
def account_statement(db: Session = Depends(get_tenant_db),
                      _=Depends(require_scope("purchases:read"))):
    """Resumen de deuda por proveedor (saldo pendiente)."""
    rows = db.execute(text("""
        SELECT s.id AS supplier_id, s.name AS supplier_name, si.currency,
               count(*) FILTER (WHERE si.balance > 0) AS open_invoices,
               COALESCE(sum(si.balance), 0) AS total_balance,
               COALESCE(sum(si.total), 0) AS total_invoiced
        FROM suppliers s JOIN supplier_invoices si ON si.supplier_id = s.id
        WHERE si.is_manual = true
        GROUP BY s.id, s.name, si.currency
        HAVING COALESCE(sum(si.balance), 0) >= 0
        ORDER BY total_balance DESC
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/facturas/{invoice_id}/pagos")
def list_invoice_payments(invoice_id: int, db: Session = Depends(get_tenant_db),
                          _=Depends(require_scope("purchases:read"))):
    rows = db.execute(text("""
        SELECT id, amount, method, reference, paid_at
        FROM supplier_payments WHERE invoice_id = :i ORDER BY paid_at"""),
        {"i": invoice_id}).mappings().all()
    return [dict(r) for r in rows]


class SupplierPaymentIn(BaseModel):
    amount: float
    method: str            # efectivo | transferencia | cheque | tarjeta
    reference: str | None = None


@router.post("/facturas/{invoice_id}/pagos")
def pay_invoice(invoice_id: int, data: SupplierPaymentIn, db: Session = Depends(get_tenant_db),
                _=Depends(require_scope("purchases:write"))):
    inv = db.execute(text("SELECT balance FROM supplier_invoices WHERE id=:i FOR UPDATE"),
                     {"i": invoice_id}).first()
    if inv is None:
        raise HTTPException(404, "Factura no encontrada")
    amount = Decimal(str(data.amount))
    if amount <= 0:
        raise HTTPException(400, "El monto debe ser positivo")
    balance = Decimal(str(inv[0]))
    if amount > balance:
        raise HTTPException(400, f"El pago ({amount}) excede el saldo ({balance})")

    db.execute(text("""INSERT INTO supplier_payments (invoice_id, amount, method, reference)
                       VALUES (:i,:a,:m,:r)"""),
               {"i": invoice_id, "a": amount, "m": data.method, "r": data.reference})
    new_balance = balance - amount
    new_status = "paid" if new_balance <= 0 else "partial"
    db.execute(text("UPDATE supplier_invoices SET balance=:b, status=:s WHERE id=:i"),
               {"b": new_balance, "s": new_status, "i": invoice_id})
    db.commit()

    # Auto-posting contable
    try:
        from app.services.auto_accounting import post_supplier_payment
        post_supplier_payment(db=db, invoice_id=invoice_id, amount=amount,
                              method=data.method, user_id=None)
        db.commit()
    except Exception:
        pass

    return {"invoice_id": invoice_id, "balance": float(new_balance), "status": new_status}


# ── Schema migration — idempotente ──────────────────────────────────────────
def _ensure_invoice_schema(db: Session):
    try:
        db.execute(text("""
            ALTER TABLE supplier_invoices
              ADD COLUMN IF NOT EXISTS supplier_ref  VARCHAR(120),
              ADD COLUMN IF NOT EXISTS payment_days  INT DEFAULT 30,
              ADD COLUMN IF NOT EXISTS notes         TEXT,
              ADD COLUMN IF NOT EXISTS is_manual     BOOLEAN DEFAULT FALSE
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS supplier_invoice_pos (
                id         SERIAL PRIMARY KEY,
                invoice_id INT NOT NULL,
                po_id      INT NOT NULL,
                UNIQUE (invoice_id, po_id)
            )
        """))
        db.commit()
    except Exception:
        db.rollback()


# ── Facturación: crear factura manual ───────────────────────────────────────
class InvoiceIn(BaseModel):
    supplier_id: int
    po_ids: list[int] = []
    supplier_ref: str | None = None   # número de factura del proveedor
    invoice_date: str | None = None   # fecha de emisión
    payment_days: int = 30
    currency: str = "USD"
    total: float
    notes: str | None = None


@router.post("/facturas")
def create_invoice(data: InvoiceIn, db: Session = Depends(get_tenant_db),
                   _=Depends(require_scope("purchases:write"))):
    from datetime import date as _date, timedelta
    _ensure_invoice_schema(db)

    sup = db.execute(text("SELECT id FROM suppliers WHERE id=:s"), {"s": data.supplier_id}).first()
    if not sup:
        raise HTTPException(404, "Proveedor no encontrado")

    issue_date = _date.fromisoformat(data.invoice_date) if data.invoice_date else _date.today()
    due_at = issue_date + timedelta(days=data.payment_days)

    # Verificar si algún PO vinculado tiene entradas confirmadas → desbloquear
    has_entries = False
    for po_id in data.po_ids:
        cnt = db.execute(text("SELECT COUNT(*) FROM warehouse_entries WHERE po_id=:p"),
                         {"p": po_id}).scalar()
        if cnt and cnt > 0:
            has_entries = True
            break
    status = "open" if has_entries or not data.po_ids else "locked"

    # Eliminar CxP auto-creados (sin factura real) para las OC vinculadas,
    # de modo que la factura manual sea el único registro para ese proveedor/OC.
    if data.po_ids:
        db.execute(text("""
            DELETE FROM supplier_invoices
            WHERE po_id = ANY(:pids) AND (is_manual IS NULL OR is_manual = false)
        """), {"pids": data.po_ids})
        db.commit()

    # Número interno de factura
    seq = db.execute(text("SELECT COALESCE(MAX(id),0)+1 FROM supplier_invoices")).scalar()
    invoice_no = f"FC-{seq:06d}"

    inv_id = db.execute(text("""
        INSERT INTO supplier_invoices
            (supplier_id, invoice_no, supplier_ref, currency, total, balance, status,
             issued_at, due_at, payment_days, notes, is_manual)
        VALUES (:sup,:no,:ref,:cur,:total,:total,:status,:issued,:due,:days,:notes,true)
        RETURNING id
    """), {
        "sup": data.supplier_id, "no": invoice_no, "ref": data.supplier_ref,
        "cur": data.currency, "total": data.total, "status": status,
        "issued": issue_date, "due": due_at, "days": data.payment_days,
        "notes": data.notes,
    }).scalar()

    for po_id in data.po_ids:
        db.execute(text("""
            INSERT INTO supplier_invoice_pos (invoice_id, po_id) VALUES (:i,:p)
            ON CONFLICT DO NOTHING
        """), {"i": inv_id, "p": po_id})
    db.commit()

    # Asiento contable: Dr Inventario / Cr CxP Proveedores
    if status == "open":
        try:
            from app.services.auto_accounting import _post, get_account
            c_inv  = get_account(db, "cuenta_inventario")
            c_prov = get_account(db, "cuenta_proveedores")
            if c_inv and c_prov:
                _post(db, description=f"CxP factura {invoice_no}", reference=invoice_no,
                      source_type="supplier_invoice", source_id=inv_id,
                      lines=[
                          {"account_id": c_inv,  "debit": float(data.total), "credit": 0,          "memo": f"Factura proveedor {invoice_no}"},
                          {"account_id": c_prov, "debit": 0,                 "credit": float(data.total), "memo": f"CxP proveedor #{data.supplier_id}"},
                      ])
            db.commit()
        except Exception:
            db.rollback()

    return {"id": inv_id, "invoice_no": invoice_no, "status": status}


@router.get("/ordenes-sin-factura")
def get_ordenes_sin_factura(db: Session = Depends(get_tenant_db),
                             _=Depends(require_scope("purchases:read"))):
    """OC confirmadas (sent/partial/received/closed) que no tienen ninguna factura de proveedor vinculada."""
    rows = db.execute(text("""
        SELECT po.id, po.po_no, po.status, po.currency, po.total,
               po.subtotal, po.expected_at,
               s.id AS supplier_id, s.name AS supplier_name,
               b.name AS branch_name,
               COALESCE(SUM(we.total), 0) AS total_received,
               COUNT(DISTINCT we.id) AS entry_count,
               COUNT(DISTINCT poi.id) AS items_count
        FROM purchase_orders po
        JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN branches b ON b.id = po.branch_id
        LEFT JOIN warehouse_entries we ON we.po_id = po.id AND we.status = 'posted'
        LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
        WHERE po.status IN ('sent','partial','received','closed')
          AND po.id NOT IN (
              SELECT DISTINCT po_id FROM supplier_invoice_pos WHERE po_id IS NOT NULL
              UNION
              SELECT DISTINCT po_id FROM supplier_invoices WHERE po_id IS NOT NULL AND is_manual = false
          )
          AND po.id NOT IN (
              SELECT DISTINCT sip.po_id
              FROM supplier_invoice_pos sip
              WHERE sip.po_id IS NOT NULL
          )
        GROUP BY po.id, po.po_no, po.status, po.currency, po.total, po.subtotal,
                 po.expected_at, s.id, s.name, b.name
        ORDER BY po.id DESC
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/cxp-resumen")
def get_cxp_resumen(db: Session = Depends(get_tenant_db),
                    _=Depends(require_scope("purchases:read"))):
    """Proveedores con entregas confirmadas + factura manual ligada (una por proveedor)."""
    _ensure_invoice_schema(db)
    rows = db.execute(text("""
        SELECT
            s.id AS supplier_id, s.name AS supplier_name,
            e.entry_count, e.total_received, e.currency,
            mi.id AS invoice_id, mi.invoice_no, mi.supplier_ref,
            mi.status AS invoice_status, mi.balance, mi.total AS invoice_total,
            to_char(mi.due_at,'YYYY-MM-DD') AS due_at,
            to_char(mi.issued_at,'YYYY-MM-DD') AS issued_at,
            mi.payment_days,
            GREATEST(0, CURRENT_DATE - mi.due_at::date) AS days_overdue
        FROM suppliers s
        JOIN (
            SELECT po.supplier_id,
                   COUNT(DISTINCT we.id) AS entry_count,
                   COALESCE(SUM(we.total), 0) AS total_received,
                   MAX(po.currency) AS currency
            FROM purchase_orders po
            JOIN warehouse_entries we ON we.po_id = po.id AND we.status = 'posted'
            GROUP BY po.supplier_id
        ) e ON e.supplier_id = s.id
        LEFT JOIN LATERAL (
            SELECT id, invoice_no, supplier_ref, status, balance, total,
                   due_at, issued_at, payment_days
            FROM supplier_invoices
            WHERE supplier_id = s.id AND is_manual = true
            ORDER BY id DESC LIMIT 1
        ) mi ON true
        ORDER BY s.name
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/facturas/{invoice_id}/detalle")
def get_invoice_detail(invoice_id: int, db: Session = Depends(get_tenant_db),
                       _=Depends(require_scope("purchases:read"))):
    _ensure_invoice_schema(db)
    inv = db.execute(text("""
        SELECT si.id, si.invoice_no, si.supplier_ref, si.po_id, si.currency,
               si.total, si.balance, si.status, si.issued_at, si.due_at,
               si.payment_days, si.notes, si.is_manual,
               s.id AS supplier_id, s.name AS supplier_name
        FROM supplier_invoices si JOIN suppliers s ON s.id=si.supplier_id
        WHERE si.id=:i
    """), {"i": invoice_id}).mappings().first()
    if not inv:
        raise HTTPException(404, "Factura no encontrada")

    payments = db.execute(text("""
        SELECT id, amount, method, reference, paid_at
        FROM supplier_payments WHERE invoice_id=:i ORDER BY paid_at
    """), {"i": invoice_id}).mappings().all()

    # POs vinculados (tabla nueva + campo legacy po_id)
    pos = db.execute(text("""
        SELECT po.id, po.po_no, po.status, po.total, po.currency,
               COUNT(DISTINCT we.id) AS entry_count,
               COALESCE(SUM(we.total), 0) AS entries_total
        FROM supplier_invoice_pos sip
        JOIN purchase_orders po ON po.id = sip.po_id
        LEFT JOIN warehouse_entries we ON we.po_id = po.id AND we.status = 'posted'
        WHERE sip.invoice_id = :i
        GROUP BY po.id, po.po_no, po.status, po.total, po.currency
        UNION
        SELECT po.id, po.po_no, po.status, po.total, po.currency,
               COUNT(DISTINCT we.id) AS entry_count,
               COALESCE(SUM(we.total), 0) AS entries_total
        FROM supplier_invoices si
        JOIN purchase_orders po ON po.id = si.po_id
        LEFT JOIN warehouse_entries we ON we.po_id = po.id AND we.status = 'posted'
        WHERE si.id = :i AND si.po_id IS NOT NULL
          AND si.po_id NOT IN (SELECT po_id FROM supplier_invoice_pos WHERE invoice_id = :i)
        GROUP BY po.id, po.po_no, po.status, po.total, po.currency
    """), {"i": invoice_id}).mappings().all()

    r = dict(inv)
    r["payments"] = [dict(p) for p in payments]
    r["pos"] = [dict(p) for p in pos]
    return r


@router.get("/cartera")
def get_cartera(db: Session = Depends(get_tenant_db),
                _=Depends(require_scope("purchases:read"))):
    """Reporte de cartera por antigüedad de vencimiento."""
    _ensure_invoice_schema(db)
    rows = db.execute(text("""
        SELECT si.id, si.invoice_no, si.supplier_ref, si.balance, si.total,
               si.currency, si.due_at, si.status, si.issued_at,
               s.name AS supplier_name, s.id AS supplier_id,
               CASE
                 WHEN si.status='paid' THEN 'paid'
                 WHEN si.status='locked' THEN 'locked'
                 WHEN si.due_at IS NULL THEN 'sin_fecha'
                 WHEN si.due_at::date >= CURRENT_DATE THEN 'vigente'
                 WHEN (CURRENT_DATE - si.due_at::date) <= 30 THEN '1_30'
                 WHEN (CURRENT_DATE - si.due_at::date) <= 60 THEN '31_60'
                 WHEN (CURRENT_DATE - si.due_at::date) <= 90 THEN '61_90'
                 ELSE 'mas_90'
               END AS bucket,
               GREATEST(0, CURRENT_DATE - si.due_at::date) AS days_overdue
        FROM supplier_invoices si JOIN suppliers s ON s.id=si.supplier_id
        WHERE si.is_manual = true
        ORDER BY days_overdue DESC NULLS LAST, si.id DESC
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/proveedores-con-entradas")
def get_suppliers_with_entries(db: Session = Depends(get_tenant_db),
                               _=Depends(require_scope("purchases:read"))):
    """IDs de proveedores que tienen al menos una OC con entradas confirmadas."""
    rows = db.execute(text("""
        SELECT DISTINCT po.supplier_id AS id
        FROM purchase_orders po
        JOIN warehouse_entries we ON we.po_id = po.id
        WHERE po.status IN ('partial','received','closed')
    """)).scalars().all()
    return list(rows)


@router.get("/estado-cuenta-proveedores")
def get_estado_cuenta_proveedores(db: Session = Depends(get_tenant_db),
                                   _=Depends(require_scope("purchases:read"))):
    """Estado de cuenta operativo por proveedor: facturas + OCs sin factura con entradas."""
    _ensure_invoice_schema(db)

    # Facturas manuales por proveedor
    facturas = db.execute(text("""
        SELECT si.id, si.invoice_no, si.supplier_ref, si.currency,
               si.total, si.balance, si.status,
               to_char(si.issued_at,'YYYY-MM-DD') AS issued_at,
               to_char(si.due_at,'YYYY-MM-DD') AS due_at,
               si.payment_days,
               GREATEST(0, CURRENT_DATE - si.due_at::date) AS days_overdue,
               si.supplier_id,
               s.name AS supplier_name
        FROM supplier_invoices si
        JOIN suppliers s ON s.id = si.supplier_id
        WHERE si.is_manual = true
        ORDER BY si.supplier_id, si.id DESC
    """)).mappings().all()

    # OCs sin factura con entradas confirmadas
    ocs_sin_factura = db.execute(text("""
        SELECT po.id, po.po_no, po.status, po.total, po.currency,
               po.expected_at,
               s.id AS supplier_id, s.name AS supplier_name,
               b.name AS branch_name,
               COUNT(DISTINCT we.id) AS entry_count,
               COALESCE(SUM(we.total), 0) AS entries_total
        FROM purchase_orders po
        JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN branches b ON b.id = po.branch_id
        LEFT JOIN warehouse_entries we ON we.po_id = po.id AND we.status = 'posted'
        WHERE po.status IN ('sent','partial','received','closed')
          AND po.id NOT IN (
              SELECT DISTINCT po_id FROM supplier_invoice_pos WHERE po_id IS NOT NULL
              UNION ALL
              SELECT DISTINCT po_id FROM supplier_invoices
              WHERE po_id IS NOT NULL AND is_manual = false
          )
          AND po.id NOT IN (
              SELECT DISTINCT sip.po_id FROM supplier_invoice_pos sip WHERE sip.po_id IS NOT NULL
          )
        GROUP BY po.id, po.po_no, po.status, po.total, po.currency,
                 po.expected_at, s.id, s.name, b.name
        ORDER BY s.id, po.id DESC
    """)).mappings().all()

    # Agrupar por proveedor
    from collections import defaultdict
    proveedores = {}

    for f in facturas:
        sid = f["supplier_id"]
        if sid not in proveedores:
            proveedores[sid] = {"supplier_id": sid, "supplier_name": f["supplier_name"],
                                "facturas": [], "ocs_sin_factura": []}
        proveedores[sid]["facturas"].append(dict(f))

    for oc in ocs_sin_factura:
        sid = oc["supplier_id"]
        if sid not in proveedores:
            proveedores[sid] = {"supplier_id": sid, "supplier_name": oc["supplier_name"],
                                "facturas": [], "ocs_sin_factura": []}
        proveedores[sid]["ocs_sin_factura"].append(dict(oc))

    return sorted(proveedores.values(), key=lambda x: x["supplier_name"])


@router.get("/ordenes-con-entradas")
def get_all_pos_with_entries(db: Session = Depends(get_tenant_db),
                             _=Depends(require_scope("purchases:read"))):
    """Todas las OCs con entradas confirmadas pendientes de facturar, de todos los proveedores."""
    rows = db.execute(text("""
        SELECT po.id, po.po_no, po.status, po.total, po.currency,
               s.id AS supplier_id, s.name AS supplier_name,
               COUNT(DISTINCT we.id) AS entry_count,
               COALESCE(SUM(we.total), 0) AS entries_total,
               EXISTS(SELECT 1 FROM supplier_invoice_pos sip WHERE sip.po_id = po.id) AS already_invoiced
        FROM purchase_orders po
        JOIN suppliers s ON s.id = po.supplier_id
        JOIN warehouse_entries we ON we.po_id = po.id AND we.status = 'posted'
        WHERE po.status IN ('partial','received','closed')
        GROUP BY po.id, po.po_no, po.status, po.total, po.currency, s.id, s.name
        ORDER BY s.name, po.id DESC
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/proveedores/{supplier_id}/ordenes-con-entradas")
def get_supplier_pos_with_entries(supplier_id: int, db: Session = Depends(get_tenant_db),
                                  _=Depends(require_scope("purchases:read"))):
    """POs del proveedor que tienen entradas de almacén confirmadas (para vincular a facturas)."""
    rows = db.execute(text("""
        SELECT po.id, po.po_no, po.status, po.total, po.currency, po.created_at,
               COUNT(DISTINCT we.id) AS entry_count,
               COALESCE(SUM(we.total), 0) AS entries_total,
               EXISTS(SELECT 1 FROM supplier_invoice_pos sip WHERE sip.po_id=po.id) AS already_invoiced
        FROM purchase_orders po
        JOIN warehouse_entries we ON we.po_id = po.id AND we.status = 'posted'
        WHERE po.supplier_id = :s AND po.status IN ('partial','received','closed')
        GROUP BY po.id, po.po_no, po.status, po.total, po.currency, po.created_at
        ORDER BY po.id DESC
    """), {"s": supplier_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/ordenes/{po_id}/export")
def export_po_csv(po_id: int, db=Depends(get_tenant_db), _=Depends(require_scope("purchases:read"))):
    po = db.execute(text("""
        SELECT po.id, po.status, po.currency, po.total, po.note,
               po.expected_at, po.created_at, s.name as supplier_name
        FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id
        WHERE po.id=:p
    """), {"p": po_id}).mappings().first()
    if not po:
        raise HTTPException(404)
    items = db.execute(text("""
        SELECT v.variant_sku, v.size, v.color, p.name as product_name,
               i.qty_ordered, i.qty_received, i.unit_cost, i.line_total
        FROM purchase_order_items i
        JOIN product_variants v ON v.id=i.variant_id
        JOIN products p ON p.id=v.product_id
        WHERE i.po_id=:p
    """), {"p": po_id}).mappings().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f'Orden de Compra #{po_id}', f'Proveedor: {po["supplier_name"]}',
                f'Estado: {po["status"]}', f'Moneda: {po["currency"]}',
                f'Total: {po["total"]}', f'Nota: {po["note"] or ""}'])
    w.writerow([])
    w.writerow(['Producto','SKU Variante','Talla','Color','Cant. Pedida','Cant. Recibida','Costo Unit.','Total Línea'])
    for r in items:
        w.writerow([r['product_name'], r['variant_sku'], r['size'] or '', r['color'] or '',
                    r['qty_ordered'], r['qty_received'], r['unit_cost'], r['line_total']])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="OC_{po_id}.csv"'})
