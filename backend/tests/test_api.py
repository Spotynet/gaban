"""Pruebas de contrato de la API (sin base de datos)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_protected_requires_auth():
    # Sin token, los endpoints protegidos deben responder 401
    for path in ["/api/productos", "/api/ventas", "/api/notificaciones",
                 "/api/contabilidad/cuentas", "/api/inventarios/traslados"]:
        assert client.get(path).status_code == 401


def test_openapi_contains_modules():
    paths = client.get("/openapi.json").json()["paths"]
    esperados = [
        "/api/auth/login", "/api/admin/tenants", "/api/admin/audit",
        "/api/ventas", "/api/ventas/{sale_id}/comprobante",
        "/api/compras/ordenes", "/api/compras/facturas/{invoice_id}/pagos",
        "/api/inventarios/traslado", "/api/contabilidad/asientos",
        "/api/contabilidad/balance-general", "/api/notificaciones",
        "/api/reportes/export/ventas.xlsx", "/api/usuarios",
    ]
    for e in esperados:
        assert e in paths, f"Falta el endpoint {e}"


def test_openapi_endpoint_count():
    paths = client.get("/openapi.json").json()["paths"]
    # El sistema expone bastantes endpoints; validamos que no se perdieron rutas
    assert len(paths) >= 50
