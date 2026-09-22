"""Panel del Administrador MASTER: alta de tenants y sucursales."""
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db, set_search_path
from app.core.security import hash_password
from app.core.tenancy import require_scope
from app.services.provisioning import create_tenant_schema

router = APIRouter(prefix="/api/admin", tags=["admin"])


class TenantIn(BaseModel):
    name: str
    slug: str
    base_currency: str = "USD"
    country: str | None = None
    admin_email: str
    admin_password: str
    admin_name: str = "Administrador"


@router.get("/tenants", dependencies=[Depends(require_scope("*"))])
def list_tenants(db: Session = Depends(get_db)):
    set_search_path(db, None)
    rows = db.execute(text("""
        SELECT t.id, t.name, t.slug, t.schema_name, t.base_currency, t.country, t.status,
               t.created_at,
               (SELECT count(*) FROM public.branches b WHERE b.tenant_id = t.id) AS branches
        FROM public.tenants t ORDER BY t.created_at DESC
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/branches", dependencies=[Depends(require_scope("*"))])
def list_all_branches(tenant_id: str | None = None, db: Session = Depends(get_db)):
    set_search_path(db, None)
    q = "SELECT id, tenant_id, code, name, default_currency, is_active FROM public.branches"
    params = {}
    if tenant_id:
        q += " WHERE tenant_id = :t"
        params["t"] = tenant_id
    q += " ORDER BY name"
    rows = db.execute(text(q), params).mappings().all()
    return [dict(r) for r in rows]


@router.post("/tenants", dependencies=[Depends(require_scope("*"))])
def create_tenant(data: TenantIn, db: Session = Depends(get_db)):
    set_search_path(db, None)
    schema = create_tenant_schema(db, data.slug)

    tid = uuid.uuid4()
    db.execute(text("""INSERT INTO public.tenants (id, name, slug, schema_name, base_currency, country)
                       VALUES (:id,:n,:s,:sc,:c,:co)"""),
               {"id": tid, "n": data.name, "s": data.slug, "sc": schema,
                "c": data.base_currency, "co": data.country})

    # rol admin del tenant: todos los scopes de negocio + gestión de usuarios/roles
    admin_scopes = ('["sales:read","sales:write","purchases:read","purchases:write",'
                    '"products:read","products:write","inventory:read","inventory:write",'
                    '"users:read","users:write","roles:read","roles:write",'
                    '"accounting:read","accounting:write"]')
    role_id = db.execute(text("""INSERT INTO public.roles (tenant_id, name, scopes)
        VALUES (:t,'ADMINISTRADOR', CAST(:sc AS JSONB)) RETURNING id"""),
        {"t": tid, "sc": admin_scopes}).scalar()

    # roles predefinidos por módulo (el admin podrá crear más)
    defaults = {
        "VENTAS": '["sales:read","sales:write","products:read","inventory:read"]',
        "COMPRAS": '["purchases:read","purchases:write","products:read","inventory:read"]',
        "INVENTARIOS": '["inventory:read","inventory:write","products:read"]',
        "PRODUCTOS": '["products:read","products:write"]',
        "CONTABILIDAD": '["accounting:read","accounting:write"]',
    }
    for name, sc in defaults.items():
        db.execute(text("INSERT INTO public.roles (tenant_id, name, scopes) VALUES (:t,:n,CAST(:sc AS JSONB))"),
                   {"t": tid, "n": name, "sc": sc})

    db.execute(text("""INSERT INTO public.users (tenant_id, role_id, email, full_name, password_hash)
                       VALUES (:t,:r,:e,:fn,:ph)"""),
               {"t": tid, "r": role_id, "e": data.admin_email, "fn": data.admin_name,
                "ph": hash_password(data.admin_password)})
    db.commit()
    return {"tenant_id": str(tid), "schema": schema, "admin_email": data.admin_email}


class BranchIn(BaseModel):
    tenant_id: str
    code: str
    name: str
    default_currency: str
    address: str | None = None


@router.get("/audit", dependencies=[Depends(require_scope("*"))])
def audit(tenant_id: str | None = None, limit: int = 200, db: Session = Depends(get_db)):
    """Bitácora de acciones — solo master. Filtro opcional por tenant."""
    set_search_path(db, None)
    q = """SELECT a.id, a.created_at, a.user_email, a.role, a.tenant_id,
                  t.name AS tenant_name, a.action, a.method, a.path, a.status_code, a.ip
           FROM public.audit_log a
           LEFT JOIN public.tenants t ON t.id = a.tenant_id"""
    params = {"lim": limit}
    if tenant_id:
        q += " WHERE a.tenant_id = :t"
        params["t"] = tenant_id
    q += " ORDER BY a.created_at DESC LIMIT :lim"
    rows = db.execute(text(q), params).mappings().all()
    return [dict(r) for r in rows]


@router.post("/branches", dependencies=[Depends(require_scope("*"))])
def create_branch(data: BranchIn, db: Session = Depends(get_db)):
    set_search_path(db, None)
    bid = uuid.uuid4()
    db.execute(text("""INSERT INTO public.branches (id, tenant_id, code, name, default_currency, address)
                       VALUES (:id,:t,:c,:n,:cur,:a)"""),
               {"id": bid, "t": data.tenant_id, "c": data.code, "n": data.name,
                "cur": data.default_currency, "a": data.address})
    db.commit()
    return {"branch_id": str(bid)}
