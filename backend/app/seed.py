"""Inicializa la BD: crea el schema global y el usuario Administrador MASTER.

Uso:
    python -m app.seed
Variables:
    MASTER_EMAIL, MASTER_PASSWORD (por defecto master@gaban.pos / master123)
"""
import os
from pathlib import Path

from sqlalchemy import text

from app.core.database import engine
from app.core.security import hash_password

GLOBAL_SQL = Path(__file__).resolve().parents[1] / "sql" / "00_global_schema.sql"


def run():
    email = os.getenv("MASTER_EMAIL", "master@gaban.pos")
    password = os.getenv("MASTER_PASSWORD", "master123")

    with engine.begin() as conn:
        conn.execute(text(GLOBAL_SQL.read_text(encoding="utf-8")))
        exists = conn.execute(text("SELECT 1 FROM public.users WHERE email=:e"),
                              {"e": email}).first()
        if not exists:
            role_id = conn.execute(text(
                "SELECT id FROM public.roles WHERE name='MASTER_ADMIN' AND tenant_id IS NULL"
            )).scalar()
            conn.execute(text("""INSERT INTO public.users (role_id, email, full_name, password_hash)
                                 VALUES (:r,:e,'Master Admin',:p)"""),
                         {"r": role_id, "e": email, "p": hash_password(password)})
            print(f"Master creado: {email} / {password}")
        else:
            print(f"Master ya existía: {email}")


if __name__ == "__main__":
    run()
