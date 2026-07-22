import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from fastapi.testclient import TestClient
from backend.app.models.base import Base, AuditLog
from backend.app.repositories.tenant import TenantRepository
from backend.app.repositories.user import UserRepository
from backend.app.repositories.alert import AlertRepository
from backend.app.repositories.incident import IncidentRepository
from backend.app.services.user_service import UserService
from backend.app.services.incident_service import IncidentService, RemediationStateError
from backend.app.main import app

DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def db_session():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with AsyncSessionLocal() as session:
        tenant_repo = TenantRepository(session)
        user_repo = UserRepository(session)

        await tenant_repo.create("tenant-scp", "삼성 SCP 고객")
        user_service = UserService(user_repo)
        await user_service.register_user("op_scp@client.com", "op123!", "tenant-scp", "TENANT_OPERATOR")

        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ---------------------------------------------------------------------------
# 서비스 레벨: 추천→승인→실행 상태 전이 및 AuditLog 기록 검증
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_execute_without_approval_raises_409_equivalent(db_session):
    """
    승인(APPROVED) 없이 실행을 시도하면 RemediationStateError가 발생해야 한다
    (라우터에서 HTTP 409로 매핑됨).
    """
    repo = IncidentRepository(db_session)
    service = IncidentService(repo)

    incident = await service.create_incident(
        tenant_id="tenant-scp",
        title="[l5-svc-node] CPU 임계치 초과 장애 발생",
        description="pytest 서비스 레벨 검증용",
        severity="WARNING",
    )

    with pytest.raises(RemediationStateError):
        await service.execute_remediation(
            incident_id=incident.id, tenant_id="tenant-scp", actor="op_scp@client.com"
        )


@pytest.mark.anyio
async def test_approve_without_recommend_raises_409_equivalent(db_session):
    """
    추천(RECOMMENDED) 없이 승인을 시도하면 RemediationStateError가 발생해야 한다.
    """
    repo = IncidentRepository(db_session)
    service = IncidentService(repo)

    incident = await service.create_incident(
        tenant_id="tenant-scp",
        title="[l5-svc-node] Memory 임계치 초과 장애 발생",
        description="pytest 서비스 레벨 검증용",
        severity="WARNING",
    )

    with pytest.raises(RemediationStateError):
        await service.approve_remediation(
            incident_id=incident.id, tenant_id="tenant-scp", actor="op_scp@client.com"
        )


@pytest.mark.anyio
async def test_recommend_approve_execute_flow_and_audit_log(db_session):
    """
    추천→승인→실행 정상 흐름을 검증하고, 승인/실행 각각이 AuditLog에 남는지 확인한다.
    """
    repo = IncidentRepository(db_session)
    service = IncidentService(repo)

    incident = await service.create_incident(
        tenant_id="tenant-scp",
        title="[l5-svc-node] Disk 임계치 초과 장애 발생",
        description="pytest 서비스 레벨 검증용",
        severity="CRITICAL",
    )

    # 1) 추천 - 실행되지 않아야 하며 상태만 전이한다
    recommended = await service.recommend_remediation(
        incident_id=incident.id, tenant_id="tenant-scp", actor="op_scp@client.com"
    )
    assert recommended.remediation_status == "RECOMMENDED"
    assert recommended.status != "RESOLVED"

    # 2) 승인
    approved = await service.approve_remediation(
        incident_id=incident.id, tenant_id="tenant-scp", actor="op_scp@client.com"
    )
    assert approved.remediation_status == "APPROVED"
    assert approved.remediation_approved_by == "op_scp@client.com"

    # 3) 실행
    executed = await service.execute_remediation(
        incident_id=incident.id, tenant_id="tenant-scp", actor="op_scp@client.com"
    )
    assert executed.remediation_status == "EXECUTED"
    assert executed.status == "RESOLVED"

    # AuditLog 검증 - APPROVE_REMEDIATION, EXECUTE_REMEDIATION 둘 다 기록되어야 한다
    alert_repo = AlertRepository(db_session)
    audit_logs = await alert_repo.get_audit_logs("tenant-scp")
    actions = [log.action for log in audit_logs]
    assert "APPROVE_REMEDIATION" in actions
    assert "EXECUTE_REMEDIATION" in actions

    approve_log = next(log for log in audit_logs if log.action == "APPROVE_REMEDIATION")
    assert approve_log.user_email == "op_scp@client.com"
    assert approve_log.resource_type == "incident"
    assert approve_log.resource_id == str(incident.id)


