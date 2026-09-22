"""Endpoints de contexto para el usuario autenticado (tenant o master)."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db, set_search_path
from app.core.tenancy import get_current_user, CurrentUser

router = APIRouter(prefix="/api", tags=["common"])


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Devuelve el contexto del usuario: rol, tenant, sucursales y monedas disponibles."""
    set_search_path(db, None)
    branches = []
    base_currency = "USD"
    country = ""
    inactivity_enabled = False
    inactivity_timeout_minutes = 30
    if user.tenant_id:
        rows = db.execute(text("""
            SELECT id, code, name, default_currency
            FROM public.branches WHERE tenant_id = :t AND is_active ORDER BY name
        """), {"t": user.tenant_id}).mappings().all()
        branches = [dict(r) for r in rows]
        tenant_row = db.execute(text(
            "SELECT base_currency, country, settings FROM public.tenants WHERE id = :t"
        ), {"t": user.tenant_id}).mappings().first()
        if tenant_row:
            base_currency = tenant_row["base_currency"]
            country = tenant_row["country"] or ""
            sec = (tenant_row["settings"] or {}).get("seguridad", {})
            inactivity_enabled = sec.get("inactivity_enabled", False)
            inactivity_timeout_minutes = sec.get("inactivity_timeout_minutes", 30)
    return {
        "id": user.id,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "branch_id": user.branch_id,
        "scopes": user.scopes,
        "branches": branches,
        "base_currency": base_currency,
        "country": country,
        "inactivity_enabled": inactivity_enabled,
        "inactivity_timeout_minutes": inactivity_timeout_minutes,
    }


@router.get("/branches")
def my_branches(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    set_search_path(db, None)
    if not user.tenant_id:
        return []
    rows = db.execute(text("""
        SELECT id, code, name, default_currency, is_active
        FROM public.branches WHERE tenant_id = :t ORDER BY name
    """), {"t": user.tenant_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/currencies")
def currencies(_: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    set_search_path(db, None)
    rows = db.execute(text("SELECT code, name, symbol, decimals FROM public.currencies")).mappings().all()
    return [dict(r) for r in rows]


@router.get("/preferencias")
def get_prefs(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Preferencias del usuario actual (p. ej. modo claro/oscuro)."""
    set_search_path(db, None)
    row = db.execute(text("SELECT prefs FROM public.users WHERE id=:u"),
                     {"u": user.id}).mappings().first()
    prefs = (row["prefs"] if row else {}) or {}
    return {"mode": prefs.get("mode", "system")}


@router.put("/preferencias")
def set_prefs(payload: dict, user: CurrentUser = Depends(get_current_user),
              db: Session = Depends(get_db)):
    import json
    set_search_path(db, None)
    mode = payload.get("mode", "system")
    if mode not in ("light", "dark", "system"):
        mode = "system"
    db.execute(text("UPDATE public.users SET prefs = prefs || CAST(:p AS JSONB) WHERE id=:u"),
               {"p": json.dumps({"mode": mode}), "u": user.id})
    db.commit()
    return {"ok": True, "mode": mode}


@router.get("/ui-config")
def get_ui_config(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Tema de color del tenant (visible para cualquier usuario de la empresa)."""
    set_search_path(db, None)
    if not user.tenant_id:
        return {"theme": "indigo"}
    row = db.execute(text("SELECT ui_config FROM public.tenants WHERE id=:t"),
                     {"t": user.tenant_id}).mappings().first()
    cfg = (row["ui_config"] if row else {}) or {}
    return {"theme": cfg.get("theme", "indigo")}


@router.put("/ui-config")
def set_ui_config(payload: dict, user: CurrentUser = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    """Solo el administrador del tenant define el tema para toda la empresa."""
    if not user.tenant_id:
        return {"ok": False, "detail": "El master no tiene tema de empresa"}
    if user.role not in ("ADMINISTRADOR", "TENANT_ADMIN") and "*" not in user.scopes:
        return {"ok": False, "detail": "Solo el administrador del tenant puede cambiar el tema"}
    import json
    set_search_path(db, None)
    db.execute(text("UPDATE public.tenants SET ui_config = CAST(:c AS JSONB) WHERE id=:t"),
               {"c": json.dumps({"theme": payload.get("theme", "indigo")}), "t": user.tenant_id})
    db.commit()
    return {"ok": True, "theme": payload.get("theme", "indigo")}


@router.get("/fiscal-config")
def get_fiscal_config(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    set_search_path(db, None)
    if not user.tenant_id:
        return {}
    row = db.execute(text("SELECT country, fiscal_config FROM public.tenants WHERE id=:t"),
                     {"t": user.tenant_id}).mappings().first()
    return {"country": row["country"], "fiscal_config": row["fiscal_config"] or {}} if row else {}


@router.put("/fiscal-config")
def set_fiscal_config(payload: dict, user: CurrentUser = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    """Guarda la configuración fiscal del tenant (razón social, NIT/RFC, régimen, resolución, serie...)."""
    if not user.tenant_id:
        return {"ok": False, "detail": "El master no tiene configuración fiscal"}
    if not user.has_scope("sales:write") and "*" not in user.scopes:
        return {"ok": False, "detail": "Sin permiso"}
    set_search_path(db, None)
    import json
    db.execute(text("UPDATE public.tenants SET fiscal_config = CAST(:c AS JSONB) WHERE id=:t"),
               {"c": json.dumps(payload), "t": user.tenant_id})
    db.commit()
    return {"ok": True}
