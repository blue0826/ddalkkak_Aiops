from backend.app.repositories.alert import AlertRepository
from backend.app.models.base import AlertRule, AuditLog
from typing import List, Optional
from loguru import logger

class AlertService:
    def __init__(self, alert_repo: AlertRepository):
        self.alert_repo = alert_repo

    async def register_rule(
        self, tenant_id: str, name: str, metric_name: str, operator: str, threshold: float, duration_minutes: int, user_email: str
    ) -> AlertRule:
        """
        경보 임계치 룰을 생성하고 이에 따른 감사 로그를 기록합니다.
        """
        logger.info(f"경보 룰 생성 비즈니스 로직 실행 - Tenant: {tenant_id}")
        new_rule = AlertRule(
            tenant_id=tenant_id,
            name=name,
            metric_name=metric_name,
            operator=operator,
            threshold=threshold,
            duration_minutes=duration_minutes,
            is_active=True
        )
        saved_rule = await self.alert_repo.create_rule(new_rule)
        
        # 감사 로그 남기기
        await self.alert_repo.create_audit_log(AuditLog(
            tenant_id=tenant_id,
            user_email=user_email,
            action="create_rule",
            resource_type="alert_rule",
            resource_id=str(saved_rule.id),
            details=f"경보 임계치 룰 생성 완료 - 이름: {name}, 메트릭: {metric_name}, 임계치: {threshold}"
        ))
        
        return saved_rule

    async def list_rules(self, tenant_id: str) -> List[AlertRule]:
        """
        소속 테넌트의 경보 룰 목록을 반환합니다.
        """
        logger.info(f"경보 룰 목록 조회 로직 실행 - Tenant: {tenant_id}")
        return await self.alert_repo.get_all_rules_by_tenant(tenant_id)

    async def remove_rule(self, rule_id: int, tenant_id: str, user_email: str) -> bool:
        """
        경보 임계치 룰을 제거하고 이에 따른 감사 로그를 기록합니다.
        """
        logger.info(f"경보 룰 삭제 로직 실행 - Tenant: {tenant_id}, ID: {rule_id}")
        success = await self.alert_repo.delete_rule(rule_id, tenant_id)
        if success:
            await self.alert_repo.create_audit_log(AuditLog(
                tenant_id=tenant_id,
                user_email=user_email,
                action="delete_rule",
                resource_type="alert_rule",
                resource_id=str(rule_id),
                details=f"경보 임계치 룰 삭제 완료 - ID: {rule_id}"
            ))
        return success

    async def list_audit_logs(self, tenant_id: str, limit: int = 100) -> List[AuditLog]:
        """
        테넌트 범위 내의 감사 로그 내역을 조회합니다.
        """
        logger.info(f"감사 로그 조회 로직 실행 - Tenant: {tenant_id}")
        return await self.alert_repo.get_audit_logs(tenant_id, limit)
