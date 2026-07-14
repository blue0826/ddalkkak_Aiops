from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from backend.app.core.config import settings
from backend.app.routers import auth, monitor, credential, alert, incident, aiops
from backend.app.db.session import engine, AsyncSessionLocal
from backend.app.models.base import Base, Tenant, User
from backend.app.core.auth import hash_password
from sqlalchemy import select

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)


# CORS 설정 (프론트엔드 연계 대비)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up ddalkkak_Aiops backend simulator...")
    logger.info("데이터베이스 테이블 초기화 시작...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with AsyncSessionLocal() as session:
        # 기초 테넌트 데이터 검사 및 시딩
        result = await session.execute(select(Tenant))
        if not result.scalars().first():
            logger.info("기초 테넌트 및 테스트 계정 시딩 수행...")
            system_tenant = Tenant(id="system", name="MSP 운영 센터")
            scp_tenant = Tenant(id="tenant-scp", name="삼성 SCP 고객사")
            aws_tenant = Tenant(id="tenant-aws", name="AWS 고객사")
            session.add_all([system_tenant, scp_tenant, aws_tenant])
            await session.commit()
            
            # 테스트 계정 정보 생성
            sysadmin = User(
                email="sysadmin@company.com",
                hashed_password=hash_password("sysadmin123!"),
                tenant_id="system",
                role="SYSTEM_ADMIN"
            )
            op_scp = User(
                email="op_scp@client.com",
                hashed_password=hash_password("op123!"),
                tenant_id="tenant-scp",
                role="TENANT_OPERATOR"
            )
            op_aws = User(
                email="op_aws@client.com",
                hashed_password=hash_password("op123!"),
                tenant_id="tenant-aws",
                role="TENANT_OPERATOR"
            )
            view_scp = User(
                email="view_scp@client.com",
                hashed_password=hash_password("view123!"),
                tenant_id="tenant-scp",
                role="TENANT_VIEWER"
            )
            session.add_all([sysadmin, op_scp, op_aws, view_scp])
            await session.commit()
            logger.info("데이터베이스 시딩 완료.")

        # 장애 인시던트 데이터 검사 및 시딩
        from backend.app.models.base import Incident, IncidentTimeline
        result_inc = await session.execute(select(Incident))
        if not result_inc.scalars().first():
            logger.info("기초 장애 인시던트 시딩 수행...")
            inc1 = Incident(
                tenant_id="tenant-scp",
                title="[scp-vm-web-01] Memory Leak Alert",
                description="Memory usage reached 92.5%, exceeding threshold of 85.0% for 5 minutes.",
                status="OPEN",
                severity="CRITICAL",
                assigned_to=None
            )
            inc2 = Incident(
                tenant_id="tenant-aws",
                title="[aws-ec2-web-01] High CPU Load Alert",
                description="CPU usage reached 89.2%, exceeding threshold of 80.0% for 5 minutes.",
                status="OPEN",
                severity="WARNING",
                assigned_to=None
            )
            session.add_all([inc1, inc2])
            await session.commit()
            
            t1 = IncidentTimeline(
                incident_id=inc1.id,
                event_type="create",
                actor="System",
                message="인프라 경보 이상 징후가 감지되어 인시던트가 자동 발행되었습니다."
            )
            t2 = IncidentTimeline(
                incident_id=inc2.id,
                event_type="create",
                actor="System",
                message="인프라 경보 이상 징후가 감지되어 인시던트가 자동 발행되었습니다."
            )
            session.add_all([t1, t2])
            await session.commit()
            logger.info("장애 인시던트 시딩 완료.")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down ddalkkak_Aiops backend simulator...")

# 모니터링 및 인증 관련 라우터 추가
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(monitor.router, prefix=settings.API_V1_STR)
app.include_router(credential.router, prefix=settings.API_V1_STR)
app.include_router(alert.router, prefix=settings.API_V1_STR)
app.include_router(incident.router, prefix=settings.API_V1_STR)
app.include_router(aiops.router, prefix=settings.API_V1_STR)


@app.get("/")
def read_root():
    return {"status": "running", "project": settings.PROJECT_NAME, "phase": "0"}
