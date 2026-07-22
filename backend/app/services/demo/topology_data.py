"""
데모 워크스페이스 토폴로지 생성기 - 결정론적(매번 동일한 그래프) 노드/링크 데이터.

계층: 리전(Provider Registry 실제 리전코드) -> VPC -> 서브넷(public/private 구분) ->
서비스(티어). 노드 필드명은 backend/app/schemas/monitor.py의 NodeSchema
(id/label/type/status/provider/tenant_id/cpu/memory/tier/subnet/region)를 그대로 따른다.

랜덤 요소가 전혀 없다 - 구조는 고정이며, 실시간성은 metrics.py가 시간 시드로 별도 부여한다.
"""
from typing import Dict, List, Optional, Tuple

from backend.app.core.providers import get_provider
from backend.app.services.demo.constants import (
    DEMO_TENANT_COMMERCE,
    DEMO_TENANT_FINTECH,
    DEMO_TENANT_GAMES,
)

# 서비스 종류별 기본 골든 시그널 베이스라인(saturation=cpu/memory, latency, error_rate, traffic).
# metrics.py가 이 베이스라인에 시간 시드 지터 + 이상치 오버레이를 적용해 시계열을 만든다.
# cpu/memory는 NodeSchema 필드로 토폴로지 노드에도 그대로 노출되고, latency_ms/error_rate_pct/
# traffic_rps는 metrics.py가 get_metrics(metric_name=...) 조회 시의 기준값으로만 쓰인다.
KIND_SPEC: Dict[str, dict] = {
    "igw":        {"type": "gateway",      "tier": None,    "label": "IGW",        "cpu": 0.0,  "memory": 0.0,  "latency_ms": 1.0,  "error_rate_pct": 0.0,  "traffic_rps": 0.0},
    "nat":        {"type": "gateway",      "tier": None,    "label": "NAT-GW",     "cpu": 0.0,  "memory": 0.0,  "latency_ms": 1.0,  "error_rate_pct": 0.0,  "traffic_rps": 0.0},
    "waf":        {"type": "firewall",     "tier": None,    "label": "WAF-Shield", "cpu": 4.0,  "memory": 10.0, "latency_ms": 2.0,  "error_rate_pct": 0.05, "traffic_rps": 900.0},
    "bastion":    {"type": "vm",           "tier": None,    "label": "Bastion",    "cpu": 6.0,  "memory": 12.0, "latency_ms": 1.0,  "error_rate_pct": 0.0,  "traffic_rps": 5.0},
    "lb":         {"type": "loadbalancer", "tier": "edge",  "label": "LB",         "cpu": 14.0, "memory": 24.0, "latency_ms": 6.0,  "error_rate_pct": 0.10, "traffic_rps": 1200.0},
    "web":        {"type": "vm",           "tier": "web",   "label": "Web",        "cpu": 42.0, "memory": 55.0, "latency_ms": 45.0, "error_rate_pct": 0.30, "traffic_rps": 420.0},
    "app":        {"type": "vm",           "tier": "app",   "label": "App",        "cpu": 48.0, "memory": 62.0, "latency_ms": 85.0, "error_rate_pct": 0.40, "traffic_rps": 260.0},
    "db_primary": {"type": "database",     "tier": "db",    "label": "DB-Primary", "cpu": 28.0, "memory": 72.0, "latency_ms": 8.0,  "error_rate_pct": 0.05, "traffic_rps": 320.0},
    "db_replica": {"type": "database",     "tier": "db",    "label": "DB-Replica", "cpu": 18.0, "memory": 55.0, "latency_ms": 10.0, "error_rate_pct": 0.05, "traffic_rps": 180.0},
    "cache":      {"type": "cache",        "tier": "cache", "label": "Cache",      "cpu": 15.0, "memory": 58.0, "latency_ms": 1.5,  "error_rate_pct": 0.0,  "traffic_rps": 700.0},
    "storage":    {"type": "storage",      "tier": None,    "label": "Storage",    "cpu": 0.0,  "memory": 0.0,  "latency_ms": 20.0, "error_rate_pct": 0.0,  "traffic_rps": 60.0},
}

# 노드 ID -> 이상치 종류("cpu_spike"/"error_spike"/"latency_spike"). metrics.py와
# incidents_seed.py가 그대로 참조한다 (최소 1개는 반드시 CRITICAL로 이어지는 cpu_spike).
ANOMALY_REGISTRY: Dict[str, str] = {
    f"{DEMO_TENANT_COMMERCE}-scp-app-1": "cpu_spike",
    f"{DEMO_TENANT_COMMERCE}-aws-web-1": "error_spike",
    f"{DEMO_TENANT_FINTECH}-scp-app-2": "cpu_spike",
    f"{DEMO_TENANT_FINTECH}-scp-db_replica-1": "latency_spike",
    f"{DEMO_TENANT_GAMES}-aws-app-1": "cpu_spike",
    f"{DEMO_TENANT_GAMES}-aws-lb-1": "latency_spike",
}

# subnets 스펙 타입: (subnet_key, subnet_label, [(kind, count), ...])
_SubnetSpec = Tuple[str, str, List[Tuple[str, int]]]


