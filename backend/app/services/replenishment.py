"""Sugerencia de reabastecimiento: compara stock vs mínimo por proveedor preferido."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def suggest_reorders(db: Session, branch_id: str) -> list[dict]:
    """Devuelve variantes en/bajo el mínimo, con la cantidad sugerida a pedir
    y su proveedor preferido (si existe)."""
    rows = db.execute(text("""
        SELECT i.variant_id, v.variant_sku, v.ean13, v.size, v.color,
               i.quantity, i.min_stock, i.max_stock,
               -- cantidad a pedir: llevar al máximo, o al doble del mínimo si no hay máximo
               GREATEST(COALESCE(i.max_stock, i.min_stock * 2), i.min_stock + 1) - i.quantity
                   AS suggested_qty,
               sp.supplier_id, s.name AS supplier_name, s.currency AS supplier_currency,
               COALESCE(sp.last_cost, v.cost_price) AS unit_cost
        FROM inventory i
        JOIN product_variants v ON v.id = i.variant_id
        LEFT JOIN supplier_products sp ON sp.variant_id = i.variant_id AND sp.is_preferred
        LEFT JOIN suppliers s ON s.id = sp.supplier_id
        WHERE i.branch_id = :b AND i.quantity <= i.min_stock
        ORDER BY sp.supplier_id NULLS LAST, v.variant_sku
    """), {"b": branch_id}).mappings().all()
    result = []
    for r in rows:
        d = dict(r)
        d["suggested_qty"] = float(d["suggested_qty"] or 0)
        d["quantity"] = float(d["quantity"])
        d["min_stock"] = float(d["min_stock"])
        d["unit_cost"] = float(d["unit_cost"] or 0)
        result.append(d)
    return result
