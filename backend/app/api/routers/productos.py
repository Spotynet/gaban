"""Módulo Productos: alta de productos, variantes (con EAN) y catálogos."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.tenancy import get_tenant_db, require_scope
from app.models.tenant_models import ProductType, Category

router = APIRouter(prefix="/api/productos", tags=["productos"])


class VariantIn(BaseModel):
    variant_sku: str
    ean13: str | None = None
    size: str | None = None
    color: str | None = None
    cost_price: float = 0
    sale_price: float = 0
    currency: str = "USD"
    attributes: dict = {}


class ProductIn(BaseModel):
    sku: str
    name: str
    description: str | None = None
    product_type_id: int
    category_id: int | None = None
    brand_id: int | None = None
    unit_id: int | None = None
    photo_url: str | None = None
    attributes: dict = {}
    color_chart_id: int | None = None
    size_chart_id: int | None = None
    is_asset: bool = True
    available_for_purchase: bool = True
    available_for_sale: bool = True
    price_mode: str = "fixed"
    currency: str = "USD"
    variants: list[VariantIn] = []


class ProductUpdateIn(BaseModel):
    sku: str
    name: str
    description: str | None = None
    product_type_id: int
    category_id: int | None = None
    brand_id: int | None = None
    unit_id: int | None = None
    is_asset: bool = True
    available_for_purchase: bool = True
    available_for_sale: bool = True
    price_mode: str = "fixed"
    currency: str = "USD"
    is_active: bool = True


def _next_product_code(db: Session) -> str:
    """Generate next product code in format YYYY-NNNNNN."""
    year = datetime.now().year
    row = db.execute(text("""
        INSERT INTO product_code_sequences (year, last_seq)
        VALUES (:yr, 1)
        ON CONFLICT (year) DO UPDATE
            SET last_seq = product_code_sequences.last_seq + 1
        RETURNING last_seq
    """), {"yr": year}).first()
    return f"{year}-{row[0]:06d}"


@router.get("/tipos")
def list_types(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    return db.query(ProductType).all()


@router.get("/categorias")
def list_categories(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    return db.query(Category).all()


@router.get("/variantes")
def list_variants(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    """Listado plano de variantes (para selección en compras e inventarios)."""
    rows = db.execute(text("""
        SELECT v.id, v.variant_sku, v.ean13, v.size, v.color,
               v.cost_price, v.sale_price, v.currency,
               p.name AS product_name, p.sku AS product_sku, p.product_code
        FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.is_active ORDER BY p.name, v.variant_sku
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("")
def list_products(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    rows = db.execute(text("""
        SELECT p.id, p.sku, p.product_code, p.name, p.description, p.is_active,
               p.product_type_id, p.category_id, p.brand_id, p.unit_id,
               p.color_chart_id, p.size_chart_id,
               p.is_asset, p.available_for_purchase, p.available_for_sale,
               p.price_mode, p.currency, p.created_at,
               pt.name  AS type_name,
               c.name   AS category_name,
               b.name   AS brand_name,
               u.code   AS unit_code,
               u.name   AS unit_name,
               cc.name  AS color_chart_name,
               sc.name  AS size_chart_name,
               COUNT(v.id) AS variant_count
        FROM products p
        LEFT JOIN product_types pt ON pt.id = p.product_type_id
        LEFT JOIN categories    c  ON c.id  = p.category_id
        LEFT JOIN brands        b  ON b.id  = p.brand_id
        LEFT JOIN units         u  ON u.id  = p.unit_id
        LEFT JOIN color_charts  cc ON cc.id = p.color_chart_id
        LEFT JOIN size_charts   sc ON sc.id = p.size_chart_id
        LEFT JOIN product_variants v ON v.product_id = p.id AND v.is_active
        GROUP BY p.id, pt.name, c.name, b.name, u.code, u.name, cc.name, sc.name
        ORDER BY p.name
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.post("")
def create_product(data: ProductIn, db: Session = Depends(get_tenant_db),
                   _=Depends(require_scope("products:write"))):
    import json as _json
    from sqlalchemy.exc import IntegrityError
    try:
        product_code = _next_product_code(db)
        row = db.execute(text("""
            INSERT INTO products (sku, product_code, name, description,
                                  product_type_id, category_id, brand_id, unit_id,
                                  photo_url, attributes, color_chart_id, size_chart_id,
                                  is_asset, available_for_purchase, available_for_sale,
                                  price_mode, currency)
            VALUES (:sku,:pcode,:name,:desc,:type_id,:cat_id,:brand_id,:unit_id,
                    :photo,:attrs,:cc_id,:sc_id,:asset,:apurch,:asale,:pmode,:curr)
            RETURNING id
        """), {
            "sku":     data.sku,
            "pcode":   product_code,
            "name":    data.name,
            "desc":    data.description,
            "type_id": data.product_type_id,
            "cat_id":  data.category_id,
            "brand_id":data.brand_id,
            "unit_id": data.unit_id,
            "photo":   data.photo_url,
            "attrs":   _json.dumps(data.attributes),
            "cc_id":   data.color_chart_id,
            "sc_id":   data.size_chart_id,
            "asset":   data.is_asset,
            "apurch":  data.available_for_purchase,
            "asale":   data.available_for_sale,
            "pmode":   data.price_mode,
            "curr":    data.currency,
        }).first()
        product_id = row[0]
        variant_ids = []
        for v in data.variants:
            vid = db.execute(text("""
                INSERT INTO product_variants (product_id, variant_sku, ean13, size, color,
                                              cost_price, sale_price, currency, attributes)
                VALUES (:pid,:vsku,:ean,:size,:color,:cost,:sale,:curr,:attrs)
                RETURNING id
            """), {
                "pid":   product_id,
                "vsku":  v.variant_sku,
                "ean":   v.ean13 or None,
                "size":  v.size or None,
                "color": v.color or None,
                "cost":  v.cost_price,
                "sale":  v.sale_price,
                "curr":  v.currency or data.currency,
                "attrs": _json.dumps(v.attributes),
            }).scalar()
            variant_ids.append({"variant_sku": v.variant_sku, "id": vid})
        db.commit()
        return {
            "id": product_id,
            "sku": data.sku,
            "product_code": product_code,
            "variants": len(data.variants),
            "variant_ids": variant_ids,
        }
    except IntegrityError as e:
        db.rollback()
        msg = str(e.orig)
        if "variant_sku" in msg:
            raise HTTPException(status_code=400, detail="Una o más referencias de variante (SKU) ya están en uso. Verifica que no existan duplicados.")
        if "ean13" in msg or "ix_variants_ean" in msg:
            raise HTTPException(status_code=400, detail="Uno o más códigos de barras ya están asignados a otra variante. Deja los campos vacíos para auto-generar.")
        if "sku" in msg.lower():
            raise HTTPException(status_code=400, detail=f"Ya existe un producto con la referencia SKU '{data.sku}'. Usa una referencia diferente.")
        raise HTTPException(status_code=400, detail=f"Error de integridad al guardar el producto: {msg[:200]}")


@router.patch("/{product_id}")
def update_product(product_id: int, data: ProductUpdateIn,
                   db: Session = Depends(get_tenant_db),
                   _=Depends(require_scope("products:write"))):
    from sqlalchemy.exc import IntegrityError
    existing = db.execute(text("SELECT id FROM products WHERE id=:id"), {"id": product_id}).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    sku = data.sku.strip().upper()
    try:
        db.execute(text("""
            UPDATE products SET
                sku=:sku, name=:name, description=:desc,
                product_type_id=:type_id, category_id=:cat_id,
                brand_id=:brand_id, unit_id=:unit_id,
                is_asset=:asset, available_for_purchase=:apurch,
                available_for_sale=:asale, price_mode=:pmode,
                currency=:curr, is_active=:active
            WHERE id=:id
        """), {
            "sku":     sku,
            "name":    data.name,
            "desc":    data.description,
            "type_id": data.product_type_id,
            "cat_id":  data.category_id,
            "brand_id":data.brand_id,
            "unit_id": data.unit_id,
            "asset":   data.is_asset,
            "apurch":  data.available_for_purchase,
            "asale":   data.available_for_sale,
            "pmode":   data.price_mode,
            "curr":    data.currency,
            "active":  data.is_active,
            "id":      product_id,
        })
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Ya existe otro producto con la referencia '{sku}'")
    return {"ok": True}


@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_tenant_db),
                   _=Depends(require_scope("products:write"))):
    # Check all modules for any usage
    checks = [
        ("SELECT 1 FROM sale_items si JOIN product_variants v ON v.id=si.variant_id WHERE v.product_id=:id LIMIT 1",
         "ventas registradas"),
        ("SELECT 1 FROM purchase_order_items poi JOIN product_variants v ON v.id=poi.variant_id WHERE v.product_id=:id LIMIT 1",
         "órdenes de compra"),
        ("SELECT 1 FROM kardex k JOIN product_variants v ON v.id=k.variant_id WHERE v.product_id=:id LIMIT 1",
         "movimientos de inventario"),
    ]
    modules_used = []
    for sql, label in checks:
        if db.execute(text(sql), {"id": product_id}).first():
            modules_used.append(label)
    if modules_used:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar: el producto tiene registros en {', '.join(modules_used)}"
        )
    db.execute(text("DELETE FROM product_variants WHERE product_id=:id"), {"id": product_id})
    db.execute(text("DELETE FROM products WHERE id=:id"), {"id": product_id})
    db.commit()
    return {"ok": True}


class VariantBarcodeIn(BaseModel):
    ean13: str | None = None


@router.patch("/{product_id}/variantes/{variant_id}/barcode")
def update_variant_barcode(product_id: int, variant_id: int, data: VariantBarcodeIn,
                           db: Session = Depends(get_tenant_db),
                           _=Depends(require_scope("products:write"))):
    row = db.execute(text("SELECT id FROM product_variants WHERE id=:vid AND product_id=:pid"),
                     {"vid": variant_id, "pid": product_id}).first()
    if not row:
        raise HTTPException(404, "Variante no encontrada")
    from sqlalchemy.exc import IntegrityError
    try:
        db.execute(text("UPDATE product_variants SET ean13=:ean WHERE id=:id"),
                   {"ean": data.ean13 or None, "id": variant_id})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, f"El código '{data.ean13}' ya está asignado a otra variante")
    return {"ok": True}


@router.patch("/{product_id}/variantes/barcodes-bulk")
def update_variant_barcodes_bulk(product_id: int, data: list[dict],
                                 db: Session = Depends(get_tenant_db),
                                 _=Depends(require_scope("products:write"))):
    """Actualiza los códigos de barras de múltiples variantes en una sola llamada."""
    from sqlalchemy.exc import IntegrityError, DataError
    skipped = 0
    for item in data:
        vid  = item.get("id")
        ean  = (item.get("ean13") or "").strip() or None
        if not vid:
            continue
        if ean and len(ean) > 100:
            ean = ean[:100]
        try:
            db.execute(text("UPDATE product_variants SET ean13=:ean WHERE id=:id AND product_id=:pid"),
                       {"ean": ean, "id": vid, "pid": product_id})
        except (IntegrityError, DataError) as e:
            db.rollback()
            msg = str(getattr(e, 'orig', e))
            if "unique" in msg.lower() or "duplicate" in msg.lower():
                skipped += 1
                continue
            raise HTTPException(400, f"Error al guardar código '{ean}': {msg[:120]}")
    db.commit()
    return {"ok": True, "updated": len(data) - skipped, "skipped": skipped}


@router.get("/buscar-ean/{ean}")
def find_by_ean(ean: str, db: Session = Depends(get_tenant_db),
                _=Depends(require_scope("products:read"))):
    """Usado por el POS y por ingreso de inventario para leer códigos de barras."""
    rows = db.execute(text("""
        SELECT v.id, v.variant_sku, v.ean13, v.size, v.color,
               v.sale_price, v.currency
        FROM product_variants v WHERE v.ean13=:ean LIMIT 1
    """), {"ean": ean}).mappings().first()
    if not rows:
        return {"found": False}
    r = dict(rows)
    return {"found": True, "variant_id": r["id"], "sku": r["variant_sku"],
            "sale_price": float(r["sale_price"]), "size": r["size"], "color": r["color"]}
