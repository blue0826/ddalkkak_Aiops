"""
데모 워크스페이스 SOAR 차단 IP 목록 생성기 - GET /monitor/security/blocked용.

BlockedIp 응답 스키마는 IP 문자열 리스트(List[str])다 - 프론트
(frontend/src/lib/types.ts의 `BlockedIp = string`, SecOpsPanel.tsx의 DataTable이
행 전체를 문자열로 취급해 렌더링)와 스키마 호환을 유지하기 위해 객체가 아닌 문자열만
반환한다. IP는 전부 IANA가 문서화 예제용으로 예약한 TEST-NET 대역(RFC 5737:
192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)에서 골라 실제 공인 IP와 절대 혼동되지
않게 한다.
"""
from typing import Dict, List

from backend.app.services.demo.constants import (
    DEMO_TENANT_COMMERCE,
    DEMO_TENANT_FINTECH,
    DEMO_TENANT_GAMES,
)

_BLOCKED_IPS_BY_TENANT: Dict[str, List[str]] = {
    DEMO_TENANT_COMMERCE: ["203.0.113.15", "198.51.100.42", "203.0.113.201"],
    DEMO_TENANT_FINTECH: ["198.51.100.88", "203.0.113.77"],
    DEMO_TENANT_GAMES: ["192.0.2.133", "198.51.100.9", "192.0.2.201"],
}


def get_blocked_ips(tenant_id: str) -> List[str]:
    """SOAR가 차단한 공격자 IP 목록(데모 고정 시나리오)을 반환한다."""
    return list(_BLOCKED_IPS_BY_TENANT.get(tenant_id, []))
