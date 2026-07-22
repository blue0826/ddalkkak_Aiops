"""
실 SCP OpenAPI VM 인벤토리 -> 토폴로지 노드/링크 매핑기.

버그 배경: backend/app/routers/monitor.py의 실 VM 주입 경로가 각 VM을 하드코딩된
scp-subnet-pub/scp-subnet-priv 부모 노드에 parent_child로 연결했는데, 그 컨테이너
노드는 구 데모 시뮬레이터(load_sample_topology, 테스트 전용)에만 존재했다. 실
고객사 테넌트는 시뮬레이터 기저 토폴로지가 비어 있으므로(InfrastructureSimulator
CEO 지시 - 프로덕션에는 가짜 노드 없음) 그 부모 노드가 존재하지 않아 모든
parent_child 링크가 댕글링되고, 프론트 레이아웃 엔진(topologyLayout.ts)이
provider->VPC->subnet->tier 계층을 못 찾아 토폴로지 맵이 깨졌다.

이 모듈은 실 VM 목록만으로 VPC 1개 + (VM들이 실제로 속한 고유 서브넷명당) 서브넷
컨테이너를 동적으로 조립해, 모든 parent_child 링크가 실존 노드를 가리키게 한다.
demo/topology_data.py와 동일한 필드 규약(id/label/type/status/provider/tenant_id/
cpu/memory/tier/subnet/region, 링크의 parent_child/network_flow)을 따른다.

순수 함수 - 실 SCP API를 호출하지 않으므로 유닛 테스트 가능하다.

버그 배경(2026-07-20): 이 모듈이 모든 실 VM 노드에 random.randint()로 지어낸 cpu/memory
값을 채워 넣고 있었다 - 실측값은 SCP Cloud Monitoring(유료 API, 현재 테넌트 monos는
동의 OFF)이 있어야만 얻을 수 있는데, data_source="REAL" 배지 아래 지어낸 숫자가
운영자에게 실측치처럼 노출되었다(CEO 금지 사항: 실 고객사에 지어낸 데이터 표시 금지).
실측값이 없을 때는 0.0(= "0% 정상"으로 오인 가능)도 아니고 지어낸 난수도 아닌 None을
반환한다 - 컨테이너 노드(vpc/subnet)도 애초에 측정 대상이 아니므로 동일하게 None으로
통일한다("측정값 없음"을 한 가지 방식으로만 표현).
"""
import re
from typing import Any, Dict, List, Optional, Tuple

from backend.app.core.providers import get_provider

# 상태 매핑 (SCP OpenAPI 상태값 -> 토폴로지 표준 상태값)
_STATUS_MAP = {"ACTIVE": "running", "SHUTOFF": "stopped", "ERROR": "warning"}


def _sanitize_id_segment(value: str) -> str:
    """서브넷명을 노드 id에 안전하게 쓸 수 있도록 슬러그화한다(영숫자 외 문자는 '-')."""
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "default"


def _subnet_kind_label(subnet_name: str) -> str:
    """서브넷명에 public/private 키워드가 있으면 한국어 구분 라벨을, 없으면 '일반'을 반환한다."""
    if "public" in subnet_name:
        return "퍼블릭"
    if "private" in subnet_name:
        return "프라이빗"
    return "일반"


def _extract_vm_ip_and_subnet(vm: Dict[str, Any]) -> Tuple[str, str]:
    """실 SCP VM 응답에서 (IP, 서브넷명(소문자))을 추출한다. addresses[0].ip_addresses[0].ip_address 규약."""
    addresses = vm.get("addresses", [])
    vm_ip = "N/A"
    subnet_name = ""
    if addresses:
        ip_list = addresses[0].get("ip_addresses", [])
        if ip_list:
            vm_ip = ip_list[0].get("ip_address", "N/A")
        subnet_name = addresses[0].get("subnet_name", "").lower()
    return vm_ip, subnet_name


def _classify_tier(vm_name: str, subnet_name: str, sec_groups: List[str]) -> str:
    """서브넷명(공개/비공개) 기반 1차 분류 후, 보안그룹/VM명으로 db 계층을 재분류한다."""
    if "private" in subnet_name:
        tier = "app"
    elif "public" in subnet_name:
        tier = "web"
    else:
        tier = "app"

    if any("db" in sg or "sql" in sg or "maria" in sg or "redis" in sg for sg in sec_groups):
        tier = "db"
    elif "redis" in vm_name.lower() or "db" in vm_name.lower() or "maria" in vm_name.lower():
        tier = "db"

    return tier


