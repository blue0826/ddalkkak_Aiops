"""
데모 워크스페이스(demo-commerce/demo-fintech/demo-games) 검증 테스트.

CEO 지시(2026-07-16): 실 고객사 데이터와 완전히 분리된, 명확히 라벨된(is_demo=True)
데모 워크스페이스가 정직하게 작동하는지 검증한다 - 데모 고객사는 계층 구조를 갖춘
풍부한 데이터를 보여주고, 실 고객사(자격증명 미연동)는 여전히 완전히 빈 값을
반환해야 한다(분리 회귀 방지가 이 파일의 핵심 목적).
"""
import asyncio
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.db.session import AsyncSessionLocal
from backend.app.main import app
from backend.app.models.base import AlertRule, Incident
from backend.app.services import demo_engine
from backend.app.services.demo.constants import (
    DEMO_TENANT_COMMERCE,
    DEMO_TENANT_FINTECH,
    DEMO_TENANT_GAMES,
    DEMO_TENANT_IDS,
)

client = TestClient(app)


def get_token(username, password):
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    return response.json()["access_token"]


def admin_headers():
    token = get_token("sysadmin@company.com", "sysadmin123!")
    return {"Authorization": f"Bearer {token}"}


# --- 1. GET /tenants - 데모 고객사 3곳이 is_demo=true로 노출되는지 ---

def test_get_tenants_exposes_demo_workspaces():
    response = client.get("/api/v1/tenants", headers=admin_headers())
    assert response.status_code == 200
    data = {t["id"]: t for t in response.json()}

    for demo_id in DEMO_TENANT_IDS:
        assert demo_id in data
        assert data[demo_id]["is_demo"] is True

    # 실 고객사(레거시 테스트 픽스처)는 is_demo=false여야 한다 - 데모와 절대 혼동되지 않는다
    assert data["tenant-scp"]["is_demo"] is False
    assert data["tenant-aws"]["is_demo"] is False


# --- 2. 데모 토폴로지 - 리전/VPC/서브넷/서비스 계층 구조와 노드 규모 ---

def test_demo_commerce_topology_has_layered_multicloud_structure():
    response = client.get(
        "/api/v1/monitor/topology", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data_source"] == "DEMO"

    nodes = data["nodes"]
    assert len(nodes) >= 30  # 간판 데모(SCP+AWS 합산) - 약 34개 노드

    providers = {n["provider"] for n in nodes}
    assert providers == {"scp", "aws"}  # 멀티클라우드 확인

    types = {n["type"] for n in nodes}
    assert {"vpc", "subnet", "vm", "database"}.issubset(types)

    # 계층(리전->VPC->서브넷->서비스) - 모든 노드가 리전을 부여받아야 한다
    assert all(n.get("region") for n in nodes)

    # 서브넷 구분(public/private) 확인
    subnets = {n.get("subnet") for n in nodes if n["type"] == "subnet"}
    assert any("public" in s for s in subnets if s)
    assert any("private" in s for s in subnets if s)

    # 심어둔 이상치로 최소 1개 노드는 warning 상태여야 한다(크리티컬 카드 트리거)
    assert any(n["status"] == "warning" for n in nodes)


def test_demo_fintech_and_games_are_single_cloud():
    fintech = client.get(
        "/api/v1/monitor/topology", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_FINTECH}
    ).json()
    assert {n["provider"] for n in fintech["nodes"]} == {"scp"}
    assert len(fintech["nodes"]) >= 15

    games = client.get(
        "/api/v1/monitor/topology", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_GAMES}
    ).json()
    assert {n["provider"] for n in games["nodes"]} == {"aws"}
    assert len(games["nodes"]) >= 15


def test_demo_topology_provider_filter_applies_through_router():
    response = client.get(
        "/api/v1/monitor/topology", headers=admin_headers(),
        params={"tenant_id": DEMO_TENANT_COMMERCE, "provider": "aws"}
    )
    assert response.status_code == 200
    nodes = response.json()["nodes"]
    assert nodes  # aws 노드가 존재해야 함
    assert {n["provider"] for n in nodes} == {"aws"}


def test_system_aggregate_topology_merges_all_demo_tenants():
    """통합(system) 뷰에서 데모 고객사 3곳 전부가 합산되어 노출되는지 확인한다."""
    response = client.get("/api/v1/monitor/topology", headers=admin_headers())
    assert response.status_code == 200
    tenant_ids_in_view = {n["tenant_id"] for n in response.json()["nodes"]}
    assert set(DEMO_TENANT_IDS).issubset(tenant_ids_in_view)


# --- 3. 실 고객사 분리 회귀 - 신규 온보딩 고객사는 여전히 완전히 빈 값 ---

