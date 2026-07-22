from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from typing import List, Optional
from backend.app.models.base import TenantServiceSetting
from loguru import logger


class TenantServiceSettingRepository:
    """
    테넌트별 프로바이더 과금 서비스 옵트인 설정(tenant_service_setting) DB 접근 계층.

    "행이 없으면 비활성(OFF)"이 명시적 기본값이다 - get()이 None을 반환하면 호출측이
    enabled=False로 취급해야 한다(과금 서프라이즈 방지 원칙, CEO 결정 2026-07-20).
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, tenant_id: str, provider: str, service_key: str) -> Optional[TenantServiceSetting]:
        logger.info(f"테넌트 서비스 동의 설정 조회: {tenant_id}/{provider}/{service_key}")
        stmt = select(TenantServiceSetting).where(
            TenantServiceSetting.tenant_id == tenant_id,
            TenantServiceSetting.provider == provider,
            TenantServiceSetting.service_key == service_key,
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_all_by_tenant(self, tenant_id: str) -> List[TenantServiceSetting]:
        """
        테넌트에 등록된(=행이 존재하는) 전체 서비스 설정을 반환합니다. 행이 없는
        서비스는 여기 포함되지 않으므로, 카탈로그 순회는 호출측(라우터)이 담당합니다.
        """
        logger.info(f"테넌트별 서비스 동의 설정 전체 DB 조회: {tenant_id}")
        stmt = select(TenantServiceSetting).where(TenantServiceSetting.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def _get_or_create(self, tenant_id: str, provider: str, service_key: str) -> TenantServiceSetting:
        row = await self.get(tenant_id, provider, service_key)
        if row:
            return row
        logger.info(f"테넌트 서비스 동의 설정 신규 생성: {tenant_id}/{provider}/{service_key}")
        row = TenantServiceSetting(tenant_id=tenant_id, provider=provider, service_key=service_key)
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def set_enabled(
        self, tenant_id: str, provider: str, service_key: str, enabled: bool
    ) -> TenantServiceSetting:
        """
        운영자 토글(PUT /tenants/{tenant_id}/services/{service_key}) 결과를 upsert합니다.
        """
        logger.info(f"테넌트 서비스 동의 설정 변경: {tenant_id}/{provider}/{service_key} -> enabled={enabled}")
        row = await self._get_or_create(tenant_id, provider, service_key)
        row.enabled = enabled
        row.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def record_call_result(
        self, tenant_id: str, provider: str, service_key: str, status_value: str
    ) -> TenantServiceSetting:
        """
        실 외부 API 호출 결과(ok/forbidden/error)를 last_status/last_checked_at에 기록합니다.
        동의(enabled)가 켜져 실제로 호출을 시도했을 때만 호출측(라우터)이 이 메서드를 부른다.
        """
        logger.info(f"테넌트 서비스 호출 결과 기록: {tenant_id}/{provider}/{service_key} -> {status_value}")
        row = await self._get_or_create(tenant_id, provider, service_key)
        row.last_status = status_value
        row.last_checked_at = datetime.utcnow()
        row.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(row)
        return row
