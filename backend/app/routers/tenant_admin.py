"""
MSP 관리자 전용 - 고객사(테넌트) 온보딩 및 전체 보기 집계 라우터.

멀티테넌트 확장(여러 고객사 등록 + 전체 대시보드 노출)을 위해 신설된 두 엔드포인트를 담는다.
monitor.py가 비대해지는 것을 막기 위해 별도 파일로 분리했다 (기존 monitor.py의 GET /tenants,
/monitor/* 엔드포인트는 그대로 monitor.py에 남아있다).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from loguru import logger

from backend.app.db.session import get_db
from backend.app.core.auth import User, RoleChecker
from backend.app.core.license import check_license_write_gate
from backend.app.core.providers import list_billable_service_keys, get_service_display_name
from backend.app.models.base import AuditLog
from backend.app.repositories.tenant import TenantRepository
from backend.app.repositories.incident import IncidentRepository
from backend.app.repositories.alert import AlertRepository
from backend.app.repositories.credential import CredentialRepository
from backend.app.repositories.tenant_service_setting import TenantServiceSettingRepository
from backend.app.schemas.monitor import (
    TenantSchema, TenantCreateRequest, TenantUpdateRequest, TenantOverviewSchema,
    ServiceStatusSchema, ServiceEnabledUpdateRequest
)
from backend.app.services.simulator import simulator
from backend.app.services import demo_engine

# 과금 서비스 동의 토글은 현재 SCP만 대상이다(비즈니스 컨텍스트: SCP Cloud Monitoring/
# Cloud Logging이 유료 서비스). 프로바이더별 옵트인이 필요해지면 이 상수를 경로/쿼리
# 파라미터로 확장하면 된다.
_TENANT_SERVICE_PROVIDER = "scp"

router = APIRouter()


@router.post(
    "/tenants",
    response_model=TenantSchema,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(check_license_write_gate)]
)
async def create_tenant(
    payload: TenantCreateRequest,
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN"])),
    db: AsyncSession = Depends(get_db)
):
    """
    신규 고객사(테넌트) 온보딩 API. 중복 ID는 409로 거부하며, 생성 성공 시 감사 로그를 남긴다.
    """
    logger.info(f"신규 고객사 온보딩 API 요청 수신 - ID: {payload.id}, Name: {payload.name}")
    tenant_repo = TenantRepository(db)

    existing = await tenant_repo.get_by_id(payload.id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"이미 존재하는 테넌트 ID입니다: {payload.id}"
        )

    tenant = await tenant_repo.create(payload.id, payload.name)

    alert_repo = AlertRepository(db)
    await alert_repo.create_audit_log(AuditLog(
        tenant_id=payload.id,
        user_email=current_user.email,
        action="create_tenant",
        resource_type="tenant",
        resource_id=payload.id,
        details=f"신규 고객사 온보딩: {payload.name}"
    ))

    return {"id": tenant.id, "name": tenant.name, "is_demo": tenant.is_demo}


@router.patch(
    "/tenants/{tenant_id}",
    response_model=TenantSchema,
    dependencies=[Depends(check_license_write_gate)]
)
async def update_tenant(
    tenant_id: str,
    payload: TenantUpdateRequest,
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN"])),
    db: AsyncSession = Depends(get_db)
):
    """
    고객사(테넌트) 이름 수정 API. id는 불변이며 name만 수정한다. 대상이 없으면 404.
    """
    logger.info(f"고객사 수정 API 요청 수신 - ID: {tenant_id}, name: {payload.name}")
    tenant_repo = TenantRepository(db)

    tenant = await tenant_repo.update_name(tenant_id, payload.name)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"존재하지 않는 테넌트 ID입니다: {tenant_id}"
        )

    alert_repo = AlertRepository(db)
    await alert_repo.create_audit_log(AuditLog(
        tenant_id=tenant_id,
        user_email=current_user.email,
        action="update_tenant",
        resource_type="tenant",
        resource_id=tenant_id,
        details=f"고객사 이름 수정: {tenant.name}"
    ))

    return {"id": tenant.id, "name": tenant.name, "is_demo": tenant.is_demo}


@router.put(
    "/tenants/{tenant_id}/services/{service_key}",
    response_model=ServiceStatusSchema,
    dependencies=[Depends(check_license_write_gate)]
)
async def update_tenant_service(
    tenant_id: str,
    service_key: str,
    payload: ServiceEnabledUpdateRequest,
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN"])),
    db: AsyncSession = Depends(get_db)
):
    """
    고객사(테넌트)별 SCP 과금 서비스(Cloud Monitoring/Cloud Logging) 동의 토글 API.

    CEO 결정(2026-07-20): 운영자가 명시적으로 켜기 전에는 백엔드가 해당 유료 API를
    호출하지 않는다(기본 OFF). SYSTEM_ADMIN 전용이며, 대상 테넌트가 없으면 404,
    등록되지 않은 service_key는 400으로 거부한다.
    """
    logger.info(f"테넌트 과금 서비스 동의 설정 API 요청 - 테넌트: {tenant_id}, 서비스: {service_key}, enabled: {payload.enabled}")

    tenant_repo = TenantRepository(db)
    tenant = await tenant_repo.get_by_id(tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"존재하지 않는 테넌트 ID입니다: {tenant_id}"
        )

    known_service_keys = list_billable_service_keys(_TENANT_SERVICE_PROVIDER)
    if service_key not in known_service_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"알 수 없는 서비스 키입니다: {service_key} (허용값: {', '.join(known_service_keys)})"
        )

    service_repo = TenantServiceSettingRepository(db)
    row = await service_repo.set_enabled(tenant_id, _TENANT_SERVICE_PROVIDER, service_key, payload.enabled)

    alert_repo = AlertRepository(db)
    await alert_repo.create_audit_log(AuditLog(
        tenant_id=tenant_id,
        user_email=current_user.email,
        action="update_tenant_service",
        resource_type="tenant_service_setting",
        resource_id=f"{_TENANT_SERVICE_PROVIDER}:{service_key}",
        details=f"과금 서비스 동의 설정 변경 - {_TENANT_SERVICE_PROVIDER}/{service_key}: enabled={payload.enabled}"
    ))

    return ServiceStatusSchema(
        provider=_TENANT_SERVICE_PROVIDER,
        service_key=service_key,
        display_name=get_service_display_name(_TENANT_SERVICE_PROVIDER, service_key) or service_key,
        enabled=row.enabled,
        billable=True,
        last_status=row.last_status,
        last_checked_at=row.last_checked_at,
    )


@router.delete(
    "/tenants/{tenant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(check_license_write_gate)]
)
async def delete_tenant(
    tenant_id: str,
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN"])),
    db: AsyncSession = Depends(get_db)
):
    """
    고객사(테넌트) 삭제 API. system 테넌트(MSP 운영 센터)는 삭제할 수 없다.

    고아 레코드 방지를 위해 해당 테넌트의 자격증명 -> 인시던트(+타임라인) -> 경보 룰을
    먼저 일괄 삭제한 뒤 테넌트 본체를 삭제한다. 감사 로그는 테넌트 레코드가 아직
    존재하는 시점(삭제 직전)에 기록해 audit_log.tenant_id FK 참조 무결성을 지킨다.
    """
    logger.info(f"고객사 삭제 API 요청 수신 - ID: {tenant_id}")

    if tenant_id == "system":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="system 테넌트(MSP 운영 센터)는 삭제할 수 없습니다."
        )

    tenant_repo = TenantRepository(db)
    tenant = await tenant_repo.get_by_id(tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"존재하지 않는 테넌트 ID입니다: {tenant_id}"
        )

    credential_repo = CredentialRepository(db)
    incident_repo = IncidentRepository(db)
    alert_repo = AlertRepository(db)

    deleted_credentials = await credential_repo.delete_all_by_tenant(tenant_id)
    deleted_incidents = await incident_repo.delete_all_by_tenant(tenant_id)
    deleted_rules = await alert_repo.delete_all_rules_by_tenant(tenant_id)

    await alert_repo.create_audit_log(AuditLog(
        tenant_id=tenant_id,
        user_email=current_user.email,
        action="DELETE_TENANT",
        resource_type="tenant",
        resource_id=tenant_id,
        details=(
            f"고객사 삭제 완료: {tenant.name} (연쇄 삭제 - 자격증명 {deleted_credentials}건, "
            f"인시던트 {deleted_incidents}건, 경보 룰 {deleted_rules}건)"
        )
    ))

    await tenant_repo.delete(tenant_id)
    logger.info(
        f"고객사 삭제 완료 - ID: {tenant_id} "
        f"(자격증명 {deleted_credentials}건, 인시던트 {deleted_incidents}건, 경보 룰 {deleted_rules}건 연쇄 삭제)"
    )


@router.get("/monitor/overview", response_model=List[TenantOverviewSchema])
async def get_monitor_overview(
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN"])),
    db: AsyncSession = Depends(get_db)
):
    """
    MSP 전체 보기(관리자 전용) - 전 고객사(system 제외) 각각의 리소스/인시던트/경보/비용을
    한 화면에서 집계해 반환한다. 프론트엔드 전체보기/통합뷰 대시보드가 이 API 하나로
    고객사 카드 목록을 그릴 수 있다.
    """
    logger.info("MSP 전체 고객사 대시보드 요약(overview) 조회 요청")
    tenant_repo = TenantRepository(db)
    incident_repo = IncidentRepository(db)
    tenants = await tenant_repo.get_all()

    overview: List[dict] = []
    for tenant in tenants:
        if tenant.id == "system":
            continue

        # 데모 워크스페이스(is_demo=True)는 데모 엔진 데이터로, 실 고객사는 기존
        # simulator 경로(자격증명 없으면 정직하게 빈 값)로 각각 분기한다.
        if tenant.is_demo:
            topo = demo_engine.get_topology(tenant.id)
            costs = demo_engine.get_costs(tenant.id)
        else:
            topo = simulator.get_topology(tenant.id)
            costs = simulator.get_costs(tenant.id)

        nodes = topo.get("nodes", [])
        providers = sorted({n["provider"] for n in nodes if n.get("provider")})
        resource_count = sum(1 for n in nodes if n.get("type") in ("vm", "database"))
        warning_node_count = sum(1 for n in nodes if n.get("status") == "warning")

        incidents = await incident_repo.get_all_by_tenant(tenant.id)
        open_incidents = [i for i in incidents if i.status == "OPEN"]
        critical_open_incidents = [i for i in open_incidents if i.severity == "CRITICAL"]

        if critical_open_incidents:
            health = "critical"
        elif open_incidents or warning_node_count:
            health = "warning"
        else:
            health = "healthy"

        overview.append({
            "tenant_id": tenant.id,
            "name": tenant.name,
            "providers": providers,
            "resource_count": resource_count,
            "active_incidents": len(open_incidents),
            "active_alerts": warning_node_count,
            "monthly_cost": costs.get("monthly_total", 0.0),
            "health": health,
            "is_demo": tenant.is_demo,
        })

    return overview
