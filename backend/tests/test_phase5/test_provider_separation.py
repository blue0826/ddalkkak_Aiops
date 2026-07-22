from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.simulator import simulator
from backend.app.core.providers import get_provider, list_providers

client = TestClient(app)


def get_token(username, password):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password}
    )
    return response.json()["access_token"]


def test_provider_registry_scp_and_aws_have_distinct_monitoring_service():
    """
    Provider Registry에서 SCP와 AWS의 모니터링 서비스 명칭이 서로 다르게 분리되어 있는지 검증합니다.
    """
    scp = get_provider("scp")
    aws = get_provider("aws")
    assert scp["monitoring_service"] == "Cloud Monitoring"
    assert aws["monitoring_service"] == "CloudWatch"
    assert scp["monitoring_service"] != aws["monitoring_service"]


def test_provider_registry_unknown_returns_none():
    assert get_provider("azure") is None
    assert get_provider("") is None


def test_providers_endpoint_lists_both_with_distinct_monitoring_service():
    token = get_token("sysadmin@company.com", "sysadmin123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/providers", headers=headers)
    assert response.status_code == 200
    data = response.json()
    ids = {p["id"] for p in data}
    assert ids == {"scp", "aws"}

    scp = next(p for p in data if p["id"] == "scp")
    aws = next(p for p in data if p["id"] == "aws")
    assert scp["monitoring_service"] == "Cloud Monitoring"
    assert aws["monitoring_service"] == "CloudWatch"
    assert scp["monitoring_service"] != aws["monitoring_service"]
    assert scp["default_region"] == "kr-west1"
    assert aws["default_region"] == "ap-northeast-2"


def test_provider_detail_endpoint_404_for_unknown_provider():
    token = get_token("sysadmin@company.com", "sysadmin123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/providers/azure", headers=headers)
    assert response.status_code == 404


def test_provider_detail_endpoint_returns_scp_metadata():
    token = get_token("sysadmin@company.com", "sysadmin123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/providers/scp", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["short_name"] == "SCP"
    assert data["instance_types"] == ["Standard-2", "Standard-4", "Standard-8", "Standard-16"]


def test_aws_logs_return_empty_pending_real_cloudwatch_integration():
    """
    CEO 지시(2026-07-15): 하드코딩된 로그 템플릿(가짜 CloudWatch/SCP 로그 문구)은 완전히
    제거되었다. 실 Cloud Logging/CloudWatch Logs API 연동 전까지 get_logs는 프로바이더와
    무관하게 항상 빈 리스트를 정직하게 반환해야 한다 (과거의 "교차 오염 문구 없음" 검증은
    더 이상 생성되는 로그 콘텐츠가 없으므로 무의미해졌다).
    """
    logs = simulator.get_logs(tenant_id="tenant-aws", limit=60, provider="aws")
    assert logs == []


def test_scp_logs_return_empty_pending_real_cloud_logging_integration():
    logs = simulator.get_logs(tenant_id="tenant-scp", limit=60, provider="scp")
    assert logs == []


def test_aws_events_return_empty_pending_real_cloudwatch_alarm_integration():
    """
    CEO 지시(2026-07-15): 하드코딩된 evt-scp-*/evt-aws-* 가짜 이벤트는 완전히 제거되었다.
    실 CloudWatch/Cloud Monitoring 알람 API 연동 전까지 get_events는 프로바이더와 무관하게
    항상 빈 리스트를 정직하게 반환해야 한다.
    """
    events = simulator.get_events(tenant_id="tenant-aws", provider="aws")
    assert events == []


def test_scp_events_return_empty_pending_real_cloud_monitoring_alarm_integration():
    events = simulator.get_events(tenant_id="tenant-scp", provider="scp")
    assert events == []


def test_cost_recommendations_use_correct_instance_family_per_provider():
    """
    시스템(전체 취합) 비용 추천에서 SCP는 Standard- 계열만, AWS는 t3. 계열만 사용하며
    Azure 표기(D4s v3 등)가 더 이상 존재하지 않는지 검증합니다.
    """
    costs = simulator.get_costs(tenant_id="system")
    recs = costs["recommendations"]
    assert len(recs) == 2

    scp_rec = next(r for r in recs if r["node_id"].startswith("scp-"))
    aws_rec = next(r for r in recs if r["node_id"].startswith("aws-"))

    assert "Standard-" in scp_rec["action"]
    assert "D4s" not in scp_rec["action"]
    assert "Azure" not in scp_rec["action"]
    assert "t3." not in scp_rec["action"]

    assert "t3." in aws_rec["action"]
    assert "D4s" not in aws_rec["action"]
    assert "Azure" not in aws_rec["action"]
    assert "Standard-" not in aws_rec["action"]


def test_topology_nodes_carry_registry_region():
    """
    토폴로지 노드에 Provider Registry 기준 리전이 부여되는지 검증합니다.
    """
    topo = simulator.get_topology(tenant_id="system")
    scp_nodes = [n for n in topo["nodes"] if n["provider"] == "scp"]
    aws_nodes = [n for n in topo["nodes"] if n["provider"] == "aws"]
    assert all(n.get("region") == "kr-west1" for n in scp_nodes)
    assert all(n.get("region") == "ap-northeast-2" for n in aws_nodes)


def test_cloud_adapters_expose_provider_metadata():
    """
    AWSAdapter/SCPAdapter의 get_metadata()가 각자의 프로바이더 레지스트리를 정확히 반환하는지,
    AWS는 SIMULATED, SCP는 REAL_CAPABLE로 명확히 구분되는지 검증합니다.
    """
    from backend.app.services.cloud_adapter import AWSAdapter, SCPAdapter

    aws = AWSAdapter(tenant_id="tenant-aws")
    scp = SCPAdapter(tenant_id="tenant-scp")

    aws_meta = aws.get_metadata()
    scp_meta = scp.get_metadata()

    assert aws_meta["id"] == "aws"
    assert aws_meta["integration_mode"] == "SIMULATED"
    assert scp_meta["id"] == "scp"
    assert scp_meta["integration_mode"] == "REAL_CAPABLE"
    assert aws_meta["monitoring_service"] != scp_meta["monitoring_service"]
