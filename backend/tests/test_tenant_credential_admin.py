"""
고객사 관리 API 검증 - DELETE /tenants/{tenant_id}(연쇄 삭제 포함) +
관리자의 자격증명 관리 확장(POST/GET/DELETE /credentials의 tenant_id 지원)을 테스트한다.

관리자(SYSTEM_ADMIN)가 고객사를 온보딩하고, 그 고객사의 SCP/AWS 자격증명을
연결/해제/삭제할 수 있어야 한다는 요구사항에 대한 계약 테스트. 기존
conftest.py가 시딩하는 tenant-scp/tenant-aws + op_scp/op_aws/view_scp 계정을
활용하며, 삭제류 테스트는 매 테스트마다 uuid 기반 임시 테넌트를 새로 만들어
검증한다(기존 시드 데이터를 건드리지 않는다).
"""
import asyncio
import uuid
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.main import app
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.base import AlertRule, CloudCredential, Incident, IncidentTimeline
from backend.app.repositories.alert import AlertRepository
from backend.app.repositories.incident import IncidentRepository

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


def op_scp_headers():
    token = get_token("op_scp@client.com", "op123!")
    return {"Authorization": f"Bearer {token}"}


def viewer_scp_headers():
    token = get_token("view_scp@client.com", "view123!")
    return {"Authorization": f"Bearer {token}"}


def make_temp_tenant() -> str:
    tenant_id = f"tenant-del-{uuid.uuid4().hex[:8]}"
    response = client.post(
        "/api/v1/tenants",
        headers=admin_headers(),
        json={"id": tenant_id, "name": "삭제 테스트용 임시 고객사"}
    )
    assert response.status_code == 201
    return tenant_id


async def _seed_incident_and_rule(tenant_id: str) -> int:
    """테스트용 인시던트(+타임라인)와 경보 룰을 직접 DB에 심고 incident_id를 반환한다."""
    async with AsyncSessionLocal() as session:
        incident_repo = IncidentRepository(session)
        alert_repo = AlertRepository(session)

        incident = await incident_repo.create(
            tenant_id=tenant_id,
            title="[테스트] 임시 인시던트",
            description="연쇄 삭제 검증용",
            severity="WARNING",
            status="OPEN"
        )
        await incident_repo.add_timeline(
            incident_id=incident.id,
            event_type="create",
            actor="System",
            message="테스트 인시던트 생성"
        )
        await alert_repo.create_rule(AlertRule(
            tenant_id=tenant_id,
            name="테스트 경보 룰",
            metric_name="cpu",
            operator="gt",
            threshold=95.0,
            duration_minutes=5,
            is_active=True
        ))
        return incident.id


