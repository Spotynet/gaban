"""Aprovisionamiento de tenants: crea el schema y sus tablas de negocio."""
import re
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

TEMPLATE = Path(__file__).resolve().parents[2] / "sql" / "01_tenant_template.sql"


def _safe_slug(slug: str) -> str:
    s = re.sub(r"[^a-z0-9_]", "_", slug.lower())
    if not re.match(r"^[a-z]", s):
        s = "t_" + s
    return s[:50]


def create_tenant_schema(db: Session, slug: str) -> str:
    """Crea CREATE SCHEMA tenant_<slug> y ejecuta la plantilla de tablas."""
    schema = f"tenant_{_safe_slug(slug)}"
    db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    db.execute(text(f'SET search_path TO "{schema}"'))
    sql = TEMPLATE.read_text(encoding="utf-8")
    # Ejecuta la plantilla dentro del nuevo schema
    db.execute(text(sql))
    db.execute(text("SET search_path TO public"))
    db.commit()
    return schema
