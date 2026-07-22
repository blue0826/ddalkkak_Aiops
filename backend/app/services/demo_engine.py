"""
데모 워크스페이스 엔진 파사드 - 라우터가 참조하는 단일 진입점.

실 고객사 경로(simulator.py/cloud_adapter.py)는 이 모듈과 완전히 분리되어 있으며
절대 서로 호출하지 않는다. is_demo=True 테넌트에 한해서만 이 파사드를 거쳐 데모
엔진(backend/app/services/demo/ 패키지)의 데이터를 서빙한다.

실제 생성 로직은 데이터 종류별로 별도 모듈에 분리되어 있다(신규 파일 500줄 미만 원칙):
- demo/constants.py   : 데모 고객사 ID/표시명/구성
- demo/topology_data.py : 결정론적 토폴로지(노드/링크) 생성
- demo/metrics.py     : 시간 시드 기반 골든 시그널 시계열 + 이상치 주입
- demo/costs.py       : KRW FinOps 비용 생성
- demo/logs.py        : 로그 티커 생성
- demo/events.py      : 인프라 이벤트/경보 생성
- demo/predictions.py : 디스크 용량 포화 예측(합성 이력 + PredictionService 재사용)
- demo/network.py     : 이중화 회선(전용회선/VPN) 경로 상태 생성
- demo/security.py    : SOAR 차단 IP 목록 생성
- demo/finops.py      : 비용 이상탐지 + Rightsizing 추천 생성
- demo/dispatch.py    : tenant.is_demo DB 판별 헬퍼
- demo/seed.py        : 테넌트/경보룰/인시던트 DB 시딩(멱등)
"""
from backend.app.services.demo.constants import DEMO_TENANT_IDS
from backend.app.services.demo.costs import get_costs
from backend.app.services.demo.dispatch import list_demo_tenant_ids, resolve_is_demo
from backend.app.services.demo.events import get_events
from backend.app.services.demo.finops import get_cost_anomalies, get_rightsizing
from backend.app.services.demo.logs import get_logs
from backend.app.services.demo.metrics import get_metrics
from backend.app.services.demo.network import get_network_paths
from backend.app.services.demo.predictions import get_predictions
from backend.app.services.demo.security import get_blocked_ips
from backend.app.services.demo.seed import seed_demo_workspace
from backend.app.services.demo.topology_data import get_topology, get_topology_multi

__all__ = [
    "DEMO_TENANT_IDS",
    "get_topology",
    "get_topology_multi",
    "get_metrics",
    "get_logs",
    "get_costs",
    "get_events",
    "get_cost_anomalies",
    "get_rightsizing",
    "get_predictions",
    "get_network_paths",
    "get_blocked_ips",
    "resolve_is_demo",
    "list_demo_tenant_ids",
    "seed_demo_workspace",
]
