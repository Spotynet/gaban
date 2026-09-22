"""Auto-posting: genera asientos contables automáticamente desde transacciones del sistema."""
from decimal import Decimal
from sqlalchemy import text
from sqlalchemy.orm import Session


def get_account(db: Session, key: str):
    row = db.execute(
        text("SELECT account_id FROM accounting_config WHERE key=:k"), {"k": key}
    ).first()
    return row[0] if row else None


def _post(db: Session, description: str, reference: str, source_type: str, source_id: int,
          lines: list[dict], user_id=None):
    from app.services.accounting import validate_entry
    lines = [l for l in lines if l.get("debit", 0) or l.get("credit", 0)]
    if not lines:
        return None
    try:
        validate_entry(lines)
    except ValueError:
        return None

    eid = db.execute(text("""
        INSERT INTO journal_entries (description, reference, source_type, source_id, is_auto, created_by)
        VALUES (:d, :r, :st, :si, TRUE, :u) RETURNING id
    """), {"d": description, "r": reference, "st": source_type, "si": source_id, "u": user_id}).scalar()

    for l in lines:
        db.execute(text("""
            INSERT INTO journal_lines (entry_id, account_id, debit, credit, memo)
            VALUES (:e, :a, :d, :c, :m)
        """), {"e": eid, "a": l["account_id"], "d": l.get("debit", 0),
               "c": l.get("credit", 0), "m": l.get("memo", "")})
    return eid


def post_sale(db: Session, sale_id: int, total: Decimal, subtotal: Decimal,
              tax: Decimal, discount: Decimal, cost: Decimal,
              payments: list[dict], currency: str, user_id=None):
    existing = db.execute(text(
        "SELECT id FROM journal_entries WHERE source_type='sale' AND source_id=:id AND description NOT LIKE 'CMV%'"
    ), {"id": sale_id}).first()
    if existing:
        return

    c_ventas     = get_account(db, "cuenta_ventas")
    c_iva        = get_account(db, "cuenta_iva_ventas")
    c_cmv        = get_account(db, "cuenta_cmv")
    c_inventario = get_account(db, "cuenta_inventario")
    c_caja       = get_account(db, "cuenta_caja")
    c_banco      = get_account(db, "cuenta_banco")
    c_tarjetas   = get_account(db, "cuenta_tarjetas")
    c_clientes   = get_account(db, "cuenta_clientes")

    METHOD_ACCOUNT = {
        "efectivo":        c_caja,
        "transferencia":   c_banco,
        "tarjeta_credito": c_tarjetas,
        "tarjeta_debito":  c_tarjetas,
        "cheque":          c_banco,
        "credito":         c_clientes,
    }

    lines = []
    for p in payments:
        acct = METHOD_ACCOUNT.get(p.get("method"), c_caja)
        if acct and float(p.get("amount", 0)):
            lines.append({"account_id": acct, "debit": float(p["amount"]), "credit": 0,
                          "memo": f'Cobro {p.get("method","")}'})

    ingreso_neto = float(subtotal) - float(discount)
    if c_ventas and ingreso_neto:
        lines.append({"account_id": c_ventas, "debit": 0, "credit": ingreso_neto,
                      "memo": "Ingresos por ventas"})

    if c_iva and float(tax):
        lines.append({"account_id": c_iva, "debit": 0, "credit": float(tax),
                      "memo": "IVA generado en venta"})

    _post(db, f"Venta #{sale_id}", f"VENTA-{sale_id}", "sale", sale_id, lines, user_id)

    if c_cmv and c_inventario and float(cost) > 0:
        cmv_lines = [
            {"account_id": c_cmv,        "debit": float(cost), "credit": 0,           "memo": "CMV venta"},
            {"account_id": c_inventario, "debit": 0,           "credit": float(cost),  "memo": "Salida inventario"},
        ]
        _post(db, f"CMV Venta #{sale_id}", f"CMV-{sale_id}", "sale", sale_id, cmv_lines, user_id)


def post_purchase_receipt(db: Session, po_id: int, total: Decimal,
                          supplier_id: int, user_id=None):
    existing = db.execute(text(
        "SELECT id FROM journal_entries WHERE source_type='purchase' AND source_id=:id"
    ), {"id": po_id}).first()
    if existing:
        return

    c_inventario  = get_account(db, "cuenta_inventario")
    c_proveedores = get_account(db, "cuenta_proveedores")
    if not c_inventario or not c_proveedores:
        return

    lines = [
        {"account_id": c_inventario,  "debit": float(total), "credit": 0,           "memo": "Ingreso mercancía OC"},
        {"account_id": c_proveedores, "debit": 0,            "credit": float(total), "memo": f"Proveedor #{supplier_id}"},
    ]
    _post(db, f"Recepción OC #{po_id}", f"OC-{po_id}", "purchase", po_id, lines, user_id)


def post_supplier_payment(db: Session, invoice_id: int, amount: Decimal,
                          method: str, user_id=None):
    c_proveedores = get_account(db, "cuenta_proveedores")
    c_caja        = get_account(db, "cuenta_caja")
    c_banco       = get_account(db, "cuenta_banco")
    pago_acct = c_banco if method in ("transferencia", "cheque") else c_caja
    if not c_proveedores or not pago_acct:
        return

    lines = [
        {"account_id": c_proveedores, "debit": float(amount), "credit": 0,            "memo": "Pago CxP"},
        {"account_id": pago_acct,     "debit": 0,             "credit": float(amount), "memo": f"Pago {method}"},
    ]
    _post(db, f"Pago factura #{invoice_id}", f"PAGO-{invoice_id}", "payment", invoice_id, lines, user_id)
