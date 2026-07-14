from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from backend.app.models.base import Tenant
from loguru import logger

class TenantRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, tenant_id: str) -> Optional[Tenant]:
        logger.info(f"Tenant 단건 조회: {tenant_id}")
        result = await self.session.execute(select(Tenant).where(Tenant.id == tenant_id))
        return result.scalars().first()

    async def get_all(self) -> List[Tenant]:
        logger.info("모든 Tenant 조회 (System Admin 전용)")
        result = await self.session.execute(select(Tenant))
        return list(result.scalars().all())

    async def create(self, tenant_id: str, name: str) -> Tenant:
        logger.info(f"신규 Tenant 생성: {tenant_id} ({name})")
        tenant = Tenant(id=tenant_id, name=name)
        self.session.add(tenant)
        await self.session.commit()
        return tenant
