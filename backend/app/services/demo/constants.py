"""
데모 워크스페이스 상수 - 데모 고객사 ID/표시명/설명은 이 파일 한 곳에서만 정의한다.
다른 데모 엔진 모듈(topology_data/metrics/costs/logs/seed)과 라우터가 전부 이 상수를
참조하므로, 데모 고객사를 추가/변경할 때는 이 파일만 수정하면 된다.

CEO 지시(2026-07-16): 실 고객사 데이터와 완전히 분리된, 명확히 라벨된 데모 워크스페이스.
데모 고객사 ID는 반드시 "demo-" 접두사로 시작해 실 고객사 ID와 절대 혼동되지 않게 한다.
"""
from typing import List

# 데모 고객사 3곳 - 순서가 곧 시딩 순서(멱등적이라 순서 자체는 중요하지 않음)
DEMO_TENANT_COMMERCE = "demo-commerce"
DEMO_TENANT_FINTECH = "demo-fintech"
DEMO_TENANT_GAMES = "demo-games"

DEMO_TENANT_IDS: List[str] = [DEMO_TENANT_COMMERCE, DEMO_TENANT_FINTECH, DEMO_TENANT_GAMES]

# 표시명 - 이름에 "(샘플)"을 명시해 실 고객사 목록에서 봤을 때도 데모임이 즉시 드러나게 한다
DEMO_TENANT_NAMES = {
    DEMO_TENANT_COMMERCE: "데모커머스 (샘플)",
    DEMO_TENANT_FINTECH: "데모핀테크 (샘플)",
    DEMO_TENANT_GAMES: "데모게임즈 (샘플)",
}

# 고객사별 클라우드 구성 - 간판 데모(커머스)는 SCP+AWS 멀티클라우드, 나머지는 단일 클라우드
DEMO_TENANT_PROVIDERS = {
    DEMO_TENANT_COMMERCE: ["scp", "aws"],
    DEMO_TENANT_FINTECH: ["scp"],
    DEMO_TENANT_GAMES: ["aws"],
}


def is_demo_tenant_id(tenant_id: str) -> bool:
    """DEMO_TENANT_IDS 상수 집합 기준 정적 판별 (DB 조회 없이 빠른 사전 확인용)."""
    return tenant_id in DEMO_TENANT_IDS
