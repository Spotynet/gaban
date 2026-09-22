"""Configuración común de las pruebas.

Fija un DATABASE_URL de prueba antes de importar la app. SQLAlchemy no se
conecta hasta que se usa una sesión, por lo que las pruebas que no tocan la BD
(salud, 401, contrato de endpoints, lógica pura) corren sin PostgreSQL.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://pos:pos@localhost:5432/gabanpos_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
