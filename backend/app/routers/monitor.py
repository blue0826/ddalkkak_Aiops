from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.db.session import get_db
from typing import List, Optional
from loguru import logger
from backend.app.core.auth import User, get_current_user, RoleChecker
from backend.app.core.config import settings
from backend.app.schemas.monitor import (
    TopologySchema, MetricPoint, MetricSeriesResponse, LogSchema, EventSchema, CostSchema, TenantSchema,
    ServiceStatusSchema
)
from backend.app.services.simulator import simulator
from backend.app.services import demo_engine
from backend.app.core.license import LicenseManager, check_license_write_gate
from backend.app.core.providers import list_billable_service_keys, list_billable_provider_ids, get_service_display_name
from backend.app.services.finops_service import FinOpsService
from backend.app.services.cloud_adapter import SCPAdapter
from backend.app.repositories.credential import CredentialRepository
from backend.app.repositories.alert import AlertRepository
from backend.app.repositories.tenant import TenantRepository
from backend.app.repositories.tenant_service_setting import TenantServiceSettingRepository
from backend.app.services.credential_service import CredentialService, resolve_scp_credential_fields
from backend.app.services.scp_real_topology import build_real_scp_topology

router = APIRouter()


async def _fetch_scp_credential_fields(db: AsyncSession, tenant_id: str, user_email: str) -> Optional[dict]:
    """
    테넌트의 SCP 자격증명(access_key/secret_key/project_id/endpoint_url)을 조회합니다.
    자격증명이 없거나 조회 중 오류가 발생하면 None (호출측은 SIMULATED로 안전하게 폴백).
    """
    try:
        cred_repo = CredentialRepository(db)
        alert_repo = AlertRepository(db)
        cred_service = CredentialService(cred_repo, alert_repo)
        return await resolve_scp_credential_fields(cred_service, tenant_id, user_email=user_email)
    except Exception as ex:
        logger.error(f"[SCP 자격증명 조회 에러] {str(ex)}")
        return None

@router.get("/license")
def get_license_status():
    """
    현재 플랫폼에 설치된 Ed25519 라이선스 유효성 및 기한 상태를 반환합니다.
    """
    return LicenseManager.get_license_info()

@router.get("/tenants", response_model=List[TenantSchema])
async def get_tenants(
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN"])),
    db: AsyncSession = Depends(get_db)
):
    logger.info("관리자 권한 테넌트 목록 요청")
    if settings.DEPLOYMENT_PROFILE == "dedicated":
        # Dedicated 모드에서는 전용 설치 단일 테넌트만 노출 (데모 워크스페이스 개념 없음)
        return [{"id": "tenant-scp", "name": "삼성 클라우드 고객사 (SCP)", "is_demo": False}]

    # Central 모드 - 실 DB의 Tenant 테이블을 조회하여 등록된 전체 고객사 목록을 반환
    # (MSP 운영 센터 자신을 뜻하는 "system"은 고객사 목록에서 제외)
    tenant_repo = TenantRepository(db)
    tenants = await tenant_repo.get_all()
    return [{"id": t.id, "name": t.name, "is_demo": t.is_demo} for t in tenants if t.id != "system"]

# 참고: POST /tenants(고객사 온보딩), GET /monitor/overview(MSP 전체 보기 집계)는
# 이 파일이 비대해지는 것을 막기 위해 backend/app/routers/tenant_admin.py로 분리되어 있다.
# PUT /tenants/{tenant_id}/services/{service_key}(과금 서비스 동의 토글)도 같은 이유로
# tenant_admin.py에 있다 - 아래 GET /monitor/service-status(조회 전용)만 이 파일에 둔다.

