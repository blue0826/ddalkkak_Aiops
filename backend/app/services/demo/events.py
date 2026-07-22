"""
데모 워크스페이스 이벤트/경보 생성기 - GET /monitor/events용. 토폴로지에 심어둔
ANOMALY_REGISTRY 노드를 그대로 근거로 삼아 "지금 진행 중인" 이벤트와 "이미 해소된"
이벤트를 섞어 반환한다 - topology_data.py/seed.py의 이상치 서사와 완전히 일치한다.

실 고객사 경로(SCP Cloud Monitoring/AWS CloudWatch 알람 연동 전)는 simulator.py가
여전히 정직하게 빈 리스트를 반환하며, 이 모듈은 is_demo 테넌트 전용이다.

status 필드는 소문자 "active"/"resolved"를 쓴다 - 프론트(TenantDashboard.tsx)가
`e.status === "active"`로 활성 이벤트 카운트를 필터링하기 때문에, Incident의
"OPEN"/"RESOLVED"(대문자) 관례와는 다른 값 공간이다.
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from backend.app.services.demo.constants import (
    DEMO_TENANT_COMMERCE,
    DEMO_TENANT_FINTECH,
    DEMO_TENANT_GAMES,
)
from backend.app.services.demo.topology_data import get_node_by_id

# (node_id, severity, status, title, description)
_EventSpec = Tuple[str, str, str, str, str]

_EVENTS_BY_TENANT: Dict[str, List[_EventSpec]] = {
    DEMO_TENANT_COMMERCE: [
        (
            f"{DEMO_TENANT_COMMERCE}-scp-app-1", "CRITICAL", "active",
            "CPU 사용률 급증 - App 서버 포화 임박",
            "CPU 사용률이 임계치(85%)를 초과해 지속적으로 상승 중입니다. 트래픽 급증에 따른 App 티어 포화가 의심됩니다.",
        ),
        (
            f"{DEMO_TENANT_COMMERCE}-aws-web-1", "WARNING", "active",
            "5xx 에러율 급증 감지",
            "Web 서버의 5xx 응답 비율이 평소 대비 급증했습니다. 업스트림 App 서버 상태 확인이 필요합니다.",
        ),
        (
            f"{DEMO_TENANT_COMMERCE}-scp-lb-1", "WARNING", "resolved",
            "트래픽 급증 경보 (해소됨)",
            "프로모션 이벤트로 인한 일시적 트래픽 급증이 감지되었으나, 오토스케일 조치 후 정상 범위로 복귀했습니다.",
        ),
    ],
    DEMO_TENANT_FINTECH: [
        (
            f"{DEMO_TENANT_FINTECH}-scp-app-2", "CRITICAL", "active",
            "CPU 사용률 급증 - 거래 처리 지연 위험",
            "CPU 사용률이 임계치(85%)를 초과했습니다. 결제/거래 처리 지연으로 이어질 수 있어 우선 확인이 필요합니다.",
        ),
        (
            f"{DEMO_TENANT_FINTECH}-scp-db_replica-1", "WARNING", "active",
            "DB 복제 지연(latency) 증가 감지",
            "DB 복제본(Replica)의 응답 지연이 평소 대비 증가했습니다. 복제 랙(lag) 여부 확인이 필요합니다.",
        ),
        (
            f"{DEMO_TENANT_FINTECH}-scp-bastion-1", "INFO", "resolved",
            "배스천 호스트 정기 보안 패치 완료",
            "예정된 보안 패치가 적용되어 배스천 호스트가 정상적으로 재기동되었습니다.",
        ),
    ],
    DEMO_TENANT_GAMES: [
        (
            f"{DEMO_TENANT_GAMES}-aws-app-1", "CRITICAL", "active",
            "게임 서버 CPU 사용률 급증 - 동시접속 피크",
            "동시 접속자 급증으로 게임 서버 CPU 사용률이 임계치(85%)를 초과했습니다. 스케일아웃 검토가 필요합니다.",
        ),
        (
            f"{DEMO_TENANT_GAMES}-aws-lb-1", "WARNING", "active",
            "매치메이킹 게이트웨이 지연 증가",
            "로드밸런서 응답 지연이 평소 대비 증가했습니다. 매치메이킹 큐 적체 여부 확인이 필요합니다.",
        ),
    ],
}


def get_events(tenant_id: str, provider: Optional[str] = None) -> List[dict]:
    """데모 테넌트의 이벤트 목록(최신순)을 반환한다. provider 필터는 이벤트가 걸린
    노드의 실제 provider 기준으로 적용한다."""
    specs = _EVENTS_BY_TENANT.get(tenant_id, [])
    now = datetime.now()
    events: List[dict] = []
    for idx, (node_id, severity, status, title, description) in enumerate(specs):
        node = get_node_by_id(node_id)
        node_provider = node["provider"] if node else "scp"
        if provider and node_provider != provider:
            continue
        events.append({
            "id": f"{tenant_id}-evt-{idx + 1}",
            "title": title,
            "description": description,
            "severity": severity,
            "status": status,
            "node_id": node_id,
            "provider": node_provider,
            "tenant_id": tenant_id,
            "created_at": (now - timedelta(minutes=idx * 17 + 5)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
    return events
