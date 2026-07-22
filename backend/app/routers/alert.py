from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from backend.app.db.session import get_db
from backend.app.core.auth import User, get_current_user, RoleChecker
from backend.app.schemas.alert import AlertRuleCreate, AlertRuleResponse, AuditLogResponse
from backend.app.repositories.alert import AlertRepository
from backend.app.services.alert_service import AlertService
from backend.app.core.license import check_license_write_gate
from loguru import logger

router = APIRouter(prefix="/alerts", tags=["alerts"])

def get_alert_service(db: AsyncSession = Depends(get_db)) -> AlertService:
    alert_repo = AlertRepository(db)
    return AlertService(alert_repo)

@router.post(
    "/rules",
    response_model=AlertRuleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(check_license_write_gate)]
)
async def create_rule(
    payload: AlertRuleCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN", "TENANT_OPERATOR"])),
    service: AlertService = Depends(get_alert_service)
):
    logger.info(f"경보 룰 생성 API 요청 수신 - Name: {payload.name}")
    return await service.register_rule(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        metric_name=payload.metric_name,
        operator=payload.operator,
        threshold=payload.threshold,
        duration_minutes=payload.duration_minutes,
        user_email=current_user.email
    )

@router.get("/rules", response_model=List[AlertRuleResponse])
async def list_rules(
    current_user: User = Depends(get_current_user),
    service: AlertService = Depends(get_alert_service)
):
    logger.info("경보 룰 목록 API 조회 요청 수신")
    return await service.list_rules(tenant_id=current_user.tenant_id)

@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: int,
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN", "TENANT_OPERATOR"])),
    service: AlertService = Depends(get_alert_service)
):
    logger.info(f"경보 룰 삭제 API 요청 수신 - ID: {rule_id}")
    success = await service.remove_rule(
        rule_id=rule_id,
        tenant_id=current_user.tenant_id,
        user_email=current_user.email
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="요청한 경보 룰을 찾을 수 없거나 삭제 권한이 없습니다."
        )

@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def list_audit_logs(
    limit: int = 100,
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN", "TENANT_OPERATOR"])),
    service: AlertService = Depends(get_alert_service)
):
    logger.info("감사 로그 API 조회 요청 수신")
    return await service.list_audit_logs(tenant_id=current_user.tenant_id, limit=limit)
