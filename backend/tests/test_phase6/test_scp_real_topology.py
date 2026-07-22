"""
backend/app/services/scp_real_topology.py 유닛 테스트.

Bug 1(main) 회귀 방지: 실 SCP VM 인벤토리를 하드코딩된 scp-subnet-pub/priv
부모 노드에 연결하던 과거 버그(부모 노드가 실 고객사 테넌트에는 존재하지 않아
모든 parent_child 링크가 댕글링되던 문제)가 재발하지 않는지 검증한다.

MOCK VM 목록만 사용하며 실 SCP OpenAPI는 절대 호출하지 않는다.
"""
from backend.app.services.scp_real_topology import build_real_scp_topology


def _mock_real_vms():
    """tfpublicmonos/tfprivatemonos 서브넷에 걸친 web/app/db 3개 VM (실 SCP 응답 형태)."""
    return [
        {
            "id": "real-vm-web-1",
            "name": "real-web-01",
            "state": "ACTIVE",
            "addresses": [{"subnet_name": "tfPublicmonos", "ip_addresses": [{"ip_address": "10.0.0.5"}]}],
            "security_groups": [],
        },
        {
            "id": "real-vm-app-1",
            "name": "real-app-01",
            "state": "ACTIVE",
            "addresses": [{"subnet_name": "tfPrivatemonos", "ip_addresses": [{"ip_address": "10.0.1.5"}]}],
            "security_groups": [],
        },
        {
            "id": "real-vm-db-1",
            "name": "real-db-01",
            "state": "ACTIVE",
            "addresses": [{"subnet_name": "tfPrivatemonos", "ip_addresses": [{"ip_address": "10.0.1.6"}]}],
            "security_groups": [{"name": "sg-maria-db"}],
        },
    ]


def test_build_real_scp_topology_creates_vpc_and_subnet_containers():
    """VPC 1개 + 실제 등장한 고유 서브넷명(2개: public/private)당 서브넷 컨테이너 1개가 생성되어야 한다."""
    nodes, links = build_real_scp_topology("monos", _mock_real_vms())

    vpc_nodes = [n for n in nodes if n["type"] == "vpc"]
    subnet_nodes = [n for n in nodes if n["type"] == "subnet"]
    vm_nodes = [n for n in nodes if n["type"] == "vm"]

    assert len(vpc_nodes) == 1
    assert len(subnet_nodes) == 2
    assert len(vm_nodes) == 3
    # 컨테이너 id는 테넌트별로 고유해야 한다 (다른 테넌트와 충돌 방지)
    assert vpc_nodes[0]["id"] == "scp-vpc-monos"


def test_build_real_scp_topology_no_dangling_parent_child_links():
    """모든 parent_child 링크의 source/target이 반환된 nodes 안에 실존해야 한다 (댕글링 금지 - 버그 1 핵심 회귀 검증)."""
    nodes, links = build_real_scp_topology("monos", _mock_real_vms())
    node_ids = {n["id"] for n in nodes}

    parent_child_links = [l for l in links if l["type"] == "parent_child"]
    assert len(parent_child_links) > 0
    for link in parent_child_links:
        assert link["source"] in node_ids, f"댕글링 소스: {link['source']}"
        assert link["target"] in node_ids, f"댕글링 타깃: {link['target']}"

    # 하드코딩된 구 부모 노드는 더 이상 참조되지 않아야 한다
    referenced_ids = {l["source"] for l in links} | {l["target"] for l in links}
    assert "scp-subnet-pub" not in referenced_ids
    assert "scp-subnet-priv" not in referenced_ids


