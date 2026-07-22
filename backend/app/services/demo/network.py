"""
데모 워크스페이스 네트워크 이중화 경로 상태 생성기 - GET /monitor/network/paths용.

실 고객사 경로(실 네트워크 모니터링 연동 전)는 simulator.py의 중립 UNKNOWN 값을 그대로
유지한다. 데모 워크스페이스는 고객사별로 다른 이중화 시나리오(정상 이중화 vs 전용회선
장애 중 VPN 자동 우회)를 고정값으로 보여준다 - 실 DR 훈련 액션(trigger_network_incident)과
달리 데모는 "관제 화면에 항상 보여줄 대표 시나리오"이므로 매 조회마다 같은 스토리를 낸다.
"""
import copy
from typing import Dict

from backend.app.services.demo.constants import (
    DEMO_TENANT_COMMERCE,
    DEMO_TENANT_FINTECH,
    DEMO_TENANT_GAMES,
)

# 커머스 - 전용회선 정상, VPN은 대기(백업) 상태인 정상 이중화 시나리오
_HEALTHY_COMMERCE = {
    "dedicated": {"status": "ACTIVE", "packet_loss": 0.02, "bandwidth_mbps": 950.0},
    "vpn": {"status": "STANDBY", "packet_loss": 0.01, "bandwidth_mbps": 120.0},
}
# 핀테크 - 동일하게 정상이지만 회선 규모가 더 작은 시나리오
_HEALTHY_FINTECH = {
    "dedicated": {"status": "ACTIVE", "packet_loss": 0.03, "bandwidth_mbps": 500.0},
    "vpn": {"status": "STANDBY", "packet_loss": 0.01, "bandwidth_mbps": 80.0},
}
# 게임즈 - 전용회선 장애가 발생해 VPN 우회가 자동 발동된 페일오버 시나리오(자동조치 데모용)
_FAILOVER_GAMES = {
    "dedicated": {"status": "FAILED", "packet_loss": 0.62, "bandwidth_mbps": 15.0},
    "vpn": {"status": "ACTIVE", "packet_loss": 0.04, "bandwidth_mbps": 420.0},
}

_NETWORK_PATHS_BY_TENANT: Dict[str, dict] = {
    DEMO_TENANT_COMMERCE: _HEALTHY_COMMERCE,
    DEMO_TENANT_FINTECH: _HEALTHY_FINTECH,
    DEMO_TENANT_GAMES: _FAILOVER_GAMES,
}


def get_network_paths(tenant_id: str) -> dict:
    """데모 테넌트의 이중화 회선(전용회선/VPN) 경로 상태를 반환한다(고정 시나리오).
    호출측이 응답 dict를 변형해도 내부 고정 시나리오 상수가 오염되지 않도록 매 호출마다
    깊은 복사본을 반환한다."""
    scenario = _NETWORK_PATHS_BY_TENANT.get(tenant_id, _HEALTHY_COMMERCE)
    return copy.deepcopy(scenario)
