"""Pruebas de hashing de contraseñas y JWT."""
import pytest

from app.core.security import hash_password, verify_password, create_access_token, decode_token


def test_password_hash_roundtrip():
    h = hash_password("secreta123")
    assert h != "secreta123"
    assert verify_password("secreta123", h)
    assert not verify_password("incorrecta", h)


def test_jwt_roundtrip():
    token = create_access_token({"sub": "u1", "role": "SALES", "scopes": ["sales:write"]})
    claims = decode_token(token)
    assert claims["sub"] == "u1"
    assert claims["role"] == "SALES"
    assert "sales:write" in claims["scopes"]
    assert "exp" in claims


def test_jwt_invalid_raises():
    with pytest.raises(ValueError):
        decode_token("token.falso.aqui")
