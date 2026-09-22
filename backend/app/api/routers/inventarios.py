"""Módulo Inventarios: consulta de stock, kardex e ingresos/ajustes manuales."""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.tenancy import get_tenant_db, require_scope, CurrentUser, get_current_user
from app.services.inventory import move_stock

router = APIRouter(prefix="/api/inventarios", tags=["inventarios"])


@router.get("/stock/{branch_id}")
def stock(branch_id: str, db: Session = Depends(get_tenant_db),
          _=Depends(require_scope("inventory:read"))):
    rows = db.execute(text("""
        SELECT i.variant_id, v.variant_sku, v.ean13, v.size, v.color, i.quantity, i.min_stock
        FROM inventory i JOIN product_variants v ON v.id = i.variant_id
        WHERE i.branch_id = :b ORDER BY v.variant_sku"""), {"b": branch_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/kardex/{variant_id}/{branch_id}")
def kardex(variant_id: int, branch_id: str, db: Session = Depends(get_tenant_db),
           _=Depends(require_scope("inventory:read"))):
    rows = db.execute(text("""
        SELECT movement_type, quantity, unit_cost, balance_after, ref_type, ref_id, created_at
        FROM kardex WHERE variant_id=:v AND branch_id=:b ORDER BY created_at"""),
        {"v": variant_id, "b": branch_id}).mappings().all()
    return [dict(r) for r in rows]


class AdjustIn(BaseModel):
    variant_id: int
    branch_id: str
    quantity: float   # + ingreso manual, - salida manual
    note: str | None = None


@router.post("/ajuste")
def adjust(data: AdjustIn, db: Session = Depends(get_tenant_db),
           user: CurrentUser = Depends(require_scope("inventory:write"))):
    q = Decimal(str(data.quantity))
    mt = "ajuste_positivo" if q >= 0 else "ajuste_negativo"
    try:
        balance = move_stock(db, variant_id=data.variant_id, branch_id=data.branch_id,
                             quantity=q, movement_type=mt, ref_type="adjustment",
                             user_id=user.id, note=data.note)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))
    db.commit()
    return {"variant_id": data.variant_id, "balance": float(balance)}


# ============ TRASLADOS ENTRE SUCURSALES ============
class TransferIn(BaseModel):
    variant_id: int
    from_branch: str
    to_branch: str
    quantity: float
    note: str | None = None


@router.post("/traslado")
def transfer(data: TransferIn, db: Session = Depends(get_tenant_db),
             user: CurrentUser = Depends(require_scope("inventory:write"))):
    if data.from_branch == data.to_branch:
        raise HTTPException(400, "El origen y el destino deben ser distintos")
    q = Decimal(str(data.quantity))
    if q <= 0:
        raise HTTPException(400, "La cantidad debe ser positiva")

    tid = db.execute(text("""INSERT INTO inventory_transfers
        (variant_id, from_branch, to_branch, quantity, note, created_by)
        VALUES (:v,:f,:t,:q,:n,:u) RETURNING id"""),
        {"v": data.variant_id, "f": data.from_branch, "t": data.to_branch,
         "q": q, "n": data.note, "u": user.id}).scalar()

    # Salida de origen (valida stock) y entrada a destino, ambas en la misma transacción
    try:
        move_stock(db, variant_id=data.variant_id, branch_id=data.from_branch, quantity=-q,
                   movement_type="traslado_salida", ref_type="transfer", ref_id=tid,
                   user_id=user.id, note="Traslado a otra sucursal")
        move_stock(db, variant_id=data.variant_id, branch_id=data.to_branch, quantity=q,
                   movement_type="traslado_entrada", ref_type="transfer", ref_id=tid,
                   user_id=user.id, note="Traslado desde otra sucursal")
    except ValueError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))
    db.commit()
    return {"transfer_id": tid}


@router.get("/traslados")
def list_transfers(db: Session = Depends(get_tenant_db), _=Depends(require_scope("inventory:read"))):
    rows = db.execute(text("""
        SELECT t.id, t.quantity, t.note, t.created_at, v.variant_sku, v.ean13,
               t.from_branch, t.to_branch
        FROM inventory_transfers t JOIN product_variants v ON v.id = t.variant_id
        ORDER BY t.created_at DESC LIMIT 200""")).mappings().all()
    return [dict(r) for r in rows]


