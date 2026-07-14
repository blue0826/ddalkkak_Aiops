from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_login_success():
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "sysadmin@company.com", "password": "sysadmin123!"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "SYSTEM_ADMIN"
    assert data["tenant_id"] == "system"

def test_login_failure():
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "sysadmin@company.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401
    assert "detail" in response.json()
