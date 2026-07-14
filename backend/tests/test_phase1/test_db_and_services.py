import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from backend.app.models.base import Base
from backend.app.repositories.tenant import TenantRepository
from backend.app.repositories.user import UserRepository
from backend.app.repositories.credential import CredentialRepository
from backend.app.repositories.alert import AlertRepository
from backend.app.services.user_service import UserService
from backend.app.services.credential_service import CredentialService
from backend.app.services.alert_service import AlertService
from backend.app.core.crypto import encryptor

DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.fixture
async def db_session():
    # SQLite 인메모리 비동기 엔진 초기화
    engine = create_async_engine(DATABASE_URL, echo=False)
    
    # 모든 테이블 스키마 생성
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    async with AsyncSessionLocal() as session:
        # 가상 기초 데이터 시딩 (SCP 및 AWS 테넌트, 운영자 생성)
        tenant_repo = TenantRepository(session)
        user_repo = UserRepository(session)
        
        await tenant_repo.create("tenant-scp", "삼성 SCP 고객사")
        await tenant_repo.create("tenant-aws", "AWS 고객사")
        
        user_service = UserService(user_repo)
        await user_service.register_user("op_scp@client.com", "op123!", "tenant-scp", "TENANT_OPERATOR")
        await user_service.register_user("op_aws@client.com", "op123!", "tenant-aws", "TENANT_OPERATOR")
        
        yield session

    # 테스트 종료 후 스키마 제거 및 커넥션 풀 종료
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest.mark.anyio
async def test_envelope_encryption_logic():
    """
    민감정보 자원 봉투 암호화(Envelope Encryption) 암/복호화 기능 자체를 테스트합니다.
    """
    plaintext = "aws-access-key-example-12345"
    enc_data, enc_dek = encryptor.encrypt(plaintext)
    
    assert enc_data != plaintext
    assert enc_dek != plaintext
    
    decrypted = encryptor.decrypt(enc_data, enc_dek)
    assert decrypted == plaintext

@pytest.mark.anyio
async def test_tenant_user_registration(db_session):
    """
    사용자 가입 및 비밀번호 검증과 소속 테넌트 조회 정상 작동을 테스트합니다.
    """
    user_repo = UserRepository(db_session)
    user_service = UserService(user_repo)
    
    auth_user = await user_service.authenticate_user("op_scp@client.com", "op123!")
    assert auth_user is not None
    assert auth_user.tenant_id == "tenant-scp"
    assert auth_user.role == "TENANT_OPERATOR"

@pytest.mark.anyio
async def test_credential_registration_and_decryption(db_session):
    """
    자격증명을 암호화하여 저장하고 복호화 조회가 안전하게 작동하며, RLS 격리가 작동하는지 검증합니다.
    """
    cred_repo = CredentialRepository(db_session)
    alert_repo = AlertRepository(db_session)
    cred_service = CredentialService(cred_repo, alert_repo)
    
    # 1. SCP 테넌트에 자격증명 추가
    cred = await cred_service.register_credential(
        tenant_id="tenant-scp",
        provider="scp",
        name="SCP-MainAccount",
        auth_data="scp_access_key:scp_secret_key",
        user_email="op_scp@client.com"
    )
    assert cred.id is not None
    assert cred.encrypted_auth_data != "scp_access_key:scp_secret_key"
    
    # 2. SCP 테넌트 권한으로 안전하게 복호화된 원본 조회
    decrypted = await cred_service.get_decrypted_credential(cred.id, "tenant-scp")
    assert decrypted is not None
    assert decrypted["decrypted_auth_data"] == "scp_access_key:scp_secret_key"
    
    # 3. AWS 테넌트 권한으로 SCP 자격증명 조회 시도 -> 테넌트 필터 차단에 의해 None 반환 검증
    decrypted_unauthorized = await cred_service.get_decrypted_credential(cred.id, "tenant-aws")
    assert decrypted_unauthorized is None

@pytest.mark.anyio
async def test_alert_rule_and_audit_logging(db_session):
    """
    경보 룰의 테넌트별 격리 조회 및 보안 감사 로그 자동 작성 기능이 정상 동작하는지 테스트합니다.
    """
    alert_repo = AlertRepository(db_session)
    alert_service = AlertService(alert_repo)
    
    # 1. SCP 테넌트 경보 룰 추가
    rule = await alert_service.register_rule(
        tenant_id="tenant-scp",
        name="High Memory Alert",
        metric_name="memory",
        operator="gt",
        threshold=85.0,
        duration_minutes=5,
        user_email="op_scp@client.com"
    )
    assert rule.id is not None
    
    # 2. 테넌트 격리 조회 확인
    rules_scp = await alert_service.list_rules("tenant-scp")
    assert len(rules_scp) == 1
    
    rules_aws = await alert_service.list_rules("tenant-aws")
    assert len(rules_aws) == 0  # 타사 테넌트 쿼리에서는 격리 차단됨
    
    # 3. 감사 로그 자동 축적 검증
    logs = await alert_service.list_audit_logs("tenant-scp")
    assert len(logs) >= 1
    assert logs[0].action == "create_rule"
    assert logs[0].tenant_id == "tenant-scp"
    assert "High Memory Alert" in logs[0].details