# ============ STOCK RESUMEN (enriquecido) ============
@router.get("/stock-resumen/{branch_id}")
def stock_resumen(branch_id: str, db: Session = Depends(get_tenant_db),
                  _=Depends(require_scope("inventory:read"))):
    rows = db.execute(text("""
        SELECT
            i.variant_id, v.variant_sku, v.ean13, v.size, v.color,
            v.cost_price, v.sale_price,
            p.id as product_id, p.name as product_name, p.sku as product_sku,
            i.quantity, i.min_stock, i.max_stock, i.updated_at,
            CASE WHEN i.quantity <= i.min_stock THEN true ELSE false END as below_min,
            CASE WHEN i.max_stock IS NOT NULL AND i.quantity >= i.max_stock THEN true ELSE false END as above_max,
            (i.quantity * v.cost_price) as stock_value
        FROM inventory i
        JOIN product_variants v ON v.id = i.variant_id
        JOIN products p ON p.id = v.product_id
        WHERE i.branch_id = :b
        ORDER BY p.name, v.size, v.color
    """), {"b": branch_id}).mappings().all()
    return [dict(r) for r in rows]


# ============ KARDEX ENRIQUECIDO ============
@router.get("/kardex-full/{branch_id}")
def kardex_full(branch_id: str, limit: int = 300, db: Session = Depends(get_tenant_db),
                _=Depends(require_scope("inventory:read"))):
    rows = db.execute(text("""
        SELECT k.id, k.variant_id, v.variant_sku, v.ean13, p.name as product_name,
               v.size, v.color,
               k.movement_type, k.quantity, k.unit_cost, k.balance_after,
               k.ref_type, k.ref_id, k.note, k.created_at
        FROM kardex k
        JOIN product_variants v ON v.id = k.variant_id
        JOIN products p ON p.id = v.product_id
        WHERE k.branch_id = :b
        ORDER BY k.created_at DESC LIMIT :lim
    """), {"b": branch_id, "lim": limit}).mappings().all()
    return [dict(r) for r in rows]


# ============ BODEGAS ============
class WarehouseIn(BaseModel):
    branch_id: str
    code: str
    name: str
    description: str | None = None


@router.get("/bodegas")
def list_warehouses(branch_id: str | None = None, db: Session = Depends(get_tenant_db),
                    _=Depends(require_scope("inventory:read"))):
    sql = "SELECT * FROM warehouses WHERE is_active=true"
    params: dict = {}
    if branch_id:
        sql += " AND branch_id = :b"
        params["b"] = branch_id
    sql += " ORDER BY name"
    return [dict(r) for r in db.execute(text(sql), params).mappings().all()]


