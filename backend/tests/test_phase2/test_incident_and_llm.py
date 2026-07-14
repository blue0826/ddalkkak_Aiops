import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from fastapi.testclient import TestClient
from backend.app.models.base import Base, Tenant, User
from backend.app.repositories.tenant import TenantRepository
from backend.app.repositories.user import UserRepository
from backend.app.repositories.incident import IncidentRepository
from backend.app.services.user_service import UserService
from backend.app.services.incident_service import IncidentService
from backend.app.services.llm_service import LLMService
from backend.app.main import app
from backend.app.db.session import get_db
import asyncio

DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.fixture
async def db_session():
    # SQLite 인메모리 비동기 엔진 기동
    engine = create_async_engine(DATABASE_URL, echo=False)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    async with AsyncSessionLocal() as session:
        # 가상 기초 테넌트 및 테넌트 운영자 계정 세팅
        tenant_repo = TenantRepository(session)
        user_repo = UserRepository(session)
        
        await tenant_repo.create("tenant-scp", "삼성 SCP 고객")
        await tenant_repo.create("tenant-aws", "AWS 고객")
        
        user_service = UserService(user_repo)
        await user_service.register_user("op_scp@client.com", "op123!", "tenant-scp", "TENANT_OPERATOR")
        await user_service.register_user("op_aws@client.com", "op123!", "tenant-aws", "TENANT_OPERATOR")
        
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest.mark.anyio
async def test_incident_creation_and_timeline(db_session):
    """
    장애 발생 시 인시던트 데이터 저장 및 타임라인 자동 등록이 제대로 수행되는지 테스트합니다.
    """
    repo = IncidentRepository(db_session)
    service = IncidentService(repo)
    
    # 1. 인시던트 신규 생성
    incident = await service.create_incident(
        tenant_id="tenant-scp",
        title="[scp-vm-web-01] Memory Leak Alert",
        description="Memory usage reached 98% on target node.",
        severity="CRITICAL"
    )
    assert incident.id is not None
    assert incident.status == "OPEN"
    
    # 2. 타임라인 목록 및 내용 검증
    details = await service.get_incident_details(incident.id, "tenant-scp")
    assert details is not None
    assert len(details["timeline"]) == 1
    assert details["timeline"][0].event_type == "create"
    assert "이상 징후가 감지" in details["timeline"][0].message

@pytest.mark.anyio
async def test_incident_tenant_isolation(db_session):
    """
    인시던트 조회 및 제어 시 타 테넌트로의 쿼리 유출이 완전 격리되는지 검증합니다.
    """
    repo = IncidentRepository(db_session)
    service = IncidentService(repo)
    
    # SCP 테넌트에 인시던트 추가
    incident = await service.create_incident(
        tenant_id="tenant-scp",
        title="SCP-Web Server Down",
        description="Emergency",
        severity="CRITICAL"
    )
    
    # 1. 자사(SCP) 테넌트 권한으로 상세 조회 시 성공
    details_scp = await service.get_incident_details(incident.id, "tenant-scp")
    assert details_scp is not None
    assert details_scp["incident"].title == "SCP-Web Server Down"
    
    # 2. 타사(AWS) 테넌트 권한으로 상세 조회 시 차단 및 None 리턴 검증
    details_aws = await service.get_incident_details(incident.id, "tenant-aws")
    assert details_aws is None

@pytest.mark.anyio
async def test_llm_assistant_rca_and_report(db_session):
    """
    L4 AI 장애원인 분석(RCA) 및 월간 보고서 마크다운 생성 작동 여부를 테스트합니다.
    """
    repo = IncidentRepository(db_session)
    service = IncidentService(repo)
    
    # 1. CPU 임계치 인시던트 가상 생성
    incident = await service.create_incident(
        tenant_id="tenant-scp",
        title="[scp-vm-web-01] CPU Overload Alert",
        description="CPU reached 92%",
        severity="WARNING"
    )
    details = await service.get_incident_details(incident.id, "tenant-scp")
    
    # 2. AI RCA 분석 분석 작동 검사
    rca_data = await LLMService.generate_incident_rca(details["incident"], details["timeline"])
    assert rca_data["summary"] is not None
    assert "CPU" in rca_data["summary"]
    assert "top -c" in rca_data["recommended_runbook"]  # CPU 런북 명령 포함 검사
    
    # 3. 월간 보고서 마크다운 제네레이터 검사
    report_md = await LLMService.generate_monthly_report(
        tenant_id="tenant-scp",
        active_vms=8,
        alarms_count=3,
        total_costs=1500.50,
        savings=230.00
    )
    assert "# 월간 클라우드 운영 보고서" in report_md
    assert "99.9" in report_md  # 가용성 지표 포함 검사
    assert "Envelope" in report_md  # 보안 명세 포함 검사
