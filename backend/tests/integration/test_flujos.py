"""Pruebas de integración de flujos completos contra PostgreSQL real."""
import uuid


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _crear_producto(client, token, ean, precio=100.0, costo=40.0):
    tipos = client.get("/api/productos/tipos", headers=auth(token)).json()
    tipo_id = tipos[0]["id"]
    sku = "SKU" + uuid.uuid4().hex[:6].upper()
    r = client.post("/api/productos", headers=auth(token), json={
        "sku": sku, "name": "Producto QA", "product_type_id": tipo_id,
        "variants": [{"variant_sku": sku + "-U", "ean13": ean, "cost_price": costo,
                      "sale_price": precio, "currency": "MXN"}],
    })
    assert r.status_code == 200, r.text
    # localizar variant_id
    v = [x for x in client.get("/api/productos/variantes", headers=auth(token)).json() if x["ean13"] == ean][0]
    return v["id"], sku


def test_venta_descuenta_inventario_y_kardex(app_client, tenant):
    t, b = tenant["token"], tenant["branch_id"]
    ean = "75" + uuid.uuid4().hex[:11]
    vid, _ = _crear_producto(app_client, t, ean, precio=100.0)

    # Ingreso de inventario: +10
    r = app_client.post("/api/inventarios/ajuste", headers=auth(t),
                        json={"variant_id": vid, "branch_id": b, "quantity": 10, "note": "inicial"})
    assert r.status_code == 200 and r.json()["balance"] == 10.0

    # Venta de 3 unidades
    r = app_client.post("/api/ventas", headers=auth(t), json={
        "branch_id": b, "kind": "sale", "currency": "MXN", "tax": 0,
        "items": [{"variant_id": vid, "quantity": 3, "unit_price": 100}],
        "payments": [{"method": "efectivo", "amount": 300}],
    })
    assert r.status_code == 200, r.text
    sale_id = r.json()["sale_id"]

    # Inventario debe quedar en 7
    stock = app_client.get(f"/api/inventarios/stock/{b}", headers=auth(t)).json()
    fila = [s for s in stock if s["variant_id"] == vid][0]
    assert float(fila["quantity"]) == 7.0

    # Kardex: entrada (ajuste) y salida por venta
    k = app_client.get(f"/api/inventarios/kardex/{vid}/{b}", headers=auth(t)).json()
    tipos = [m["movement_type"] for m in k]
    assert "ajuste_positivo" in tipos and "salida_venta" in tipos
    assert float(k[-1]["balance_after"]) == 7.0

    # Comprobante disponible con folio fiscal MX
    comp = app_client.get(f"/api/ventas/{sale_id}/comprobante", headers=auth(t)).json()
    assert comp["country"] == "MX" and comp["folio"] >= 1
    assert float(comp["sale"]["total"]) == 300.0


def test_compra_recibe_incrementa_stock_y_genera_cxp(app_client, tenant):
    t, b = tenant["token"], tenant["branch_id"]
    ean = "76" + uuid.uuid4().hex[:11]
    vid, _ = _crear_producto(app_client, t, ean)

    sup = app_client.post("/api/compras/proveedores", headers=auth(t),
                         json={"name": "Proveedor QA", "currency": "MXN"}).json()
    po = app_client.post("/api/compras/ordenes", headers=auth(t), json={
        "supplier_id": sup["id"], "branch_id": b, "currency": "MXN",
        "items": [{"variant_id": vid, "qty_ordered": 5, "unit_cost": 40}],
    }).json()

    rec = app_client.post(f"/api/compras/ordenes/{po['po_id']}/recibir", headers=auth(t))
    assert rec.status_code == 200 and rec.json()["status"] == "received"

    stock = app_client.get(f"/api/inventarios/stock/{b}", headers=auth(t)).json()
    fila = [s for s in stock if s["variant_id"] == vid][0]
    assert float(fila["quantity"]) == 5.0

    # Debe existir una cuenta por pagar (factura de proveedor)
    facturas = app_client.get("/api/compras/facturas", headers=auth(t)).json()
    assert any(float(f["balance"]) == 200.0 for f in facturas)


def test_traslado_entre_sucursales(app_client, tenant, branch2):
    t, b1, b2 = tenant["token"], tenant["branch_id"], branch2
    ean = "77" + uuid.uuid4().hex[:11]
    vid, _ = _crear_producto(app_client, t, ean)
    app_client.post("/api/inventarios/ajuste", headers=auth(t),
                    json={"variant_id": vid, "branch_id": b1, "quantity": 8})

    r = app_client.post("/api/inventarios/traslado", headers=auth(t), json={
        "variant_id": vid, "from_branch": b1, "to_branch": b2, "quantity": 3, "note": "reparto",
    })
    assert r.status_code == 200, r.text

    s1 = app_client.get(f"/api/inventarios/stock/{b1}", headers=auth(t)).json()
    s2 = app_client.get(f"/api/inventarios/stock/{b2}", headers=auth(t)).json()
    q1 = float([s for s in s1 if s["variant_id"] == vid][0]["quantity"])
    q2 = float([s for s in s2 if s["variant_id"] == vid][0]["quantity"])
    assert q1 == 5.0 and q2 == 3.0
