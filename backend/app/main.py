import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from backend.app.core.config import settings
from backend.app.routers import auth, monitor, credential, alert, incident, aiops, provider, tenant_admin
from backend.app.db.session import engine, AsyncSessionLocal
from backend.app.models.base import Base, Tenant, User
from backend.app.core.auth import hash_password
from backend.app.services.demo_engine import seed_demo_workspace
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# 백그라운드 탐지 루프 태스크 핸들 (DETECTION_LOOP_ENABLED=true 일 때만 startup에서 생성)
_detection_loop_task = None

async def _detection_loop():
    """
    env 게이트(DETECTION_LOOP_ENABLED)로만 활성화되는 백그라운드 탐지 사이클 루프.
    기본값은 false이므로 테스트/데모 환경에서는 절대 자동 실행되지 않는다.
    """
    from backend.app.repositories.incident import IncidentRepository
    from backend.app.repositories.alert import AlertRepository
    from backend.app.services.monitoring_service import MonitoringService

    while True:
        try:
            async with AsyncSessionLocal() as session:
                incident_repo = IncidentRepository(session)
                alert_repo = AlertRepository(session)
                service = MonitoringService(incident_repo, alert_repo)
                for tenant_id in ("tenant-scp", "tenant-aws"):
                    result = await service.run_detection_cycle(tenant_id)
                    logger.info(f"[백그라운드 탐지 루프] 테넌트: {tenant_id}, 결과: {result}")
        except Exception as ex:
            logger.error(f"[백그라운드 탐지 루프 오류] {ex}")

        await asyncio.sleep(settings.DETECTION_INTERVAL_SECONDS)


async def seed_core_tenant(session: AsyncSession) -> None:
    """
    기초 테넌트 데이터 검사 및 시딩 - MSP 운영 센터(system) + 시스템 관리자 계정만.
    CEO 지시(2026-07-15): 지어낸 고객사(SCP/AWS 등 데모 테넌트)는 더 이상 여기서
    시딩하지 않는다. 실 고객사는 POST /tenants 온보딩으로만 생성된다.

    backend/tests/conftest.py가 이 함수를 직접 호출해 데모 워크스페이스 시딩보다
    먼저(그리고 레거시 테스트 픽스처 inc1/inc2보다도 먼저) system 테넌트를 준비한다 -
    startup_event 전체를 그대로 재사용하지 않는 이유는 인시던트 오토인크리먼트 ID
    순서(기존 테스트가 하드코딩하는 inc1=ID 1, inc2=ID 2)를 지키기 위함이다.
    """
    result = await session.execute(select(Tenant))
    if not result.scalars().first():
        logger.info("기초 테넌트(system) 및 시스템 관리자 계정 시딩 수행...")
        system_tenant = Tenant(id="system", name="MSP 운영 센터")
        session.add(system_tenant)
        await session.commit()

        sysadmin = User(
            email="sysadmin@company.com",
            hashed_password=hash_password("sysadmin123!"),
            tenant_id="system",
            role="SYSTEM_ADMIN"
        )
        session.add(sysadmin)
        await session.commit()
        logger.info("데이터베이스 시딩 완료 (system 테넌트 + sysadmin만).")


# CORS 설정 (프론트엔드 연계 대비)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up ddalkkak_Aiops backend simulator...")
    logger.info("데이터베이스 테이블 초기화 시작...")
    # create_all은 "없는 테이블만 생성"이라 기존 데이터를 지우지 않는다(안전) - 최초
    # 기동 시 테이블이 없으면 만들어주는 용도로만 유지한다. 단, 이후 스키마 변경(컬럼
    # 추가/변경 등)은 이 create_all이 반영하지 못하므로 반드시 Alembic 마이그레이션
    # (alembic revision --autogenerate 후 alembic upgrade head)으로 처리할 것 -
    # 절차는 backend/DB_GUIDE.md 참고.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 기초 테넌트(system) + 시스템 관리자 계정 시딩
    # (이전에 여기서 시딩하던 tenant-scp/tenant-aws, op_scp/op_aws/view_scp 계정,
    # 인시던트 inc1/inc2, 기본 경보 룰은 backend/tests/conftest.py의 테스트 픽스처로 이관됨)
    async with AsyncSessionLocal() as session:
        await seed_core_tenant(session)

    # 데모 워크스페이스(고객사 3곳 + 경보 룰 + 초기 인시던트) 시딩 - 실 고객사와 완전히
    # 분리된, 명확히 라벨링된(is_demo=True) 데모 데이터. 멱등적이라 재기동해도 안전하다.
    async with AsyncSessionLocal() as session:
        logger.info("데모 워크스페이스 시딩 검사 수행...")
        await seed_demo_workspace(session)
        logger.info("데모 워크스페이스 시딩 완료(또는 이미 존재하여 스킵).")

    # 백그라운드 탐지 루프 - env 게이트가 true일 때만 활성화
    if settings.DETECTION_LOOP_ENABLED:
        global _detection_loop_task
        _detection_loop_task = asyncio.create_task(_detection_loop())
        logger.info(f"백그라운드 탐지 루프 활성화 (주기: {settings.DETECTION_INTERVAL_SECONDS}초)")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down ddalkkak_Aiops backend simulator...")
    if _detection_loop_task:
        _detection_loop_task.cancel()

# 모니터링 및 인증 관련 라우터 추가
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(monitor.router, prefix=settings.API_V1_STR)
app.include_router(credential.router, prefix=settings.API_V1_STR)
app.include_router(alert.router, prefix=settings.API_V1_STR)
app.include_router(incident.router, prefix=settings.API_V1_STR)
app.include_router(aiops.router, prefix=settings.API_V1_STR)
app.include_router(provider.router, prefix=settings.API_V1_STR)
app.include_router(tenant_admin.router, prefix=settings.API_V1_STR)


@app.get("/")
def read_root():
    return {"status": "running", "project": settings.PROJECT_NAME, "phase": "0"}
