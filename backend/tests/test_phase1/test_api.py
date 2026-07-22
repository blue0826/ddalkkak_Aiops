from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from backend.app.main import app
from backend.app.db.session import get_db
from backend.app.models.base import Base
from backend.app.repositories.tenant import TenantRepository
from backend.app.repositories.user import UserRepository
from backend.app.services.user_service import UserService
import pytest
import asyncio

DATABASE_URL = "sqlite+aiosqlite:///:memory:"
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def override_get_db():
    """
    FastAPI get_db 종속성을 테스트용 SQLite 세션으로 대체합니다.
    """
    async with AsyncSessionLocal() as session:
        yield session

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    # 이 모듈의 테스트 실행 구간에만 get_db 오버라이드 적용 (타 테스트 모듈로의 오염 방지)
    app.dependency_overrides[get_db] = override_get_db

    # 모듈 단위 실행 전 비동기 DB 테이블 스키마 생성 및 사용자 시딩
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    async def create_tables():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with AsyncSessionLocal() as session:
            tenant_repo = TenantRepository(session)
            await tenant_repo.create("tenant-scp", "SCP Client")
            await tenant_repo.create("tenant-aws", "AWS Client")

            user_repo = UserRepository(session)
            user_service = UserService(user_repo)
            await user_service.register_user("op_scp@client.com", "op123!", "tenant-scp", "TENANT_OPERATOR")
            await user_service.register_user("op_aws@client.com", "op123!", "tenant-aws", "TENANT_OPERATOR")

    loop.run_until_complete(create_tables())
    yield

    async def drop_tables():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    loop.run_until_complete(drop_tables())
    loop.run_until_complete(engine.dispose())
    del app.dependency_overrides[get_db]

client = TestClient(app)

def get_token(username, password):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password}
    )
    return response.json()["access_token"]

def test_credential_flow():
    """
    자격증명의 등록, 목록 조회, 복호화 조회, 삭제 관련 API 전체 흐름을 테스트합니다.
    """
    # 1. SCP 운영자 로그인
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. 신규 자격증명 등록 API
    response = client.post(
        "/api/v1/credentials",
        headers=headers,
        json={
            "provider": "scp",
            "name": "My-SCP-API-Key",
            "auth_data": "secret_api_key_data"
        }
    )
    assert response.status_code == 201
    cred = response.json()
    assert cred["name"] == "My-SCP-API-Key"
    cred_id = cred["id"]
    
    # 3. 자격증명 조회 API
    response = client.get("/api/v1/credentials", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1
    
    # 4. 복호화 상세 조회 API
    response = client.get(f"/api/v1/credentials/{cred_id}/decrypted", headers=headers)
    assert response.status_code == 200
    assert response.json()["decrypted_auth_data"] == "secret_api_key_data"
    
    # 5. 자격증명 삭제 API
    response = client.delete(f"/api/v1/credentials/{cred_id}", headers=headers)
    assert response.status_code == 204

def test_alert_rule_flow():
    """
    경보 룰의 생성, 조회, 감사 로그 추적 및 삭제 관련 API 전체 흐름을 테스트합니다.
    """
    # 1. SCP 운영자 로그인
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. 경보 룰 생성 API
    response = client.post(
        "/api/v1/alerts/rules",
        headers=headers,
        json={
            "name": "Memory Danger",
            "metric_name": "memory",
            "operator": "gt",
            "threshold": 95.0,
            "duration_minutes": 10
        }
    )
    assert response.status_code == 201
    rule = response.json()
    assert rule["name"] == "Memory Danger"
    rule_id = rule["id"]
    
    # 3. 경보 룰 목록 조회 API
    response = client.get("/api/v1/alerts/rules", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1
    
    # 4. 감사 로그 조회 API (경보 룰 생성 동작이 정상 로깅되었는지 교차 확인)
    response = client.get("/api/v1/alerts/audit-logs", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1
    assert any(log["action"] == "create_rule" for log in response.json())
    
    # 5. 경보 룰 삭제 API
    response = client.delete(f"/api/v1/alerts/rules/{rule_id}", headers=headers)
    assert response.status_code == 204
