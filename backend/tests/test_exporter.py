"""Pruebas de generación de archivos Excel y PDF."""
from app.services import exporter


def test_ventas_xlsx_bytes():
    data = exporter.ventas_xlsx(
        [{"id": 1, "fiscal_serie": "A", "fiscal_folio": 1, "created_at": "2026-07-21 10:00",
          "currency": "MXN", "subtotal": 100.0, "discount": 0.0, "tax": 16.0, "total": 116.0, "status": "completed"}],
        [{"producto": "Tenis", "variant_sku": "T-42", "unidades": 3.0, "ingresos": 300.0}],
    )
    # Un .xlsx es un ZIP: empieza con 'PK'
    assert data[:2] == b"PK"
    assert len(data) > 1000


def test_inventario_xlsx_bytes():
    data = exporter.inventario_xlsx(
        [{"variant_sku": "T-42", "ean13": "750", "size": "42", "color": "Negro",
          "quantity": 5.0, "min_stock": 2.0, "cost_price": 50.0, "valor": 250.0}],
        {"valor_costo": 250.0, "valor_venta": 400.0, "lineas": 1, "bajo_minimo": 0},
    )
    assert data[:2] == b"PK"


def test_resumen_pdf_signature():
    data = exporter.resumen_pdf("Resumen", "Periodo demo",
                                {"Ventas": "116.00", "# Ventas": 1},
                                [{"dia": "2026-07-21", "ventas": 1, "total": 116.0}])
    assert data[:5] == b"%PDF-"