def test_build_real_scp_topology_vm_parented_to_matching_real_subnet():
    """각 VM은 자신의 실제 subnet 값과 일치하는 서브넷 컨테이너에만 연결되어야 한다."""
    nodes, links = build_real_scp_topology("monos", _mock_real_vms())

    subnet_by_id = {n["id"]: n for n in nodes if n["type"] == "subnet"}
    parent_of = {l["target"]: l["source"] for l in links if l["type"] == "parent_child" and l["target"].startswith("real-vm-")}

    # web VM은 public 서브넷 컨테이너에, app/db VM은 private 서브넷 컨테이너에 연결
    web_parent = subnet_by_id[parent_of["real-vm-web-1"]]
    app_parent = subnet_by_id[parent_of["real-vm-app-1"]]
    db_parent = subnet_by_id[parent_of["real-vm-db-1"]]

    assert "public" in web_parent["subnet"].lower()
    assert "private" in app_parent["subnet"].lower()
    # app/db VM은 동일한 실제 서브넷(tfPrivatemonos)이므로 같은 컨테이너를 공유해야 한다
    assert app_parent["id"] == db_parent["id"]


def test_build_real_scp_topology_region_is_populated():
    """VPC/서브넷/VM 노드 전부 region이 채워져야 한다 (프론트 region 캡션/그룹핑 의존)."""
    nodes, links = build_real_scp_topology("monos", _mock_real_vms(), region="kr-west1")

    for node in nodes:
        assert node.get("region") == "kr-west1"


def test_build_real_scp_topology_defaults_region_from_provider_registry():
    """region 인자를 생략하면 Provider Registry의 SCP 기본 리전(kr-west1)을 사용해야 한다."""
    nodes, links = build_real_scp_topology("monos", _mock_real_vms())
    assert all(n.get("region") == "kr-west1" for n in nodes)


def test_build_real_scp_topology_keeps_web_app_db_network_flow_links():
    """web->app, app->db network_flow 링크가 유지되어야 한다 (트래픽 흐름 시각화)."""
    nodes, links = build_real_scp_topology("monos", _mock_real_vms())
    flow_links = [l for l in links if l["type"] == "network_flow"]

    assert {"source": "real-vm-web-1", "target": "real-vm-app-1", "type": "network_flow"} in flow_links
    assert {"source": "real-vm-app-1", "target": "real-vm-db-1", "type": "network_flow"} in flow_links


def test_build_real_scp_topology_empty_vm_list_returns_only_vpc():
    """VM이 없으면 서브넷 컨테이너/VM 없이 VPC 노드만(고아 링크 없이) 반환해야 한다."""
    nodes, links = build_real_scp_topology("monos", [])

    assert len(nodes) == 1
    assert nodes[0]["type"] == "vpc"
    assert links == []


def test_build_real_scp_topology_vm_cpu_memory_are_none_not_fabricated():
    """
    버그 회귀 방지(2026-07-20): 실측값(SCP Cloud Monitoring 유료 API) 없이는 VM 노드의
    cpu/memory를 지어내지 않는다 - random 값도, "0%(정상)"으로 오인되는 0.0도 아닌
    None(측정값 없음)이어야 한다. data_source="REAL" 배지 아래 지어낸 데이터를 보여주는
    것은 CEO가 금지한 행위다.
    """
    nodes, _ = build_real_scp_topology("monos", _mock_real_vms())
    vm_nodes = [n for n in nodes if n["type"] == "vm"]

    assert len(vm_nodes) == 3
    for vm in vm_nodes:
        assert vm["cpu"] is None
        assert vm["memory"] is None


def test_build_real_scp_topology_container_cpu_memory_are_none():
    """컨테이너 노드(vpc/subnet)도 측정 대상이 아니므로 cpu/memory가 None으로 통일되어야 한다."""
    nodes, _ = build_real_scp_topology("monos", _mock_real_vms())
    container_nodes = [n for n in nodes if n["type"] in ("vpc", "subnet")]

    assert len(container_nodes) > 0
    for node in container_nodes:
        assert node["cpu"] is None
        assert node["memory"] is None


def test_build_real_scp_topology_is_deterministic():
    """
    동일 입력으로 두 번 호출해도 완전히 동일한 결과가 나와야 한다(순수 함수 - 난수 없음의
    증거). random.randint()로 cpu/memory를 채우던 예전 버그는 호출마다 값이 달라졌다.
    """
    nodes1, links1 = build_real_scp_topology("monos", _mock_real_vms())
    nodes2, links2 = build_real_scp_topology("monos", _mock_real_vms())

    assert nodes1 == nodes2
    assert links1 == links2
