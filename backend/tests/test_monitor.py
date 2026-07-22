from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def get_token(username, password):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password}
    )
    return response.json()["access_token"]


def admin_headers():
    token = get_token("sysadmin@company.com", "sysadmin123!")
    return {"Authorization": f"Bearer {token}"}


def _set_scp_monitoring_consent(tenant_id: str, enabled: bool):
    """
    과금 서비스 게이트(2026-07-20) 도입 이후, SCP Cloud Monitoring 실 API 경로를 mock으로
    검증하는 테스트는 먼저 해당 테넌트의 동의를 켜야 라우터가 자격증명 조회/어댑터 호출
    단계까지 진행한다 - PUT /tenants/{tenant_id}/services/monitoring API를 그대로 재사용한다.
    """
    response = client.put(
        f"/api/v1/tenants/{tenant_id}/services/monitoring",
        headers=admin_headers(),
        json={"enabled": enabled}
    )
    assert response.status_code == 200

def test_get_tenants_admin():
    """
    GET /tenants는 실 DB(Tenant 테이블) 기준으로 등록된 전체 고객사를 반환해야 한다.
    기동 시 시딩되는 기초 2곳(tenant-scp/tenant-aws)이 최소한 모두 포함되고
    system은 제외되는지 검증한다 (실 온보딩으로 생성된 테넌트가 추가로 있어도 무방).
    """
    token = get_token("sysadmin@company.com", "sysadmin123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/tenants", headers=headers)
    assert response.status_code == 200
    data = response.json()
    ids = {t["id"] for t in data}
    assert {"tenant-scp", "tenant-aws"}.issubset(ids)
    assert "system" not in ids

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
    """
    CEO 지시(2026-07-15): 특정 테넌트에 하드코딩된 고정 KRW 금액(과거 1,831,275원 등)은
    더 이상 존재하지 않는다 - 비용은 테스트 픽스처로 주입된 노드 인벤토리를
    표준 인스턴스 요금(KRW)으로 환산한 계산값이므로, 마법의 숫자를 재단언하는 대신
    금액 산식의 구조적 정합성(통화/추천 1건/절감액 = 현재가-목표가 등)을 검증한다.
    """
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/monitor/costs", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["currency"] == "KRW"
    assert float(data["monthly_total"]) > 0
    assert len(data["recommendations"]) == 1

    rec = data["recommendations"][0]
    assert float(rec["current_monthly_cost"]) > float(rec["target_monthly_cost"])
    assert float(rec["savings"]) == round(float(rec["current_monthly_cost"]) - float(rec["target_monthly_cost"]), 2)
    assert float(rec["savings"]) > 0

def test_network_bypass_forbidden_for_viewer():
    """
    읽기전용(TENANT_VIEWER) 역할은 네트워크 자동 우회 조치 API를 실행할 수 없어야 합니다.
    """
    token = get_token("view_scp@client.com", "view123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/api/v1/monitor/network/bypass?action=trigger", headers=headers)
    assert response.status_code == 403

def test_soar_block_forbidden_for_viewer():
    """
    읽기전용(TENANT_VIEWER) 역할은 SOAR 수동 차단 조치 API를 실행할 수 없어야 합니다.
    """
    token = get_token("view_scp@client.com", "view123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/api/v1/monitor/security/soar?ip=192.0.2.1", headers=headers)
    assert response.status_code == 403


# --- 데이터 출처(data_source) 정직 라벨링 검증 ---
# 실 라이브 API 응답에서 온 값만 REAL, 그 외(시뮬레이터/폴백)는 전부 SIMULATED여야 한다.

