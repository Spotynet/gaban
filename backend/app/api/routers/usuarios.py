"""Gestión de usuarios y roles por tenant (para el administrador del tenant)."""
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db, set_search_path
from app.core.security import hash_password
from app.core.tenancy import get_current_user, require_scope, CurrentUser

router = APIRouter(prefix="/api", tags=["usuarios"])

# Catálogo de permisos disponibles para armar roles en la interfaz
AVAILABLE_SCOPES = [
    {"scope": "sales:read", "label": "Ventas — ver"},
    {"scope": "sales:write", "label": "Ventas — operar (POS, pedidos)"},
    {"scope": "purchases:read", "label": "Compras — ver"},
    {"scope": "purchases:write", "label": "Compras — operar (órdenes, pagos)"},
    {"scope": "products:read", "label": "Productos — ver"},
    {"scope": "products:write", "label": "Productos — crear/editar"},
    {"scope": "inventory:read", "label": "Inventarios — ver"},
    {"scope": "inventory:write", "label": "Inventarios — ajustes/traslados"},
    {"scope": "users:read", "label": "Usuarios — ver"},
    {"scope": "users:write", "label": "Usuarios — administrar"},
    {"scope": "roles:read", "label": "Roles — ver"},
    {"scope": "roles:write", "label": "Roles — administrar"},
    {"scope": "accounting:read", "label": "Contabilidad — ver"},
    {"scope": "accounting:write", "label": "Contabilidad — registrar"},
]


@router.get("/scopes")
def scopes(_: CurrentUser = Depends(require_scope("users:read"))):
    return AVAILABLE_SCOPES


# ============ ROLES ============
@router.get("/roles")
def list_roles(user: CurrentUser = Depends(require_scope("roles:read")), db: Session = Depends(get_db)):
    set_search_path(db, None)
    rows = db.execute(text("""SELECT id, name, scopes FROM public.roles
                              WHERE tenant_id = :t ORDER BY name"""),
                      {"t": user.tenant_id}).mappings().all()
    return [dict(r) for r in rows]


class RoleIn(BaseModel):
    name: str
    scopes: list[str] = []


@router.post("/roles")
def create_role(data: RoleIn, user: CurrentUser = Depends(require_scope("roles:write")),
                db: Session = Depends(get_db)):
    set_search_path(db, None)
    rid = db.execute(text("""INSERT INTO public.roles (tenant_id, name, scopes)
                             VALUES (:t,:n,CAST(:sc AS JSONB)) RETURNING id"""),
                     {"t": user.tenant_id, "n": data.name, "sc": json.dumps(data.scopes)}).scalar()
    db.commit()
    return {"id": rid, "name": data.name}


@router.patch("/roles/{role_id}")
def update_role(role_id: int, data: RoleIn, user: CurrentUser = Depends(require_scope("roles:write")),
                db: Session = Depends(get_db)):
    set_search_path(db, None)
    owner = db.execute(text("SELECT tenant_id FROM public.roles WHERE id=:r"), {"r": role_id}).scalar()
    if str(owner) != str(user.tenant_id):
        raise HTTPException(403, "Ese rol no pertenece a tu empresa")
    db.execute(text("UPDATE public.roles SET name=:n, scopes=CAST(:sc AS JSONB) WHERE id=:r"),
               {"n": data.name, "sc": json.dumps(data.scopes), "r": role_id})
    db.commit()
    return {"id": role_id}


@router.delete("/roles/{role_id}")
def delete_role(role_id: int, user: CurrentUser = Depends(require_scope("roles:write")),
                db: Session = Depends(get_db)):
    set_search_path(db, None)
    owner = db.execute(text("SELECT tenant_id FROM public.roles WHERE id=:r"), {"r": role_id}).scalar()
    if owner is None:
        raise HTTPException(404, "Rol no encontrado")
    if str(owner) != str(user.tenant_id):
        raise HTTPException(403, "Ese rol no pertenece a tu empresa")
    in_use = db.execute(text("SELECT 1 FROM public.users WHERE role_id=:r LIMIT 1"), {"r": role_id}).first()
    if in_use:
        raise HTTPException(400, "No se puede eliminar: hay usuarios asignados a este rol")
    db.execute(text("DELETE FROM public.roles WHERE id=:r"), {"r": role_id})
    db.commit()
    return {"ok": True}


