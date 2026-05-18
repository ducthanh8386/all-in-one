import pytest
from app.core.security import hash_password, verify_password, create_access_token, decode_token
from datetime import timedelta

def test_password_hashing():
    password = "secret_password"
    hashed = hash_password(password)
    
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong_password", hashed) is False

def test_jwt_token():
    data = {"sub": "test_user"}
    token = create_access_token(data, expires_delta=timedelta(minutes=15))
    
    decoded = decode_token(token)
    assert decoded is not None
    assert decoded["sub"] == "test_user"
    assert "exp" in decoded

def test_decode_invalid_token():
    assert decode_token("invalid.token.string") is None
