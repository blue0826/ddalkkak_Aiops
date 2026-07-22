"""
멀티테넌트 확장 검증 테스트 - CEO 요구사항: "여러 고객사를 다 등록하고 모든 테넌트가
대시보드에 표시돼야 한다. 1개 클라우드 전용이 아니다(한 고객사가 SCP·AWS 둘 다 가질 수 있다)."

GET /tenants가 실 DB 기반으로 등록된 고객사를 포함하는지, GET /monitor/overview /
POST /tenants(온보딩) 계약이 스펙대로 동작하는지를 검증한다.

CEO 지시(2026-07-15): 지어낸 데모 고객사 3곳(tenant-commerce/tenant-finance/tenant-mfg)은
시딩하지 않는다 — 실데이터(실 온보딩으로 생성된 테넌트)만 다룬다. 온보딩 테스트는 테스트
안에서 임시 테넌트를 만들어 검증하며, 시드된 데모 데이터에 의존하지 않는다.

기존 tenant-scp/tenant-aws 노드/계정/엔드포인트는 이 파일에서 건드리지 않는다.
"""
import uuid
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


# --- 1. GET /tenants가 실 DB 목록을 반환하는지 (API 레벨) ---

def test_get_tenants_includes_base_tenants_via_api():
    response = client.get("/api/v1/tenants", headers=admin_headers())
    assert response.status_code == 200
    ids = {t["id"] for t in response.json()}
    assert {"tenant-scp", "tenant-aws"}.issubset(ids)
    assert "system" not in ids


# --- 2. GET /monitor/overview - admin 전체 요약, 뷰어/운영자는 403 ---

def test_monitor_overview_admin_returns_full_summary():
    response = client.get("/api/v1/monitor/overview", headers=admin_headers())
    assert response.status_code == 200
    data = response.json()
    tenant_ids = {row["tenant_id"] for row in data}
    assert {"tenant-scp", "tenant-aws"}.issubset(tenant_ids)
    assert "system" not in tenant_ids

    scp_row = next(row for row in data if row["tenant_id"] == "tenant-scp")
    assert "scp" in scp_row["providers"]
    assert scp_row["resource_count"] > 0
    assert scp_row["monthly_cost"] > 0
    assert scp_row["health"] in ("healthy", "warning", "critical")
    # scp-vm-app-01이 warning 상태이므로 최소 healthy는 아니어야 한다
    assert scp_row["health"] in ("warning", "critical")
    assert scp_row["active_alerts"] >= 1


def test_monitor_overview_includes_freshly_onboarded_tenant():
    """
    온보딩 직후 신규 테넌트도 시드된 데모 데이터 없이 overview 목록에 포함되어야 한다
    (시뮬레이터 인프라가 없는 신규 고객사는 resource_count/monthly_cost가 0이어도 정상).
    """
    new_id = f"tenant-onboard-overview-{uuid.uuid4().hex[:8]}"
    create_response = client.post(
        "/api/v1/tenants",
        headers=admin_headers(),
        json={"id": new_id, "name": "온보딩 오버뷰 테스트 고객사"}
    )
    assert create_response.status_code == 201

    response = client.get("/api/v1/monitor/overview", headers=admin_headers())
    assert response.status_code == 200
    tenant_ids = {row["tenant_id"] for row in response.json()}
    assert new_id in tenant_ids


def test_monitor_overview_forbidden_for_operator_and_viewer():
    op_token = get_token("op_scp@client.com", "op123!")
    response = client.get(
        "/api/v1/monitor/overview",
        headers={"Authorization": f"Bearer {op_token}"}
    )
    assert response.status_code == 403

    viewer_token = get_token("view_scp@client.com", "view123!")
    response = client.get(
        "/api/v1/monitor/overview",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert response.status_code == 403


# --- 4. POST /tenants - admin 생성, 중복 409, 뷰어 403 ---

def test_create_tenant_success_as_admin():
    new_id = f"tenant-onboard-{uuid.uuid4().hex[:8]}"
    response = client.post(
        "/api/v1/tenants",
        headers=admin_headers(),
        json={"id": new_id, "name": "신규 온보딩 테스트 고객사"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["id"] == new_id
    assert body["name"] == "신규 온보딩 테스트 고객사"

    # 생성 직후 GET /tenants 목록에도 반영되어야 한다
    list_response = client.get("/api/v1/tenants", headers=admin_headers())
    ids = {t["id"] for t in list_response.json()}
    assert new_id in ids


def test_create_tenant_duplicate_id_conflict():
    response = client.post(
        "/api/v1/tenants",
        headers=admin_headers(),
        json={"id": "tenant-scp", "name": "삼성 SCP 고객사 중복 시도"}
    )
    assert response.status_code == 409


def test_create_tenant_forbidden_for_viewer():
    viewer_token = get_token("view_scp@client.com", "view123!")
    new_id = f"tenant-onboard-forbidden-{uuid.uuid4().hex[:8]}"
    response = client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"id": new_id, "name": "권한없음 테스트"}
    )
    assert response.status_code == 403
