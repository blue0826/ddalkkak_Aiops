"""
데모 워크스페이스 메트릭 생성기 - 골든 시그널(포화도 cpu/memory, 지연 latency, 에러율,
트래픽) 시계열을 시간 기반 시드로 재현 가능하게 생성한다.

Math.random류 순수 난수 대신, 각 시점의 "분 단위" 타임스탬프를 시드로 쓰는
random.Random((node_id, metric_name, minute_bucket))을 사용한다 - 같은 노드/지표/시각
조합이면 언제 다시 조회해도 항상 같은 값이 나오되(재현성), 시간이 흐르면 값도 함께
흘러가 "살아있는" 데모처럼 보인다.

이상치 주입: topology_data.ANOMALY_REGISTRY에 등록된 (node_id -> 이상 종류) 조합은
조회 구간의 최근 40% 구간에서 값이 서서히 악화되다 급격히 나빠지는 추세를 갖는다 -
L2 통계적 이상탐지(Z-Score)와 상단 크리티컬 카드가 실제로 반응하도록.
"""
import random
from datetime import datetime, timedelta
from typing import List

from backend.app.services.demo.topology_data import ANOMALY_REGISTRY, KIND_SPEC, get_node_by_id, get_node_kind

_DEFAULT_BASELINE = {"cpu": 0.0, "memory": 0.0, "latency_ms": 1.0, "error_rate_pct": 0.0, "traffic_rps": 0.0}

# 지표별 지터 폭 - 베이스라인 대비 비율(예: cpu는 베이스라인의 +-6% 수준으로 흔들림)
_METRIC_JITTER_RATIO = {
    "cpu": 0.06,
    "memory": 0.04,
    "latency_ms": 0.15,
    "error_rate_pct": 0.25,
    "traffic_rps": 0.12,
}

# 이상치 종류별로 어떤 metric_name에 얼마만큼의 최대 악화폭을 더할지
_ANOMALY_OVERLAY_MAX = {
    ("cpu_spike", "cpu"): 45.0,       # 베이스라인 48% -> 최대 93%대로 상승 (CRITICAL 유발)
    ("cpu_spike", "memory"): 20.0,
    ("error_spike", "error_rate_pct"): 8.5,   # 베이스라인 0.3% -> 최대 8.8%대 급증
    ("latency_spike", "latency_ms"): 180.0,
}


def _baseline_for(node_id: str) -> dict:
    kind = get_node_kind(node_id)
    return KIND_SPEC.get(kind, _DEFAULT_BASELINE)


def _seeded_jitter(node_id: str, metric_name: str, minute_bucket: int) -> float:
    """시간 시드 지터 - 같은 (node_id, metric_name, 분) 조합이면 항상 같은 값을 낸다.
    random.Random은 튜플 시드를 지원하지 않으므로 문자열로 합성한다(str 시드는
    Python이 hashlib 기반으로 처리해 PYTHONHASHSEED와 무관하게 재현 가능하다)."""
    rng = random.Random(f"{node_id}|{metric_name}|{minute_bucket}")
    return rng.uniform(-1.0, 1.0)


def _anomaly_overlay(node_id: str, metric_name: str, minutes_ago: int, window: int) -> float:
    """
    등록된 이상치 노드/지표 조합에 한해, 조회 구간 후반부(최근 40%)에서 서서히 커지는
    악화 오버레이를 더한다. 등록되지 않은 조합은 0(영향 없음, 정상 노드는 절대 흔들리지 않음).
    """
    anomaly_kind = ANOMALY_REGISTRY.get(node_id)
    max_delta = _ANOMALY_OVERLAY_MAX.get((anomaly_kind, metric_name)) if anomaly_kind else None
    if not max_delta:
        return 0.0

    progress = 1.0 - (minutes_ago / max(window, 1))  # 0(과거) ~ 1(현재)
    onset = max(0.0, (progress - 0.6) / 0.4)
    return onset * max_delta


def get_metrics(tenant_id: str, node_id: str, metric_name: str, minutes: int = 60) -> List[dict]:
    """
    데모 노드의 시계열 메트릭을 반환한다. 노드가 없거나 다른 테넌트 소속이면 정직하게
    빈 리스트를 반환한다(실 시뮬레이터의 테넌트 격리 관례와 동일).
    """
    node = get_node_by_id(node_id)
    if not node or node["tenant_id"] != tenant_id:
        return []

    baseline = float(_baseline_for(node_id).get(metric_name, 0.0))
    jitter_ratio = _METRIC_JITTER_RATIO.get(metric_name, 0.08)

    points: List[dict] = []
    now = datetime.now()
    for i in range(minutes, 0, -1):
        time_point = now - timedelta(minutes=i)
        minute_bucket = int(time_point.timestamp() // 60)
        jitter = _seeded_jitter(node_id, metric_name, minute_bucket) * baseline * jitter_ratio
        overlay = _anomaly_overlay(node_id, metric_name, minutes_ago=i, window=minutes)
        value = max(0.0, baseline + jitter + overlay)
        points.append({
            "timestamp": time_point.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "value": round(value, 2),
        })
    return points
