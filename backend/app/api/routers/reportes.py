"""Reportes y KPIs del tenant para el dashboard."""
from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.tenancy import get_tenant_db, require_scope
from app.services import exporter

router = APIRouter(prefix="/api/reportes", tags=["reportes"])

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# Rango por defecto: últimos 30 días
_WHERE_FECHA = "s.created_at >= COALESCE(:desde, now() - interval '30 days') " \
               "AND s.created_at < COALESCE(:hasta, now() + interval '1 day')"


def _branch_filter(branch_id):
    return (" AND s.branch_id = :b" if branch_id else "", {"b": branch_id} if branch_id else {})


@router.get("/resumen")
def resumen(desde: str | None = None, hasta: str | None = None, branch_id: str | None = None,
            db: Session = Depends(get_tenant_db), _=Depends(require_scope("sales:read"))):
    bf, bp = _branch_filter(branch_id)
    params = {"desde": desde, "hasta": hasta, **bp}
    ventas = db.execute(text(f"""
        SELECT COUNT(*) AS num_ventas, COALESCE(SUM(total),0) AS total_ventas,
               COALESCE(AVG(total),0) AS ticket_promedio
        FROM sales s WHERE s.kind='sale' AND {_WHERE_FECHA}{bf}"""), params).mappings().first()
    pedidos = db.execute(text(f"""
        SELECT COUNT(*) AS pendientes, COALESCE(SUM(total),0) AS monto
        FROM sales s WHERE s.kind='order' AND s.status <> 'delivered'{bf}"""), bp).mappings().first()
    return {
        "num_ventas": ventas["num_ventas"],
        "total_ventas": float(ventas["total_ventas"]),
        "ticket_promedio": float(ventas["ticket_promedio"]),
        "pedidos_pendientes": pedidos["pendientes"],
        "pedidos_monto": float(pedidos["monto"]),
    }


@router.get("/ventas-por-dia")
def ventas_por_dia(desde: str | None = None, hasta: str | None = None, branch_id: str | None = None,
                   db: Session = Depends(get_tenant_db), _=Depends(require_scope("sales:read"))):
    bf, bp = _branch_filter(branch_id)
    params = {"desde": desde, "hasta": hasta, **bp}
    rows = db.execute(text(f"""
        SELECT to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD') AS dia,
               COUNT(*) AS ventas, COALESCE(SUM(total),0) AS total
        FROM sales s WHERE s.kind='sale' AND {_WHERE_FECHA}{bf}
        GROUP BY 1 ORDER BY 1"""), params).mappings().all()
    return [{"dia": r["dia"], "ventas": r["ventas"], "total": float(r["total"])} for r in rows]


@router.get("/top-productos")
def top_productos(limit: int = 10, desde: str | None = None, hasta: str | None = None,
                  branch_id: str | None = None, db: Session = Depends(get_tenant_db),
                  _=Depends(require_scope("sales:read"))):
    bf, bp = _branch_filter(branch_id)
    params = {"desde": desde, "hasta": hasta, "lim": limit, **bp}
    rows = db.execute(text(f"""
        SELECT p.name AS producto, v.variant_sku,
               SUM(si.quantity) AS unidades, SUM(si.line_total) AS ingresos
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN product_variants v ON v.id = si.variant_id
        JOIN products p ON p.id = v.product_id
        WHERE s.kind='sale' AND {_WHERE_FECHA}{bf}
        GROUP BY p.name, v.variant_sku
        ORDER BY unidades DESC LIMIT :lim"""), params).mappings().all()
    return [{"producto": r["producto"], "variant_sku": r["variant_sku"],
             "unidades": float(r["unidades"]), "ingresos": float(r["ingresos"])} for r in rows]


@router.get("/valor-inventario")
def valor_inventario(branch_id: str | None = None, db: Session = Depends(get_tenant_db),
                     _=Depends(require_scope("inventory:read"))):
    bf = " WHERE i.branch_id = :b" if branch_id else ""
    bp = {"b": branch_id} if branch_id else {}
    row = db.execute(text(f"""
        SELECT COALESCE(SUM(i.quantity * v.cost_price),0) AS valor_costo,
               COALESCE(SUM(i.quantity * v.sale_price),0) AS valor_venta,
               COUNT(*) FILTER (WHERE i.quantity <= i.min_stock) AS bajo_minimo,
               COUNT(*) AS lineas
        FROM inventory i JOIN product_variants v ON v.id = i.variant_id{bf}"""), bp).mappings().first()
    return {"valor_costo": float(row["valor_costo"]), "valor_venta": float(row["valor_venta"]),
            "bajo_minimo": row["bajo_minimo"], "lineas": row["lineas"]}


