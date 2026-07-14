from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from backend.app.models.base import CloudCredential
from loguru import logger

class CredentialRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, credential_id: int, tenant_id: str) -> Optional[CloudCredential]:
        """
        특정 자격증명을 ID와 테넌트 기준 필터링하여 단건 조회합니다.
        """
        logger.info(f"자격증명 DB 조회: {credential_id} (Tenant: {tenant_id})")
        stmt = select(CloudCredential).where(CloudCredential.id == credential_id)
        if tenant_id != "system":
            stmt = stmt.where(CloudCredential.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_all_by_tenant(self, tenant_id: str) -> List[CloudCredential]:
        """
        소속 테넌트 내의 전체 자격증명 목록을 조회합니다.
        """
        logger.info(f"테넌트별 자격증명 목록 DB 조회: {tenant_id}")
        stmt = select(CloudCredential)
        if tenant_id != "system":
            stmt = stmt.where(CloudCredential.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, credential: CloudCredential) -> CloudCredential:
        """
        자격증명 레코드를 생성합니다 (호출 전 암호화 완료 전제).
        """
        logger.info(f"자격증명 DB 생성: {credential.name} (Tenant: {credential.tenant_id})")
        self.session.add(credential)
        await self.session.commit()
        return credential

    async def delete(self, credential_id: int, tenant_id: str) -> bool:
        """
        자격증명 레코드를 테넌트 격리를 보장하며 삭제합니다.
        """
        logger.info(f"자격증명 DB 삭제 시도: {credential_id} (Tenant: {tenant_id})")
        credential = await self.get_by_id(credential_id, tenant_id)
        if not credential:
            logger.warning(f"삭제하려는 자격증명이 존재하지 않거나 타 테넌트의 자산입니다. (ID: {credential_id})")
            return False
        await self.session.delete(credential)
        await self.session.commit()
        return True
