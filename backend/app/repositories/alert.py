from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from backend.app.models.base import AlertRule, AuditLog
from loguru import logger

class AlertRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_rule_by_id(self, rule_id: int, tenant_id: str) -> Optional[AlertRule]:
        """
        경보 룰을 ID와 테넌트 기준 필터링하여 단건 조회합니다.
        """
        logger.info(f"경보 룰 DB 조회: {rule_id} (Tenant: {tenant_id})")
        stmt = select(AlertRule).where(AlertRule.id == rule_id)
        if tenant_id != "system":
            stmt = stmt.where(AlertRule.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_all_rules_by_tenant(self, tenant_id: str) -> List[AlertRule]:
        """
        소속 테넌트 내의 전체 경보 룰 목록을 조회합니다.
        """
        logger.info(f"테넌트별 경보 룰 목록 DB 조회: {tenant_id}")
        stmt = select(AlertRule)
        if tenant_id != "system":
            stmt = stmt.where(AlertRule.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_rule(self, rule: AlertRule) -> AlertRule:
        """
        새로운 경보 임계치 룰을 생성합니다.
        """
        logger.info(f"경보 룰 DB 생성: {rule.name} (Tenant: {rule.tenant_id})")
        self.session.add(rule)
        await self.session.commit()
        return rule

    async def delete_rule(self, rule_id: int, tenant_id: str) -> bool:
        """
        경보 룰을 테넌트 격리 보장하에 삭제합니다.
        """
        logger.info(f"경보 룰 DB 삭제 시도: {rule_id} (Tenant: {tenant_id})")
        rule = await self.get_rule_by_id(rule_id, tenant_id)
        if not rule:
            logger.warning(f"삭제하려는 경보 룰이 존재하지 않거나 권한이 없습니다. (ID: {rule_id})")
            return False
        await self.session.delete(rule)
        await self.session.commit()
        return True

    async def delete_all_rules_by_tenant(self, tenant_id: str) -> int:
        """
        테넌트 소속 전체 경보 룰을 일괄 삭제합니다 (테넌트 삭제 시 고아 방지용).
        """
        logger.info(f"테넌트 전체 경보 룰 DB 일괄 삭제: {tenant_id}")
        stmt = select(AlertRule).where(AlertRule.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        rules = list(result.scalars().all())
        for rule in rules:
            await self.session.delete(rule)
        await self.session.commit()
        return len(rules)

    async def create_audit_log(self, audit_log: AuditLog) -> AuditLog:
        """
        작업 내역을 감사 로그로 기록합니다 (회사 보안 룰).
        """
        logger.info(f"감사 로그 DB 기록: {audit_log.action} (User: {audit_log.user_email})")
        self.session.add(audit_log)
        await self.session.commit()
        return audit_log

    async def get_audit_logs(self, tenant_id: str, limit: int = 100) -> List[AuditLog]:
        """
        감사 로그 조회를 수행합니다 (테넌트 격리).
        """
        logger.info(f"감사 로그 목록 DB 조회: {tenant_id}")
        stmt = select(AuditLog)
        if tenant_id != "system":
            stmt = stmt.where(AuditLog.tenant_id == tenant_id)
        stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