def test_freshly_onboarded_real_tenant_stays_completely_empty():
    new_id = f"tenant-demo-regress-{uuid.uuid4().hex[:8]}"
    create_resp = client.post(
        "/api/v1/tenants", headers=admin_headers(), json={"id": new_id, "name": "분리 회귀 테스트 고객사"}
    )
    assert create_resp.status_code == 201
    assert create_resp.json()["is_demo"] is False

    topo = client.get(
        "/api/v1/monitor/topology", headers=admin_headers(), params={"tenant_id": new_id}
    ).json()
    assert topo["nodes"] == []
    assert topo["data_source"] == "SIMULATED"

    costs = client.get(
        "/api/v1/monitor/costs", headers=admin_headers(), params={"tenant_id": new_id}
    ).json()
    assert float(costs["monthly_total"]) == 0
    assert costs["data_source"] == "SIMULATED"

    logs = client.get(
        "/api/v1/monitor/logs", headers=admin_headers(), params={"tenant_id": new_id}
    ).json()
    assert logs == []


# --- 4. 데모 비용(KRW FinOps) ---

def test_demo_costs_are_krw_and_nonzero_with_recommendation():
    response = client.get(
        "/api/v1/monitor/costs", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["currency"] == "KRW"
    assert data["data_source"] == "DEMO"
    assert float(data["monthly_total"]) > 0
    assert len(data["daily_trends"]) == 7
    assert len(data["recommendations"]) >= 1


# --- 5. 데모 로그 티커 ---

def test_demo_logs_stream_is_labeled_demo():
    response = client.get(
        "/api/v1/monitor/logs", headers=admin_headers(),
        params={"tenant_id": DEMO_TENANT_GAMES, "limit": 10}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 10
    assert all(log["data_source"] == "DEMO" for log in data)
    assert all(log["provider"] == "aws" for log in data)  # 게임즈는 AWS 단독


# --- 6. 데모 인시던트 - 심각도 다양, 최소 1건 CRITICAL (열린 상태) ---

def test_demo_incidents_have_varied_severity_with_open_critical():
    response = client.get(
        "/api/v1/incidents", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    )
    assert response.status_code == 200
    incidents = response.json()
    assert len(incidents) >= 2

    severities = {i["severity"] for i in incidents}
    assert "CRITICAL" in severities
    assert any(i["status"] == "OPEN" and i["severity"] == "CRITICAL" for i in incidents)
    # 심각도 다양성 - RESOLVED 이력도 최소 1건 포함(데모커머스)
    assert any(i["status"] == "RESOLVED" for i in incidents)


def test_demo_alert_rules_seeded_per_tenant():
    async def _fetch_rules():
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AlertRule).where(AlertRule.tenant_id == DEMO_TENANT_FINTECH)
            )
            return list(result.scalars().all())

    rules = asyncio.run(_fetch_rules())
    assert len(rules) == 2
    assert all(r.is_active for r in rules)


def test_all_demo_tenants_have_at_least_one_open_critical_incident():
    async def _fetch():
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Incident).where(Incident.tenant_id.in_(DEMO_TENANT_IDS)))
            return list(result.scalars().all())

    incidents = asyncio.run(_fetch())
    for tenant_id in DEMO_TENANT_IDS:
        tenant_incidents = [i for i in incidents if i.tenant_id == tenant_id]
        assert any(i.status == "OPEN" and i.severity == "CRITICAL" for i in tenant_incidents), tenant_id


# --- 7. MSP 전체보기(overview) 카드 - 데모 배지 + 실측 데이터 ---

def test_monitor_overview_includes_demo_badge_and_nonzero_data():
    response = client.get("/api/v1/monitor/overview", headers=admin_headers())
    assert response.status_code == 200
    rows = {row["tenant_id"]: row for row in response.json()}

    for demo_id in DEMO_TENANT_IDS:
        assert demo_id in rows
        assert rows[demo_id]["is_demo"] is True
        assert rows[demo_id]["resource_count"] > 0
        assert float(rows[demo_id]["monthly_cost"]) > 0
        assert rows[demo_id]["active_incidents"] >= 1

    assert rows[DEMO_TENANT_COMMERCE]["health"] in ("warning", "critical")

    # 실 고객사(레거시 픽스처)는 is_demo=false로 노출되어야 한다
    assert rows["tenant-scp"]["is_demo"] is False


# --- 8. 데모 메트릭 엔진 - 이상치 주입 + 재현성 + 테넌트 격리 (엔진 유닛 테스트) ---

