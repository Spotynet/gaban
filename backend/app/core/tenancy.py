"""Resolución del tenant por request a partir del JWT."""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db, set_search_path
from app.core.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


class CurrentUser:
    def __init__(self, payload: dict):
        self.id = payload.get("sub")
        self.email = payload.get("email")
        self.tenant_id = payload.get("tenant_id")
        self.schema = payload.get("schema")
        self.branch_id = payload.get("branch_id")
        self.role = payload.get("role")
        self.scopes = payload.get("scopes", [])

    def has_scope(self, scope: str) -> bool:
        return "*" in self.scopes or scope in self.scopes


def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")
    return CurrentUser(payload)


def get_tenant_db(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Session:
    """Sesión con search_path fijado al schema del tenant del usuario."""
    set_search_path(db, user.schema)
    return db


def require_scope(scope: str):
    """Dependencia que exige un scope concreto."""
    def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not user.has_scope(scope):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Falta permiso: {scope}")
        return user
    return checker