def test_get_metrics_default_is_simulated_with_fallback_points():
    """
    SCP 자격증명/실연동 파라미터 없이 /monitor/metrics를 호출하면 data_source가
    SIMULATED이고, 시뮬레이터 폴백 포인트가 채워져 반환되어야 한다.
    """
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get(
        "/api/v1/monitor/metrics?node_id=scp-vm-web-01&metric_name=cpu&minutes=10",
        headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data_source"] == "SIMULATED"
    assert data["node_id"] == "scp-vm-web-01"
    assert data["metric_name"] == "cpu"
    assert len(data["points"]) > 0


def test_get_metrics_real_when_scp_credential_and_adapter_succeed(monkeypatch):
    """
    (mock) 테넌트에 SCP 자격증명이 등록되어 있고 실 Cloud Monitoring API가 값을
    반환하는 상황을 monkeypatch로 재현하여, /monitor/metrics 응답의 data_source가
    정직하게 REAL로 라벨링되는지 검증한다. 실 네트워크 호출은 발생하지 않는다.

    과금 서비스 게이트(2026-07-20) 전제 - 이 시나리오는 운영자가 명시적으로 동의
    (enabled=true)한 상태를 재현하므로 먼저 PUT으로 동의를 켠다.
    """
    import backend.app.routers.monitor as monitor_router
    import backend.app.services.cloud_adapter as cloud_adapter_module

    async def fake_resolve(db, tenant_id, user_email):
        return {
            "access_key": "ak",
            "secret_key": "sk",
            "project_id": "pj",
            "endpoint_url": "https://openapi.samsungsdscloud.com"
        }

    def fake_fetch_metrics_real(self, node_id, metric_name, minutes):
        return [{"timestamp": "2026-07-15T00:00:00Z", "value": 77.7}]

    monkeypatch.setattr(monitor_router, "_fetch_scp_credential_fields", fake_resolve)
    monkeypatch.setattr(cloud_adapter_module.SCPAdapter, "fetch_metrics_real", fake_fetch_metrics_real)

    _set_scp_monitoring_consent("tenant-scp", True)
    try:
        token = get_token("op_scp@client.com", "op123!")
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get(
            "/api/v1/monitor/metrics?node_id=scp-vm-web-01&metric_name=cpu&minutes=10&provider=scp",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["data_source"] == "REAL"
        assert data["points"][0]["value"] == 77.7
    finally:
        _set_scp_monitoring_consent("tenant-scp", False)


def test_get_metrics_falls_back_to_simulated_when_real_adapter_returns_nothing(monkeypatch):
    """
    (mock) SCP 자격증명은 있지만 실 어댑터가 값을 못 받아온 상황(None)을 재현한다.

    버그 수정(2026-07-20, CEO 지시): 예전에는 이 경우 거짓으로 REAL을 표기하지 않는 대신
    시뮬레이터 폴백(SIMULATED + 지어낸 값)으로 응답했으나, 이는 실 고객사 화면에 지어낸
    데이터를 보여주는 하드룰 위반이었다(SCP 기본 에이전트리스 수집이 수 시간 간격이라
    minutes=60 등 짧은 구간은 흔히 0 포인트). 이제는 시뮬레이터로 대체하지 않고 정직한
    빈 결과(REAL_EMPTY, points=[])로 응답해야 한다.
    """
    import backend.app.routers.monitor as monitor_router
    import backend.app.services.cloud_adapter as cloud_adapter_module

    async def fake_resolve(db, tenant_id, user_email):
        return {
            "access_key": "ak",
            "secret_key": "sk",
            "project_id": "pj",
            "endpoint_url": "https://openapi.samsungsdscloud.com"
        }

    def fake_fetch_metrics_real(self, node_id, metric_name, minutes):
        return None

    monkeypatch.setattr(monitor_router, "_fetch_scp_credential_fields", fake_resolve)
    monkeypatch.setattr(cloud_adapter_module.SCPAdapter, "fetch_metrics_real", fake_fetch_metrics_real)

    _set_scp_monitoring_consent("tenant-scp", True)
    try:
        token = get_token("op_scp@client.com", "op123!")
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get(
            "/api/v1/monitor/metrics?node_id=scp-vm-web-01&metric_name=cpu&minutes=10&provider=scp",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["data_source"] == "REAL_EMPTY"
        assert data["points"] == []
    finally:
        _set_scp_monitoring_consent("tenant-scp", False)


def test_get_metrics_real_uses_monitoring_endpoint_url_from_credential(monkeypatch):
    """
    2026-07-20 P0 실측 이후: /monitor/metrics가 SCPAdapter를 만들 때 credential_service가
    파생한 monitoring_endpoint_url(cloudmonitoring.{region}.{env}.samsungsdscloud.com)을
    실제로 전달하는지 검증한다. 이전에는 이 값이 전달되지 않아 항상 settings.
    SCP_MONITORING_ENDPOINT(구버전 openapi.samsungsdscloud.com 폴백)로만 요청이 갔었다.
    """
    import backend.app.routers.monitor as monitor_router
    import backend.app.services.cloud_adapter as cloud_adapter_module

    captured_hosts = []

    async def fake_resolve(db, tenant_id, user_email):
        return {
            "access_key": "ak",
            "secret_key": "sk",
            "project_id": "pj",
            "endpoint_url": "https://virtualserver.kr-west1.e.samsungsdscloud.com",
            "monitoring_endpoint_url": "https://cloudmonitoring.kr-west1.e.samsungsdscloud.com",
        }

    def fake_fetch_metrics_real(self, node_id, metric_name, minutes):
        captured_hosts.append(self.monitoring_endpoint_url)
        return [{"timestamp": "2026-07-20T00:00:00Z", "value": 55.5}]

    monkeypatch.setattr(monitor_router, "_fetch_scp_credential_fields", fake_resolve)
    monkeypatch.setattr(cloud_adapter_module.SCPAdapter, "fetch_metrics_real", fake_fetch_metrics_real)

    _set_scp_monitoring_consent("tenant-scp", True)
    try:
        token = get_token("op_scp@client.com", "op123!")
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get(
            "/api/v1/monitor/metrics?node_id=scp-vm-web-01&metric_name=cpu&minutes=10&provider=scp",
            headers=headers
        )
        assert response.status_code == 200
        assert response.json()["data_source"] == "REAL"
        assert captured_hosts == ["https://cloudmonitoring.kr-west1.e.samsungsdscloud.com"]
    finally:
        _set_scp_monitoring_consent("tenant-scp", False)


def test_topology_data_source_simulated_by_default():
    """
    실 VM 주입이 시도되지 않거나 실패하면 /monitor/topology 응답은 정직하게
    data_source=SIMULATED여야 한다.
    """
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/monitor/topology?provider=scp", headers=headers)
    assert response.status_code == 200
    assert response.json()["data_source"] == "SIMULATED"


def test_topology_data_source_real_when_scp_vms_injected(monkeypatch):
    """
    (mock) SCP 자격증명 조회 및 fetch_real_vms 실서버 주입이 성공하는 상황을 재현하여
    /monitor/topology 응답의 data_source가 REAL로 라벨링되는지 검증한다.
    (토폴로지=REAL이어도 메트릭은 독립적으로 SIMULATED일 수 있음 - 각자 정직하게 보고)
    """
    import backend.app.routers.monitor as monitor_router
    import backend.app.services.cloud_adapter as cloud_adapter_module
    from backend.app.services.simulator import simulator

    async def fake_resolve(db, tenant_id, user_email):
        return {
            "access_key": "ak",
            "secret_key": "sk",
            "project_id": "pj",
            "endpoint_url": "https://virtualserver.kr-west1.e.samsungsdscloud.com"
        }

    def fake_fetch_real_vms(self):
        return [{
            "id": "real-vm-1",
            "name": "real-web-01",
            "state": "ACTIVE",
            "addresses": [{"subnet_name": "tfPublicmonos", "ip_addresses": [{"ip_address": "10.0.0.5"}]}],
            "security_groups": []
        }]

    monkeypatch.setattr(monitor_router, "_fetch_scp_credential_fields", fake_resolve)
    monkeypatch.setattr(cloud_adapter_module.SCPAdapter, "fetch_real_vms", fake_fetch_real_vms)

    try:
        token = get_token("op_scp@client.com", "op123!")
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/v1/monitor/topology?provider=scp", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["data_source"] == "REAL"
        assert any(n["id"] == "real-vm-1" for n in data["nodes"])
    finally:
        # 전역 싱글톤(simulator.active_real_vms) 오염 방지 - 다른 테스트에 영향 없도록 정리
        simulator.active_real_vms.pop("tenant-scp", None)


def test_get_costs_real_daily_trends_have_no_random_noise():
    """
    버그 회귀 방지(2026-07-20 스윕): data_source="REAL"인 비용 응답의 daily_trends는
    random.uniform() 잡음 없이 결정론적이어야 한다 - 실 청구 이력이 없는데 REAL 배지
    아래 지어낸 값을 보여주는 것은 scp_real_topology.py의 cpu/memory 버그와 동일한
    클래스다. 같은 입력(active_real_vms)으로 두 번 호출해 완전히 동일한 daily_trends가
    나오는지로 "난수 없음"을 검증한다.
    """
    from backend.app.services.simulator import simulator

    real_vm = {
        "id": "real-vm-cost-1",
        "label": "real-web-01\n(10.0.0.5)",
        "type": "vm",
        "tenant_id": "tenant-scp",
        "provider": "scp",
        "metadata": {"scp_compute_class_type": "Standard-4"},
    }
    simulator.active_real_vms["tenant-scp"] = [real_vm]
    try:
        costs1 = simulator.get_costs(tenant_id="tenant-scp", provider="scp")
        costs2 = simulator.get_costs(tenant_id="tenant-scp", provider="scp")

        assert costs1["data_source"] == "REAL"
        assert costs2["data_source"] == "REAL"
        assert costs1["daily_trends"] == costs2["daily_trends"]
    finally:
        simulator.active_real_vms.pop("tenant-scp", None)


