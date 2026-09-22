"""Configuración global de módulos por tenant."""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db, set_search_path
from app.core.tenancy import get_current_user, CurrentUser, get_tenant_db, require_scope

router = APIRouter(prefix="/api/configuracion", tags=["configuracion"])

DEFAULTS = {
    "general": {
        "company_name": "",
        "legal_name": "",
        "tax_id": "",
        "phone": "",
        "address": "",
        "website": "",
        "timezone": "America/Bogota",
    },
    "pos": {
        "tax_default": 0,
        "allow_manual_discount": True,
        "allow_negative_stock_sale": False,
        "auto_print_receipt": False,
        "pos_default_mode": "sale",
        "require_customer": False,
        "allow_multi_payment": True,
        "max_discount_pct": 100,
        "payment_methods": ["efectivo", "tarjeta_credito", "tarjeta_debito", "transferencia", "cheque"],
    },
    "inventario": {
        "cost_method": "promedio",
        "low_stock_alert": True,
        "low_stock_threshold": 5,
        "allow_free_transfers": False,
        "track_serial": False,
        "barcode": {
            "enabled": False,
            "default_type": "ean13",
            "ean13_country": "770",
            "ean13_company": "0001",
            "ean13_variant_digits": 2,
            "ean_auto": True,
            "module_products": True,
            "module_inventory": True,
            "module_sales": True,
            "c128_prefix": "",
            "c128_source": "variant_sku",
            "qr_content": "sku",
        },
    },
    "compras": {
        "default_credit_days": 30,
        "auto_receive_po": False,
        "require_po_approval": False,
        "default_tax_pct": 0,
    },
    "fiscal": {
        "serie": "FE",
        "next_folio": 1,
        "tax_regime": "",
        "resolution_number": "",
        "resolution_date": "",
        "resolution_from": "",
        "resolution_to": "",
    },
    "seguridad": {
        "inactivity_enabled": False,
        "inactivity_timeout_minutes": 30,
    },
}

TIMEZONES = [
    "America/Bogota", "America/Mexico_City", "America/New_York",
    "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Lima", "America/Santiago", "America/Buenos_Aires",
    "America/Caracas", "America/Guayaquil", "America/La_Paz",
    "America/Asuncion", "America/Montevideo", "America/Panama",
    "America/Costa_Rica", "America/El_Salvador", "America/Guatemala",
    "America/Managua", "America/Tegucigalpa", "Europe/Madrid",
    "UTC",
]


def _require_admin(user: CurrentUser):
    if not user.tenant_id:
        raise HTTPException(403, "Solo tenants pueden configurar módulos")
    if user.role not in ("ADMINISTRADOR", "TENANT_ADMIN") and "*" not in user.scopes:
        raise HTTPException(403, "Solo el administrador del tenant puede cambiar la configuración")


def _merge(defaults: dict, saved: dict) -> dict:
    """Saved values take priority; defaults fill in missing keys. One level of deep merge for dict values."""
    result = {**defaults, **saved}
    for k, v in defaults.items():
        if isinstance(v, dict) and isinstance(saved.get(k), dict):
            result[k] = {**v, **saved[k]}
    return result


