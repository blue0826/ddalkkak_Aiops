"""
테넌트별 유료(과금) 서비스 동의 게이트 검증 테스트.

CEO 결정(2026-07-20): 삼성 SCP Cloud Monitoring/Cloud Logging은 과금 서비스이므로
운영자가 해당 고객사에 대해 명시적으로 켜기 전에는(기본 OFF) 백엔드가 절대 실 API를
호출하지 않는다. 이 파일은 다음을 검증한다:
1. GET /monitor/service-status - 기본값(행 없음=비활성), 데모 테넌트는 항상 사용가능
2. PUT /tenants/{tenant_id}/services/{service_key} - 권한/영속성/감사로그/입력검증
3. (가장 중요) 동의 OFF 상태에서는 자격증명이 있어도 실 SCP API가 절대 호출되지 않음
"""
import uuid

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.demo.constants import DEMO_TENANT_COMMERCE

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


def onboard_tenant() -> str:
    """격리된 테스트용 실 고객사(is_demo=False)를 온보딩하고 ID를 반환한다."""
    new_id = f"tenant-svc-gate-{uuid.uuid4().hex[:8]}"
    response = client.post(
        "/api/v1/tenants",
        headers=admin_headers(),
        json={"id": new_id, "name": "과금 서비스 게이트 테스트 고객사"}
    )
    assert response.status_code == 201
    return new_id


# --- 1. GET /monitor/service-status ---

def test_service_status_default_disabled_for_new_real_tenant():
    """
    신규 온보딩 테넌트는 tenant_service_setting 행이 없으므로 "부재 = 비활성" 기본값에
    따라 scp/monitoring, scp/logging 모두 enabled=false, last_status=unknown이어야 한다.
    """
    tenant_id = onboard_tenant()
    response = client.get(
        "/api/v1/monitor/service-status",
        headers=admin_headers(),
        params={"tenant_id": tenant_id}
    )
    assert response.status_code == 200
    data = response.json()
    keys = {item["service_key"]: item for item in data}
    assert "monitoring" in keys and "logging" in keys

    monitoring = keys["monitoring"]
    assert monitoring["provider"] == "scp"
    assert monitoring["display_name"] == "Cloud Monitoring"
    assert monitoring["enabled"] is False
    assert monitoring["billable"] is True
    assert monitoring["last_status"] == "unknown"
    assert monitoring["last_checked_at"] is None

    logging_entry = keys["logging"]
    assert logging_entry["display_name"] == "Cloud Logging"
    assert logging_entry["enabled"] is False
    assert logging_entry["billable"] is True


