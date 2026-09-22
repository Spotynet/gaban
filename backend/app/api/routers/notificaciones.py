"""Notificaciones/alertas agregadas de todos los módulos para el tenant."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db, set_search_path
from app.core.tenancy import get_current_user, CurrentUser

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])


@router.get("")
def notifications(due_days: int = 7, db: Session = Depends(get_db),
                  user: CurrentUser = Depends(get_current_user)):
    """Devuelve alertas de inventario, compras, ventas, bancos y promociones."""
    if not user.tenant_id or not user.schema:
        return {"total": 0, "alerts": []}
    set_search_path(db, user.schema)
    alerts = []

    # --- Inventario: stock crítico ---
    row = db.execute(text("""
        SELECT COUNT(*) AS c,
               COUNT(*) FILTER (WHERE quantity <= 0) AS agotados
        FROM inventory WHERE quantity <= min_stock""")).mappings().first()
    if row and row["c"] > 0:
        sample = db.execute(text("""
            SELECT v.variant_sku FROM inventory i JOIN product_variants v ON v.id=i.variant_id
            WHERE i.quantity <= i.min_stock ORDER BY i.quantity LIMIT 5""")).scalars().all()
        alerts.append({
            "module": "Inventario",
            "severity": "critical" if row["agotados"] > 0 else "warning",
            "title": f"{row['c']} variante(s) en/bajo el mínimo" + (f" · {row['agotados']} agotada(s)" if row["agotados"] else ""),
            "detail": ", ".join(sample) + ("…" if row["c"] > 5 else ""),
        })

    # --- Compras: facturas vencidas y por vencer ---
    inv = db.execute(text(f"""
        SELECT
          COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at < current_date) AS vencidas,
          COALESCE(SUM(balance) FILTER (WHERE due_at IS NOT NULL AND due_at < current_date),0) AS m_vencidas,
          COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at >= current_date AND due_at <= current_date + :d) AS por_vencer,
          COALESCE(SUM(balance) FILTER (WHERE due_at IS NOT NULL AND due_at >= current_date AND due_at <= current_date + :d),0) AS m_por_vencer
        FROM supplier_invoices WHERE balance > 0"""), {"d": due_days}).mappings().first()
    if inv and inv["vencidas"] > 0:
        alerts.append({"module": "Compras", "severity": "critical",
                       "title": f"{inv['vencidas']} factura(s) de proveedor VENCIDA(s)",
                       "detail": f"Saldo vencido: {float(inv['m_vencidas']):.2f}"})
    if inv and inv["por_vencer"] > 0:
        alerts.append({"module": "Compras", "severity": "warning",
                       "title": f"{inv['por_vencer']} factura(s) por vencer en {due_days} días",
                       "detail": f"Saldo próximo: {float(inv['m_por_vencer']):.2f}"})

    # --- Ventas: pedidos pendientes de entrega ---
    ped = db.execute(text("""
        SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS m
        FROM sales WHERE kind='order' AND status <> 'delivered'""")).mappings().first()
    if ped and ped["c"] > 0:
        alerts.append({"module": "Ventas", "severity": "info",
                       "title": f"{ped['c']} pedido(s) pendiente(s) de entrega",
                       "detail": f"Monto: {float(ped['m']):.2f}"})

    # --- Bancos: saldo negativo ---
    banks = db.execute(text("""
        SELECT b.name, b.opening_balance
               + COALESCE(SUM(CASE WHEN m.type='ingreso' THEN m.amount ELSE -m.amount END),0) AS saldo
        FROM bank_accounts b LEFT JOIN bank_movements m ON m.bank_account_id=b.id
        WHERE b.is_active GROUP BY b.id HAVING (b.opening_balance
               + COALESCE(SUM(CASE WHEN m.type='ingreso' THEN m.amount ELSE -m.amount END),0)) < 0""")).mappings().all()
    for b in banks:
        alerts.append({"module": "Bancos", "severity": "critical",
                       "title": f"Saldo negativo en {b['name']}",
                       "detail": f"Saldo: {float(b['saldo']):.2f}"})

    # --- Promociones por expirar ---
    promos = db.execute(text(f"""
        SELECT name, to_char(ends_at,'YYYY-MM-DD') AS fin FROM promotions
        WHERE is_active AND ends_at IS NOT NULL
          AND ends_at >= current_date AND ends_at <= current_date + :d"""), {"d": due_days}).mappings().all()
    for p in promos:
        alerts.append({"module": "Promociones", "severity": "info",
                       "title": f"Promoción '{p['name']}' vence pronto",
                       "detail": f"Vence: {p['fin']}"})

    order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: order.get(a["severity"], 3))
    return {"total": len(alerts), "alerts": alerts}
