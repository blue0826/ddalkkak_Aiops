import asyncio
import os
import tempfile

# 실 서비스 DB(aiops_mvp.db)를 pytest가 절대 건드리지 않도록, backend.app.* 임포트
# (아래에서 backend.app.main -> backend.app.core.config -> settings = Settings() 순으로
# 트리거됨) 이전에 DATABASE_URL 환경변수를 테스트 전용 임시 파일로 못박는다.
# pydantic-settings는 os.environ 값을 .env 파일 값보다 우선하므로 이 시점 이후로는
# config.py의 절대경로 기본값도, .env의 값도 아닌 이 임시 DB만 사용된다.
_TEST_DB_DIR = tempfile.mkdtemp(prefix="aiops_test_db_")
_TEST_DB_PATH = os.path.join(_TEST_DB_DIR, "test_aiops_mvp.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TEST_DB_PATH}"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.main import app
from backend.app.core.auth import hash_password
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.base import AlertRule, Incident, IncidentTimeline, Tenant, User
from backend.app.services.simulator import simulator


@pytest.fixture(scope="session", autouse=True)
def _seed_legacy_demo_simulator_topology():
    """
    CEO 지시(2026-07-15): InfrastructureSimulator(backend/app/services/simulator.py)의
    생성자는 더 이상 하드코딩된 데모 토폴로지(15개 노드/링크/디스크 이력)를 시딩하지
    않는다 - 실 SCP 자격증명으로 수집된 실 VM 인벤토리(active_real_vms)가 없으면
    topology/metrics/costs가 전부 빈 값이어야 하기 때문이다.

    다만 이 저장소의 기존 pytest 스위트(~95개)는 여전히 tenant-scp/tenant-aws 소속의
    가상 노드(scp-vm-app-01 등)가 시뮬레이터에 이미 존재한다고 가정하고 작성되어 있다.
    따라서 simulator.load_sample_topology() - 테스트 전용으로만 존재하며 프로덕션
    코드 경로에서는 절대 호출되지 않는 헬퍼 - 를 세션 시작 시 1회 호출해 과거와 동일한
    데모 인프라를 주입한다. 프로덕션 기동 경로(main.py)는 이 메서드를 호출하지 않는다.
    """
    simulator.load_sample_topology()


@pytest.fixture(scope="session", autouse=True)
def _bootstrap_main_app_db():
    """
    테스트 세션 시작 시 1회, DB 테이블 생성 및 기본 테넌트(system)/시스템 관리자 계정
    시딩을 명시적으로 트리거합니다.

    이 저장소의 여러 테스트 파일(test_auth.py, test_monitor.py,
    test_phase5/test_aiops_advanced_api.py 등)이 TestClient(app)을 컨텍스트
    매니저 없이 모듈 레벨에서 생성하는데, 이 경우 ASGI lifespan(startup/shutdown)이
    자동으로 실행되지 않아 DB 테이블이 준비되지 않는다. 로그인이 DB 조회
    기반으로 전환된 이후에는 이 부트스트랩이 없으면 "no such table: user" 로
    실패하므로, 세션 최초 1회 테이블 생성 + system 시딩을 보장한다.

    주의: main.py의 startup_event 전체(= FastAPI 앱을 `with TestClient(app):`로 진입)를
    그대로 트리거하지 않고, 테이블 생성 + seed_core_tenant()만 직접 호출한다.
    startup_event는 이제 데모 워크스페이스 시딩(인시던트 포함)도 수행하는데, 그걸
    여기서 먼저 실행해버리면 데모 인시던트가 오토인크리먼트 ID를 먼저 차지해
    아래 _seed_legacy_demo_tenant_data()가 만드는 inc1/inc2가 ID 1/2가 아니게 되고,
    이 하드코딩된 ID를 전제로 하는 기존 테스트(예: /incidents/1/...)가 대거 깨진다.
    데모 워크스페이스 시딩은 _seed_demo_workspace 픽스처(아래)가 legacy 픽스처
    이후에 명시적으로 실행한다.
    """
    asyncio.run(_bootstrap_tables_and_core_tenant())


async def _bootstrap_tables_and_core_tenant() -> None:
    from backend.app.main import seed_core_tenant
    from backend.app.models.base import Base
    from backend.app.db.session import engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        await seed_core_tenant(session)


@pytest.fixture(scope="session", autouse=True)
def _seed_legacy_demo_tenant_fixtures(_bootstrap_main_app_db):
    """
    CEO 지시(2026-07-15): 실 서비스는 실 고객사 0곳(빈 상태)으로 시작해야 하므로,
    지어낸 데모 고객사(SCP/AWS) 시딩은 backend/app/main.py의 startup_event에서
    완전히 제거되었다 (이제 system 테넌트 + sysadmin 계정만 시딩됨).

    다만 이 저장소의 기존 pytest 스위트(~95개)는 여전히 tenant-scp/tenant-aws
    테넌트, op_scp/op_aws/view_scp 테스트 계정, 기초 인시던트(inc1/inc2)와
    기본 경보 룰(cpu>90/memory>90)이 앱 기동 시 이미 존재한다고 가정하고
    작성되어 있다 (simulator.py의 가상 노드도 tenant-scp/tenant-aws 소속이므로
    토폴로지/비용/이벤트 조회 테스트가 이 테넌트들을 전제로 한다).

    따라서 예전에 main.py가 시딩하던 것과 동일한 데이터를 "테스트 전용 픽스처"로
    이 conftest에서 공급한다 - 프로덕션 기동 경로(main.py)는 더 이상 이 데이터를
    만들지 않는다. _bootstrap_main_app_db가 먼저 실행되어 테이블 생성 및
    system/sysadmin 시딩이 끝난 뒤에 실행되도록 의존성을 명시했다.

    항목별로 존재 여부를 검사한 뒤에만 생성하므로(idempotent), 로컬에 이미
    시딩된 aiops_mvp.db 파일을 재사용해 pytest를 반복 실행해도 안전하다.
    """
    asyncio.run(_seed_legacy_demo_tenant_data())


async def _seed_legacy_demo_tenant_data() -> None:
    async with AsyncSessionLocal() as session:
        # 1. 테넌트: tenant-scp / tenant-aws
        existing_scp = await session.execute(select(Tenant).where(Tenant.id == "tenant-scp"))
        if not existing_scp.scalars().first():
            session.add(Tenant(id="tenant-scp", name="삼성 SCP 고객사"))
        existing_aws = await session.execute(select(Tenant).where(Tenant.id == "tenant-aws"))
        if not existing_aws.scalars().first():
            session.add(Tenant(id="tenant-aws", name="AWS 고객사"))
        await session.commit()

        # 2. 테스트 계정 (bcrypt 해싱)
        for email, password, tenant_id, role in (
            ("op_scp@client.com", "op123!", "tenant-scp", "TENANT_OPERATOR"),
            ("op_aws@client.com", "op123!", "tenant-aws", "TENANT_OPERATOR"),
            ("view_scp@client.com", "view123!", "tenant-scp", "TENANT_VIEWER"),
        ):
            existing_user = await session.execute(select(User).where(User.email == email))
            if not existing_user.scalars().first():
                session.add(User(
                    email=email,
                    hashed_password=hash_password(password),
                    tenant_id=tenant_id,
                    role=role
                ))
        await session.commit()

        # 3. 기초 장애 인시던트(inc1/inc2) + 타임라인
        existing_inc1 = await session.execute(
            select(Incident).where(
                Incident.tenant_id == "tenant-scp",
                Incident.title == "[scp-vm-web-01] Memory Leak Alert"
            )
        )
        inc1 = existing_inc1.scalars().first()
        if not inc1:
            inc1 = Incident(
                tenant_id="tenant-scp",
                title="[scp-vm-web-01] Memory Leak Alert",
                description="Memory usage reached 92.5%, exceeding threshold of 85.0% for 5 minutes.",
                status="OPEN",
                severity="CRITICAL",
                assigned_to=None
            )
            session.add(inc1)
            await session.commit()
            await session.refresh(inc1)
            session.add(IncidentTimeline(
                incident_id=inc1.id,
                event_type="create",
                actor="System",
                message="인프라 경보 이상 징후가 감지되어 인시던트가 자동 발행되었습니다."
            ))
            await session.commit()

        existing_inc2 = await session.execute(
            select(Incident).where(
                Incident.tenant_id == "tenant-aws",
                Incident.title == "[aws-ec2-web-01] High CPU Load Alert"
            )
        )
        inc2 = existing_inc2.scalars().first()
        if not inc2:
            inc2 = Incident(
                tenant_id="tenant-aws",
                title="[aws-ec2-web-01] High CPU Load Alert",
                description="CPU usage reached 89.2%, exceeding threshold of 80.0% for 5 minutes.",
                status="OPEN",
                severity="WARNING",
                assigned_to=None
            )
            session.add(inc2)
            await session.commit()
            await session.refresh(inc2)
            session.add(IncidentTimeline(
                incident_id=inc2.id,
                event_type="create",
                actor="System",
                message="인프라 경보 이상 징후가 감지되어 인시던트가 자동 발행되었습니다."
            ))
            await session.commit()

        # 4. 기본 경보 임계치 룰 (tenant-scp/tenant-aws 각각 cpu>90, memory>90, 5분)
        for seed_tenant_id in ("tenant-scp", "tenant-aws"):
            for seed_metric_name, seed_rule_name in (
                ("cpu", "CPU 90% 초과 경보 (5분)"),
                ("memory", "메모리 90% 초과 경보 (5분)")
            ):
                existing_rule = await session.execute(
                    select(AlertRule).where(
                        AlertRule.tenant_id == seed_tenant_id,
                        AlertRule.metric_name == seed_metric_name
                    )
                )
                if not existing_rule.scalars().first():
                    session.add(AlertRule(
                        tenant_id=seed_tenant_id,
                        name=seed_rule_name,
                        metric_name=seed_metric_name,
                        operator="gt",
                        threshold=90.0,
                        duration_minutes=5,
                        is_active=True
                    ))
        await session.commit()


@pytest.fixture(scope="session", autouse=True)
def _seed_demo_workspace(_seed_legacy_demo_tenant_fixtures):
    """
    데모 워크스페이스(데모 고객사 3곳 + 경보 룰 + 초기 인시던트) 시딩 - main.py
    startup_event가 실제로 호출하는 것과 동일한 seed_demo_workspace()를 그대로
    재사용한다. 반드시 _seed_legacy_demo_tenant_fixtures(inc1=ID 1, inc2=ID 2 생성) 이후에
    실행되도록 픽스처 의존성으로 순서를 고정한다 - 그래야 기존 테스트 스위트가
    하드코딩하는 인시던트 ID 가정이 깨지지 않는다.
    """
    from backend.app.services.demo_engine import seed_demo_workspace

    asyncio.run(_run_seed_demo_workspace(seed_demo_workspace))


async def _run_seed_demo_workspace(seed_fn) -> None:
    async with AsyncSessionLocal() as session:
        await seed_fn(session)
