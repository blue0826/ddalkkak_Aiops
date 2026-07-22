"""
데모 워크스페이스 - 6개 보조 AIOps 엔드포인트(events/costs-anomalies/costs-rightsizing/
predictions/network-paths/security-blocked) 검증 테스트.

이 6개는 원래 topology/metrics/incidents+alerts/costs/logs 5개 영역에만 연결됐던 데모
엔진(demo_engine)에 뒤늦게 연결된 엔드포인트들이다 - 연결 전에는 simulator.py의 "실
고객사 미연동 시 정직한 빈 값" 경로를 데모 테넌트도 그대로 타서 데모 고객사인데도
빈 화면이 나왔다. 이 파일은 (1) 데모 테넌트는 이제 풍부한 데이터를 반환하고, (2) 실
고객사 경로는 기존과 동일하게 완전히 빈 값을 유지하는지(회귀 방지) 함께 검증한다.
"""
import uuid

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.demo.constants import (
    DEMO_TENANT_COMMERCE,
    DEMO_TENANT_FINTECH,
    DEMO_TENANT_GAMES,
)

client = TestClient(app)


def get_token(username, password):
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    return response.json()["access_token"]


def admin_headers():
    token = get_token("sysadmin@company.com", "sysadmin123!")
    return {"Authorization": f"Bearer {token}"}


# --- 1. 이벤트(GET /monitor/events) ---

def test_demo_events_are_nonempty_and_reference_real_topology_nodes():
    response = client.get(
        "/api/v1/monitor/events", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    )
    assert response.status_code == 200
    events = response.json()
    assert len(events) >= 2

    topo = client.get(
        "/api/v1/monitor/topology", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    ).json()
    node_ids = {n["id"] for n in topo["nodes"]}

    for evt in events:
        assert evt["tenant_id"] == DEMO_TENANT_COMMERCE
        assert evt["node_id"] in node_ids
        assert evt["status"] in ("active", "resolved")

    # 프론트(TenantDashboard.tsx)가 status == "active"로 활성 카운트를 세므로 최소 1건은 active여야 한다
    assert any(e["status"] == "active" for e in events)
    assert any(e["severity"] == "CRITICAL" for e in events)


def test_demo_events_provider_filter_applies():
    response = client.get(
        "/api/v1/monitor/events", headers=admin_headers(),
        params={"tenant_id": DEMO_TENANT_COMMERCE, "provider": "aws"}
    )
    assert response.status_code == 200
    events = response.json()
    assert events  # aws 이벤트가 존재해야 함
    assert all(e["provider"] == "aws" for e in events)


# --- 2. 비용 이상탐지(GET /monitor/costs/anomalies) ---

def test_demo_cost_anomalies_detect_injected_spike():
    response = client.get(
        "/api/v1/monitor/costs/anomalies", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    )
    assert response.status_code == 200
    anomalies = response.json()
    assert len(anomalies) >= 1
    assert anomalies[0]["severity"] in ("CRITICAL", "WARNING")
    assert anomalies[0]["anomaly_amount"] > anomalies[0]["average_amount"]


# --- 3. Rightsizing 추천(GET /monitor/costs/rightsizing) ---

def test_demo_rightsizing_recommendations_reference_real_nodes_with_krw_savings():
    response = client.get(
        "/api/v1/monitor/costs/rightsizing", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_FINTECH}
    )
    assert response.status_code == 200
    recs = response.json()
    assert len(recs) >= 1

    topo = client.get(
        "/api/v1/monitor/topology", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_FINTECH}
    ).json()
    node_ids = {n["id"] for n in topo["nodes"]}

    for rec in recs:
        assert rec["node_id"] in node_ids
        assert rec["savings"] > 0
        assert rec["current_monthly_cost"] > rec["target_monthly_cost"]


# --- 4. 디스크 용량 포화 예측(GET /monitor/predictions) ---

def test_demo_predictions_show_nonzero_usage_and_positive_growth():
    response = client.get(
        "/api/v1/monitor/predictions", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_FINTECH}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["current_usage_pct"] > 0
    assert data["growth_rate_pct_day"] > 0
    assert len(data["history"]) >= 3
    assert data["node_id"].startswith(DEMO_TENANT_FINTECH)


