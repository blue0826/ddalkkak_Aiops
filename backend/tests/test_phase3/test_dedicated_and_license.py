import pytest
from unittest.mock import patch
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from backend.app.models.base import Base
from backend.app.repositories.tenant import TenantRepository
from backend.app.repositories.user import UserRepository
from backend.app.repositories.incident import IncidentRepository
from backend.app.services.user_service import UserService
from backend.app.services.incident_service import IncidentService, RemediationStateError
from backend.app.core.license import LicenseManager, check_license_write_gate
from backend.app.routers.monitor import get_tenants, get_topology
from backend.app.core.auth import User as AuthUser
import os

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

def test_license_manager_fallback():
    """
    license.key 파일이 존재하지 않을 때 임시 평가판으로 동작 검증
    """
    # 임시로 더미 경로 기입
    lic_info = LicenseManager.get_license_info(license_path="non_existent_file.key")
    assert lic_info["is_valid"] is True
    assert lic_info["is_evaluation"] is True
    assert lic_info["edition"] == "MSP Evaluation"
    assert lic_info["is_expired"] is False

def test_license_manager_invalid_signature():
    """
    라이선스 키 서명이 손상되었을 때 검증 예외 복구 검사
    """
    # 더미 데이터.서명 파일을 강제로 생성
    dummy_key_path = "temp_invalid_license.key"
    with open(dummy_key_path, "w") as f:
        f.write("eyJlZGl0aW9uIjogIkRlZGljYXRlZCBFdiJ9.dGhpcyBpcyBhbiBpbnZhbGlkIHNpZ25hdHVyZQ==")
        
    try:
        lic_info = LicenseManager.get_license_info(license_path=dummy_key_path)
        assert lic_info["is_valid"] is False
        assert lic_info["is_expired"] is True
        assert "Invalid" in lic_info["edition"]
    finally:
        if os.path.exists(dummy_key_path):
            os.remove(dummy_key_path)

def test_license_write_gate_exception():
    """
    유효하지 않은 라이선스에 대해 CUD 쓰기 게이트 차단 기능 검사
    """
    invalid_lic = {
        "edition": "Invalid License",
        "is_valid": False,
        "is_expired": True
    }
    with patch.object(LicenseManager, 'get_license_info', return_value=invalid_lic):
        with pytest.raises(HTTPException) as exc_info:
            check_license_write_gate()
        assert exc_info.value.status_code == 403
        assert "만료" in exc_info.value.detail

@pytest.mark.anyio
@patch("backend.app.routers.monitor.settings")
async def test_dedicated_tenants_and_topology_isolation(mock_settings):
    """
    Dedicated 모드 설정 하에서 테넌트 및 토폴로지가 전용 SCP 테넌트로 강제 고정되는지 검증
    """
    mock_settings.DEPLOYMENT_PROFILE = "dedicated"
    
    # 1. /tenants 호출 시 MSP 리스트 대신 단일 전용 테넌트만 반환하는지 검사
    # (Dedicated 모드에서는 DB 조회 없이 즉시 반환되므로 db 인자는 사용되지 않는다)
    user = AuthUser(email="sysadmin@company.com", tenant_id="system", role="SYSTEM_ADMIN")
    from unittest.mock import AsyncMock
    tenants = await get_tenants(current_user=user, db=AsyncMock())
    assert len(tenants) == 1
    assert tenants[0]["id"] == "tenant-scp"

    # 2. /monitor/topology 호출 시 system이 아닌 전용 테넌트(tenant-scp) 데이터만 쿼리하는지 검사
    from unittest.mock import AsyncMock
    mock_db = AsyncMock()
    with patch("backend.app.routers.monitor.simulator") as mock_sim:
        await get_topology(tenant_id="system", current_user=user, db=mock_db)
        # simulator.get_topology가 "tenant-scp"로 호출되었는지 검사
        mock_sim.get_topology.assert_called_once_with("tenant-scp", provider="scp")

@pytest.mark.anyio
async def test_remediate_incident_l5_flow(db_session):
    """
    L5 추천→승인→실행 3단계 상태머신 및 인시던트 해결(RESOLVED) 생명주기를 통합 테스트합니다.
    승인(APPROVED) 없이는 실행이 거부되어야 한다 (헌법 #4: AI 추천, 사람 결정).
    """
    repo = IncidentRepository(db_session)
    service = IncidentService(repo)

    # 가상 장애 생성
    incident = await service.create_incident(
        tenant_id="tenant-scp",
        title="[scp-vm-web-01] OutOfMemory Alert",
        description="JVM heap error",
        severity="CRITICAL"
    )
    assert incident.status == "OPEN"
    assert incident.remediation_status == "NONE"

    # 승인 없이 즉시 실행 시도 -> 거부되어야 한다
    with pytest.raises(RemediationStateError):
        await service.remediate_incident(
            incident_id=incident.id,
            tenant_id="tenant-scp",
            actor="op_scp@client.com"
        )

    # 1단계: 추천
    recommended = await service.recommend_remediation(
        incident_id=incident.id, tenant_id="tenant-scp", actor="op_scp@client.com"
    )
    assert recommended.remediation_status == "RECOMMENDED"
    assert recommended.remediation_action

    # 2단계: 승인
    approved = await service.approve_remediation(
        incident_id=incident.id, tenant_id="tenant-scp", actor="op_scp@client.com"
    )
    assert approved.remediation_status == "APPROVED"
    assert approved.remediation_approved_by == "op_scp@client.com"

    # 3단계: 실행 (구 API 호환 경로)
    resolved = await service.remediate_incident(
        incident_id=incident.id,
        tenant_id="tenant-scp",
        actor="op_scp@client.com"
    )

    # 조치 완결성 검사
    assert resolved.status == "RESOLVED"
    assert resolved.remediation_status == "EXECUTED"
    assert resolved.assigned_to == "op_scp@client.com"
    assert resolved.resolved_at is not None

    # 타임라인 조치 트레일 검사
    details = await service.get_incident_details(incident.id, "tenant-scp")
    timeline_messages = [t.message for t in details["timeline"]]

    # [시뮬레이션] 라벨 및 재기동 완료 로그 포함 여부 검사
    assert any("[시뮬레이션]" in m for m in timeline_messages)
    assert any("Service restarted successfully" in m for m in timeline_messages)