@router.post("/bodegas")
def create_warehouse(data: WarehouseIn, db: Session = Depends(get_tenant_db),
                     _=Depends(require_scope("inventory:write"))):
    try:
        row = db.execute(text("""
            INSERT INTO warehouses (branch_id,code,name,description)
            VALUES (:b,:c,:n,:d) RETURNING *
        """), {"b": data.branch_id, "c": data.code.upper().strip(),
               "n": data.name.strip(), "d": data.description}).mappings().first()
        db.commit()
        return dict(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(400, str(e))


@router.patch("/bodegas/{wid}")
def update_warehouse(wid: int, data: WarehouseIn, db: Session = Depends(get_tenant_db),
                     _=Depends(require_scope("inventory:write"))):
    db.execute(text("""
        UPDATE warehouses SET code=:c, name=:n, description=:d WHERE id=:id
    """), {"c": data.code.upper().strip(), "n": data.name.strip(),
           "d": data.description, "id": wid})
    db.commit()
    return {"ok": True}


@router.delete("/bodegas/{wid}")
def delete_warehouse(wid: int, db: Session = Depends(get_tenant_db),
                     _=Depends(require_scope("inventory:write"))):
    db.execute(text("UPDATE warehouses SET is_active=false WHERE id=:id"), {"id": wid})
    db.commit()
    return {"ok": True}


# ============ INVENTARIO FÍSICO ============
class PhysicalInvIn(BaseModel):
    branch_id: str
    warehouse_id: int | None = None
    name: str
    note: str | None = None


@router.get("/inventarios-fisicos")
def list_physical_invs(branch_id: str | None = None, db: Session = Depends(get_tenant_db),
                       _=Depends(require_scope("inventory:read"))):
    sql = """
        SELECT pi.*, w.name as warehouse_name,
               (SELECT count(*) FROM physical_inventory_lines l WHERE l.physical_inv_id=pi.id) as line_count
        FROM physical_inventories pi LEFT JOIN warehouses w ON w.id=pi.warehouse_id
        WHERE 1=1
    """
    params: dict = {}
    if branch_id:
        sql += " AND pi.branch_id=:b"
        params["b"] = branch_id
    sql += " ORDER BY pi.created_at DESC"
    return [dict(r) for r in db.execute(text(sql), params).mappings().all()]


@router.post("/inventarios-fisicos")
def create_physical_inv(data: PhysicalInvIn, db: Session = Depends(get_tenant_db),
                        user: CurrentUser = Depends(require_scope("inventory:write"))):
    row = db.execute(text("""
        INSERT INTO physical_inventories (branch_id,warehouse_id,name,note,created_by,status)
        VALUES (:b,:w,:n,:note,:u,'draft') RETURNING *
    """), {"b": data.branch_id, "w": data.warehouse_id, "n": data.name,
           "note": data.note, "u": user.id}).mappings().first()
    db.commit()
    return dict(row)


@router.get("/inventarios-fisicos/{inv_id}/lineas")
def get_physical_inv_lines(inv_id: int, db: Session = Depends(get_tenant_db),
                           _=Depends(require_scope("inventory:read"))):
    rows = db.execute(text("""
        SELECT l.*, v.variant_sku, v.size, v.color, v.ean13, p.name as product_name
        FROM physical_inventory_lines l
        JOIN product_variants v ON v.id=l.variant_id
        JOIN products p ON p.id=v.product_id
        WHERE l.physical_inv_id=:id ORDER BY p.name, v.variant_sku
    """), {"id": inv_id}).mappings().all()
    return [dict(r) for r in rows]


class LineUpsertIn(BaseModel):
    variant_id: int
    counted_qty: float | None = None
    note: str | None = None


@router.put("/inventarios-fisicos/{inv_id}/lineas")
def upsert_lines(inv_id: int, lines: list[LineUpsertIn],
                 db: Session = Depends(get_tenant_db),
                 _=Depends(require_scope("inventory:write"))):
    inv = db.execute(text("SELECT branch_id, status FROM physical_inventories WHERE id=:id"),
                     {"id": inv_id}).first()
    if not inv:
        raise HTTPException(404, "Inventario físico no encontrado")
    if inv[1] == "closed":
        raise HTTPException(400, "El inventario físico ya está cerrado")

    db.execute(text("UPDATE physical_inventories SET status='in_progress' WHERE id=:id AND status='draft'"),
               {"id": inv_id})
    branch_id = inv[0]
    for ln in lines:
        sys_qty = db.execute(
            text("SELECT COALESCE(quantity,0) FROM inventory WHERE variant_id=:v AND branch_id=:b"),
            {"v": ln.variant_id, "b": branch_id}
        ).scalar() or 0
        db.execute(text("""
            INSERT INTO physical_inventory_lines (physical_inv_id, variant_id, system_qty, counted_qty, note)
            VALUES (:inv,:v,:sq,:cq,:n)
            ON CONFLICT (physical_inv_id, variant_id) DO UPDATE
                SET counted_qty=EXCLUDED.counted_qty, note=EXCLUDED.note, system_qty=EXCLUDED.system_qty
        """), {"inv": inv_id, "v": ln.variant_id, "sq": float(sys_qty),
               "cq": ln.counted_qty, "n": ln.note})
    db.commit()
    return {"ok": True}


@router.post("/inventarios-fisicos/{inv_id}/cerrar")
def close_physical_inv(inv_id: int, apply_adjustments: bool = True,
                       db: Session = Depends(get_tenant_db),
                       user: CurrentUser = Depends(require_scope("inventory:write"))):
    inv = db.execute(text("SELECT branch_id, status FROM physical_inventories WHERE id=:id"),
                     {"id": inv_id}).first()
    if not inv:
        raise HTTPException(404)
    if inv[1] == "closed":
        raise HTTPException(400, "Ya cerrado")

    branch_id = inv[0]
    adjusted = 0
    if apply_adjustments:
        lines = db.execute(text("""
            SELECT variant_id, counted_qty, system_qty, difference
            FROM physical_inventory_lines
            WHERE physical_inv_id=:id AND counted_qty IS NOT NULL
        """), {"id": inv_id}).all()
        for ln in lines:
            diff = Decimal(str(ln[3] or 0))
            if diff != 0:
                move_stock(db, variant_id=ln[0], branch_id=branch_id,
                           quantity=diff, movement_type="inventario_fisico",
                           ref_type="physical_inventory", ref_id=inv_id,
                           user_id=user.id,
                           note=f"Ajuste inventario físico #{inv_id}")
                adjusted += 1

    db.execute(text("""
        UPDATE physical_inventories SET status='closed', closed_by=:u, closed_at=now() WHERE id=:id
    """), {"u": user.id, "id": inv_id})
    db.commit()
    return {"ok": True, "adjusted_lines": adjusted}


# ============ SALDO INICIAL ============
class InitialStockIn(BaseModel):
    branch_id: str
    items: list[dict]


@router.post("/saldo-inicial")
def set_initial_stock(data: InitialStockIn, db: Session = Depends(get_tenant_db),
                      user: CurrentUser = Depends(require_scope("inventory:write"))):
    results = []
    for item in data.items:
        vid = item["variant_id"]
        qty = Decimal(str(item.get("quantity", 0)))
        cost = Decimal(str(item["unit_cost"])) if item.get("unit_cost") else None
        note = item.get("note") or "Saldo inicial"
        existing = db.execute(
            text("SELECT count(*) FROM kardex WHERE variant_id=:v AND branch_id=:b"),
            {"v": vid, "b": data.branch_id}
        ).scalar()
        if existing > 0:
            results.append({"variant_id": vid, "skipped": True, "reason": "Ya tiene movimientos"})
            continue
        balance = move_stock(db, variant_id=vid, branch_id=data.branch_id,
                             quantity=qty, movement_type="saldo_inicial",
                             unit_cost=cost, ref_type="initial_stock",
                             user_id=user.id, note=note)
        results.append({"variant_id": vid, "balance": float(balance)})
    db.commit()
    return results


# ============ BAJA DIRECTA ============
class WriteOffIn(BaseModel):
    variant_id: int
    branch_id: str
    quantity: float
    reason: str
    note: str | None = None


@router.post("/baja")
def write_off(data: WriteOffIn, db: Session = Depends(get_tenant_db),
              user: CurrentUser = Depends(require_scope("inventory:write"))):
    q = Decimal(str(data.quantity))
    if q <= 0:
        raise HTTPException(400, "Cantidad debe ser positiva")
    try:
        balance = move_stock(db, variant_id=data.variant_id, branch_id=data.branch_id,
                             quantity=-q, movement_type="baja_directa",
                             ref_type="writeoff", user_id=user.id,
                             note=f"[{data.reason}] {data.note or ''}")
    except ValueError as e:
        db.rollback()
        raise HTTPException(400, str(e))
    db.commit()
    return {"balance": float(balance)}


# ============ EXPORTACIÓN CSV ============
from fastapi.responses import StreamingResponse
import csv, io


@router.get("/export/stock/{branch_id}")
def export_stock_csv(branch_id: str, db=Depends(get_tenant_db), _=Depends(require_scope("inventory:read"))):
    rows = db.execute(text("""
        SELECT p.sku as product_sku, p.name as product_name, v.variant_sku, v.ean13,
               v.size, v.color, i.quantity, i.min_stock, i.max_stock,
               v.cost_price, v.sale_price,
               (i.quantity * v.cost_price) as stock_value, i.updated_at
        FROM inventory i
        JOIN product_variants v ON v.id=i.variant_id
        JOIN products p ON p.id=v.product_id
        WHERE i.branch_id=:b ORDER BY p.name, v.variant_sku
    """), {"b": branch_id}).mappings().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['Ref.Producto','Producto','SKU Variante','Código Barras','Talla','Color',
                'Cantidad','Stock Mín.','Stock Máx.','Costo Unit.','Precio Venta','Valor Stock','Actualizado'])
    for r in rows:
        w.writerow([r['product_sku'], r['product_name'], r['variant_sku'], r['ean13'] or '',
                    r['size'] or '', r['color'] or '', r['quantity'], r['min_stock'],
                    r['max_stock'] or '', r['cost_price'], r['sale_price'],
                    r['stock_value'], str(r['updated_at'])[:16]])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="inventario_{branch_id[:8]}.csv"'})


