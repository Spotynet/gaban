"""Autenticación: login (OAuth2 password) devuelve JWT con tenant y scopes."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db, set_search_path
from app.core.security import verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    set_search_path(db, None)  # los usuarios viven en public
    row = db.execute(text("""
        SELECT u.id, u.password_hash, u.tenant_id, u.branch_id, u.is_active,
               r.name AS role, r.scopes, t.schema_name
        FROM public.users u
        JOIN public.roles r ON r.id = u.role_id
        LEFT JOIN public.tenants t ON t.id = u.tenant_id
        WHERE u.email = :email
    """), {"email": form.username.strip().lower()}).mappings().first()

    if not row or not verify_password(form.password, row["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales inválidas")
    if not row["is_active"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Usuario inactivo")

    email_normalized = form.username.strip().lower()
    token = create_access_token({
        "sub": str(row["id"]),
        "email": email_normalized,
        "tenant_id": str(row["tenant_id"]) if row["tenant_id"] else None,
        "schema": row["schema_name"],
        "branch_id": str(row["branch_id"]) if row["branch_id"] else None,
        "role": row["role"],
        "scopes": row["scopes"],
    })
    return {"access_token": token, "token_type": "bearer", "role": row["role"]}
