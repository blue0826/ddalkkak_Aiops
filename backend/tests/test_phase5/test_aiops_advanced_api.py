from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def get_token(username, password):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password}
    )
    return response.json()["access_token"]

def test_simulate_rightsizing_success():
    """
    비용 최적화 시뮬레이터 API 테스트
    """
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get(
        "/api/v1/aiops/costs/simulate-rightsizing?node_id=scp-vm-app-01&scale_ratio=2.0",
        headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "original_value" in data[0]
    assert "simulated_value" in data[0]
    assert "timestamp" in data[0]

def test_get_incident_timeline_cards_success():
    """
    인시던트 RCA 타임라인 카드 조회 API 테스트
    """
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get(
        "/api/v1/aiops/incidents/1/timeline-cards",
        headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 4
    assert data[0]["event_type"] == "TRIGGERED"
    assert data[1]["event_type"] == "ANOMALY_DETECT"
    assert data[2]["event_type"] == "CORRELATION"
    assert data[3]["event_type"] == "RECOMMENDATION"

def test_run_action_script_success():
    """
    Copilot AI 플레이북 스크립트 수동 가상 실행 API 테스트
    """
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    req_body = {
        "script": "sudo lvextend -L +10G /dev/mapper/vg-root\nsudo service nginx restart"
    }
    response = client.post(
        "/api/v1/aiops/incidents/1/run-action-script",
        json=req_body,
        headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert "stdout" in data
    assert "SUCCESS" in data["stdout"]