def _build_stack(
    tenant_id: str,
    provider: str,
    region: str,
    vpc_label: str,
    subnets: List[_SubnetSpec],
) -> Tuple[List[dict], List[dict]]:
    """리전 -> VPC -> 서브넷(public/private) -> 서비스 계층 하나(stack)를 조립한다."""
    nodes: List[dict] = []
    links: List[dict] = []

    vpc_id = f"{tenant_id}-{provider}-vpc"
    nodes.append({
        "id": vpc_id, "label": vpc_label, "type": "vpc", "status": "running",
        "provider": provider, "tenant_id": tenant_id, "cpu": 0.0, "memory": 0.0,
        "region": region,
    })

    kind_counts: Dict[str, int] = {}

    for subnet_key, subnet_label, services in subnets:
        subnet_id = f"{tenant_id}-{provider}-subnet-{subnet_key}"
        nodes.append({
            "id": subnet_id, "label": subnet_label, "type": "subnet", "status": "running",
            "provider": provider, "tenant_id": tenant_id, "cpu": 0.0, "memory": 0.0,
            "region": region, "subnet": subnet_key,
        })
        links.append({"source": vpc_id, "target": subnet_id, "type": "parent_child"})

        for kind, count in services:
            spec = KIND_SPEC[kind]
            for i in range(1, count + 1):
                node_id = f"{tenant_id}-{provider}-{kind}-{i}"
                status = "warning" if node_id in ANOMALY_REGISTRY else "running"
                nodes.append({
                    "id": node_id,
                    "label": f"{spec['label']}-{i:02d}",
                    "type": spec["type"],
                    "status": status,
                    "provider": provider,
                    "tenant_id": tenant_id,
                    "cpu": spec["cpu"],
                    "memory": spec["memory"],
                    "tier": spec["tier"],
                    "subnet": subnet_key,
                    "region": region,
                })
                links.append({"source": subnet_id, "target": node_id, "type": "parent_child"})
            kind_counts[kind] = count

    links.extend(_flow_links(tenant_id, provider, kind_counts))
    return nodes, links


def _flow_links(tenant_id: str, provider: str, kind_counts: Dict[str, int]) -> List[dict]:
    """트래픽 흐름(network_flow) 링크 - igw->waf->lb->web->app->db/cache 계층 흐름."""

    def ids(kind: str) -> List[str]:
        return [f"{tenant_id}-{provider}-{kind}-{i}" for i in range(1, kind_counts.get(kind, 0) + 1)]

    igw, waf, lb = ids("igw"), ids("waf"), ids("lb")
    web, app = ids("web"), ids("app")
    db_primary, db_replica, cache, nat = ids("db_primary"), ids("db_replica"), ids("cache"), ids("nat")

    links: List[dict] = []
    if igw and waf:
        links.append({"source": igw[0], "target": waf[0], "type": "network_flow"})
    if waf and lb:
        links.append({"source": waf[0], "target": lb[0], "type": "network_flow"})

    for idx, web_id in enumerate(web):
        if lb:
            links.append({"source": lb[0], "target": web_id, "type": "network_flow"})
        if app:
            links.append({"source": web_id, "target": app[idx % len(app)], "type": "network_flow"})

    for idx, app_id in enumerate(app):
        if db_primary:
            links.append({"source": app_id, "target": db_primary[0], "type": "network_flow"})
        if db_replica and idx % 2 == 1:
            links.append({"source": app_id, "target": db_replica[0], "type": "network_flow"})
        if cache:
            links.append({"source": app_id, "target": cache[0], "type": "network_flow"})
        if nat:
            links.append({"source": app_id, "target": nat[0], "type": "network_flow"})

    if db_primary and db_replica:
        links.append({"source": db_primary[0], "target": db_replica[0], "type": "association"})

    return links


def _commerce_stacks() -> Tuple[List[dict], List[dict]]:
    """데모커머스 - SCP + AWS 멀티클라우드 간판 데모 (~34노드)."""
    scp_region = get_provider("scp")["default_region"]
    aws_region = get_provider("aws")["default_region"]

    scp_nodes, scp_links = _build_stack(
        DEMO_TENANT_COMMERCE, "scp", scp_region, "Commerce-SCP-VPC",
        subnets=[
            ("public", "Public-Subnet", [("igw", 1), ("waf", 1), ("lb", 1), ("web", 3)]),
            ("private-app", "Private-App-Subnet", [("nat", 1), ("app", 3), ("cache", 1)]),
            ("private-db", "Private-DB-Subnet", [("db_primary", 1), ("db_replica", 1), ("storage", 1)]),
        ],
    )
    aws_nodes, aws_links = _build_stack(
        DEMO_TENANT_COMMERCE, "aws", aws_region, "Commerce-AWS-VPC",
        subnets=[
            ("public", "Public-Subnet", [("igw", 1), ("waf", 1), ("lb", 1), ("web", 2)]),
            ("private-app", "Private-App-Subnet", [("nat", 1), ("app", 2), ("cache", 1)]),
            ("private-db", "Private-DB-Subnet", [("db_primary", 1), ("db_replica", 1), ("storage", 1)]),
        ],
    )
    return scp_nodes + aws_nodes, scp_links + aws_links