@router.get("/export/kardex/{branch_id}")
def export_kardex_csv(branch_id: str, db=Depends(get_tenant_db), _=Depends(require_scope("inventory:read"))):
    rows = db.execute(text("""
        SELECT k.created_at, p.name as product_name, v.variant_sku, v.size, v.color,
               k.movement_type, k.quantity, k.unit_cost, k.balance_after, k.ref_type, k.ref_id, k.note
        FROM kardex k
        JOIN product_variants v ON v.id=k.variant_id
        JOIN products p ON p.id=v.product_id
        WHERE k.branch_id=:b ORDER BY k.created_at DESC LIMIT 5000
    """), {"b": branch_id}).mappings().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['Fecha','Producto','SKU Variante','Talla','Color','Tipo Movimiento',
                'Cantidad','Costo Unit.','Saldo','Tipo Ref.','Ref. ID','Nota'])
    for r in rows:
        w.writerow([str(r['created_at'])[:16], r['product_name'], r['variant_sku'],
                    r['size'] or '', r['color'] or '', r['movement_type'],
                    r['quantity'], r['unit_cost'] or '', r['balance_after'],
                    r['ref_type'] or '', r['ref_id'] or '', r['note'] or ''])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="kardex_{branch_id[:8]}.csv"'})


@router.get("/export/inventario-fisico/{inv_id}")
def export_physical_inv_csv(inv_id: int, db=Depends(get_tenant_db), _=Depends(require_scope("inventory:read"))):
    inv = db.execute(text("SELECT name, status FROM physical_inventories WHERE id=:id"), {"id": inv_id}).first()
    if not inv:
        raise HTTPException(404)
    rows = db.execute(text("""
        SELECT p.name as product_name, v.variant_sku, v.ean13, v.size, v.color,
               l.system_qty, l.counted_qty, l.difference, l.note
        FROM physical_inventory_lines l
        JOIN product_variants v ON v.id=l.variant_id
        JOIN products p ON p.id=v.product_id
        WHERE l.physical_inv_id=:id ORDER BY p.name, v.variant_sku
    """), {"id": inv_id}).mappings().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['Producto','SKU Variante','Código Barras','Talla','Color',
                'Cantidad Sistema','Cantidad Contada','Diferencia','Nota'])
    for r in rows:
        w.writerow([r['product_name'], r['variant_sku'], r['ean13'] or '',
                    r['size'] or '', r['color'] or '',
                    r['system_qty'], r['counted_qty'] if r['counted_qty'] is not None else '',
                    r['difference'] if r['difference'] is not None else '', r['note'] or ''])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="inventario_fisico_{inv_id}.csv"'})


