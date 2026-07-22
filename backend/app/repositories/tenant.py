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

    async def update_name(self, tenant_id: str, name: str) -> Optional[Tenant]:
        """
        테넌트 이름을 수정합니다. 대상이 없으면 None을 반환합니다(호출측이 404 처리).
        id는 불변이며 name만 수정 대상입니다.
        """
        logger.info(f"Tenant 이름 수정 시도: {tenant_id} -> {name}")
        tenant = await self.get_by_id(tenant_id)
        if not tenant:
            logger.warning(f"수정하려는 테넌트가 존재하지 않습니다: {tenant_id}")
            return None
        tenant.name = name
        await self.session.commit()
        await self.session.refresh(tenant)
        return tenant

    async def delete(self, tenant_id: str) -> bool:
        """
        테넌트 레코드를 삭제합니다. 종속 리소스(자격증명/인시던트/경보 룰)는
        호출측에서 먼저 정리했다는 것을 전제로 합니다(고아 레코드 방지 책임 분리).
        """
        logger.info(f"Tenant DB 삭제 시도: {tenant_id}")
        tenant = await self.get_by_id(tenant_id)
        if not tenant:
            logger.warning(f"삭제하려는 테넌트가 존재하지 않습니다: {tenant_id}")
            return False
        await self.session.delete(tenant)
        await self.session.commit()
        return True
