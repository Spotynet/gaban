"""Pruebas de QA funcional end-to-end: validaciones, permisos, offline y alertas."""
import uuid


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _producto_con_stock(client, token, branch, cantidad, ean=None, precio=100.0):
    ean = ean or ("79" + uuid.uuid4().hex[:11])
    tipos = client.get("/api/productos/tipos", headers=auth(token)).json()
    sku = "QA" + uuid.uuid4().hex[:6].upper()
    client.post("/api/productos", headers=auth(token), json={
        "sku": sku, "name": "P", "product_type_id": tipos[0]["id"],
        "variants": [{"variant_sku": sku + "-U", "ean13": ean, "cost_price": 10, "sale_price": precio, "currency": "MXN"}],
    })
    vid = [x for x in client.get("/api/productos/variantes", headers=auth(token)).json() if x["ean13"] == ean][0]["id"]
    if cantidad:
        client.post("/api/inventarios/ajuste", headers=auth(token),
                    json={"variant_id": vid, "branch_id": branch, "quantity": cantidad})
    return vid


# ---------- Validaciones de negocio ----------
def test_no_se_puede_vender_sin_stock_suficiente(app_client, tenant):
    t, b = tenant["token"], tenant["branch_id"]
    vid = _producto_con_stock(app_client, t, b, 2)
    r = app_client.post("/api/ventas", headers=auth(t), json={
        "branch_id": b, "kind": "sale", "currency": "MXN",
        "items": [{"variant_id": vid, "quantity": 5, "unit_price": 100}],
        "payments": [{"method": "efectivo", "amount": 500}],
    })
    assert r.status_code == 400
    assert "insuficiente" in r.text.lower()


def test_pago_insuficiente_rechazado(app_client, tenant):
    t, b = tenant["token"], tenant["branch_id"]
    vid = _producto_con_stock(app_client, t, b, 5)
    r = app_client.post("/api/ventas", headers=auth(t), json={
        "branch_id": b, "kind": "sale", "currency": "MXN",
        "items": [{"variant_id": vid, "quantity": 2, "unit_price": 100}],
        "payments": [{"method": "efectivo", "amount": 100}],
    })
    assert r.status_code == 400


def test_asiento_contable_debe_cuadrar(app_client, tenant):
    t = tenant["token"]
    cuentas = app_client.get("/api/contabilidad/cuentas", headers=auth(t)).json()
    caja = [c for c in cuentas if c["code"] == "1105"][0]["id"]
    ventas = [c for c in cuentas if c["code"] == "4135"][0]["id"]

    # Desbalanceado -> 400
    bad = app_client.post("/api/contabilidad/asientos", headers=auth(t), json={
        "description": "malo", "lines": [
            {"account_id": caja, "debit": 100, "credit": 0},
            {"account_id": ventas, "debit": 0, "credit": 90}]})
    assert bad.status_code == 400

    # Balanceado -> ok y se refleja en la balanza
    ok = app_client.post("/api/contabilidad/asientos", headers=auth(t), json={
        "description": "venta contado", "lines": [
            {"account_id": caja, "debit": 100, "credit": 0},
            {"account_id": ventas, "debit": 0, "credit": 100}]})
    assert ok.status_code == 200
    balanza = app_client.get("/api/contabilidad/balanza", headers=auth(t)).json()
    assert any(row["code"] == "1105" for row in balanza)


# ---------- Permisos ----------
def test_tenant_admin_no_accede_a_endpoints_master(app_client, tenant):
    # El admin del tenant NO tiene scope '*': no debe poder listar tenants
    r = app_client.get("/api/admin/tenants", headers=auth(tenant["token"]))
    assert r.status_code == 403


def test_sin_token_401(app_client):
    assert app_client.get("/api/ventas").status_code == 401


# ---------- Idempotencia offline ----------
def test_venta_offline_idempotente(app_client, tenant):
    t, b = tenant["token"], tenant["branch_id"]
    vid = _producto_con_stock(app_client, t, b, 10)
    cu = str(uuid.uuid4())
    payload = {"branch_id": b, "kind": "sale", "currency": "MXN", "client_uuid": cu,
               "items": [{"variant_id": vid, "quantity": 1, "unit_price": 100}],
               "payments": [{"method": "efectivo", "amount": 100}]}
    r1 = app_client.post("/api/ventas", headers=auth(t), json=payload)
    r2 = app_client.post("/api/ventas", headers=auth(t), json=payload)  # reintento de sync
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["sale_id"] == r2.json()["sale_id"]
    assert r2.json().get("duplicate") is True
    # El stock solo bajó una vez (10 -> 9)
    stock = app_client.get(f"/api/inventarios/stock/{b}", headers=auth(t)).json()
    assert float([s for s in stock if s["variant_id"] == vid][0]["quantity"]) == 9.0


# ---------- Alertas ----------
def test_alerta_stock_critico(app_client, tenant):
    t, b = tenant["token"], tenant["branch_id"]
    vid = _producto_con_stock(app_client, t, b, 1)
    # Vende todo -> queda en 0 (<= mínimo)
    app_client.post("/api/ventas", headers=auth(t), json={
        "branch_id": b, "kind": "sale", "currency": "MXN",
        "items": [{"variant_id": vid, "quantity": 1, "unit_price": 100}],
        "payments": [{"method": "efectivo", "amount": 100}]})
    notifs = app_client.get("/api/notificaciones", headers=auth(t)).json()
    assert notifs["total"] >= 1
    assert any(a["module"] == "Inventario" for a in notifs["alerts"])


# ---------- Auditoría ----------
def test_auditoria_registra_acciones(app_client, master_token, tenant):
    # Las acciones previas del tenant deben haber quedado en la bitácora
    audit = app_client.get(f"/api/admin/audit?tenant_id={tenant['tenant_id']}", headers=auth(master_token)).json()
    assert len(audit) >= 1
    assert any(a["action"] for a in audit)


# ---------- Pedido: no toca inventario hasta entregar ----------
def test_pedido_descuenta_solo_al_entregar(app_client, tenant):
    t, b = tenant["token"], tenant["branch_id"]
    vid = _producto_con_stock(app_client, t, b, 6)
    ped = app_client.post("/api/ventas", headers=auth(t), json={
        "branch_id": b, "kind": "order", "currency": "MXN",
        "items": [{"variant_id": vid, "quantity": 2, "unit_price": 100}], "payments": []})
    assert ped.status_code == 200
    sid = ped.json()["sale_id"]
    # Aún no descuenta
    stock = app_client.get(f"/api/inventarios/stock/{b}", headers=auth(t)).json()
    assert float([s for s in stock if s["variant_id"] == vid][0]["quantity"]) == 6.0
    # Entregar -> descuenta
    app_client.post(f"/api/ventas/{sid}/entregar", headers=auth(t))
    stock = app_client.get(f"/api/inventarios/stock/{b}", headers=auth(t)).json()
    assert float([s for s in stock if s["variant_id"] == vid][0]["quantity"]) == 4.0