def build_real_scp_topology(
    tenant_id: str,
    real_vms: List[Dict[str, Any]],
    region: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    실 SCP OpenAPI fetch_real_vms() 원본 응답 목록으로부터 VPC -> 서브넷 -> VM
    계층의 토폴로지 노드/링크를 조립한다.

    - VPC 컨테이너 노드 1개(테넌트별 고유 id `scp-vpc-<tenant_id>`)
    - VM들의 실제 subnet_name 별로(고유값 1개당 1개) 서브넷 컨테이너 노드 생성
      (하드코딩된 scp-subnet-pub/priv 미사용 - 실 데이터 기준 동적 생성이라
      parent_child 링크가 절대 댕글링되지 않는다)
    - VPC -> 각 서브넷, 각 서브넷 -> 그 서브넷 소속 VM으로 parent_child 링크 연결
    - web -> app -> db 계층형 network_flow 링크는 기존 라우터 로직 그대로 유지
    - region은 모든 신규 노드(VPC/서브넷/VM)에 동일하게 부여

    실 SCP API를 호출하지 않는 순수 함수이므로 유닛 테스트에서 real_vms에 mock
    데이터를 넣어 검증할 수 있다.
    """
    resolved_region = region or (get_provider("scp") or {}).get("default_region", "kr-west1")

    vpc_id = f"scp-vpc-{tenant_id}"
    vpc_node: Dict[str, Any] = {
        "id": vpc_id,
        "label": f"{tenant_id} SCP VPC",
        "type": "vpc",
        "status": "running",
        "provider": "scp",
        "tenant_id": tenant_id,
        # 컨테이너 노드는 측정 대상이 아니다 - None(측정값 없음), 0.0(오인 가능한 "정상")이 아니다.
        "cpu": None,
        "memory": None,
        "region": resolved_region,
    }

    vm_nodes: List[Dict[str, Any]] = []
    parent_links: List[Dict[str, Any]] = []
    # subnet_key(슬러그) -> {"id":, "label":, "raw_name":} — 등장 순서 보존
    subnet_meta: "Dict[str, Dict[str, str]]" = {}

    for idx, vm in enumerate(real_vms):
        vm_id = vm.get("id", f"scp-real-vm-{idx}")
        vm_name = vm.get("name", f"real-vm-{idx}")
        vm_state = vm.get("state", "ACTIVE").upper()
        vm_ip, subnet_name = _extract_vm_ip_and_subnet(vm)

        sec_groups = [sg.get("name", "").lower() for sg in vm.get("security_groups", [])]
        tier = _classify_tier(vm_name, subnet_name, sec_groups)
        node_status = _STATUS_MAP.get(vm_state, "running")

        subnet_key = _sanitize_id_segment(subnet_name) if subnet_name else "default"
        subnet_node_id = f"scp-subnet-{tenant_id}-{subnet_key}"
        if subnet_key not in subnet_meta:
            display_name = subnet_name or "미지정"
            subnet_meta[subnet_key] = {
                "id": subnet_node_id,
                "label": f"{_subnet_kind_label(subnet_name)} 서브넷 ({display_name})",
                "raw_name": subnet_name,
            }

        vm_nodes.append({
            "id": vm_id,
            "label": f"{vm_name}\n({vm_ip})",
            "type": "vm",
            "tier": tier,
            "status": node_status,
            "provider": "scp",
            "tenant_id": tenant_id,
            "subnet": subnet_name,
            "region": resolved_region,
            # 실측값 없음(유료 Cloud Monitoring API 미동의) - 지어낸 값 대신 정직하게 None.
            # 프론트는 null cpu/memory를 "미측정"으로 표시하며, 이 None이 상태(status) 판정에
            # 영향을 주지 않는다 - node_status는 바로 위에서 실 VM 상태(vm_state)로만 결정된다.
            "cpu": None,
            "memory": None,
        })
        parent_links.append({"source": subnet_node_id, "target": vm_id, "type": "parent_child"})

    subnet_nodes: List[Dict[str, Any]] = []
    vpc_links: List[Dict[str, Any]] = []
    for meta in subnet_meta.values():
        subnet_nodes.append({
            "id": meta["id"],
            "label": meta["label"],
            "type": "subnet",
            "status": "running",
            "provider": "scp",
            "tenant_id": tenant_id,
            # 컨테이너 노드는 측정 대상이 아니다 - None(측정값 없음)으로 vpc_node와 동일하게 통일.
            "cpu": None,
            "memory": None,
            "region": resolved_region,
            "subnet": meta["raw_name"],
        })
        vpc_links.append({"source": vpc_id, "target": meta["id"], "type": "parent_child"})

    # --- 계층 간 논리적 트래픽 흐름 링크 (web -> app -> db) ---
    web_vms = [n for n in vm_nodes if n["tier"] == "web"]
    app_vms = [n for n in vm_nodes if n["tier"] == "app"]
    db_vms = [n for n in vm_nodes if n["tier"] == "db"]

    flow_links: List[Dict[str, Any]] = []
    if web_vms and app_vms:
        for idx, w_vm in enumerate(web_vms):
            target_app = app_vms[idx % len(app_vms)]
            flow_links.append({"source": w_vm["id"], "target": target_app["id"], "type": "network_flow"})
    if app_vms and db_vms:
        for idx, a_vm in enumerate(app_vms):
            target_db = db_vms[idx % len(db_vms)]
            flow_links.append({"source": a_vm["id"], "target": target_db["id"], "type": "network_flow"})

    nodes = [vpc_node] + subnet_nodes + vm_nodes
    links = vpc_links + parent_links + flow_links
    return nodes, links