def _fintech_stacks() -> Tuple[List[dict], List[dict]]:
    """데모핀테크 - SCP 단독, 보안 구성요소(WAF+Bastion) 강조 (~18노드)."""
    scp_region = get_provider("scp")["default_region"]
    nodes, links = _build_stack(
        DEMO_TENANT_FINTECH, "scp", scp_region, "Fintech-SCP-VPC",
        subnets=[
            ("public", "Public-Subnet", [("igw", 1), ("waf", 1), ("bastion", 1), ("lb", 1), ("web", 2)]),
            ("private-app", "Private-App-Subnet", [("nat", 1), ("app", 3), ("cache", 1)]),
            ("private-db", "Private-DB-Subnet", [("db_primary", 1), ("db_replica", 1), ("storage", 1)]),
        ],
    )
    return nodes, links


def _games_stacks() -> Tuple[List[dict], List[dict]]:
    """데모게임즈 - AWS 단독, 게임서버/세션캐시 구성 (~17노드)."""
    aws_region = get_provider("aws")["default_region"]
    nodes, links = _build_stack(
        DEMO_TENANT_GAMES, "aws", aws_region, "Games-AWS-VPC",
        subnets=[
            ("public", "Public-Subnet", [("igw", 1), ("waf", 1), ("lb", 1), ("web", 2)]),
            ("private-app", "Private-App-Subnet", [("nat", 1), ("app", 3), ("cache", 1)]),
            ("private-db", "Private-DB-Subnet", [("db_primary", 1), ("db_replica", 1), ("storage", 1)]),
        ],
    )
    return nodes, links


_BUILDERS = {
    DEMO_TENANT_COMMERCE: _commerce_stacks,
    DEMO_TENANT_FINTECH: _fintech_stacks,
    DEMO_TENANT_GAMES: _games_stacks,
}

# 모듈 임포트 시 1회만 조립(완전 결정론적 - 매 호출마다 재계산할 필요 없음)
_NODES_BY_TENANT: Dict[str, List[dict]] = {}
_LINKS_BY_TENANT: Dict[str, List[dict]] = {}
for _tid, _builder in _BUILDERS.items():
    _n, _l = _builder()
    _NODES_BY_TENANT[_tid] = _n
    _LINKS_BY_TENANT[_tid] = _l


# node_id -> (node dict, kind) 전역 색인 - metrics.py/costs.py/logs.py가 조회에 사용한다
_NODE_INDEX: Dict[str, dict] = {}
for _tid, _nodelist in _NODES_BY_TENANT.items():
    for _node in _nodelist:
        _NODE_INDEX[_node["id"]] = _node


def get_node_by_id(node_id: str) -> Optional[dict]:
    return _NODE_INDEX.get(node_id)


def get_node_kind(node_id: str) -> Optional[str]:
    """node_id(예: demo-commerce-scp-app-1)에서 KIND_SPEC 키(app)를 역산한다."""
    node = _NODE_INDEX.get(node_id)
    if not node:
        return None
    # id 포맷: {tenant_id}-{provider}-{kind}-{index} - tenant_id 접두사를 떼어내고
    # provider 다음 세그먼트부터 마지막 숫자 세그먼트 이전까지를 kind로 재구성한다.
    prefix = f"{node['tenant_id']}-{node['provider']}-"
    if not node_id.startswith(prefix):
        return None
    remainder = node_id[len(prefix):]  # 예: "app-1" 또는 "db_primary-1"
    kind, _, _index = remainder.rpartition("-")
    return kind or None


def get_tenant_nodes(tenant_id: str) -> List[dict]:
    return _NODES_BY_TENANT.get(tenant_id, [])


def get_tenant_links(tenant_id: str) -> List[dict]:
    return _LINKS_BY_TENANT.get(tenant_id, [])


def get_topology(tenant_id: str, provider: Optional[str] = None) -> dict:
    """단일 데모 테넌트의 토폴로지(노드/링크)를 provider 필터와 함께 반환한다.
    data_source="DEMO"를 명시해 실 고객사 SIMULATED/REAL과 절대 혼동되지 않게 한다."""
    nodes = get_tenant_nodes(tenant_id)
    links = get_tenant_links(tenant_id)
    if provider:
        nodes = [n for n in nodes if n["provider"] == provider]
        node_ids = {n["id"] for n in nodes}
        links = [l for l in links if l["source"] in node_ids and l["target"] in node_ids]
    return {"nodes": nodes, "links": links, "data_source": "DEMO"}


def get_topology_multi(tenant_ids: List[str], provider: Optional[str] = None) -> dict:
    """여러 데모 테넌트의 토폴로지를 합산한다 (system 통합 뷰 병합용)."""
    nodes: List[dict] = []
    links: List[dict] = []
    for tid in tenant_ids:
        topo = get_topology(tid, provider=provider)
        nodes.extend(topo["nodes"])
        links.extend(topo["links"])
    return {"nodes": nodes, "links": links}
