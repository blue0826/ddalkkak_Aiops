"""
데모 워크스페이스 디스크 용량 포화 예측 생성기 - GET /monitor/predictions용.

실 예측 로직(PredictionService.predict_disk_saturation - 선형회귀 기반)은 실 고객사와
100% 동일하게 재사용하고, 입력 이력(historical_usage)만 노드 특성에 따라 결정론적으로
합성한다. ANOMALY_REGISTRY에 cpu_spike로 등록된 노드(이미 부하가 걸린 노드)는 가파른
증가 추세를 가져 saturates_soon=True를 보여준다 - "용량 예측"이 이미 경보가 걸린 노드와
자연스럽게 이어지는 데모 시나리오.
"""
import random
from typing import Dict, List, Optional

from backend.app.services.demo.constants import (
    DEMO_TENANT_COMMERCE,
    DEMO_TENANT_FINTECH,
    DEMO_TENANT_GAMES,
)
from backend.app.services.demo.topology_data import ANOMALY_REGISTRY, get_node_by_id, get_tenant_nodes
from backend.app.services.prediction_service import PredictionService

# node_id 파라미터 없이(또는 실 고객사용 기본값 "scp-vm-app-01"로) 조회하면 각 고객사의
# 이미 이상치가 심어진 노드를 기본 예측 대상으로 삼는다.
_DEFAULT_NODE_ID: Dict[str, str] = {
    DEMO_TENANT_COMMERCE: f"{DEMO_TENANT_COMMERCE}-scp-app-1",
    DEMO_TENANT_FINTECH: f"{DEMO_TENANT_FINTECH}-scp-app-2",
    DEMO_TENANT_GAMES: f"{DEMO_TENANT_GAMES}-aws-app-1",
}


def _resolve_node_id(tenant_id: str, node_id: Optional[str], provider: Optional[str]) -> str:
    """요청받은 node_id가 이 데모 테넌트 소속의 유효한 노드면 그대로 쓰고, 아니면
    (실 고객사용 기본값 "scp-vm-app-01" 포함) 고객사별 기본 예측 대상으로 대체한다."""
    node = get_node_by_id(node_id) if node_id else None
    if node and node["tenant_id"] == tenant_id and (not provider or node["provider"] == provider):
        return node_id

    preferred = _DEFAULT_NODE_ID.get(tenant_id)
    preferred_node = get_node_by_id(preferred) if preferred else None
    if preferred_node and (not provider or preferred_node["provider"] == provider):
        return preferred

    # 기본 노드가 요청한 provider와 다른 클라우드에 속한 경우(예: 커머스+aws) 해당
    # provider의 첫 vm 노드로 대체한다.
    candidates = [
        n for n in get_tenant_nodes(tenant_id)
        if n["type"] == "vm" and (not provider or n["provider"] == provider)
    ]
    if candidates:
        return candidates[0]["id"]
    return preferred or (node_id or "")


def _generate_history(node_id: str, days: int = 10) -> List[float]:
    """디스크 사용률 이력을 노드 특성에 따라 시드 고정 난수로 결정론적으로 생성한다.
    cpu_spike로 등록된 노드는 급격한 증가 추세(포화 임박), 그 외 노드는 완만한 증가
    추세(여유)를 갖는다 - 매번 동일한 node_id는 항상 동일한 이력을 낸다(재현성)."""
    rng = random.Random(f"disk|{node_id}")
    base = 38.0 + rng.uniform(0.0, 8.0)
    is_hot = ANOMALY_REGISTRY.get(node_id) == "cpu_spike"
    daily_growth = 4.2 if is_hot else rng.uniform(0.15, 0.6)

    history: List[float] = []
    for i in range(days):
        jitter = rng.uniform(-0.3, 0.3)
        history.append(round(min(99.5, base + daily_growth * i + jitter), 1))
    return history


def get_predictions(tenant_id: str, node_id: Optional[str] = None, provider: Optional[str] = None) -> dict:
    """데모 테넌트의 디스크 용량 포화 예측을 반환한다 (data_source 개념은 응답 스키마에
    없으므로 history/node_id로 어떤 노드를 근거로 했는지 정직하게 드러낸다)."""
    resolved_id = _resolve_node_id(tenant_id, node_id, provider)
    history = _generate_history(resolved_id)
    result = PredictionService.predict_disk_saturation(history)
    result["history"] = history
    result["node_id"] = resolved_id
    return result