# ============ USUARIOS ============
@router.get("/usuarios")
def list_users(user: CurrentUser = Depends(require_scope("users:read")), db: Session = Depends(get_db)):
    set_search_path(db, None)
    rows = db.execute(text("""
        SELECT u.id, u.email, u.full_name, u.is_active, u.role_id, r.name AS role_name,
               u.branch_id, b.name AS branch_name
        FROM public.users u
        JOIN public.roles r ON r.id = u.role_id
        LEFT JOIN public.branches b ON b.id = u.branch_id
        WHERE u.tenant_id = :t ORDER BY u.full_name"""), {"t": user.tenant_id}).mappings().all()
    return [dict(r) for r in rows]


class UserIn(BaseModel):
    full_name: str
    email: str
    password: str
    role_id: int
    branch_id: str | None = None


@router.post("/usuarios")
def create_user(data: UserIn, user: CurrentUser = Depends(require_scope("users:write")),
                db: Session = Depends(get_db)):
    set_search_path(db, None)
    role_owner = db.execute(text("SELECT tenant_id FROM public.roles WHERE id=:r"), {"r": data.role_id}).scalar()
    if str(role_owner) != str(user.tenant_id):
        raise HTTPException(400, "El rol no pertenece a tu empresa")
    email = data.email.strip().lower()
    exists = db.execute(text("SELECT 1 FROM public.users WHERE email=:e"), {"e": email}).first()
    if exists:
        raise HTTPException(400, "Ese correo ya está registrado")
    uid = uuid.uuid4()
    db.execute(text("""INSERT INTO public.users (id, tenant_id, branch_id, role_id, email, full_name, password_hash)
                       VALUES (:id,:t,:b,:r,:e,:fn,:ph)"""),
               {"id": uid, "t": user.tenant_id, "b": data.branch_id or None, "r": data.role_id,
                "e": email, "fn": data.full_name, "ph": hash_password(data.password)})
    db.commit()
    return {"id": str(uid), "email": email}


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    role_id: int | None = None
    branch_id: str | None = None
    is_active: bool | None = None
    password: str | None = None


@router.patch("/usuarios/{user_id}")
def update_user(user_id: str, data: UserUpdate, user: CurrentUser = Depends(require_scope("users:write")),
                db: Session = Depends(get_db)):
    set_search_path(db, None)
    owner = db.execute(text("SELECT tenant_id FROM public.users WHERE id=:u"), {"u": user_id}).scalar()
    if str(owner) != str(user.tenant_id):
        raise HTTPException(403, "Ese usuario no pertenece a tu empresa")
    sets, params = [], {"u": user_id}
    if data.full_name is not None:
        sets.append("full_name=:fn"); params["fn"] = data.full_name
    if data.email is not None:
        norm_email = data.email.strip().lower()
        dup = db.execute(text("SELECT 1 FROM public.users WHERE email=:e AND id != :u"), {"e": norm_email, "u": user_id}).first()
        if dup:
            raise HTTPException(400, "Ese correo ya está en uso por otro usuario")
        sets.append("email=:e"); params["e"] = norm_email
    if data.role_id is not None:
        sets.append("role_id=:r"); params["r"] = data.role_id
    if data.branch_id is not None:
        sets.append("branch_id=:b"); params["b"] = data.branch_id or None
    if data.is_active is not None:
        sets.append("is_active=:a"); params["a"] = data.is_active
    if data.password:
        sets.append("password_hash=:p"); params["p"] = hash_password(data.password)
    if sets:
        db.execute(text(f"UPDATE public.users SET {', '.join(sets)} WHERE id=:u"), params)
        db.commit()
    return {"id": user_id}


@router.delete("/usuarios/{user_id}")
def delete_user(user_id: str, user: CurrentUser = Depends(require_scope("users:write")),
                db: Session = Depends(get_db)):
    set_search_path(db, None)
    owner = db.execute(text("SELECT tenant_id FROM public.users WHERE id=:u"), {"u": user_id}).scalar()
    if owner is None:
        raise HTTPException(404, "Usuario no encontrado")
    if str(owner) != str(user.tenant_id):
        raise HTTPException(403, "Ese usuario no pertenece a tu empresa")
    if str(user_id) == str(user.id):
        raise HTTPException(400, "No puedes eliminar tu propio usuario")
    db.execute(text("DELETE FROM public.users WHERE id=:u"), {"u": user_id})
    db.commit()
    return {"ok": True}
