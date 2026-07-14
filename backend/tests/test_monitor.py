from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def get_token(username, password):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password}
    )
    return response.json()["access_token"]

def test_get_tenants_admin():
    token = get_token("sysadmin@company.com", "sysadmin123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/tenants", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 2

def test_get_tenants_forbidden_for_user():
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/tenants", headers=headers)
    assert response.status_code == 403

def test_get_topology_scp_tenant():
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/monitor/topology", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "links" in data
    # 반환되는 모든 노드가 scp 테넌트 전용인지 확인
    for node in data["nodes"]:
        assert node["tenant_id"] == "tenant-scp"

def test_get_topology_aws_tenant():
    token = get_token("op_aws@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/monitor/topology", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    # 반환되는 모든 노드가 aws 테넌트 전용인지 확인
    for node in data["nodes"]:
        assert node["tenant_id"] == "tenant-aws"

def test_get_costs_scp_money_format():
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/monitor/costs", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["currency"] == "KRW"
    # KRW Pivot 및 1350원 환율 적용 여부 검증
    assert float(data["monthly_total"]) == 1831275.0
    assert len(data["recommendations"]) == 1
    assert float(data["recommendations"][0]["savings"]) == 89100.0


