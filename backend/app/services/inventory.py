"""Servicio central de inventario: punto único que mueve stock y escribe kardex.

Todos los módulos (ventas, compras, ajustes) llaman aquí para mantener el
sistema integrado 360. Debe ejecutarse dentro de una transacción.
"""
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session


def move_stock(
    db: Session,
    variant_id: int,
    branch_id: str,
    quantity: Decimal,      # + entra, - sale
    movement_type: str,
    unit_cost: Decimal | None = None,
    ref_type: str | None = None,
    ref_id: int | None = None,
    user_id: str | None = None,
    note: str | None = None,
):
    """Actualiza inventory y registra una fila inmutable en kardex."""
    row = db.execute(
        text("SELECT quantity FROM inventory WHERE variant_id=:v AND branch_id=:b FOR UPDATE"),
        {"v": variant_id, "b": branch_id},
    ).first()

    if row is None:
        current = Decimal("0")
        db.execute(
            text("INSERT INTO inventory (variant_id, branch_id, quantity) VALUES (:v,:b,:q)"),
            {"v": variant_id, "b": branch_id, "q": quantity},
        )
    else:
        current = Decimal(row[0])
        db.execute(
            text("UPDATE inventory SET quantity = quantity + :q, updated_at = now() "
                 "WHERE variant_id=:v AND branch_id=:b"),
            {"q": quantity, "v": variant_id, "b": branch_id},
        )

    balance_after = current + quantity
    if balance_after < 0:
        raise ValueError("Stock insuficiente para la operación")

    db.execute(
        text("""INSERT INTO kardex
                (variant_id, branch_id, movement_type, quantity, unit_cost,
                 balance_after, ref_type, ref_id, note, created_by)
                VALUES (:v,:b,:mt,:q,:uc,:bal,:rt,:ri,:note,:uid)"""),
        {"v": variant_id, "b": branch_id, "mt": movement_type, "q": quantity,
         "uc": unit_cost, "bal": balance_after, "rt": ref_type, "ri": ref_id,
         "note": note, "uid": user_id},
    )
    return balance_after
