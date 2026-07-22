"""
데모 워크스페이스 FinOps 이상탐지/Rightsizing 생성기 - GET /monitor/costs/anomalies,
GET /monitor/costs/rightsizing용.

비용 이상탐지는 실 고객사와 동일한 FinOpsService.detect_cost_anomalies()를 그대로
재사용하되, 입력 추세만 데모 전용으로 합성한다(아래 get_cost_anomalies 설명 참고).

Rightsizing은 FinOpsService.get_dynamic_rightsizing()을 재사용하지 않는다 - 그 함수는
avg_cpu<5%(유휴) 또는 >80%(과부하) 극단치에서만 추천을 내도록 설계되어 있는데, 이는
노이즈가 많은 실 운영 CPU를 전제로 한 임계치다. 데모 베이스라인(topology_data.KIND_SPEC)은
완만한 값(15~48%)이라 이 임계치를 만족하는 노드가 거의 없어 재사용 시 빈 결과가 나온다.
따라서 데모는 CPU 베이스라인이 낮은 노드 순으로 직접 하위 순위를 매겨 추천을 만든다.
"""
from decimal import Decimal
from typing import List, Optional

from backend.app.core.providers import get_provider
from backend.app.services.demo.costs import UNIT_MONTHLY_KRW, get_costs
from backend.app.services.demo.topology_data import get_topology
from backend.app.services.finops_service import FinOpsService

# 이상탐지용 마지막 날 지출 급증 배율 - /monitor/costs의 daily_trends(요일별 ±3% 파동)만으로는
# FinOpsService.detect_cost_anomalies의 30% 급증 임계치를 넘지 못한다. 그래서 이상탐지
# 데모 전용으로 별도 스파이크를 주입한 시퀀스를 만들며, 원본 /monitor/costs 응답(daily_trends)은
# 건드리지 않는다.
_SPIKE_MULTIPLIER = 1.55


def get_cost_anomalies(tenant_id: str, provider: Optional[str] = None) -> List[dict]:
    """데모 테넌트의 비용 추세에 결정론적 스파이크를 주입한 뒤 FinOpsService로 이상탐지한다."""
    trend = get_costs(tenant_id, provider=provider).get("daily_trends", [])
    if not trend:
        return []

    spiked_trend = [dict(day) for day in trend]
    last = spiked_trend[-1]
    spiked_trend[-1] = {"date": last["date"], "amount": round(last["amount"] * _SPIKE_MULTIPLIER, 2)}
    return FinOpsService.detect_cost_anomalies(spiked_trend)


def get_rightsizing(tenant_id: str, provider: Optional[str] = None) -> List[dict]:
    """베이스라인 CPU가 가장 낮은 vm/database 노드 상위 2건을 다운사이징 추천 대상으로 선정한다."""
    topo = get_topology(tenant_id, provider=provider)
    candidates = [n for n in topo["nodes"] if n["type"] in ("vm", "database")]
    if not candidates:
        return []

    ranked = sorted(candidates, key=lambda n: n.get("cpu", 0.0))[:2]
    recommendations: List[dict] = []
    for node in ranked:
        avg_cpu = float(node.get("cpu", 0.0))
        unit_cost = UNIT_MONTHLY_KRW.get(node["provider"], {}).get(node["type"], UNIT_MONTHLY_KRW["aws"]["vm"])
        target_cost = (unit_cost / Decimal("2.0")).quantize(Decimal("0.01"))
        savings = unit_cost - target_cost

        registry = get_provider(node["provider"]) or {}
        instance_types = registry.get("instance_types", [])
        action_label = f"{instance_types[2]} -> {instance_types[1]}" if len(instance_types) >= 3 else "인스턴스 다운사이징"

        recommendations.append({
            "node_id": node["id"],
            "node_label": node["label"],
            "avg_cpu": avg_cpu,
            "action": "Downgrade (Scale-Down)",
            "reason": f"베이스라인 CPU 사용률이 {avg_cpu:.1f}%로 낮아 자원이 과다 프로비저닝된 것으로 추정됩니다.",
            "current_monthly_cost": float(unit_cost),
            "target_monthly_cost": float(target_cost),
            "savings": float(savings),
            "recommendation_text": f"인스턴스 타입을 1단계 축소({action_label})하여 월간 {float(savings):,.0f}원을 절감할 수 있습니다.",
        })
    return recommendations