@router.get("")
def get_config(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.tenant_id:
        return {"defaults": DEFAULTS, "timezones": TIMEZONES}
    set_search_path(db, None)
    row = db.execute(
        text("SELECT name, base_currency, country, fiscal_config, settings FROM public.tenants WHERE id=:t"),
        {"t": user.tenant_id},
    ).mappings().first()
    if not row:
        raise HTTPException(404, "Tenant no encontrado")

    saved = row["settings"] or {}
    fiscal_saved = row["fiscal_config"] or {}

    config = {}
    for section, defs in DEFAULTS.items():
        src = fiscal_saved if section == "fiscal" else saved.get(section, {})
        config[section] = _merge(defs, src)

    # Merge general with tenant base fields
    config["general"]["company_name"] = config["general"]["company_name"] or row["name"]

    return {
        "tenant_name": row["name"],
        "base_currency": row["base_currency"],
        "country": row["country"] or "",
        "config": config,
        "timezones": TIMEZONES,
    }


@router.put("")
def save_config(
    payload: dict,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(user)
    set_search_path(db, None)

    row = db.execute(
        text("SELECT settings, fiscal_config FROM public.tenants WHERE id=:t"),
        {"t": user.tenant_id},
    ).mappings().first()
    if not row:
        raise HTTPException(404, "Tenant no encontrado")

    existing_settings = dict(row["settings"] or {})
    existing_fiscal = dict(row["fiscal_config"] or {})

    # Update base tenant fields
    base_updates = {}
    if "base_currency" in payload:
        base_updates["base_currency"] = payload["base_currency"]
    if "country" in payload:
        base_updates["country"] = (payload["country"] or "").upper()[:2]

    # Update sections
    new_settings = dict(existing_settings)
    new_fiscal = dict(existing_fiscal)

    for section in ("general", "pos", "inventario", "compras", "seguridad"):
        if section in payload:
            # preserve existing saved fields, apply payload on top (addr_* and others survive)
            existing_section = existing_settings.get(section, {})
            new_settings[section] = {**DEFAULTS.get(section, {}), **existing_section, **payload[section]}

    if "fiscal" in payload:
        existing_fiscal_section = existing_fiscal if isinstance(existing_fiscal, dict) else {}
        new_fiscal = {**DEFAULTS["fiscal"], **existing_fiscal_section, **payload["fiscal"]}

    # Build SET clause
    set_parts = ["settings = CAST(:s AS JSONB)", "fiscal_config = CAST(:f AS JSONB)"]
    params: dict = {
        "t": user.tenant_id,
        "s": json.dumps(new_settings),
        "f": json.dumps(new_fiscal),
    }
    if base_updates:
        for col, val in base_updates.items():
            set_parts.append(f"{col} = :{col}")
            params[col] = val

    db.execute(text(f"UPDATE public.tenants SET {', '.join(set_parts)} WHERE id=:t"), params)
    db.commit()
    return {"ok": True}


@router.get("/timezones")
def list_timezones(_: CurrentUser = Depends(get_current_user)):
    return TIMEZONES


# ── Catalog models ─────────────────────────────────────────────────────────────

class CatalogItem(BaseModel):
    code: str
    name: str

class ColorItem(BaseModel):
    code: str
    name: str
    hex: str | None = None

class SizeItem(BaseModel):
    code: str
    name: str
    sort_order: int = 0

class UnitItem(BaseModel):
    code: str
    name: str

class CategoryItem(BaseModel):
    name: str
    parent_id: int | None = None

class ProductTypeItem(BaseModel):
    name: str
    has_sizes: bool = False
    has_expiry: bool = False

class BrandItem(BaseModel):
    name: str
    supplier_id: int | None = None


# ── Helper ─────────────────────────────────────────────────────────────────────

def _catalog_get(db, table: str, extra_cols: str = "") -> list[dict]:
    cols = f"id, code, name{', ' + extra_cols if extra_cols else ''}"
    rows = db.execute(text(f"SELECT {cols} FROM {table} ORDER BY {'sort_order, ' if 'sort_order' in extra_cols else ''}name")).mappings().all()
    return [dict(r) for r in rows]

def _catalog_delete(db, table: str, item_id: int):
    db.execute(text(f"DELETE FROM {table} WHERE id=:id"), {"id": item_id})
    db.commit()


# ── CATEGORÍAS ──────────────────────────────────────────────────────────────────

@router.get("/productos/categorias")
def get_categorias(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    rows = db.execute(text("""
        SELECT c.id, c.name, c.parent_id, p.name AS parent_name
        FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
        ORDER BY c.parent_id NULLS FIRST, c.name
    """)).mappings().all()
    return [dict(r) for r in rows]

@router.post("/productos/categorias")
def create_categoria(data: CategoryItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    row = db.execute(
        text("INSERT INTO categories (name, parent_id) VALUES (:n, :p) RETURNING id, name, parent_id"),
        {"n": data.name, "p": data.parent_id}
    ).mappings().first()
    db.commit()
    return dict(row)

@router.patch("/productos/categorias/{item_id}")
def update_categoria(item_id: int, data: CategoryItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(text("UPDATE categories SET name=:n, parent_id=:p WHERE id=:id"), {"n": data.name, "p": data.parent_id, "id": item_id})
    db.commit()
    return {"ok": True}

@router.delete("/productos/categorias/{item_id}")
def delete_categoria(item_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    _catalog_delete(db, "categories", item_id)
    return {"ok": True}


# ── TIPOS DE PRODUCTO ───────────────────────────────────────────────────────────

@router.get("/productos/tipos")
def get_tipos(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    rows = db.execute(text("SELECT id, name, has_sizes, has_expiry FROM product_types ORDER BY name")).mappings().all()
    return [dict(r) for r in rows]

@router.post("/productos/tipos")
def create_tipo(data: ProductTypeItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    row = db.execute(
        text("INSERT INTO product_types (name, has_sizes, has_expiry) VALUES (:n, :s, :e) RETURNING id, name, has_sizes, has_expiry"),
        {"n": data.name, "s": data.has_sizes, "e": data.has_expiry}
    ).mappings().first()
    db.commit()
    return dict(row)

@router.patch("/productos/tipos/{item_id}")
def update_tipo(item_id: int, data: ProductTypeItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(text("UPDATE product_types SET name=:n, has_sizes=:s, has_expiry=:e WHERE id=:id"), {"n": data.name, "s": data.has_sizes, "e": data.has_expiry, "id": item_id})
    db.commit()
    return {"ok": True}

@router.delete("/productos/tipos/{item_id}")
def delete_tipo(item_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    _catalog_delete(db, "product_types", item_id)
    return {"ok": True}


# ── COLORES ─────────────────────────────────────────────────────────────────────

@router.get("/productos/colores")
def get_colores(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    rows = db.execute(text("SELECT id, code, name, hex FROM colors ORDER BY name")).mappings().all()
    return [dict(r) for r in rows]

@router.post("/productos/colores")
def create_color(data: ColorItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    row = db.execute(
        text("INSERT INTO colors (code, name, hex) VALUES (:c, :n, :h) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, hex=EXCLUDED.hex RETURNING id, code, name, hex"),
        {"c": data.code.upper(), "n": data.name, "h": data.hex}
    ).mappings().first()
    db.commit()
    return dict(row)

@router.patch("/productos/colores/{item_id}")
def update_color(item_id: int, data: ColorItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(text("UPDATE colors SET code=:c, name=:n, hex=:h WHERE id=:id"), {"c": data.code.upper(), "n": data.name, "h": data.hex, "id": item_id})
    db.commit()
    return {"ok": True}

@router.delete("/productos/colores/{item_id}")
def delete_color(item_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    used_variant = db.execute(text("SELECT 1 FROM product_variants WHERE color=(SELECT code FROM colors WHERE id=:id) LIMIT 1"), {"id": item_id}).first()
    if used_variant:
        raise HTTPException(400, "No se puede eliminar: el color está usado en variantes de productos")
    used_group = db.execute(text("""
        SELECT cg.name FROM color_chart_items cci
        JOIN color_charts cg ON cg.id=cci.chart_id
        JOIN products p ON p.color_chart_id=cg.id
        WHERE cci.color_id=:id LIMIT 1
    """), {"id": item_id}).first()
    if used_group:
        raise HTTPException(400, f"No se puede eliminar: el color pertenece al grupo '{used_group[0]}' asignado a productos")
    _catalog_delete(db, "colors", item_id)
    return {"ok": True}


# ── TALLAS ──────────────────────────────────────────────────────────────────────

@router.get("/productos/tallas")
def get_tallas(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    rows = db.execute(text("SELECT id, code, name, sort_order FROM sizes ORDER BY sort_order, name")).mappings().all()
    return [dict(r) for r in rows]

@router.post("/productos/tallas")
def create_talla(data: SizeItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    row = db.execute(
        text("INSERT INTO sizes (code, name, sort_order) VALUES (:c, :n, :s) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order RETURNING id, code, name, sort_order"),
        {"c": data.code.upper(), "n": data.name, "s": data.sort_order}
    ).mappings().first()
    db.commit()
    return dict(row)

@router.patch("/productos/tallas/{item_id}")
def update_talla(item_id: int, data: SizeItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(text("UPDATE sizes SET code=:c, name=:n, sort_order=:s WHERE id=:id"), {"c": data.code.upper(), "n": data.name, "s": data.sort_order, "id": item_id})
    db.commit()
    return {"ok": True}

@router.delete("/productos/tallas/{item_id}")
def delete_talla(item_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    used_variant = db.execute(text("SELECT 1 FROM product_variants WHERE size=(SELECT code FROM sizes WHERE id=:id) LIMIT 1"), {"id": item_id}).first()
    if used_variant:
        raise HTTPException(400, "No se puede eliminar: la talla está usada en variantes de productos")
    used_group = db.execute(text("""
        SELECT sg.name FROM size_chart_items sci
        JOIN size_charts sg ON sg.id=sci.chart_id
        JOIN products p ON p.size_chart_id=sg.id
        WHERE sci.size_id=:id LIMIT 1
    """), {"id": item_id}).first()
    if used_group:
        raise HTTPException(400, f"No se puede eliminar: la talla pertenece al grupo '{used_group[0]}' asignado a productos")
    _catalog_delete(db, "sizes", item_id)
    return {"ok": True}


# ── UNIDADES DE MEDIDA ──────────────────────────────────────────────────────────

@router.get("/productos/unidades")
def get_unidades(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    rows = db.execute(text("SELECT id, code, name FROM units ORDER BY name")).mappings().all()
    return [dict(r) for r in rows]

@router.post("/productos/unidades")
def create_unidad(data: UnitItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    row = db.execute(
        text("INSERT INTO units (code, name) VALUES (:c, :n) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id, code, name"),
        {"c": data.code.upper(), "n": data.name}
    ).mappings().first()
    db.commit()
    return dict(row)

@router.patch("/productos/unidades/{item_id}")
def update_unidad(item_id: int, data: UnitItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(text("UPDATE units SET code=:c, name=:n WHERE id=:id"), {"c": data.code.upper(), "n": data.name, "id": item_id})
    db.commit()
    return {"ok": True}

@router.delete("/productos/unidades/{item_id}")
def delete_unidad(item_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    _catalog_delete(db, "units", item_id)
    return {"ok": True}


# ── MARCAS ──────────────────────────────────────────────────────────────────────

@router.get("/productos/marcas")
def get_marcas(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    rows = db.execute(text("""
        SELECT b.id, b.name, b.supplier_id, s.name AS supplier_name
        FROM brands b
        LEFT JOIN suppliers s ON s.id = b.supplier_id
        ORDER BY b.name
    """)).mappings().all()
    return [dict(r) for r in rows]

@router.post("/productos/marcas")
def create_marca(data: BrandItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    row = db.execute(
        text("INSERT INTO brands (name, supplier_id) VALUES (:n, :sid) ON CONFLICT (name) DO NOTHING RETURNING id, name"),
        {"n": data.name, "sid": data.supplier_id}
    ).mappings().first()
    db.commit()
    if not row:
        existing = db.execute(text("SELECT id, name FROM brands WHERE name=:n"), {"n": data.name}).mappings().first()
        return dict(existing)
    return dict(row)

@router.patch("/productos/marcas/{item_id}")
def update_marca(item_id: int, data: BrandItem, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(text("UPDATE brands SET name=:n, supplier_id=:sid WHERE id=:id"), {"n": data.name, "sid": data.supplier_id, "id": item_id})
    db.commit()
    return {"ok": True}

@router.delete("/productos/marcas/{item_id}")
def delete_marca(item_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    _catalog_delete(db, "brands", item_id)
    return {"ok": True}




# ── GRUPOS DE COLORES ────────────────────────────────────────────────────────────

class GrupoIn(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True
    item_ids: list[int] = []


@router.get("/productos/grupos-colores")
def list_color_groups(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    groups = db.execute(text("SELECT id, name, description, is_active FROM color_charts ORDER BY name")).mappings().all()
    result = []
    for g in groups:
        items = db.execute(
            text("SELECT cci.color_id, c.code, c.name, c.hex FROM color_chart_items cci JOIN colors c ON c.id=cci.color_id WHERE cci.chart_id=:gid ORDER BY c.name"),
            {"gid": g["id"]}
        ).mappings().all()
        result.append({**dict(g), "items": [dict(i) for i in items]})
    return result


@router.post("/productos/grupos-colores")
def create_color_group(data: GrupoIn, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    row = db.execute(
        text("INSERT INTO color_charts (name, description, is_active) VALUES (:n, :d, :a) RETURNING id"),
        {"n": data.name, "d": data.description or None, "a": data.is_active}
    ).first()
    group_id = row[0]
    for cid in data.item_ids:
        db.execute(text("INSERT INTO color_chart_items (chart_id, color_id) VALUES (:g, :c) ON CONFLICT DO NOTHING"), {"g": group_id, "c": cid})
    db.commit()
    return {"id": group_id, "name": data.name}


@router.patch("/productos/grupos-colores/{group_id}")
def update_color_group(group_id: int, data: GrupoIn, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(text("UPDATE color_charts SET name=:n, description=:d, is_active=:a WHERE id=:id"),
               {"n": data.name, "d": data.description or None, "a": data.is_active, "id": group_id})
    db.execute(text("DELETE FROM color_chart_items WHERE chart_id=:gid"), {"gid": group_id})
    for cid in data.item_ids:
        db.execute(text("INSERT INTO color_chart_items (chart_id, color_id) VALUES (:g, :c) ON CONFLICT DO NOTHING"), {"g": group_id, "c": cid})
    db.commit()
    return {"ok": True}


@router.delete("/productos/grupos-colores/{group_id}")
def delete_color_group(group_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    prod = db.execute(text("SELECT name FROM products WHERE color_chart_id=:id LIMIT 1"), {"id": group_id}).first()
    if prod:
        raise HTTPException(400, f"No se puede eliminar: el grupo está asignado al producto '{prod[0]}'")
    db.execute(text("DELETE FROM color_charts WHERE id=:id"), {"id": group_id})
    db.commit()
    return {"ok": True}


# ── GRUPOS DE TALLAS ─────────────────────────────────────────────────────────────

@router.get("/productos/grupos-tallas")
def list_size_groups(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    groups = db.execute(text("SELECT id, name, description, is_active FROM size_charts ORDER BY name")).mappings().all()
    result = []
    for g in groups:
        items = db.execute(
            text("SELECT sci.size_id, s.code, s.name, s.sort_order FROM size_chart_items sci JOIN sizes s ON s.id=sci.size_id WHERE sci.chart_id=:gid ORDER BY s.sort_order, s.name"),
            {"gid": g["id"]}
        ).mappings().all()
        result.append({**dict(g), "items": [dict(i) for i in items]})
    return result


@router.post("/productos/grupos-tallas")
def create_size_group(data: GrupoIn, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    row = db.execute(
        text("INSERT INTO size_charts (name, description, is_active) VALUES (:n, :d, :a) RETURNING id"),
        {"n": data.name, "d": data.description or None, "a": data.is_active}
    ).first()
    group_id = row[0]
    for sid in data.item_ids:
        db.execute(text("INSERT INTO size_chart_items (chart_id, size_id) VALUES (:g, :s) ON CONFLICT DO NOTHING"), {"g": group_id, "s": sid})
    db.commit()
    return {"id": group_id, "name": data.name}


@router.patch("/productos/grupos-tallas/{group_id}")
def update_size_group(group_id: int, data: GrupoIn, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(text("UPDATE size_charts SET name=:n, description=:d, is_active=:a WHERE id=:id"),
               {"n": data.name, "d": data.description or None, "a": data.is_active, "id": group_id})
    db.execute(text("DELETE FROM size_chart_items WHERE chart_id=:gid"), {"gid": group_id})
    for sid in data.item_ids:
        db.execute(text("INSERT INTO size_chart_items (chart_id, size_id) VALUES (:g, :s) ON CONFLICT DO NOTHING"), {"g": group_id, "s": sid})
    db.commit()
    return {"ok": True}


@router.delete("/productos/grupos-tallas/{group_id}")
def delete_size_group(group_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    prod = db.execute(text("SELECT name FROM products WHERE size_chart_id=:id LIMIT 1"), {"id": group_id}).first()
    if prod:
        raise HTTPException(400, f"No se puede eliminar: el grupo está asignado al producto '{prod[0]}'")
    db.execute(text("DELETE FROM size_charts WHERE id=:id"), {"id": group_id})
    db.commit()
    return {"ok": True}


# ── CATÁLOGOS PERSONALIZADOS ─────────────────────────────────────────────────

class CustomCatalogIn(BaseModel):
    name: str
    description: str | None = None
    icon: str = "📋"
    has_code: bool = True
    is_active: bool = True

class CustomCatalogItemIn(BaseModel):
    code: str | None = None
    name: str
    sort_order: int = 0
    is_active: bool = True


@router.get("/productos/catalogos-custom")
def list_custom_catalogs(db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    rows = db.execute(text("""
        SELECT c.id, c.name, c.description, c.icon, c.has_code, c.is_active,
               COUNT(i.id) AS item_count
        FROM custom_catalogs c
        LEFT JOIN custom_catalog_items i ON i.catalog_id = c.id
        GROUP BY c.id ORDER BY c.name
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.post("/productos/catalogos-custom")
def create_custom_catalog(data: CustomCatalogIn, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    row = db.execute(
        text("INSERT INTO custom_catalogs (name, description, icon, has_code, is_active) VALUES (:n,:d,:ic,:hc,:a) RETURNING id"),
        {"n": data.name, "d": data.description or None, "ic": data.icon, "hc": data.has_code, "a": data.is_active}
    ).first()
    db.commit()
    return {"id": row[0], "name": data.name}


@router.patch("/productos/catalogos-custom/{cat_id}")
def update_custom_catalog(cat_id: int, data: CustomCatalogIn, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(
        text("UPDATE custom_catalogs SET name=:n, description=:d, icon=:ic, has_code=:hc, is_active=:a WHERE id=:id"),
        {"n": data.name, "d": data.description or None, "ic": data.icon, "hc": data.has_code, "a": data.is_active, "id": cat_id}
    )
    db.commit()
    return {"ok": True}


@router.delete("/productos/catalogos-custom/{cat_id}")
def delete_custom_catalog(cat_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(text("DELETE FROM custom_catalog_items WHERE catalog_id=:id"), {"id": cat_id})
    db.execute(text("DELETE FROM custom_catalogs WHERE id=:id"), {"id": cat_id})
    db.commit()
    return {"ok": True}


@router.get("/productos/catalogos-custom/{cat_id}/items")
def list_custom_catalog_items(cat_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:read"))):
    rows = db.execute(
        text("SELECT id, code, name, sort_order, is_active FROM custom_catalog_items WHERE catalog_id=:id ORDER BY sort_order, name"),
        {"id": cat_id}
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/productos/catalogos-custom/{cat_id}/items")
def create_custom_catalog_item(cat_id: int, data: CustomCatalogItemIn, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    row = db.execute(
        text("INSERT INTO custom_catalog_items (catalog_id, code, name, sort_order, is_active) VALUES (:cid,:c,:n,:s,:a) RETURNING id"),
        {"cid": cat_id, "c": data.code or None, "n": data.name, "s": data.sort_order, "a": data.is_active}
    ).first()
    db.commit()
    return {"id": row[0], "name": data.name}


@router.patch("/productos/catalogos-custom/{cat_id}/items/{item_id}")
def update_custom_catalog_item(cat_id: int, item_id: int, data: CustomCatalogItemIn, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(
        text("UPDATE custom_catalog_items SET code=:c, name=:n, sort_order=:s, is_active=:a WHERE id=:id AND catalog_id=:cid"),
        {"c": data.code or None, "n": data.name, "s": data.sort_order, "a": data.is_active, "id": item_id, "cid": cat_id}
    )
    db.commit()
    return {"ok": True}


@router.delete("/productos/catalogos-custom/{cat_id}/items/{item_id}")
def delete_custom_catalog_item(cat_id: int, item_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("products:write"))):
    db.execute(text("DELETE FROM custom_catalog_items WHERE id=:id AND catalog_id=:cid"), {"id": item_id, "cid": cat_id})
    db.commit()
    return {"ok": True}


# ── PERFILES POS (CAJEROS / VENDEDORES) ─────────────────────────────────────

class PosProfileIn(BaseModel):
    name: str
    role: str = "cajero"   # cajero | vendedor | supervisor
    is_active: bool = True
    notes: str | None = None


def _ensure_pos_profiles_table(db):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS pos_profiles (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            role VARCHAR(30) NOT NULL DEFAULT 'cajero',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    db.commit()


@router.get("/pos/perfiles")
def list_pos_profiles(db: Session = Depends(get_tenant_db), _=Depends(require_scope("sales:read"))):
    _ensure_pos_profiles_table(db)
    rows = db.execute(text(
        "SELECT id, name, role, is_active, notes, created_at FROM pos_profiles ORDER BY name"
    )).mappings().all()
    return [dict(r) for r in rows]


@router.post("/pos/perfiles")
def create_pos_profile(data: PosProfileIn, db: Session = Depends(get_tenant_db),
                       _=Depends(require_scope("sales:write"))):
    _ensure_pos_profiles_table(db)
    row = db.execute(text("""
        INSERT INTO pos_profiles (name, role, is_active, notes)
        VALUES (:n, :r, :a, :no) RETURNING id, name, role, is_active
    """), {"n": data.name, "r": data.role, "a": data.is_active, "no": data.notes}).mappings().first()
    db.commit()
    return dict(row)


@router.patch("/pos/perfiles/{profile_id}")
def update_pos_profile(profile_id: int, data: PosProfileIn, db: Session = Depends(get_tenant_db),
                       _=Depends(require_scope("sales:write"))):
    _ensure_pos_profiles_table(db)
    db.execute(text(
        "UPDATE pos_profiles SET name=:n, role=:r, is_active=:a, notes=:no WHERE id=:id"
    ), {"n": data.name, "r": data.role, "a": data.is_active, "no": data.notes, "id": profile_id})
    db.commit()
    return {"ok": True}


@router.delete("/pos/perfiles/{profile_id}")
def delete_pos_profile(profile_id: int, db: Session = Depends(get_tenant_db),
                       _=Depends(require_scope("sales:write"))):
    db.execute(text("DELETE FROM pos_profiles WHERE id=:id"), {"id": profile_id})
    db.commit()
    return {"ok": True}