def test_demo_predictions_default_node_saturates_soon_for_commerce():
    """데모 고객사 중 최소 1곳은 saturates_soon=true를 보여줘야 한다(자동화 메뉴가
    실제로 반응하는지 검증) - 커머스는 이미 CPU 경보가 걸린 app 노드가 기본 예측 대상이다."""
    response = client.get(
        "/api/v1/monitor/predictions", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["saturates_soon"] is True
    assert data["days_to_saturation"] > 0


def test_demo_predictions_explicit_node_id_is_honored():
    topo = client.get(
        "/api/v1/monitor/topology", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_GAMES}
    ).json()
    db_node = next(n for n in topo["nodes"] if n["type"] == "database")

    response = client.get(
        "/api/v1/monitor/predictions", headers=admin_headers(),
        params={"tenant_id": DEMO_TENANT_GAMES, "node_id": db_node["id"]}
    )
    assert response.status_code == 200
    assert response.json()["node_id"] == db_node["id"]


# --- 5. 네트워크 이중화 경로(GET /monitor/network/paths) ---

def test_demo_network_paths_are_not_unknown():
    response = client.get(
        "/api/v1/monitor/network/paths", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["dedicated"]["status"] != "UNKNOWN"
    assert data["vpn"]["status"] != "UNKNOWN"
    assert data["dedicated"]["bandwidth_mbps"] > 0 or data["vpn"]["bandwidth_mbps"] > 0


def test_demo_network_paths_games_shows_failover_scenario():
    """게임즈 데모는 전용회선 장애 + VPN 자동우회 시나리오로 고정되어 있어, 자동화
    메뉴(네트워크 이중화)의 페일오버 스토리를 즉시 보여줘야 한다."""
    response = client.get(
        "/api/v1/monitor/network/paths", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_GAMES}
    )
    data = response.json()
    assert data["dedicated"]["status"] == "FAILED"
    assert data["vpn"]["status"] == "ACTIVE"


# --- 6. SOAR 차단 IP(GET /monitor/security/blocked) ---

def test_demo_blocked_ips_are_nonempty_ip_strings():
    response = client.get(
        "/api/v1/monitor/security/blocked", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    )
    assert response.status_code == 200
    ips = response.json()
    assert len(ips) >= 2
    assert all(isinstance(ip, str) for ip in ips)


# --- 7. 실 고객사 회귀 방지 - 6개 엔드포인트 전부 기존과 동일하게 완전히 빈 값이어야 한다 ---

def test_freshly_onboarded_real_tenant_all_six_endpoints_stay_empty():
    new_id = f"tenant-aiops6-regress-{uuid.uuid4().hex[:8]}"
    create_resp = client.post(
        "/api/v1/tenants", headers=admin_headers(), json={"id": new_id, "name": "6종 엔드포인트 회귀 테스트 고객사"}
    )
    assert create_resp.status_code == 201
    assert create_resp.json()["is_demo"] is False

    try:
        events = client.get(
            "/api/v1/monitor/events", headers=admin_headers(), params={"tenant_id": new_id}
        ).json()
        assert events == []

        anomalies = client.get(
            "/api/v1/monitor/costs/anomalies", headers=admin_headers(), params={"tenant_id": new_id}
        ).json()
        assert anomalies == []

        rightsizing = client.get(
            "/api/v1/monitor/costs/rightsizing", headers=admin_headers(), params={"tenant_id": new_id}
        ).json()
        assert rightsizing == []

        # node_id를 명시하지 않고 기본값("scp-vm-app-01")으로 조회하면, 이 테스트 스위트가
        # 로드하는 레거시 픽스처(conftest.py의 load_sample_topology)가 그 노드 ID로 disk_histories를
        # 이미 채워둔 상태라 실제 배포 환경(빈 값)과 다르게 값이 나온다 - 이 픽스처 아티팩트를
        # 피하기 위해 신규 고객사에는 절대 존재할 수 없는 node_id를 명시적으로 지정한다.
        prediction = client.get(
            "/api/v1/monitor/predictions", headers=admin_headers(),
            params={"tenant_id": new_id, "node_id": "no-such-node-for-regression-test"}
        ).json()
        assert prediction["current_usage_pct"] == 0.0
        assert prediction["saturates_soon"] is False
        assert prediction["history"] == []

        paths = client.get(
            "/api/v1/monitor/network/paths", headers=admin_headers(), params={"tenant_id": new_id}
        ).json()
        assert paths["dedicated"]["status"] == "UNKNOWN"
        assert paths["vpn"]["status"] == "UNKNOWN"

        blocked = client.get(
            "/api/v1/monitor/security/blocked", headers=admin_headers(), params={"tenant_id": new_id}
        ).json()
        assert blocked == []
    finally:
        client.delete(f"/api/v1/tenants/{new_id}", headers=admin_headers())