# ============ RECÁLCULO DE COSTO PROMEDIO PONDERADO ============
@router.post("/recalcular-costos/{branch_id}")
def recalcular_costos(
    branch_id: str,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(require_scope("inventory:write")),
):
    """Recalcula el costo promedio ponderado de cada variante usando todos los
    movimientos de entrada (compras, ajustes positivos, saldo inicial) del kardex.
    Actualiza cost_price en product_variants."""

    # Obtener todas las variantes con existencias en esta sucursal
    variants = db.execute(text(
        "SELECT DISTINCT variant_id FROM inventory WHERE branch_id = :b"
    ), {"b": branch_id}).fetchall()

    updated = 0
    details = []

    for (variant_id,) in variants:
        # Sumar todas las entradas con costo registrado en el kardex
        # (compras, saldo inicial, ajustes positivos con costo)
        result = db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN quantity > 0 AND unit_cost IS NOT NULL
                                  THEN quantity * unit_cost ELSE 0 END), 0) AS total_cost_value,
                COALESCE(SUM(CASE WHEN quantity > 0 AND unit_cost IS NOT NULL
                                  THEN quantity ELSE 0 END), 0)             AS total_qty_with_cost
            FROM kardex
            WHERE variant_id = :v
              AND branch_id  = :b
              AND quantity   > 0
        """), {"v": variant_id, "b": branch_id}).first()

        total_value   = Decimal(str(result[0]))
        total_qty     = Decimal(str(result[1]))

        if total_qty > 0:
            avg_cost = total_value / total_qty
            db.execute(text(
                "UPDATE product_variants SET cost_price = :c WHERE id = :v"
            ), {"c": avg_cost, "v": variant_id})
            details.append({"variant_id": variant_id, "avg_cost": float(avg_cost)})
            updated += 1

    db.commit()
    return {"updated": updated, "branch_id": branch_id, "details": details}