@router.get("/saldos")
def saldos(db: Session = Depends(get_tenant_db), _=Depends(require_scope("sales:read"))):
    """Cuentas por pagar (proveedores) y por cobrar (pedidos pendientes)."""
    cxp = db.execute(text("SELECT COALESCE(SUM(balance),0) AS s FROM supplier_invoices WHERE balance > 0")).scalar()
    cxc = db.execute(text("SELECT COALESCE(SUM(total),0) AS s FROM sales WHERE kind='order' AND status <> 'delivered'")).scalar()
    return {"cuentas_por_pagar": float(cxp or 0), "cuentas_por_cobrar": float(cxc or 0)}


# ============ EXPORTACIÓN ============
@router.get("/export/ventas.xlsx")
def export_ventas(desde: str | None = None, hasta: str | None = None, branch_id: str | None = None,
                  db: Session = Depends(get_tenant_db), _=Depends(require_scope("sales:read"))):
    bf, bp = _branch_filter(branch_id)
    params = {"desde": desde, "hasta": hasta, **bp}
    ventas = db.execute(text(f"""
        SELECT id, fiscal_serie, fiscal_folio, to_char(created_at,'YYYY-MM-DD HH24:MI') AS created_at,
               currency, subtotal, discount, tax, total, status
        FROM sales s WHERE s.kind='sale' AND {_WHERE_FECHA}{bf}
        ORDER BY created_at DESC"""), params).mappings().all()
    ventas = [{k: (float(v) if k in ("subtotal", "discount", "tax", "total") else v)
               for k, v in dict(r).items()} for r in ventas]
    top = _top(db, desde, hasta, branch_id, bf, bp)
    data = exporter.ventas_xlsx(ventas, top)
    return Response(data, media_type=XLSX_MIME,
                    headers={"Content-Disposition": "attachment; filename=ventas.xlsx"})


def _top(db, desde, hasta, branch_id, bf, bp):
    rows = db.execute(text(f"""
        SELECT p.name AS producto, v.variant_sku,
               SUM(si.quantity) AS unidades, SUM(si.line_total) AS ingresos
        FROM sale_items si JOIN sales s ON s.id = si.sale_id
        JOIN product_variants v ON v.id = si.variant_id JOIN products p ON p.id = v.product_id
        WHERE s.kind='sale' AND {_WHERE_FECHA}{bf}
        GROUP BY p.name, v.variant_sku ORDER BY unidades DESC LIMIT 20"""),
        {"desde": desde, "hasta": hasta, **bp}).mappings().all()
    return [{"producto": r["producto"], "variant_sku": r["variant_sku"],
             "unidades": float(r["unidades"]), "ingresos": float(r["ingresos"])} for r in rows]


@router.get("/export/inventario.xlsx")
def export_inventario(branch_id: str | None = None, db: Session = Depends(get_tenant_db),
                      _=Depends(require_scope("inventory:read"))):
    bf = " WHERE i.branch_id = :b" if branch_id else ""
    bp = {"b": branch_id} if branch_id else {}
    rows = db.execute(text(f"""
        SELECT v.variant_sku, v.ean13, v.size, v.color, i.quantity, i.min_stock,
               v.cost_price, (i.quantity * v.cost_price) AS valor
        FROM inventory i JOIN product_variants v ON v.id = i.variant_id{bf}
        ORDER BY v.variant_sku"""), bp).mappings().all()
    rows = [{k: (float(v) if k in ("quantity", "min_stock", "cost_price", "valor") else v)
             for k, v in dict(r).items()} for r in rows]
    resumen = valor_inventario(branch_id=branch_id, db=db, _=None)
    data = exporter.inventario_xlsx(rows, resumen)
    return Response(data, media_type=XLSX_MIME,
                    headers={"Content-Disposition": "attachment; filename=inventario.xlsx"})


@router.get("/export/resumen.pdf")
def export_resumen(desde: str | None = None, hasta: str | None = None, branch_id: str | None = None,
                   db: Session = Depends(get_tenant_db), _=Depends(require_scope("sales:read"))):
    r = resumen(desde=desde, hasta=hasta, branch_id=branch_id, db=db, _=None)
    saldos_d = saldos(db=db, _=None)
    por_dia = ventas_por_dia(desde=desde, hasta=hasta, branch_id=branch_id, db=db, _=None)
    kpis = {
        "Ventas del período": f'{r["total_ventas"]:.2f}',
        "Número de ventas": r["num_ventas"],
        "Ticket promedio": f'{r["ticket_promedio"]:.2f}',
        "Pedidos pendientes": r["pedidos_pendientes"],
        "Cuentas por pagar": f'{saldos_d["cuentas_por_pagar"]:.2f}',
        "Cuentas por cobrar": f'{saldos_d["cuentas_por_cobrar"]:.2f}',
    }
    periodo = f'Período: {desde or "últimos 30 días"} a {hasta or "hoy"}'
    data = exporter.resumen_pdf("Resumen ejecutivo — GabAn POS", periodo, kpis, por_dia)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=resumen.pdf"})
