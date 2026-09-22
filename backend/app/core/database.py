"""Conexión a PostgreSQL y utilidades de sesión."""
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker, declarative_base

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


@event.listens_for(Session, "after_begin")
def _apply_search_path(session, transaction, connection):
    """Reaplica el search_path del tenant al inicio de CADA transacción.

    El search_path es propiedad de la conexión; sin esto, tras un commit la
    siguiente transacción (p. ej. un refresh) podría tomar otra conexión del
    pool sin el schema del tenant. Guardamos el schema en session.info.
    """
    schema = session.info.get("schema")
    if schema:
        connection.exec_driver_sql(f'SET search_path TO "{schema}", public')


def get_db():
    """Dependencia FastAPI: entrega una sesión por request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def set_search_path(db, schema_name: str | None):
    """Fija el search_path del tenant para la sesión (se reaplica en cada transacción)."""
    db.info["schema"] = schema_name
    if schema_name:
        db.execute(text(f'SET search_path TO "{schema_name}", public'))
    else:
        db.execute(text("SET search_path TO public"))
