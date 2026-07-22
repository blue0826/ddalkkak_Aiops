"""
데모 워크스페이스 FinOps 비용 생성기 - 노드 인벤토리를 KRW 표준 단가로 환산한다.
simulator.py의 실 고객사 산식(코드당 KRW 고정 단가)과 동일한 철학을 데모 전용으로
재현하되, 캐시/스토리지/로드밸런서/방화벽/게이트웨이까지 포함해 더 풍부한 비용
구성표를 보여준다. 실 고객사 비용 계산 경로(simulator.py)는 건드리지 않는다.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from backend.app.core.providers import get_provider
from backend.app.services.demo.topology_data import get_topology

# provider/노드타입별 월간 표준 단가(KRW) - 실 SCP/AWS 정가와 무관한 데모 전용 참고값.
# scp가 aws보다 비싼 것은 simulator.py의 기존 관례(KRW 다이렉트 과금 vs 원화환산)를 따른다.
UNIT_MONTHLY_KRW: Dict[str, Dict[str, Decimal]] = {
    "scp": {
        "vm": Decimal("178200"), "database": Decimal("356400"), "cache": Decimal("64200"),
        "loadbalancer": Decimal("32400"), "storage": Decimal("8900"),
        "firewall": Decimal("21600"), "gateway": Decimal("5400"),
    },
    "aws": {
        "vm": Decimal("87750"), "database": Decimal("175500"), "cache": Decimal("31500"),
        "loadbalancer": Decimal("24300"), "storage": Decimal("5400"),
        "firewall": Decimal("16200"), "gateway": Decimal("4050"),
    },
}


def _rightsizing_recommendation(nodes: List[dict]) -> List[dict]:
    """부하가 가장 낮은 vm 노드 1건을 다운사이징 추천 대상으로 선정한다."""
    vm_nodes = [n for n in nodes if n["type"] == "vm"]
    if not vm_nodes:
        return []

    idle_node = min(vm_nodes, key=lambda n: n.get("cpu", 0.0))
    unit_cost = UNIT_MONTHLY_KRW.get(idle_node["provider"], {}).get("vm", Decimal("87750"))
    target_cost = (unit_cost / Decimal("2.0")).quantize(Decimal("0.01"))
    savings = unit_cost - target_cost

    registry = get_provider(idle_node["provider"]) or {}
    instance_types = registry.get("instance_types", [])
    action_label = f"{instance_types[2]} -> {instance_types[1]}" if len(instance_types) >= 3 else "인스턴스 다운사이징"

    return [{
        "node_id": idle_node["id"],
        "reason": f"최근 CPU 사용률이 낮아 유휴 자원으로 추정됩니다. ({idle_node['label']})",
        "action": f"인스턴스 다운사이징 ({action_label})",
        "current_monthly_cost": float(unit_cost),
        "target_monthly_cost": float(target_cost),
        "savings": float(savings),
    }]


def get_costs(tenant_id: str, provider: Optional[str] = None) -> dict:
    """데모 테넌트의 KRW 비용 데이터를 반환한다 (data_source는 항상 DEMO로 정직하게 라벨링)."""
    topo = get_topology(tenant_id, provider=provider)
    nodes = topo["nodes"]

    monthly_total = Decimal("0.0")
    for node in nodes:
        unit_cost = UNIT_MONTHLY_KRW.get(node["provider"], {}).get(node["type"])
        if unit_cost:
            monthly_total += unit_cost

    daily_trends: List[dict] = []
    daily_average = 0.0
    if monthly_total > 0:
        daily_base = monthly_total / Decimal("30.0")
        now = datetime.now()
        for i in range(7, 0, -1):
            day = now - timedelta(days=i)
            # 결정론적 요일 패턴 - 주말 소폭 할인 + (day % 3) 기반의 작은 물결(순수 난수 아님)
            wave = Decimal(str(round(0.03 * ((i % 3) - 1), 4)))
            multiplier = (Decimal("0.85") if day.weekday() >= 5 else Decimal("1.0")) + wave
            amount = daily_base * multiplier
            daily_trends.append({"date": day.strftime("%Y-%m-%d"), "amount": float(round(amount, 2))})
        daily_average = float(round(daily_base, 2))

    return {
        "currency": "KRW",
        "monthly_total": float(monthly_total),
        "daily_average": daily_average,
        "daily_trends": daily_trends,
        "recommendations": _rightsizing_recommendation(nodes),
        "data_source": "DEMO",
    }