def test_service_status_demo_tenant_always_available():
    """
    데모 워크스페이스는 실 과금 API를 절대 호출하지 않으므로, DB 설정과 무관하게
    enabled=true, billable=false, last_status=ok로 항상 "미활성화" 배너 없이 보고되어야 한다.
    """
    response = client.get(
        "/api/v1/monitor/service-status",
        headers=admin_headers(),
        params={"tenant_id": DEMO_TENANT_COMMERCE}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2
    for item in data:
        assert item["enabled"] is True
        assert item["billable"] is False
        assert item["last_status"] == "ok"


def test_service_status_forbidden_for_non_admin_cross_tenant():
    """
    비관리자(TENANT_OPERATOR)가 자신의 테넌트가 아닌 다른 tenant_id를 조회하면 403이어야 한다.
    """
    token = get_token("op_scp@client.com", "op123!")  # tenant-scp 소속
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get(
        "/api/v1/monitor/service-status",
        headers=headers,
        params={"tenant_id": "tenant-aws"}
    )
    assert response.status_code == 403


def test_service_status_allows_own_tenant_for_non_admin():
    """비관리자는 자신의 테넌트 조회는 허용되어야 한다."""
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get(
        "/api/v1/monitor/service-status",
        headers=headers,
        params={"tenant_id": "tenant-scp"}
    )
    assert response.status_code == 200


# --- 2. PUT /tenants/{tenant_id}/services/{service_key} ---

def test_put_service_admin_toggle_persists_and_writes_audit_log():
    tenant_id = onboard_tenant()

    on_response = client.put(
        f"/api/v1/tenants/{tenant_id}/services/monitoring",
        headers=admin_headers(),
        json={"enabled": True}
    )
    assert on_response.status_code == 200
    on_data = on_response.json()
    assert on_data["enabled"] is True
    assert on_data["provider"] == "scp"
    assert on_data["service_key"] == "monitoring"

    # 영속성 확인 - GET service-status로 재조회
    status_response = client.get(
        "/api/v1/monitor/service-status",
        headers=admin_headers(),
        params={"tenant_id": tenant_id}
    )
    monitoring = next(i for i in status_response.json() if i["service_key"] == "monitoring")
    assert monitoring["enabled"] is True

    # 감사 로그 기록 확인 - admin 소속(system)은 audit-logs 필터가 스킵되어 전체가 조회됨
    audit_response = client.get("/api/v1/alerts/audit-logs", headers=admin_headers(), params={"limit": 500})
    assert audit_response.status_code == 200
    matching = [
        entry for entry in audit_response.json()
        if entry["tenant_id"] == tenant_id and entry["action"] == "update_tenant_service"
    ]
    assert len(matching) >= 1
    assert "monitoring" in matching[-1]["details"]
    assert "enabled=True" in matching[-1]["details"]

    # 다시 끄기 - persists false로도 정상 전환되는지
    off_response = client.put(
        f"/api/v1/tenants/{tenant_id}/services/monitoring",
        headers=admin_headers(),
        json={"enabled": False}
    )
    assert off_response.status_code == 200
    assert off_response.json()["enabled"] is False


def test_put_service_non_admin_forbidden():
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.put(
        "/api/v1/tenants/tenant-scp/services/monitoring",
        headers=headers,
        json={"enabled": True}
    )
    assert response.status_code == 403


def test_put_service_unknown_tenant_404():
    response = client.put(
        "/api/v1/tenants/tenant-does-not-exist-xyz/services/monitoring",
        headers=admin_headers(),
        json={"enabled": True}
    )
    assert response.status_code == 404


def test_put_service_invalid_service_key_400():
    tenant_id = onboard_tenant()
    response = client.put(
        f"/api/v1/tenants/{tenant_id}/services/not-a-real-service",
        headers=admin_headers(),
        json={"enabled": True}
    )
    assert response.status_code == 400


# --- 3. 게이트 검증 (가장 중요) - 동의 OFF면 자격증명이 있어도 실 SCP 호출이 발생하지 않는다 ---

def test_metrics_gate_skips_real_scp_call_when_consent_is_off(monkeypatch):
    """
    테넌트에 SCP 자격증명이 등록되어 있어도(mock), 과금 서비스 동의가 꺼져 있으면
    SCPAdapter.fetch_metrics_real이 절대 호출되지 않아야 한다. spy로 어댑터 메서드
    호출 여부 자체를 단언한다.

    버그 수정(2026-07-20, CEO 지시): 예전에는 이 경우 시뮬레이터 폴백(SIMULATED + 지어낸
    값)으로 응답했으나, 실 고객사(tenant-scp) 화면에 지어낸 데이터를 보여주는 하드룰
    위반이었다. 이제는 시뮬레이터로 대체하지 않고 정직한 빈 결과(REAL_EMPTY, points=[])로
    응답해야 한다 - "미활성화" 안내는 GET /monitor/service-status가 별도로 담당한다.
    """
    import backend.app.routers.monitor as monitor_router
    import backend.app.services.cloud_adapter as cloud_adapter_module

    call_count = {"n": 0}

    async def fake_resolve(db, tenant_id, user_email):
        # 자격증명이 "존재"하는 상황을 재현 - 게이트가 이 단계 이전에 막아야 한다
        return {
            "access_key": "ak",
            "secret_key": "sk",
            "project_id": "pj",
            "endpoint_url": "https://openapi.samsungsdscloud.com"
        }

    def spy_fetch_metrics_real(self, node_id, metric_name, minutes):
        call_count["n"] += 1
        return [{"timestamp": "2026-07-20T00:00:00Z", "value": 99.9}]

    monkeypatch.setattr(monitor_router, "_fetch_scp_credential_fields", fake_resolve)
    monkeypatch.setattr(cloud_adapter_module.SCPAdapter, "fetch_metrics_real", spy_fetch_metrics_real)

    # tenant-scp는 동의 행이 없는 기본 상태(비활성) - 다른 테스트가 켜놓았을 가능성을 배제하기
    # 위해 명시적으로 OFF로 확정한다.
    off_response = client.put(
        "/api/v1/tenants/tenant-scp/services/monitoring",
        headers=admin_headers(),
        json={"enabled": False}
    )
    assert off_response.status_code == 200
    assert off_response.json()["enabled"] is False

    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get(
        "/api/v1/monitor/metrics?node_id=scp-vm-web-01&metric_name=cpu&minutes=10&provider=scp",
        headers=headers
    )
    assert response.status_code == 200
    data = response.json()

    # 핵심 단언 - 유료 API(어댑터 메서드)가 단 한 번도 호출되지 않았어야 한다
    assert call_count["n"] == 0
    # 정직한 빈 결과 - 지어낸 값 없이 REAL_EMPTY + 빈 points여야 한다
    assert data["data_source"] == "REAL_EMPTY"
    assert data["points"] == []


def test_metrics_gate_allows_real_scp_call_when_consent_is_on_and_records_status(monkeypatch):
    """
    동의를 켜면 게이트가 실 호출을 허용하고, 성공 시 REAL로 라벨링되며
    tenant_service_setting.last_status가 ok로 기록되는지(다음 GET에 반영) 검증한다.
    """
    import backend.app.routers.monitor as monitor_router
    import backend.app.services.cloud_adapter as cloud_adapter_module

    call_count = {"n": 0}

    async def fake_resolve(db, tenant_id, user_email):
        return {
            "access_key": "ak",
            "secret_key": "sk",
            "project_id": "pj",
            "endpoint_url": "https://openapi.samsungsdscloud.com"
        }

    def spy_fetch_metrics_real(self, node_id, metric_name, minutes):
        call_count["n"] += 1
        self.last_call_status = "ok"
        return [{"timestamp": "2026-07-20T00:00:00Z", "value": 12.3}]

    monkeypatch.setattr(monitor_router, "_fetch_scp_credential_fields", fake_resolve)
    monkeypatch.setattr(cloud_adapter_module.SCPAdapter, "fetch_metrics_real", spy_fetch_metrics_real)

    on_response = client.put(
        "/api/v1/tenants/tenant-scp/services/monitoring",
        headers=admin_headers(),
        json={"enabled": True}
    )
    assert on_response.status_code == 200

    try:
        token = get_token("op_scp@client.com", "op123!")
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get(
            "/api/v1/monitor/metrics?node_id=scp-vm-web-01&metric_name=cpu&minutes=10&provider=scp",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert call_count["n"] == 1
        assert data["data_source"] == "REAL"

        status_response = client.get(
            "/api/v1/monitor/service-status",
            headers=admin_headers(),
            params={"tenant_id": "tenant-scp"}
        )
        monitoring = next(i for i in status_response.json() if i["service_key"] == "monitoring")
        assert monitoring["last_status"] == "ok"
        assert monitoring["last_checked_at"] is not None
    finally:
        client.put(
            "/api/v1/tenants/tenant-scp/services/monitoring",
            headers=admin_headers(),
            json={"enabled": False}
        )


def test_metrics_real_empty_when_consent_on_but_no_credentials_registered():
    """
    신규 실 고객사(is_demo=False) - 과금 서비스 동의는 켰지만 아직 SCP 자격증명을
    등록하지 않은 상태(온보딩 직후 흔한 순서: 동의 먼저, 자격증명 나중). 실 호출 자체를
    시도할 수 없으므로 시뮬레이터로 대체하지 않고 정직한 빈 결과(REAL_EMPTY, points=[])로
    응답해야 한다 - 지어낸 값이 실 고객사 이름 아래 노출되면 안 된다.
    """
    new_id = onboard_tenant()

    on_response = client.put(
        f"/api/v1/tenants/{new_id}/services/monitoring",
        headers=admin_headers(),
        json={"enabled": True}
    )
    assert on_response.status_code == 200

    response = client.get(
        "/api/v1/monitor/metrics",
        headers=admin_headers(),
        params={"tenant_id": new_id, "node_id": "no-such-node", "metric_name": "cpu", "provider": "scp"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data_source"] == "REAL_EMPTY"
    assert data["points"] == []


def test_metrics_demo_tenant_unaffected_by_real_empty_gate():
    """
    회귀 방지 - is_demo 테넌트는 provider=scp로 조회해도 이 REAL_EMPTY 게이트를 절대
    타지 않고 기존과 동일하게 DEMO 데이터를 그대로 반환해야 한다(데모 워크스페이스는
    이 버그 수정의 대상이 아니다).
    """
    topo = client.get(
        "/api/v1/monitor/topology", headers=admin_headers(), params={"tenant_id": DEMO_TENANT_COMMERCE}
    ).json()
    vm_node = next(n for n in topo["nodes"] if n["type"] == "vm")

    response = client.get(
        "/api/v1/monitor/metrics",
        headers=admin_headers(),
        params={"tenant_id": DEMO_TENANT_COMMERCE, "node_id": vm_node["id"], "metric_name": "cpu", "provider": "scp"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data_source"] == "DEMO"
    assert len(data["points"]) > 0