# ---------------------------------------------------------------------------
# API 레벨: 라우터 권한(RoleChecker) 및 409 상태 매핑 검증
# ---------------------------------------------------------------------------

client = TestClient(app)


def get_token(username, password):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password}
    )
    return response.json()["access_token"]


def test_remediation_approve_forbidden_for_viewer():
    """
    view_scp(TENANT_VIEWER)는 승인 API를 호출할 수 없어야 한다 (인시던트 존재 여부와 무관).
    """
    token = get_token("view_scp@client.com", "view123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/api/v1/incidents/1/remediation/approve", headers=headers)
    assert response.status_code == 403


def test_remediation_execute_forbidden_for_viewer():
    """
    view_scp(TENANT_VIEWER)는 실행 API를 호출할 수 없어야 한다 (인시던트 존재 여부와 무관).
    """
    token = get_token("view_scp@client.com", "view123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/api/v1/incidents/1/remediation/execute", headers=headers)
    assert response.status_code == 403


def test_remediation_recommend_forbidden_for_viewer():
    token = get_token("view_scp@client.com", "view123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/api/v1/incidents/1/remediation/recommend", headers=headers)
    assert response.status_code == 403


@pytest.mark.anyio
async def test_l5_remediation_full_flow_via_api_with_audit_log():
    """
    새 인시던트를 하나 만들어 API 레벨에서 추천→승인→실행 전체 흐름과
    승인 없는 실행의 409 응답, AuditLog 기록을 종단간(end-to-end) 검증한다.
    """
    from backend.app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        repo = IncidentRepository(session)
        service = IncidentService(repo)
        incident = await service.create_incident(
            tenant_id="tenant-scp",
            title="[l5-api-node] CPU 임계치 초과 장애 발생",
            description="pytest API 레벨 L5 승인 흐름 검증용",
            severity="WARNING",
        )
    incident_id = incident.id

    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}

    # 승인 없이 즉시 실행 시도 -> 409
    exec_before_approval = client.post(
        f"/api/v1/incidents/{incident_id}/remediation/execute", headers=headers
    )
    assert exec_before_approval.status_code == 409

    # 1) 추천
    recommend_resp = client.post(
        f"/api/v1/incidents/{incident_id}/remediation/recommend", headers=headers
    )
    assert recommend_resp.status_code == 200
    assert recommend_resp.json()["remediation_status"] == "RECOMMENDED"

    # 2) 승인
    approve_resp = client.post(
        f"/api/v1/incidents/{incident_id}/remediation/approve", headers=headers
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["remediation_status"] == "APPROVED"

    # 3) 실행
    execute_resp = client.post(
        f"/api/v1/incidents/{incident_id}/remediation/execute", headers=headers
    )
    assert execute_resp.status_code == 200
    body = execute_resp.json()
    assert body["remediation_status"] == "EXECUTED"
    assert body["status"] == "RESOLVED"

    # 인시던트 상세 조회에도 remediation 필드가 노출되어야 한다
    detail_resp = client.get(f"/api/v1/incidents/{incident_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail_incident = detail_resp.json()["incident"]
    assert detail_incident["remediation_status"] == "EXECUTED"
    assert detail_incident["remediation_approved_by"] == "op_scp@client.com"

    # AuditLog에 승인/실행 액션이 남아야 한다
    audit_resp = client.get("/api/v1/alerts/audit-logs", headers=headers)
    assert audit_resp.status_code == 200
    actions = [log["action"] for log in audit_resp.json()]
    assert "APPROVE_REMEDIATION" in actions
    assert "EXECUTE_REMEDIATION" in actions
