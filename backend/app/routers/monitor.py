from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.db.session import get_db
from typing import List, Optional
import random
from loguru import logger
from backend.app.core.auth import User, get_current_user, RoleChecker
from backend.app.core.config import settings
from backend.app.schemas.monitor import TopologySchema, MetricPoint, LogSchema, EventSchema, CostSchema, TenantSchema
from backend.app.services.simulator import simulator
from backend.app.core.license import LicenseManager, check_license_write_gate
from backend.app.services.finops_service import FinOpsService

router = APIRouter()

@router.get("/license")
def get_license_status():
    """
    현재 플랫폼에 설치된 Ed25519 라이선스 유효성 및 기한 상태를 반환합니다.
    """
    return LicenseManager.get_license_info()

@router.get("/tenants", response_model=List[TenantSchema])
def get_tenants(current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN"]))):
    logger.info("관리자 권한 테넌트 목록 요청")
    if settings.DEPLOYMENT_PROFILE == "dedicated":
        # Dedicated 모드에서는 전용 설치 단일 테넌트만 노출
        return [{"id": "tenant-scp", "name": "삼성 클라우드 고객사 (SCP)"}]
        
    return [
        {"id": "tenant-scp", "name": "삼성 클라우드 고객사 (SCP)"},
        {"id": "tenant-aws", "name": "AWS 고객사 (AWS)"}
    ]

@router.get("/monitor/topology", response_model=TopologySchema)
async def get_topology(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if settings.DEPLOYMENT_PROFILE == "dedicated":
        # Dedicated 모드에서는 무조건 전용 테넌트 및 scp 고정
        effective_tenant = "tenant-scp"
        provider = "scp"
    else:
        effective_tenant = current_user.tenant_id
        if current_user.role == "SYSTEM_ADMIN":
            effective_tenant = tenant_id if tenant_id else "system"
        elif tenant_id and tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="다른 테넌트의 데이터에 접근할 수 없습니다."
            )

    # 1. 시뮬레이터 기본 토폴로지 데이터 획득
    topo = simulator.get_topology(effective_tenant, provider=provider)

    # 2. SCP 연동 자격증명이 존재하는 경우 실서버 VM으로 토폴로지 동적 대체
    if provider == "scp":
        from backend.app.repositories.credential import CredentialRepository
        from backend.app.services.credential_service import CredentialService
        from backend.app.repositories.alert import AlertRepository
        import json

        try:
            cred_repo = CredentialRepository(db)
            alert_repo = AlertRepository(db)
            service = CredentialService(cred_repo, alert_repo)
            
            # 해당 테넌트 자격증명 목록 조회
            creds = await service.list_credentials(effective_tenant)
            scp_cred = next((c for c in creds if c.provider == "scp"), None)
            
            if scp_cred:
                # 복호화 후 실서버 VM 목록 조회
                decrypted = await service.get_decrypted_credential(scp_cred.id, effective_tenant)
                if decrypted and decrypted.get("decrypted_auth_data"):
                    auth_info = json.loads(decrypted["decrypted_auth_data"])
                    ak = auth_info.get("access_key")
                    sk = auth_info.get("secret_key")
                    prj = auth_info.get("project_id")
                    # DB에 저장된 정확한 엔드포인트 URL 사용 (scp_env + scp_region 기반 자동 조합된 값)
                    endpoint = auth_info.get("endpoint_url")
                    if not endpoint:
                        scp_env = auth_info.get("scp_env", "e")
                        scp_region = auth_info.get("scp_region", "kr-west1")
                        endpoint = f"https://virtualserver.{scp_region}.{scp_env}.samsungsdscloud.com"
                    logger.info(f"[SCP 실서버 연동] 엔드포인트: {endpoint}")
                    if ak and sk and prj:
                        from backend.app.services.cloud_adapter import SCPAdapter
                        adapter = SCPAdapter(effective_tenant, access_key=ak, secret_key=sk, project_id=prj, endpoint_url=endpoint)
                        real_vms = adapter.fetch_real_vms()
                        
                        if real_vms:
                            logger.info(f"실 SCP OpenAPI VM {len(real_vms)}개 수집 성공 - 토폴로지 실서버 동적 매핑 수행")

                            # 실서버 연동 시 시뮬레이션용 가상 장비/네트워크 노드 소거 (실제 리소스만 노출)
                            excluded_types = ["nas", "object_storage", "backup", "waf", "firewall", "igw", "nat", "lb", "loadbalancer", "internet", "network_path"]
                            
                            # 가상 장비 노드 제외 (VPC와 Subnet만 기저 노드로 유지)
                            base_nodes = [
                                n for n in topo["nodes"] 
                                if n["type"] != "vm" and n["type"].lower() not in excluded_types and not any(k in n["id"].lower() for k in ["vpn", "dedicated", "bypass"])
                            ]
                            
                            # 제외된 노드가 포함된 링크 제거
                            base_links = [
                                l for l in topo["links"] 
                                if not (
                                    l["source"].startswith("scp-vm-") or l["target"].startswith("scp-vm-") or
                                    any(k in l["source"].lower() or k in l["target"].lower() for k in excluded_types + ["vpn", "dedicated"])
                                )
                            ]

                            real_nodes = []
                            real_links = []

                            for idx, vm in enumerate(real_vms):
                                # 실제 SCP API 응답 필드명 사용
                                vm_id = vm.get("id", f"scp-real-vm-{idx}")
                                vm_name = vm.get("name", f"real-vm-{idx}")
                                vm_state = vm.get("state", "ACTIVE").upper()

                                # IP / 서브넷 추출: addresses[0].ip_addresses[0].ip_address
                                addresses = vm.get("addresses", [])
                                vm_ip = "N/A"
                                subnet_name = ""
                                if addresses:
                                    ip_list = addresses[0].get("ip_addresses", [])
                                    if ip_list:
                                        vm_ip = ip_list[0].get("ip_address", "N/A")
                                    subnet_name = addresses[0].get("subnet_name", "").lower()

                                # 서브넷명 기반 계층 분류
                                # tfPublicmonos → 퍼블릭(DMZ), tfPrivatemonos → 프라이빗(App/DB)
                                if "public" in subnet_name:
                                    tier = "web"
                                    parent_node = "scp-subnet-pub"
                                elif "private" in subnet_name:
                                    tier = "app"
                                    parent_node = "scp-subnet-priv"
                                else:
                                    tier = "app"
                                    parent_node = "scp-subnet-priv"

                                # 상태 매핑 (ACTIVE → running)
                                status_map = {"ACTIVE": "running", "SHUTOFF": "stopped", "ERROR": "warning"}
                                node_status = status_map.get(vm_state, "running")

                                # security_groups로 역할 추정
                                sec_groups = [sg.get("name", "").lower() for sg in vm.get("security_groups", [])]
                                if any("db" in sg or "sql" in sg or "maria" in sg or "redis" in sg for sg in sec_groups):
                                    tier = "db"
                                    parent_node = "scp-subnet-priv"
                                elif "redis" in vm_name.lower() or "db" in vm_name.lower() or "maria" in vm_name.lower():
                                    tier = "db"
                                    parent_node = "scp-subnet-priv"

                                node_obj = {
                                    "id": vm_id,
                                    "label": f"{vm_name}\n({vm_ip})",
                                    "type": "vm",
                                    "tier": tier,
                                    "status": node_status,
                                    "provider": "scp",
                                    "tenant_id": effective_tenant,
                                    "subnet": subnet_name,
                                    "cpu": float(random.randint(15, 80)),
                                    "memory": float(random.randint(20, 85))
                                }
                                real_nodes.append(node_obj)

                                # 서브넷 부모 연결
                                real_links.append({
                                    "source": parent_node,
                                    "target": vm_id,
                                    "type": "parent_child"
                                })

                            # --- 계층 간 논리적 트래픽 흐름 링크 (web -> app -> db) 동적 생성 ---
                            web_vms = [n for n in real_nodes if n["tier"] == "web"]
                            app_vms = [n for n in real_nodes if n["tier"] == "app"]
                            db_vms = [n for n in real_nodes if n["tier"] == "db"]

                            # 1. Web -> App 연결 (모든 Web에서 첫 번째 App으로, 혹은 순차적으로)
                            if web_vms and app_vms:
                                for idx, w_vm in enumerate(web_vms):
                                    target_app = app_vms[idx % len(app_vms)]
                                    real_links.append({
                                        "source": w_vm["id"],
                                        "target": target_app["id"],
                                        "type": "network_flow"
                                    })
                            
                            # 2. App -> DB 연결
                            if app_vms and db_vms:
                                for idx, a_vm in enumerate(app_vms):
                                    target_db = db_vms[idx % len(db_vms)]
                                    real_links.append({
                                        "source": a_vm["id"],
                                        "target": target_db["id"],
                                        "type": "network_flow"
                                    })

                            # simulator 캐시 등록하여 타 API(메트릭, 로그, 비용) 호출 시 실서버 데이터 전파 연동
                            simulator.active_real_vms[effective_tenant] = real_nodes

                            topo["nodes"] = base_nodes + real_nodes


                            topo["links"] = base_links + real_links

        except Exception as ex:
            logger.error(f"[동적 토폴로지 주입 에러] {str(ex)}")

    return topo

@router.get("/monitor/metrics", response_model=List[MetricPoint])
def get_metrics(
    node_id: str,
    metric_name: str,
    minutes: int = 60,
    current_user: User = Depends(get_current_user)
):
    return simulator.get_metrics(
        tenant_id=current_user.tenant_id,
        node_id=node_id,
        metric_name=metric_name,
        minutes=minutes
    )

@router.get("/monitor/logs", response_model=List[LogSchema])
def get_logs(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    if settings.DEPLOYMENT_PROFILE == "dedicated":
        return simulator.get_logs(tenant_id="tenant-scp", limit=limit, provider="scp")

    effective_tenant = current_user.tenant_id
    if current_user.role == "SYSTEM_ADMIN":
        effective_tenant = tenant_id if tenant_id else "system"
    elif tenant_id and tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="다른 테넌트의 로그에 접근할 수 없습니다."
        )
    return simulator.get_logs(tenant_id=effective_tenant, limit=limit, provider=provider)

@router.get("/monitor/events", response_model=List[EventSchema])
def get_events(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if settings.DEPLOYMENT_PROFILE == "dedicated":
        return simulator.get_events(tenant_id="tenant-scp", provider="scp")

    effective_tenant = current_user.tenant_id
    if current_user.role == "SYSTEM_ADMIN":
        effective_tenant = tenant_id if tenant_id else "system"
    elif tenant_id and tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="다른 테넌트의 이벤트에 접근할 수 없습니다."
        )
    return simulator.get_events(tenant_id=effective_tenant, provider=provider)

@router.get("/monitor/costs", response_model=CostSchema)
def get_costs(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if settings.DEPLOYMENT_PROFILE == "dedicated":
        return simulator.get_costs(tenant_id="tenant-scp", provider="scp")

    effective_tenant = current_user.tenant_id
    if current_user.role == "SYSTEM_ADMIN":
        effective_tenant = tenant_id if tenant_id else "system"
    elif tenant_id and tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="다른 테넌트의 비용 데이터에 접근할 수 없습니다."
        )
    return simulator.get_costs(tenant_id=effective_tenant, provider=provider)

@router.get("/monitor/costs/anomalies")
def get_cost_anomalies(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    logger.info(f"FinOps 비용 이상 탐지 분석 요청 수신 - provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)
    
    costs = simulator.get_costs(effective_tenant, provider=provider)
    anomalies = FinOpsService.detect_cost_anomalies(costs.get("daily_trends", []))
    return anomalies

@router.get("/monitor/costs/rightsizing")
def get_rightsizing_recommendations(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    logger.info(f"FinOps 리소스 Rightsizing 상세 추천 요청 수신 - provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)
    
    topo = simulator.get_topology(effective_tenant, provider=provider)
    recommendations = FinOpsService.get_dynamic_rightsizing(topo.get("nodes", []), simulator)
    return recommendations

@router.get("/monitor/predictions")
def get_disk_predictions(
    node_id: Optional[str] = "scp-vm-app-01",
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    logger.info(f"AIOps 디스크 용량 포화 예측 조회 - 노드: {node_id}, provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)
    
    # 기본 node_id가 들어왔고 실시간 연동 수집된 실제 가상서버들이 있다면 첫 번째 서버 ID로 치환
    if node_id == "scp-vm-app-01" and provider == "scp":
        real_vms = simulator.active_real_vms.get(effective_tenant, [])
        if real_vms:
            node_id = real_vms[0]["id"]
            
    return simulator.get_disk_prediction_data(effective_tenant, node_id)

@router.get("/monitor/network/paths")
def get_network_paths(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    logger.info(f"AIOps 이중화 회선 경로 상태 조회 - provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)
    return simulator.get_network_paths(effective_tenant)

@router.post("/monitor/network/bypass")
def trigger_network_bypass(
    action: str,  # "trigger" 또는 "recover"
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    logger.info(f"네트워크 회선 자동 우회 액션 지시: {action}, provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)
    if action == "trigger":
        return simulator.trigger_network_incident(effective_tenant)
    else:
        return simulator.recover_network(effective_tenant)

@router.get("/monitor/security/blocked")
def get_blocked_ips(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    logger.info(f"SecOps SOAR 차단 공격자 IP 리스트 조회 - provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)
    return simulator.get_blocked_ips(effective_tenant)

@router.post("/monitor/security/soar")
def trigger_soar_block(
    ip: str,
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    logger.info(f"SecOps SOAR 수동 차단 실행: {ip}, provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)
    simulator.block_ip_address(effective_tenant, ip)
    return {"status": "SUCCESS", "message": f"IP {ip} blocked in security group by SOAR."}