@router.get("/monitor/service-status", response_model=List[ServiceStatusSchema])
async def get_service_status(
    tenant_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    테넌트별 프로바이더 과금(유료) 서비스 활성화 상태를 조회한다. 프론트는 이 응답으로
    "미활성화(과금 서비스)" 안내 배너 노출 여부를 결정한다 - 실제 게이트(외부 API 호출
    차단)는 각 엔드포인트(예: /monitor/metrics)가 독립적으로 수행하며, 이 API는 그
    상태를 정직하게 보여주기만 한다.

    is_demo 테넌트는 실 과금 API를 절대 호출하지 않으므로 DB 설정과 무관하게 항상
    사용 가능(enabled=true, billable=false)으로 보고한다 - 데모 워크스페이스에
    "미활성화" 배너가 뜨는 회귀를 원천 차단한다.
    """
    # 형제 엔드포인트(logs/costs)와 동일한 effective_tenant 해석 패턴
    effective_tenant = current_user.tenant_id
    if current_user.role == "SYSTEM_ADMIN":
        effective_tenant = tenant_id if tenant_id else "system"
    elif tenant_id and tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="다른 테넌트의 서비스 설정에 접근할 수 없습니다."
        )

    is_demo = await demo_engine.resolve_is_demo(db, effective_tenant)
    service_repo = TenantServiceSettingRepository(db)

    results: List[ServiceStatusSchema] = []
    for provider_id in list_billable_provider_ids():
        for service_key in list_billable_service_keys(provider_id):
            display_name = get_service_display_name(provider_id, service_key) or service_key

            if is_demo:
                results.append(ServiceStatusSchema(
                    provider=provider_id,
                    service_key=service_key,
                    display_name=display_name,
                    enabled=True,
                    billable=False,
                    last_status="ok",
                    last_checked_at=None,
                ))
                continue

            row = await service_repo.get(effective_tenant, provider_id, service_key)
            results.append(ServiceStatusSchema(
                provider=provider_id,
                service_key=service_key,
                display_name=display_name,
                enabled=bool(row.enabled) if row else False,
                billable=True,
                last_status=row.last_status if row else "unknown",
                last_checked_at=row.last_checked_at if row else None,
            ))

    return results

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

    # 1-1. 데모 워크스페이스 오버레이 - 실 고객사 경로(simulator/SCP 실연동)는 절대
    # 건드리지 않는다. is_demo 테넌트 단건 조회는 데모 엔진 데이터로 완전히 교체하고,
    # system 통합 뷰는 실 데이터에 전체 데모 고객사 토폴로지를 합산한다. Dedicated
    # 모드는 데모 워크스페이스 개념이 없는 단일 전용 테넌트 배포이므로 건너뛴다.
    if settings.DEPLOYMENT_PROFILE != "dedicated":
        if effective_tenant == "system":
            demo_ids = await demo_engine.list_demo_tenant_ids(db)
            demo_topo = demo_engine.get_topology_multi(demo_ids, provider=provider)
            topo = {
                "nodes": topo["nodes"] + demo_topo["nodes"],
                "links": topo["links"] + demo_topo["links"],
                "data_source": topo.get("data_source", "SIMULATED"),
            }
        elif await demo_engine.resolve_is_demo(db, effective_tenant):
            return demo_engine.get_topology(effective_tenant, provider=provider)

    # 2. SCP 연동 자격증명이 존재하는 경우 실서버 VM으로 토폴로지 동적 대체
    # data_source 기본값은 SIMULATED (스키마 기본값) - 아래에서 실 VM 주입 성공 시에만 REAL로 승격
    if provider == "scp":
        try:
            scp_fields = await _fetch_scp_credential_fields(db, effective_tenant, current_user.email)

            if scp_fields:
                logger.info(f"[SCP 실서버 연동] 엔드포인트: {scp_fields['endpoint_url']}")
                adapter = SCPAdapter(
                    effective_tenant,
                    access_key=scp_fields["access_key"],
                    secret_key=scp_fields["secret_key"],
                    project_id=scp_fields["project_id"],
                    endpoint_url=scp_fields["endpoint_url"],
                )
                # SCP의 fetch_real_vms는 동기 urllib 호출이므로 스레드풀로 위임하여
                # 이벤트루프 블로킹(최대 10초)을 방지한다 (로직 자체는 어댑터 내부 그대로 유지)
                real_vms = await run_in_threadpool(adapter.fetch_real_vms)

                if real_vms:
                    logger.info(f"실 SCP OpenAPI VM {len(real_vms)}개 수집 성공 - 토폴로지 실서버 동적 매핑 수행")

                    # 실서버 연동 시 시뮬레이션용 가상 장비/네트워크 노드 소거 (실제 리소스만 노출).
                    # vpc/subnet도 함께 제외한다 - 아래에서 실 VM의 실제 subnet_name 기준으로
                    # 새 VPC/서브넷 컨테이너를 동적 조립하므로, 구 데모 컨테이너(scp-vpc-01 등,
                    # 실 고객사에는 애초에 존재하지 않음)를 남겨두면 실제로는 텅 빈 고아 컨테이너가 된다.
                    excluded_types = ["nas", "object_storage", "backup", "waf", "firewall", "igw", "nat", "lb", "loadbalancer", "internet", "network_path"]

                    base_nodes = [
                        n for n in topo["nodes"]
                        if n["type"] not in ("vm", "vpc", "subnet") and n["type"].lower() not in excluded_types and not any(k in n["id"].lower() for k in ["vpn", "dedicated", "bypass"])
                    ]
                    base_node_ids = {n["id"] for n in base_nodes}

                    # 제외된 노드가 포함된 링크 제거 (양 끝이 모두 남은 base_nodes에 있을 때만 유지 -
                    # 댕글링 링크가 섞여 들어가지 않도록 화이트리스트 방식으로 검증)
                    base_links = [
                        l for l in topo["links"]
                        if l["source"] in base_node_ids and l["target"] in base_node_ids
                    ]

                    # 실 VM 목록만으로 VPC -> 서브넷(실제 subnet_name 기준 동적 생성) -> VM
                    # 계층을 조립 - 하드코딩된 scp-subnet-pub/priv 부모를 참조하지 않으므로
                    # parent_child 링크가 댕글링되지 않는다 (backend/app/services/scp_real_topology.py)
                    real_nodes, real_links = build_real_scp_topology(effective_tenant, real_vms)

                    # simulator 캐시 등록하여 타 API(메트릭, 로그, 비용) 호출 시 실서버 데이터 전파 연동
                    # (vpc/subnet 컨테이너는 제외 - active_real_vms는 예전과 동일하게 VM 노드만 담는다)
                    simulator.active_real_vms[effective_tenant] = [n for n in real_nodes if n["type"] == "vm"]

                    topo["nodes"] = base_nodes + real_nodes
                    topo["links"] = base_links + real_links
                    # 실 SCP VM 인벤토리 주입 성공 - 이 응답에 한해 정직하게 REAL로 라벨링
                    topo["data_source"] = "REAL"

        except Exception as ex:
            logger.error(f"[동적 토폴로지 주입 에러] {str(ex)}")

    return topo

@router.get("/monitor/metrics", response_model=MetricSeriesResponse)
async def get_metrics(
    node_id: str,
    metric_name: str,
    minutes: int = 60,
    provider: Optional[str] = None,
    tenant_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 형제 엔드포인트(topology/logs/costs)와 동일한 effective_tenant 해석 패턴.
    # metrics는 노드 단위 조회라 topology처럼 "system" 기본값을 두지 않는다 -
    # admin이 tenant_id 없이 부르면 자기 테넌트(대개 "system")로 그대로 둔다.
    effective_tenant = current_user.tenant_id
    if current_user.role == "SYSTEM_ADMIN":
        if tenant_id:
            effective_tenant = tenant_id
    elif tenant_id and tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="다른 테넌트의 메트릭에 접근할 수 없습니다."
        )

    # 데모 워크스페이스 - is_demo 테넌트는 실 SCP 자격증명 조회를 시도할 필요가 없다
    # (데모 고객사는 실 자격증명을 갖지 않는다). 실 고객사 경로는 그대로 아래로 진행한다.
    if await demo_engine.resolve_is_demo(db, effective_tenant):
        return MetricSeriesResponse(
            data_source="DEMO",
            node_id=node_id,
            metric_name=metric_name,
            points=demo_engine.get_metrics(effective_tenant, node_id, metric_name, minutes)
        )

    points = None
    data_source = "SIMULATED"

    # SCP provider 요청 = 이 테넌트의 실제 SCP 자원을 조회하는 것으로 해석된다(이 시점의
    # effective_tenant는 위에서 이미 is_demo 분기를 통과했으므로 실 고객사/시스템 스코프다).
    # 과금 서비스 게이트(CEO 결정 2026-07-20): Cloud Monitoring은 유료 API이므로 운영자가
    # 해당 테넌트에 대해 명시적으로 동의(enabled=true)하지 않았으면 자격증명 조회조차
    # 시도하지 않는다(불필요한 DECRYPT_CREDENTIAL 감사로그 방지).
    #
    # 버그 수정(2026-07-20, CEO 지시): 예전에는 동의 OFF/자격증명 없음/실 호출 성공했지만
    # 이 구간에 샘플 없음(SCP 기본 에이전트리스 수집은 수 시간 간격 - 흔한 케이스) 전부
    # 시뮬레이터 SIMULATED 폴백으로 떨어져, "실 고객사 화면에 지어낸 데이터"가 노출되는
    # 하드룰 위반이었다. provider=="scp" 경로에 들어온 이상 어떤 사유로든 실측 포인트가
    # 없으면 정직한 빈 결과(REAL_EMPTY, points=[])로 응답하고, 이 아래 시뮬레이터 폴백으로
    # 절대 흘러가지 않는다.
    if provider == "scp":
        service_repo = TenantServiceSettingRepository(db)
        service_consent = await service_repo.get(effective_tenant, "scp", "monitoring")
        if service_consent and service_consent.enabled:
            scp_fields = await _fetch_scp_credential_fields(db, effective_tenant, current_user.email)
            if scp_fields:
                adapter = SCPAdapter(
                    effective_tenant,
                    access_key=scp_fields["access_key"],
                    secret_key=scp_fields["secret_key"],
                    project_id=scp_fields["project_id"],
                    endpoint_url=scp_fields["endpoint_url"],
                    # 2026-07-20 P0 실측 확정 호스트 (credential_service.resolve_scp_credential_fields
                    # 참조) - .get()으로 접근해 이 키가 없는 구(舊) 목(mock)에도 안전하게 폴백한다.
                    monitoring_endpoint_url=scp_fields.get("monitoring_endpoint_url"),
                )
                # fetch_metrics_real은 동기 httpx 호출이므로 스레드풀로 위임해 이벤트루프 블로킹을 방지한다
                real_points = await run_in_threadpool(adapter.fetch_metrics_real, node_id, metric_name, minutes)
                # 호출 결과(ok/forbidden/error)를 정직하게 기록 - UI가 "왜 비어있는지" 설명 가능
                await service_repo.record_call_result(effective_tenant, "scp", "monitoring", adapter.last_call_status)
                if real_points:
                    points = real_points
                    data_source = "REAL"
                else:
                    # 실 호출 경로를 탔으나(성공했지만 이 구간에 샘플 없음, 또는 실패) 반환된
                    # 포인트가 없다 - 지어낸 값 없이 정직하게 빈 결과로 응답한다.
                    points = []
                    data_source = "REAL_EMPTY"
            else:
                # 동의는 켜져 있지만 아직 SCP 자격증명이 등록되지 않음 - 실 호출 자체를
                # 시도할 수 없으므로 시뮬레이터로 대체하지 않고 정직한 빈 결과로 응답한다.
                points = []
                data_source = "REAL_EMPTY"
        else:
            logger.info(
                f"[유료 서비스 미동의] SCP Cloud Monitoring 비활성화 상태 - 테넌트: {effective_tenant} - "
                "실 API 호출을 건너뜁니다(시뮬레이터로 대체하지 않음 - 미활성화 안내는 "
                "GET /monitor/service-status가 별도로 담당)."
            )
            points = []
            data_source = "REAL_EMPTY"

    if points is None:
        points = simulator.get_metrics(
            tenant_id=effective_tenant,
            node_id=node_id,
            metric_name=metric_name,
            minutes=minutes
        )
        data_source = "SIMULATED"

    return MetricSeriesResponse(
        data_source=data_source,
        node_id=node_id,
        metric_name=metric_name,
        points=points
    )

@router.get("/monitor/logs", response_model=List[LogSchema])
async def get_logs(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
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

    if await demo_engine.resolve_is_demo(db, effective_tenant):
        return demo_engine.get_logs(effective_tenant, limit=limit, provider=provider)
    return simulator.get_logs(tenant_id=effective_tenant, limit=limit, provider=provider)

@router.get("/monitor/events", response_model=List[EventSchema])
async def get_events(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
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

    if await demo_engine.resolve_is_demo(db, effective_tenant):
        return demo_engine.get_events(effective_tenant, provider=provider)
    return simulator.get_events(tenant_id=effective_tenant, provider=provider)

@router.get("/monitor/costs", response_model=CostSchema)
async def get_costs(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
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

    if await demo_engine.resolve_is_demo(db, effective_tenant):
        return demo_engine.get_costs(effective_tenant, provider=provider)
    return simulator.get_costs(tenant_id=effective_tenant, provider=provider)

@router.get("/monitor/costs/anomalies")
async def get_cost_anomalies(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    logger.info(f"FinOps 비용 이상 탐지 분석 요청 수신 - provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)

    if settings.DEPLOYMENT_PROFILE != "dedicated" and await demo_engine.resolve_is_demo(db, effective_tenant):
        return demo_engine.get_cost_anomalies(effective_tenant, provider=provider)

    costs = simulator.get_costs(effective_tenant, provider=provider)
    anomalies = FinOpsService.detect_cost_anomalies(costs.get("daily_trends", []))
    return anomalies

@router.get("/monitor/costs/rightsizing")
async def get_rightsizing_recommendations(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    logger.info(f"FinOps 리소스 Rightsizing 상세 추천 요청 수신 - provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)

    if settings.DEPLOYMENT_PROFILE != "dedicated" and await demo_engine.resolve_is_demo(db, effective_tenant):
        return demo_engine.get_rightsizing(effective_tenant, provider=provider)

    topo = simulator.get_topology(effective_tenant, provider=provider)
    recommendations = FinOpsService.get_dynamic_rightsizing(topo.get("nodes", []), simulator)
    return recommendations

@router.get("/monitor/predictions")
async def get_disk_predictions(
    node_id: Optional[str] = "scp-vm-app-01",
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    logger.info(f"AIOps 디스크 용량 포화 예측 조회 - 노드: {node_id}, provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)

    if settings.DEPLOYMENT_PROFILE != "dedicated" and await demo_engine.resolve_is_demo(db, effective_tenant):
        return demo_engine.get_predictions(effective_tenant, node_id=node_id, provider=provider)

    # 기본 node_id가 들어왔고 실시간 연동 수집된 실제 가상서버들이 있다면 첫 번째 서버 ID로 치환
    if node_id == "scp-vm-app-01" and provider == "scp":
        real_vms = simulator.active_real_vms.get(effective_tenant, [])
        if real_vms:
            node_id = real_vms[0]["id"]

    return simulator.get_disk_prediction_data(effective_tenant, node_id)

@router.get("/monitor/network/paths")
async def get_network_paths(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    logger.info(f"AIOps 이중화 회선 경로 상태 조회 - provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)

    if settings.DEPLOYMENT_PROFILE != "dedicated" and await demo_engine.resolve_is_demo(db, effective_tenant):
        return demo_engine.get_network_paths(effective_tenant)
    return simulator.get_network_paths(effective_tenant)

@router.post("/monitor/network/bypass")
def trigger_network_bypass(
    action: str,  # "trigger" 또는 "recover"
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(RoleChecker(["SYSTEM_ADMIN", "TENANT_OPERATOR"]))
):
    logger.info(f"네트워크 회선 자동 우회 액션 지시: {action}, provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)
    if action == "trigger":
        return simulator.trigger_network_incident(effective_tenant)
    else:
        return simulator.recover_network(effective_tenant)

@router.get("/monitor/security/blocked")
async def get_blocked_ips(
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    logger.info(f"SecOps SOAR 차단 공격자 IP 리스트 조회 - provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)

    if settings.DEPLOYMENT_PROFILE != "dedicated" and await demo_engine.resolve_is_demo(db, effective_tenant):
        return demo_engine.get_blocked_ips(effective_tenant)
    return simulator.get_blocked_ips(effective_tenant)

@router.post("/monitor/security/soar")
def trigger_soar_block(
    ip: str,
    tenant_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(RoleChecker(["SYSTEM_ADMIN", "TENANT_OPERATOR"]))
):
    logger.info(f"SecOps SOAR 수동 차단 실행: {ip}, provider: {provider}")
    effective_tenant = "tenant-scp" if settings.DEPLOYMENT_PROFILE == "dedicated" else (tenant_id if tenant_id and current_user.role == "SYSTEM_ADMIN" else current_user.tenant_id)
    simulator.block_ip_address(effective_tenant, ip)
    return {"status": "SUCCESS", "message": f"IP {ip} blocked in security group by SOAR."}