def test_demo_metrics_engine_injects_cpu_anomaly_trend():
    node_id = f"{DEMO_TENANT_COMMERCE}-scp-app-1"
    points = demo_engine.get_metrics(DEMO_TENANT_COMMERCE, node_id, "cpu", minutes=60)
    assert len(points) == 60
    # 이상치 노드는 구간 후반부(현재에 가까울수록)로 갈수록 값이 뚜렷하게 악화되어야 한다
    assert points[-1]["value"] > points[0]["value"] + 20
    assert points[-1]["value"] > 85.0  # 경보 룰 임계치(85%) 초과 확인


def test_demo_metrics_engine_normal_node_stays_flat():
    node_id = f"{DEMO_TENANT_COMMERCE}-scp-app-2"  # 이상치 미등록 노드
    points = demo_engine.get_metrics(DEMO_TENANT_COMMERCE, node_id, "cpu", minutes=60)
    values = [p["value"] for p in points]
    assert max(values) - min(values) < 15  # 정상 노드는 크게 흔들리지 않아야 한다


def test_demo_metrics_engine_is_deterministic_within_same_call():
    node_id = f"{DEMO_TENANT_GAMES}-aws-web-1"
    a = demo_engine.get_metrics(DEMO_TENANT_GAMES, node_id, "cpu", minutes=5)
    b = demo_engine.get_metrics(DEMO_TENANT_GAMES, node_id, "cpu", minutes=5)
    assert a == b


def test_demo_metrics_engine_enforces_tenant_isolation():
    node_id = f"{DEMO_TENANT_COMMERCE}-scp-app-1"
    # 다른 데모 테넌트 소속으로 조회하면 정직하게 빈 리스트를 반환해야 한다
    assert demo_engine.get_metrics(DEMO_TENANT_GAMES, node_id, "cpu", minutes=5) == []


# --- 9. GET /monitor/metrics의 tenant_id 오버라이드 (MSP admin 드릴다운) ---
# 버그: topology/logs/costs는 이미 tenant_id 파라미터 + admin 오버라이드 + is_demo 분기가
# 있었지만 metrics만 빠져 있어, admin(tenant_id="system")이 데모 고객사로 드릴다운해도
# 메트릭이 항상 빈 값이었다(골든시그널 차트 미표시). 아래는 그 회귀 방지 테스트.

def test_admin_metrics_drilldown_into_demo_tenant_returns_demo_data():
    topo = client.get(
        "/api/v1/monitor/topology", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    ).json()
    vm_node = next(n for n in topo["nodes"] if n["type"] == "vm")

    response = client.get(
        "/api/v1/monitor/metrics",
        headers=admin_headers(),
        params={"tenant_id": DEMO_TENANT_COMMERCE, "node_id": vm_node["id"], "metric_name": "cpu"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data_source"] == "DEMO"
    assert len(data["points"]) > 0


def test_admin_metrics_without_tenant_id_defaults_to_own_tenant():
    """admin이 tenant_id 없이 호출하면(예: system 통합 뷰) 데모로 오분류되지 않고
    자기 테넌트("system") 기준으로 그대로 SIMULATED 폴백해야 한다 - topology의 "system"
    기본값 승격과 달리 metrics는 노드 단위라 승격하지 않는다."""
    response = client.get(
        "/api/v1/monitor/metrics",
        headers=admin_headers(),
        params={"node_id": "scp-vm-web-01", "metric_name": "cpu"},
    )
    assert response.status_code == 200
    assert response.json()["data_source"] == "SIMULATED"


def test_non_admin_metrics_cross_tenant_forbidden():
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get(
        "/api/v1/monitor/metrics",
        headers=headers,
        params={"tenant_id": DEMO_TENANT_COMMERCE, "node_id": "scp-vm-web-01", "metric_name": "cpu"},
    )
    assert response.status_code == 403


def test_freshly_onboarded_real_tenant_metrics_stay_simulated_and_empty():
    """신규 실 고객사(자격증명 미연동)로 admin이 드릴다운해도 metrics는 여전히
    SIMULATED + 빈 포인트여야 한다(데모 분기로 잘못 새지 않는 회귀 방지)."""
    new_id = f"tenant-metrics-regress-{uuid.uuid4().hex[:8]}"
    create_resp = client.post(
        "/api/v1/tenants", headers=admin_headers(), json={"id": new_id, "name": "메트릭 분리 회귀 테스트 고객사"}
    )
    assert create_resp.status_code == 201

    response = client.get(
        "/api/v1/monitor/metrics",
        headers=admin_headers(),
        params={"tenant_id": new_id, "node_id": "some-nonexistent-node", "metric_name": "cpu"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data_source"] == "SIMULATED"
    assert data["points"] == []
