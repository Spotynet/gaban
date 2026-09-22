"""Reglas puras de contabilidad (sin base de datos), fáciles de probar."""
from decimal import Decimal


def totals(lines) -> tuple[Decimal, Decimal]:
    """Suma débitos y créditos de una lista de líneas (objetos con .debit/.credit
    o dicts con 'debit'/'credit')."""
    def g(obj, key):
        return obj[key] if isinstance(obj, dict) else getattr(obj, key)
    tot_d = sum(Decimal(str(g(l, "debit") or 0)) for l in lines)
    tot_c = sum(Decimal(str(g(l, "credit") or 0)) for l in lines)
    return tot_d, tot_c


def validate_entry(lines) -> Decimal:
    """Valida un asiento de partida doble. Devuelve el total si es válido;
    si no, lanza ValueError con el motivo."""
    if len(lines) < 2:
        raise ValueError("Un asiento requiere al menos dos líneas")
    tot_d, tot_c = totals(lines)
    if tot_d != tot_c:
        raise ValueError(f"El asiento no cuadra: débitos {tot_d} ≠ créditos {tot_c}")
    if tot_d == 0:
        raise ValueError("El asiento no puede ser por cero")
    return tot_d