async def _count_rows_for_tenant(tenant_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        cred_count = len((await session.execute(
            select(CloudCredential).where(CloudCredential.tenant_id == tenant_id)
        )).scalars().all())
        incidents = (await session.execute(
            select(Incident).where(Incident.tenant_id == tenant_id)
        )).scalars().all()
        rule_count = len((await session.execute(
            select(AlertRule).where(AlertRule.tenant_id == tenant_id)
        )).scalars().all())

        timeline_count = 0
        for incident in incidents:
            timeline_count += len((await session.execute(
                select(IncidentTimeline).where(IncidentTimeline.incident_id == incident.id)
            )).scalars().all())

        return {
            "credentials": cred_count,
            "incidents": len(incidents),
            "timelines": timeline_count,
            "rules": rule_count,
        }


# --- DELETE /tenants/{tenant_id} ---

def test_delete_tenant_system_is_blocked():
    response = client.delete("/api/v1/tenants/system", headers=admin_headers())
    assert response.status_code in (400, 403)


def test_delete_tenant_not_found():
    response = client.delete(
        f"/api/v1/tenants/tenant-does-not-exist-{uuid.uuid4().hex[:8]}",
        headers=admin_headers()
    )
    assert response.status_code == 404


def test_delete_tenant_forbidden_for_viewer():
    tenant_id = make_temp_tenant()
    try:
        response = client.delete(f"/api/v1/tenants/{tenant_id}", headers=viewer_scp_headers())
        assert response.status_code == 403
    finally:
        client.delete(f"/api/v1/tenants/{tenant_id}", headers=admin_headers())


def test_delete_tenant_cascades_credentials_incidents_and_rules():
    tenant_id = make_temp_tenant()

    # 자격증명 등록(관리자가 대상 테넌트를 지정)
    cred_response = client.post(
        "/api/v1/credentials",
        headers=admin_headers(),
        json={
            "provider": "aws",
            "name": "Temp-Cascade-Cred",
            "auth_data": "temp_secret",
            "tenant_id": tenant_id
        }
    )
    assert cred_response.status_code == 201
    assert cred_response.json()["tenant_id"] == tenant_id

    # 인시던트(+타임라인)/경보 룰 시딩
    asyncio.run(_seed_incident_and_rule(tenant_id))

    # 삭제 전 상태 확인 - 전부 1건 이상 존재해야 한다
    before = asyncio.run(_count_rows_for_tenant(tenant_id))
    assert before["credentials"] == 1
    assert before["incidents"] == 1
    assert before["timelines"] == 1
    assert before["rules"] == 1

    # 삭제 실행
    delete_response = client.delete(f"/api/v1/tenants/{tenant_id}", headers=admin_headers())
    assert delete_response.status_code == 204

    # 연쇄 삭제 검증 - 자격증명/인시던트/타임라인/경보 룰이 모두 제거되어야 한다
    after = asyncio.run(_count_rows_for_tenant(tenant_id))
    assert after == {"credentials": 0, "incidents": 0, "timelines": 0, "rules": 0}

    # 테넌트 자체도 목록에서 사라져야 한다
    tenants_response = client.get("/api/v1/tenants", headers=admin_headers())
    ids = {t["id"] for t in tenants_response.json()}
    assert tenant_id not in ids

    # 재삭제 시도는 404
    redelete_response = client.delete(f"/api/v1/tenants/{tenant_id}", headers=admin_headers())
    assert redelete_response.status_code == 404


# --- PATCH /tenants/{tenant_id} - 고객사 이름 수정(관리자 전용) ---

def test_update_tenant_success_as_admin():
    tenant_id = make_temp_tenant()
    try:
        response = client.patch(
            f"/api/v1/tenants/{tenant_id}",
            headers=admin_headers(),
            json={"name": "수정된 고객사명"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == tenant_id
        assert body["name"] == "수정된 고객사명"

        # 목록 조회에도 수정된 이름이 반영되어야 한다
        list_response = client.get("/api/v1/tenants", headers=admin_headers())
        updated = next(t for t in list_response.json() if t["id"] == tenant_id)
        assert updated["name"] == "수정된 고객사명"
    finally:
        client.delete(f"/api/v1/tenants/{tenant_id}", headers=admin_headers())


def test_update_tenant_not_found():
    response = client.patch(
        f"/api/v1/tenants/tenant-does-not-exist-{uuid.uuid4().hex[:8]}",
        headers=admin_headers(),
        json={"name": "존재하지 않는 고객사"}
    )
    assert response.status_code == 404


def test_update_tenant_forbidden_for_viewer():
    tenant_id = make_temp_tenant()
    try:
        response = client.patch(
            f"/api/v1/tenants/{tenant_id}",
            headers=viewer_scp_headers(),
            json={"name": "권한없음 수정 시도"}
        )
        assert response.status_code == 403
    finally:
        client.delete(f"/api/v1/tenants/{tenant_id}", headers=admin_headers())


# --- POST /api/v1/credentials - 관리자 대상 지정 온보딩 ---

def test_create_credential_admin_targets_specific_tenant():
    response = client.post(
        "/api/v1/credentials",
        headers=admin_headers(),
        json={
            "provider": "scp",
            "name": "Admin-Onboarded-SCP-Cred",
            "auth_data": "admin_secret",
            "tenant_id": "tenant-aws"
        }
    )
    assert response.status_code == 201
    body = response.json()
    assert body["tenant_id"] == "tenant-aws"
    assert body["name"] == "Admin-Onboarded-SCP-Cred"

    # 뒷정리
    client.delete(f"/api/v1/credentials/{body['id']}", headers=admin_headers())


def test_create_credential_admin_target_tenant_not_found():
    response = client.post(
        "/api/v1/credentials",
        headers=admin_headers(),
        json={
            "provider": "aws",
            "name": "Ghost-Tenant-Cred",
            "auth_data": "secret",
            "tenant_id": f"tenant-ghost-{uuid.uuid4().hex[:8]}"
        }
    )
    assert response.status_code == 404


def test_create_credential_non_admin_tenant_id_is_ignored():
    response = client.post(
        "/api/v1/credentials",
        headers=op_scp_headers(),
        json={
            "provider": "aws",
            "name": "Op-Should-Stay-Own-Tenant",
            "auth_data": "secret",
            "tenant_id": "tenant-aws"  # 다른 테넌트를 지정해도 무시되어야 함
        }
    )
    assert response.status_code == 201
    body = response.json()
    assert body["tenant_id"] == "tenant-scp"

    # 뒷정리
    client.delete(f"/api/v1/credentials/{body['id']}", headers=op_scp_headers())


# --- GET /api/v1/credentials - 관리자 전체/테넌트별 조회, 비관리자 자기 것만 ---

def test_list_credentials_admin_scoped_to_single_tenant():
    create_response = client.post(
        "/api/v1/credentials",
        headers=admin_headers(),
        json={
            "provider": "aws",
            "name": "Scoped-List-Cred",
            "auth_data": "secret",
            "tenant_id": "tenant-aws"
        }
    )
    cred_id = create_response.json()["id"]
    try:
        response = client.get(
            "/api/v1/credentials",
            headers=admin_headers(),
            params={"tenant_id": "tenant-aws"}
        )
        assert response.status_code == 200
        items = response.json()
        assert len(items) >= 1
        assert all(item["tenant_id"] == "tenant-aws" for item in items)
        assert any(item["id"] == cred_id for item in items)
    finally:
        client.delete(f"/api/v1/credentials/{cred_id}", headers=admin_headers())


def test_list_credentials_admin_without_tenant_id_returns_all_tenants():
    scp_cred = client.post(
        "/api/v1/credentials",
        headers=admin_headers(),
        json={"provider": "scp", "name": "All-List-SCP", "auth_data": "s", "tenant_id": "tenant-scp"}
    ).json()
    aws_cred = client.post(
        "/api/v1/credentials",
        headers=admin_headers(),
        json={"provider": "aws", "name": "All-List-AWS", "auth_data": "s", "tenant_id": "tenant-aws"}
    ).json()
    try:
        response = client.get("/api/v1/credentials", headers=admin_headers())
        assert response.status_code == 200
        tenant_ids_seen = {item["tenant_id"] for item in response.json()}
        assert {"tenant-scp", "tenant-aws"}.issubset(tenant_ids_seen)
    finally:
        client.delete(f"/api/v1/credentials/{scp_cred['id']}", headers=admin_headers())
        client.delete(f"/api/v1/credentials/{aws_cred['id']}", headers=admin_headers())


def test_list_credentials_non_admin_only_sees_own_tenant():
    response = client.get(
        "/api/v1/credentials",
        headers=op_scp_headers(),
        params={"tenant_id": "tenant-aws"}  # 다른 테넌트를 요청해도 무시되어야 함
    )
    assert response.status_code == 200
    items = response.json()
    assert all(item["tenant_id"] == "tenant-scp" for item in items)


# --- DELETE /api/v1/credentials/{credential_id} - 관리자 임의 테넌트 삭제 ---

def test_delete_credential_admin_can_delete_other_tenant_credential():
    created = client.post(
        "/api/v1/credentials",
        headers=admin_headers(),
        json={
            "provider": "aws",
            "name": "Admin-Cross-Tenant-Delete-Target",
            "auth_data": "secret",
            "tenant_id": "tenant-aws"
        }
    ).json()
    cred_id = created["id"]

    delete_response = client.delete(f"/api/v1/credentials/{cred_id}", headers=admin_headers())
    assert delete_response.status_code == 204

    # 삭제 후 tenant-aws 목록에 더 이상 존재하지 않아야 함
    list_response = client.get(
        "/api/v1/credentials",
        headers=admin_headers(),
        params={"tenant_id": "tenant-aws"}
    )
    ids = {item["id"] for item in list_response.json()}
    assert cred_id not in ids
