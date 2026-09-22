"""Entorno de integración con un PostgreSQL real (embebido con pgserver).

Levanta un Postgres en espacio de usuario, aplica el esquema global, crea el
usuario master y expone la app FastAPI apuntando a esa base. Las pruebas de
integración se saltan automáticamente si pgserver no está disponible.
"""
import tempfile
import urllib.parse as up
import uuid as uuidlib
from pathlib import Path

import pytest

pgserver = pytest.importorskip("pgserver")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

BACKEND = Path(__file__).resolve().parents[2]
GLOBAL_SQL = BACKEND / "sql" / "00_global_schema.sql"


@pytest.fixture(scope="session")
def pg_engine():
    srv = pgserver.get_server(tempfile.mkdtemp())
    sock = up.parse_qs(up.urlparse(srv.get_uri()).query)["host"][0]
    engine = create_engine("postgresql+psycopg2://postgres@/postgres",
                           connect_args={"host": sock}, future=True)
    # Aplica el esquema global (sin la línea de pgcrypto: gen_random_uuid es nativa en PG16)
    sql = GLOBAL_SQL.read_text(encoding="utf-8")
    sql = "\n".join(l for l in sql.splitlines() if "CREATE EXTENSION" not in l)
    with engine.begin() as c:
        c.execute(text(sql))
    yield engine
    srv.cleanup()


@pytest.fixture(scope="session")
def app_client(pg_engine):
    """Parcha la app para usar la BD de prueba y devuelve un TestClient."""
    from fastapi.testclient import TestClient
    import app.core.database as dbmod
    import app.core.audit as auditmod
    from app.core.security import hash_password
    from app.core.database import get_db

    TestSession = sessionmaker(bind=pg_engine, autoflush=False, autocommit=False, future=True)
    # Redirige la app y la auditoría a la BD de prueba
    dbmod.engine = pg_engine
    dbmod.SessionLocal = TestSession
    auditmod.SessionLocal = TestSession

    # Crea el usuario master
    with pg_engine.begin() as c:
        exists = c.execute(text("SELECT 1 FROM public.users WHERE email='master@gaban.pos'")).first()
        if not exists:
            role_id = c.execute(text(
                "SELECT id FROM public.roles WHERE name='MASTER_ADMIN' AND tenant_id IS NULL")).scalar()
            c.execute(text("""INSERT INTO public.users (id, role_id, email, full_name, password_hash)
                              VALUES (:id,:r,'master@gaban.pos','Master',:p)"""),
                      {"id": uuidlib.uuid4(), "r": role_id, "p": hash_password("master123")})

    from app.main import app

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def login(client, email, password):
    r = client.post("/api/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def master_token(app_client):
    return login(app_client, "master@gaban.pos", "master123")


@pytest.fixture(scope="session")
def tenant(app_client, master_token):
    """Crea una empresa + sucursal y devuelve contexto con token de admin del tenant."""
    slug = "qa" + uuidlib.uuid4().hex[:6]
    r = app_client.post("/api/admin/tenants", headers=auth(master_token), json={
        "name": "QA Retail", "slug": slug, "base_currency": "MXN", "country": "MX",
        "admin_email": f"admin_{slug}@qa.pos", "admin_password": "admin123", "admin_name": "Admin QA",
    })
    assert r.status_code == 200, r.text
    tenant_id = r.json()["tenant_id"]

    b = app_client.post("/api/admin/branches", headers=auth(master_token), json={
        "tenant_id": tenant_id, "code": "S1", "name": "Matriz", "default_currency": "MXN",
    })
    assert b.status_code == 200, b.text
    branch_id = b.json()["branch_id"]

    token = login(app_client, f"admin_{slug}@qa.pos", "admin123")
    return {"tenant_id": tenant_id, "branch_id": branch_id, "token": token, "slug": slug}


@pytest.fixture(scope="session")
def branch2(app_client, master_token, tenant):
    b = app_client.post("/api/admin/branches", headers=auth(master_token), json={
        "tenant_id": tenant["tenant_id"], "code": "S2", "name": "Sucursal 2", "default_currency": "MXN",
    })
    assert b.status_code == 200, b.text
    return b.json()["branch_id"]
