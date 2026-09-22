"""Contabilidad general: plan de cuentas, asientos (partida doble),
libro mayor, balanza, estado de resultados, balance general y bancos."""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.tenancy import get_tenant_db, require_scope, CurrentUser
from app.services.accounting import validate_entry

router = APIRouter(prefix="/api/contabilidad", tags=["contabilidad"])


# ============ PLAN DE CUENTAS ============
@router.get("/cuentas")
def list_accounts(db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    rows = db.execute(text("SELECT id, code, name, type, nature, is_active FROM chart_accounts ORDER BY code")).mappings().all()
    return [dict(r) for r in rows]


class AccountIn(BaseModel):
    code: str
    name: str
    type: str      # activo | pasivo | patrimonio | ingreso | gasto
    nature: str    # D | C


@router.post("/cuentas")
def create_account(data: AccountIn, db: Session = Depends(get_tenant_db),
                   _=Depends(require_scope("accounting:write"))):
    aid = db.execute(text("""INSERT INTO chart_accounts (code, name, type, nature)
                             VALUES (:c,:n,:t,:na) RETURNING id"""),
                     {"c": data.code, "n": data.name, "t": data.type, "na": data.nature}).scalar()
    db.commit()
    return {"id": aid}


# ============ ASIENTOS (LIBRO DIARIO) ============
class LineIn(BaseModel):
    account_id: int
    debit: float = 0
    credit: float = 0
    memo: str | None = None


class EntryIn(BaseModel):
    entry_date: str | None = None
    description: str | None = None
    reference: str | None = None
    lines: list[LineIn]


@router.post("/asientos")
def create_entry(data: EntryIn, db: Session = Depends(get_tenant_db),
                 user: CurrentUser = Depends(require_scope("accounting:write"))):
    try:
        tot_d = validate_entry(data.lines)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    eid = db.execute(text("""INSERT INTO journal_entries (entry_date, description, reference, created_by)
        VALUES (COALESCE(CAST(:d AS DATE), current_date), :desc, :ref, :u) RETURNING id"""),
        {"d": data.entry_date, "desc": data.description, "ref": data.reference, "u": user.id}).scalar()
    for l in data.lines:
        db.execute(text("""INSERT INTO journal_lines (entry_id, account_id, debit, credit, memo)
                           VALUES (:e,:a,:d,:c,:m)"""),
                   {"e": eid, "a": l.account_id, "d": l.debit, "c": l.credit, "m": l.memo})
    db.commit()
    return {"entry_id": eid, "total": float(tot_d)}


@router.get("/asientos")
def list_entries(db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    rows = db.execute(text("""
        SELECT e.id, to_char(e.entry_date,'YYYY-MM-DD') AS entry_date, e.description, e.reference,
               COALESCE(SUM(l.debit),0) AS total
        FROM journal_entries e LEFT JOIN journal_lines l ON l.entry_id = e.id
        GROUP BY e.id ORDER BY e.entry_date DESC, e.id DESC LIMIT 200""")).mappings().all()
    return [dict(r) | {"total": float(r["total"])} for r in rows]


@router.get("/asientos/{entry_id}")
def get_entry(entry_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    lines = db.execute(text("""
        SELECT l.account_id, a.code, a.name, l.debit, l.credit, l.memo
        FROM journal_lines l JOIN chart_accounts a ON a.id = l.account_id
        WHERE l.entry_id = :e ORDER BY l.id"""), {"e": entry_id}).mappings().all()
    return {"entry_id": entry_id, "lines": [dict(r) | {"debit": float(r["debit"]), "credit": float(r["credit"])} for r in lines]}


# ============ LIBRO MAYOR ============
@router.get("/mayor/{account_id}")
def ledger(account_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    rows = db.execute(text("""
        SELECT to_char(e.entry_date,'YYYY-MM-DD') AS fecha, e.description, l.debit, l.credit
        FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
        WHERE l.account_id = :a ORDER BY e.entry_date, l.id"""), {"a": account_id}).mappings().all()
    saldo = Decimal("0")
    out = []
    for r in rows:
        saldo += Decimal(str(r["debit"])) - Decimal(str(r["credit"]))
        out.append({"fecha": r["fecha"], "description": r["description"],
                    "debit": float(r["debit"]), "credit": float(r["credit"]), "saldo": float(saldo)})
    return out


# ============ BALANZA DE COMPROBACIÓN ============
@router.get("/balanza")
def trial_balance(db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    rows = db.execute(text("""
        SELECT a.id, a.code, a.name, a.type, a.nature,
               COALESCE(SUM(l.debit),0) AS debitos, COALESCE(SUM(l.credit),0) AS creditos
        FROM chart_accounts a LEFT JOIN journal_lines l ON l.account_id = a.id
        WHERE a.type NOT IN ('')
        GROUP BY a.id ORDER BY a.code""")).mappings().all()
    result = []
    for r in rows:
        d = float(r["debitos"]); c = float(r["creditos"])
        if d == 0 and c == 0:
            continue
        saldo = (d - c) if r["nature"] == "D" else (c - d)
        result.append({"code": r["code"], "name": r["name"], "type": r["type"],
                       "debitos": d, "creditos": c, "saldo": saldo})
    return result


# ============ ESTADO DE RESULTADOS ============
@router.get("/estado-resultados")
def income_statement(db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    rows = db.execute(text("""
        SELECT a.type, a.code, a.name,
               COALESCE(SUM(l.debit),0) AS d, COALESCE(SUM(l.credit),0) AS c
        FROM chart_accounts a LEFT JOIN journal_lines l ON l.account_id = a.id
        WHERE a.type IN ('ingreso','gasto') GROUP BY a.id ORDER BY a.code""")).mappings().all()
    ingresos, gastos = [], []
    tot_ing = tot_gas = 0.0
    for r in rows:
        d = float(r["d"]); c = float(r["c"])
        if r["type"] == "ingreso":
            val = c - d
            if val: ingresos.append({"code": r["code"], "name": r["name"], "monto": val}); tot_ing += val
        else:
            val = d - c
            if val: gastos.append({"code": r["code"], "name": r["name"], "monto": val}); tot_gas += val
    return {"ingresos": ingresos, "gastos": gastos, "total_ingresos": tot_ing,
            "total_gastos": tot_gas, "utilidad_neta": tot_ing - tot_gas}


# ============ BALANCE GENERAL ============
@router.get("/balance-general")
def balance_sheet(db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    rows = db.execute(text("""
        SELECT a.type, a.code, a.name, a.nature,
               COALESCE(SUM(l.debit),0) AS d, COALESCE(SUM(l.credit),0) AS c
        FROM chart_accounts a LEFT JOIN journal_lines l ON l.account_id = a.id
        WHERE a.type IN ('activo','pasivo','patrimonio','ingreso','gasto')
        GROUP BY a.id ORDER BY a.code""")).mappings().all()
    activos, pasivos, patrimonio = [], [], []
    t_act = t_pas = t_pat = 0.0
    utilidad = 0.0
    for r in rows:
        d = float(r["d"]); c = float(r["c"])
        if r["type"] == "activo":
            v = d - c
            if v: activos.append({"code": r["code"], "name": r["name"], "monto": v}); t_act += v
        elif r["type"] == "pasivo":
            v = c - d
            if v: pasivos.append({"code": r["code"], "name": r["name"], "monto": v}); t_pas += v
        elif r["type"] == "patrimonio":
            v = c - d
            if v: patrimonio.append({"code": r["code"], "name": r["name"], "monto": v}); t_pat += v
        elif r["type"] == "ingreso":
            utilidad += c - d
        elif r["type"] == "gasto":
            utilidad -= d - c
    # La utilidad del ejercicio suma al patrimonio
    if utilidad:
        patrimonio.append({"code": "3600", "name": "Utilidad del ejercicio", "monto": utilidad})
        t_pat += utilidad
    return {"activos": activos, "pasivos": pasivos, "patrimonio": patrimonio,
            "total_activos": t_act, "total_pasivos": t_pas, "total_patrimonio": t_pat,
            "cuadra": round(t_act, 2) == round(t_pas + t_pat, 2)}


# ============ BANCOS ============
class BankIn(BaseModel):
    name: str
    bank: str | None = None
    account_number: str | None = None
    currency: str = "USD"
    opening_balance: float = 0
    account_id: int | None = None


@router.get("/bancos")
def list_banks(db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    rows = db.execute(text("""
        SELECT b.id, b.name, b.bank, b.account_number, b.currency, b.opening_balance,
               b.opening_balance
               + COALESCE(SUM(CASE WHEN m.type='ingreso' THEN m.amount ELSE -m.amount END),0) AS saldo
        FROM bank_accounts b LEFT JOIN bank_movements m ON m.bank_account_id = b.id
        WHERE b.is_active GROUP BY b.id ORDER BY b.name""")).mappings().all()
    return [dict(r) | {"opening_balance": float(r["opening_balance"]), "saldo": float(r["saldo"])} for r in rows]


@router.post("/bancos")
def create_bank(data: BankIn, db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:write"))):
    bid = db.execute(text("""INSERT INTO bank_accounts (name, bank, account_number, currency, opening_balance, account_id)
        VALUES (:n,:b,:an,:c,:ob,:ai) RETURNING id"""),
        {"n": data.name, "b": data.bank, "an": data.account_number, "c": data.currency,
         "ob": data.opening_balance, "ai": data.account_id}).scalar()
    db.commit()
    return {"id": bid}


class BankMovementIn(BaseModel):
    movement_date: str | None = None
    type: str            # ingreso | egreso
    amount: float
    description: str | None = None
    reference: str | None = None


@router.get("/bancos/{bank_id}/movimientos")
def bank_movements(bank_id: int, db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    rows = db.execute(text("""
        SELECT id, to_char(movement_date,'YYYY-MM-DD') AS fecha, type, amount, description, reference
        FROM bank_movements WHERE bank_account_id=:b ORDER BY movement_date, id"""),
        {"b": bank_id}).mappings().all()
    return [dict(r) | {"amount": float(r["amount"])} for r in rows]


@router.post("/bancos/{bank_id}/movimientos")
def add_bank_movement(bank_id: int, data: BankMovementIn, db: Session = Depends(get_tenant_db),
                      _=Depends(require_scope("accounting:write"))):
    db.execute(text("""INSERT INTO bank_movements (bank_account_id, movement_date, type, amount, description, reference)
        VALUES (:b, COALESCE(CAST(:d AS DATE), current_date), :t, :a, :de, :r)"""),
        {"b": bank_id, "d": data.movement_date, "t": data.type, "a": data.amount,
         "de": data.description, "r": data.reference})
    db.commit()
    return {"ok": True}


# ============ PATCH cuenta / DELETE asiento ============
@router.patch("/cuentas/{account_id}")
def update_account(account_id: int, data: AccountIn, db: Session = Depends(get_tenant_db),
                   _=Depends(require_scope("accounting:write"))):
    db.execute(text("UPDATE chart_accounts SET code=:c, name=:n, type=:t, nature=:na WHERE id=:id"),
               {"c": data.code, "n": data.name, "t": data.type, "na": data.nature, "id": account_id})
    db.commit()
    return {"ok": True}


@router.delete("/asientos/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_tenant_db),
                 _=Depends(require_scope("accounting:write"))):
    entry = db.execute(text("SELECT is_auto FROM journal_entries WHERE id=:id"), {"id": entry_id}).first()
    if not entry:
        raise HTTPException(404)
    if entry[0]:
        raise HTTPException(400, "No se puede eliminar un asiento automático del sistema")
    db.execute(text("DELETE FROM journal_lines WHERE entry_id=:id"), {"id": entry_id})
    db.execute(text("DELETE FROM journal_entries WHERE id=:id"), {"id": entry_id})
    db.commit()
    return {"ok": True}


# ============ CONFIGURACIÓN CONTABLE ============
class AccountingConfigIn(BaseModel):
    key: str
    account_id: int


@router.get("/config")
def get_accounting_config(db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    rows = db.execute(text("""
        SELECT ac.key, ac.account_id, ac.description, ca.code, ca.name
        FROM accounting_config ac
        LEFT JOIN chart_accounts ca ON ca.id=ac.account_id
        ORDER BY ac.key
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.put("/config")
def save_accounting_config(items: list[AccountingConfigIn], db: Session = Depends(get_tenant_db),
                           _=Depends(require_scope("accounting:write"))):
    for item in items:
        db.execute(text("""
            INSERT INTO accounting_config (key, account_id)
            VALUES (:k, :a)
            ON CONFLICT (key) DO UPDATE SET account_id=EXCLUDED.account_id
        """), {"k": item.key, "a": item.account_id})
    db.commit()
    return {"ok": True}


# ============ LIBRO DIARIO ENRIQUECIDO ============
@router.get("/diario")
def libro_diario(
    date_from: str | None = None,
    date_to: str | None = None,
    source_type: str | None = None,
    limit: int = 300,
    db: Session = Depends(get_tenant_db),
    _=Depends(require_scope("accounting:read"))
):
    conds = ["1=1"]
    params: dict = {"lim": limit}
    if date_from:
        conds.append("e.entry_date >= :df"); params["df"] = date_from
    if date_to:
        conds.append("e.entry_date <= :dt"); params["dt"] = date_to
    if source_type and source_type != "all":
        if source_type == "manual":
            conds.append("e.source_type IS NULL")
        else:
            conds.append("e.source_type = :st"); params["st"] = source_type

    rows = db.execute(text(f"""
        SELECT e.id, to_char(e.entry_date,'YYYY-MM-DD') AS entry_date,
               e.description, e.reference, e.source_type, e.source_id, e.is_auto,
               COALESCE(SUM(l.debit),0) AS total_debit,
               COALESCE(SUM(l.credit),0) AS total_credit,
               COUNT(l.id) AS line_count
        FROM journal_entries e
        LEFT JOIN journal_lines l ON l.entry_id=e.id
        WHERE {' AND '.join(conds)}
        GROUP BY e.id
        ORDER BY e.entry_date DESC, e.id DESC
        LIMIT :lim
    """), params).mappings().all()
    return [dict(r) | {"total_debit": float(r["total_debit"]), "total_credit": float(r["total_credit"])} for r in rows]


# ============ LIBRO MAYOR COMPLETO ============
@router.get("/mayor")
def libro_mayor_all(
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_tenant_db),
    _=Depends(require_scope("accounting:read"))
):
    conds = ["1=1"]
    params: dict = {}
    if date_from:
        conds.append("e.entry_date >= :df"); params["df"] = date_from
    if date_to:
        conds.append("e.entry_date <= :dt"); params["dt"] = date_to

    rows = db.execute(text(f"""
        SELECT a.id, a.code, a.name, a.type, a.nature,
               COALESCE(SUM(l.debit),0) AS total_debit,
               COALESCE(SUM(l.credit),0) AS total_credit
        FROM chart_accounts a
        LEFT JOIN journal_lines l ON l.account_id=a.id
        LEFT JOIN journal_entries e ON e.id=l.entry_id
        WHERE {' AND '.join(conds)} AND a.is_active
        GROUP BY a.id ORDER BY a.code
    """), params).mappings().all()
    result = []
    for r in rows:
        d = float(r["total_debit"]); c = float(r["total_credit"])
        saldo = (d - c) if r["nature"] == "D" else (c - d)
        result.append({**dict(r), "total_debit": d, "total_credit": c, "saldo": saldo})
    return result


# ============ CONCILIACIÓN ============
@router.get("/conciliacion")
def conciliacion(db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    ventas_sin = db.execute(text("""
        SELECT COUNT(*) FROM sales s
        WHERE NOT EXISTS (
            SELECT 1 FROM journal_entries e
            WHERE e.source_type='sale' AND e.source_id=s.id
        ) AND s.status IN ('completed','delivered')
    """)).scalar()

    oc_sin = db.execute(text("""
        SELECT COUNT(*) FROM purchase_orders po
        WHERE po.status='received'
        AND NOT EXISTS (
            SELECT 1 FROM journal_entries e
            WHERE e.source_type='purchase' AND e.source_id=po.id
        )
    """)).scalar()

    por_fuente = db.execute(text("""
        SELECT COALESCE(source_type,'manual') AS fuente,
               COUNT(*) AS asientos,
               COALESCE(SUM(l.debit),0) AS total_debito
        FROM journal_entries e
        LEFT JOIN journal_lines l ON l.entry_id=e.id
        GROUP BY COALESCE(source_type,'manual')
        ORDER BY asientos DESC
    """)).mappings().all()

    return {
        "ventas_sin_asiento": int(ventas_sin or 0),
        "oc_sin_asiento": int(oc_sin or 0),
        "por_fuente": [dict(r) | {"total_debito": float(r["total_debito"])} for r in por_fuente],
    }


# ============ RE-POSTEO ============
@router.post("/repostear-ventas")
def repostear_ventas(db: Session = Depends(get_tenant_db),
                     user: CurrentUser = Depends(require_scope("accounting:write"))):
    from app.services.auto_accounting import post_sale
    ventas = db.execute(text("""
        SELECT s.id, s.total, s.subtotal, s.tax, s.discount, s.currency
        FROM sales s
        WHERE s.status IN ('completed','delivered')
        AND NOT EXISTS (
            SELECT 1 FROM journal_entries e
            WHERE e.source_type='sale' AND e.source_id=s.id AND e.description NOT LIKE 'CMV%%'
        )
        ORDER BY s.id LIMIT 500
    """)).mappings().all()

    count = 0
    for s in ventas:
        try:
            payments = db.execute(text(
                "SELECT method, amount FROM sale_payments WHERE sale_id=:id"
            ), {"id": s["id"]}).mappings().all()
            cost = db.execute(text("""
                SELECT COALESCE(SUM(si.quantity * v.cost_price),0)
                FROM sale_items si JOIN product_variants v ON v.id=si.variant_id
                WHERE si.sale_id=:id
            """), {"id": s["id"]}).scalar() or 0
            post_sale(db=db, sale_id=s["id"], total=Decimal(str(s["total"])),
                      subtotal=Decimal(str(s["subtotal"])), tax=Decimal(str(s["tax"])),
                      discount=Decimal(str(s["discount"])), cost=Decimal(str(cost)),
                      payments=[dict(p) for p in payments],
                      currency=s["currency"], user_id=str(user.id))
            db.commit()
            count += 1
        except Exception:
            db.rollback()
    return {"reposteadas": count}


@router.post("/repostear-compras")
def repostear_compras(db: Session = Depends(get_tenant_db),
                      user: CurrentUser = Depends(require_scope("accounting:write"))):
    from app.services.auto_accounting import post_purchase_receipt
    ocs = db.execute(text("""
        SELECT po.id, po.total, po.supplier_id FROM purchase_orders po
        WHERE po.status='received'
        AND NOT EXISTS (
            SELECT 1 FROM journal_entries e
            WHERE e.source_type='purchase' AND e.source_id=po.id
        )
        ORDER BY po.id LIMIT 500
    """)).mappings().all()
    count = 0
    for po in ocs:
        try:
            post_purchase_receipt(db=db, po_id=po["id"], total=Decimal(str(po["total"])),
                                  supplier_id=po["supplier_id"], user_id=str(user.id))
            db.commit(); count += 1
        except Exception:
            db.rollback()
    return {"reposteadas": count}


# ============ CSV EXPORTS ============
from fastapi.responses import StreamingResponse
import csv, io


@router.get("/export/diario")
def export_diario_csv(date_from: str | None = None, date_to: str | None = None,
                      db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    conds = ["1=1"]
    params: dict = {}
    if date_from: conds.append("e.entry_date >= :df"); params["df"] = date_from
    if date_to:   conds.append("e.entry_date <= :dt"); params["dt"] = date_to
    rows = db.execute(text(f"""
        SELECT to_char(e.entry_date,'YYYY-MM-DD') AS fecha, e.description, e.reference,
               COALESCE(e.source_type,'manual') AS source_type, e.is_auto,
               a.code, a.name, l.debit, l.credit, l.memo
        FROM journal_entries e
        JOIN journal_lines l ON l.entry_id=e.id
        JOIN chart_accounts a ON a.id=l.account_id
        WHERE {' AND '.join(conds)}
        ORDER BY e.entry_date, e.id, l.id
    """), params).mappings().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['Fecha','Descripción','Referencia','Fuente','Auto','Cta.Código','Cta.Nombre','Débito','Crédito','Memo'])
    for r in rows:
        w.writerow([r['fecha'], r['description'], r['reference'] or '',
                    r['source_type'], 'Sí' if r['is_auto'] else 'No',
                    r['code'], r['name'], r['debit'], r['credit'], r['memo'] or ''])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename="libro_diario.csv"'})


@router.get("/export/balanza")
def export_balanza_csv(db: Session = Depends(get_tenant_db), _=Depends(require_scope("accounting:read"))):
    rows = db.execute(text("""
        SELECT a.code, a.name, a.type, a.nature,
               COALESCE(SUM(l.debit),0) AS debitos, COALESCE(SUM(l.credit),0) AS creditos
        FROM chart_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id
        WHERE a.is_active GROUP BY a.id ORDER BY a.code
    """)).mappings().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['Código','Cuenta','Tipo','Naturaleza','Débitos','Créditos','Saldo'])
    for r in rows:
        d = float(r['debitos']); c = float(r['creditos'])
        saldo = (d-c) if r['nature']=='D' else (c-d)
        w.writerow([r['code'], r['name'], r['type'], r['nature'], d, c, saldo])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename="balanza.csv"'})
