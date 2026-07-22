"""
데모 워크스페이스 DB 시딩 - 데모 고객사 3곳(is_demo=True) + 고객사별 활성 경보 룰 +
초기 인시던트(심각도 다양, 최소 1건 CRITICAL)를 멱등적으로(이미 있으면 스킵) 생성한다.

호출 순서 주의(backend/tests/conftest.py 참고): 이 함수는 반드시 레거시 테스트 픽스처
(tenant-scp/tenant-aws의 inc1/inc2)가 먼저 생성된 뒤에 호출되어야 한다 - 그래야 기존
테스트 스위트가 하드코딩하는 "inc1=인시던트 ID 1, inc2=ID 2" 가정이 깨지지 않는다.
프로덕션(main.py startup_event)에는 경쟁하는 시딩이 없으므로 순서 문제가 없다.
"""
from datetime import datetime
from typing import List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.base import AlertRule, Incident, IncidentTimeline, Tenant
from backend.app.services.demo.constants import (
    DEMO_TENANT_COMMERCE,
    DEMO_TENANT_FINTECH,
    DEMO_TENANT_GAMES,
    DEMO_TENANT_IDS,
    DEMO_TENANT_NAMES,
)
from backend.app.services.demo.topology_data import get_node_by_id

# 테넌트별 경보 룰: (name, metric_name, operator, threshold, duration_minutes)
_ALERT_RULES = {
    DEMO_TENANT_COMMERCE: [
        ("CPU 85% 초과 경보 (5분)", "cpu", "gt", 85.0, 5),
        ("에러율 3% 초과 경보 (5분)", "error_rate_pct", "gt", 3.0, 5),
    ],
    DEMO_TENANT_FINTECH: [
        ("CPU 85% 초과 경보 (5분)", "cpu", "gt", 85.0, 5),
        ("지연시간 150ms 초과 경보 (5분)", "latency_ms", "gt", 150.0, 5),
    ],
    DEMO_TENANT_GAMES: [
        ("CPU 85% 초과 경보 (5분)", "cpu", "gt", 85.0, 5),
        ("지연시간 150ms 초과 경보 (5분)", "latency_ms", "gt", 150.0, 5),
    ],
}

# 테넌트별 초기 인시던트: (node_id, severity, status, 짧은 제목, 설명)
_IncidentSpec = Tuple[str, str, str, str, str]
_INCIDENTS: dict[str, List[_IncidentSpec]] = {
    DEMO_TENANT_COMMERCE: [
        (
            f"{DEMO_TENANT_COMMERCE}-scp-app-1", "CRITICAL", "OPEN",
            "CPU 사용률 급증 - App 서버 포화 임박",
            "CPU 사용률이 임계치(85%)를 초과해 지속적으로 상승 중입니다. 트래픽 급증에 따른 App 티어 포화가 의심됩니다.",
        ),
        (
            f"{DEMO_TENANT_COMMERCE}-aws-web-1", "WARNING", "OPEN",
            "5xx 에러율 급증 감지",
            "Web 서버의 5xx 응답 비율이 평소 대비 급증했습니다. 업스트림 App 서버 상태 확인이 필요합니다.",
        ),
        (
            f"{DEMO_TENANT_COMMERCE}-scp-lb-1", "WARNING", "RESOLVED",
            "트래픽 급증 경보 (해소됨)",
            "프로모션 이벤트로 인한 일시적 트래픽 급증이 감지되었으나, 오토스케일 조치 후 정상 범위로 복귀했습니다.",
        ),
    ],
    DEMO_TENANT_FINTECH: [
        (
            f"{DEMO_TENANT_FINTECH}-scp-app-2", "CRITICAL", "OPEN",
            "CPU 사용률 급증 - 거래 처리 지연 위험",
            "CPU 사용률이 임계치(85%)를 초과했습니다. 결제/거래 처리 지연으로 이어질 수 있어 우선 확인이 필요합니다.",
        ),
        (
            f"{DEMO_TENANT_FINTECH}-scp-db_replica-1", "WARNING", "OPEN",
            "DB 복제 지연(latency) 증가 감지",
            "DB 복제본(Replica)의 응답 지연이 평소 대비 증가했습니다. 복제 랙(lag) 여부 확인이 필요합니다.",
        ),
    ],
    DEMO_TENANT_GAMES: [
        (
            f"{DEMO_TENANT_GAMES}-aws-app-1", "CRITICAL", "OPEN",
            "게임 서버 CPU 사용률 급증 - 동시접속 피크",
            "동시 접속자 급증으로 게임 서버 CPU 사용률이 임계치(85%)를 초과했습니다. 스케일아웃 검토가 필요합니다.",
        ),
        (
            f"{DEMO_TENANT_GAMES}-aws-lb-1", "WARNING", "OPEN",
            "매치메이킹 게이트웨이 지연 증가",
            "로드밸런서 응답 지연이 평소 대비 증가했습니다. 매치메이킹 큐 적체 여부 확인이 필요합니다.",
        ),
    ],
}


async def _seed_tenants(session: AsyncSession) -> None:
    for tenant_id in DEMO_TENANT_IDS:
        existing = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        if not existing.scalars().first():
            session.add(Tenant(id=tenant_id, name=DEMO_TENANT_NAMES[tenant_id], is_demo=True))
    await session.commit()


async def _seed_alert_rules(session: AsyncSession) -> None:
    for tenant_id, rules in _ALERT_RULES.items():
        for name, metric_name, operator, threshold, duration_minutes in rules:
            existing = await session.execute(
                select(AlertRule).where(AlertRule.tenant_id == tenant_id, AlertRule.name == name)
            )
            if not existing.scalars().first():
                session.add(AlertRule(
                    tenant_id=tenant_id, name=name, metric_name=metric_name,
                    operator=operator, threshold=threshold, duration_minutes=duration_minutes,
                    is_active=True,
                ))
    await session.commit()


async def _seed_incidents(session: AsyncSession) -> None:
    for tenant_id, incidents in _INCIDENTS.items():
        for node_id, severity, status, short_title, description in incidents:
            node = get_node_by_id(node_id)
            node_label = node["label"] if node else node_id
            full_title = f"[{node_label}] {short_title}"

            existing = await session.execute(
                select(Incident).where(Incident.tenant_id == tenant_id, Incident.title == full_title)
            )
            if existing.scalars().first():
                continue

            incident = Incident(
                tenant_id=tenant_id,
                title=full_title,
                description=description,
                status=status,
                severity=severity,
            )
            if status == "RESOLVED":
                incident.resolved_at = datetime.utcnow()
            session.add(incident)
            await session.commit()
            await session.refresh(incident)

            session.add(IncidentTimeline(
                incident_id=incident.id,
                event_type="create",
                actor="System",
                message=f"데모 워크스페이스 초기 인시던트 - {description}",
            ))
            if status == "RESOLVED":
                session.add(IncidentTimeline(
                    incident_id=incident.id,
                    event_type="status_change",
                    actor="System",
                    message="오토스케일 조치 후 정상 범위로 복귀하여 자동 종결되었습니다.",
                ))
            await session.commit()


async def seed_demo_workspace(session: AsyncSession) -> None:
    """
    데모 워크스페이스 전체(테넌트 3곳 + 경보 룰 + 초기 인시던트)를 멱등적으로 시딩한다.
    항목별로 존재 여부를 먼저 검사하므로 반복 호출해도 안전하다(이미 있으면 스킵).
    """
    await _seed_tenants(session)
    await _seed_alert_rules(session)
    await _seed_incidents(session)
