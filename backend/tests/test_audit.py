"""Pruebas del etiquetador de auditoría."""
from app.core.audit import _label


def test_label_known_route():
    assert _label("POST", "/api/ventas") == "Crear venta/pedido"
    assert _label("POST", "/api/inventarios/traslado") == "Traslado entre sucursales"


def test_label_strips_ids():
    # Debe reconocer la ruta aunque lleve un id numérico
    assert _label("POST", "/api/compras/ordenes/12/recibir") == "Recibir orden de compra"


def test_label_strips_uuid():
    uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    assert _label("PATCH", f"/api/usuarios/{uuid}") == "Editar usuario"


def test_label_fallback():
    assert _label("DELETE", "/api/algo/nuevo") == "DELETE algo/nuevo"
