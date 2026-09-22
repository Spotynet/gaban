"""Pruebas de la validación de partida doble."""
import pytest

from app.services.accounting import validate_entry, totals


def test_balanced_entry_ok():
    lines = [{"debit": 100, "credit": 0}, {"debit": 0, "credit": 100}]
    assert validate_entry(lines) == 100


def test_unbalanced_entry_raises():
    lines = [{"debit": 100, "credit": 0}, {"debit": 0, "credit": 90}]
    with pytest.raises(ValueError, match="no cuadra"):
        validate_entry(lines)


def test_zero_entry_raises():
    lines = [{"debit": 0, "credit": 0}, {"debit": 0, "credit": 0}]
    with pytest.raises(ValueError, match="cero"):
        validate_entry(lines)


def test_single_line_raises():
    with pytest.raises(ValueError, match="dos líneas"):
        validate_entry([{"debit": 10, "credit": 0}])


def test_totals_multiline():
    lines = [{"debit": 50, "credit": 0}, {"debit": 30, "credit": 0}, {"debit": 0, "credit": 80}]
    d, c = totals(lines)
    assert float(d) == 80 and float(c) == 80
