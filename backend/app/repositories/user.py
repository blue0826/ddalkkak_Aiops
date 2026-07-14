from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from backend.app.models.base import User
from loguru import logger

class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_email(self, email: str) -> Optional[User]:
        """
        이메일 기준으로 사용자를 조회합니다 (인증 단계).
        """
        logger.info(f"이메일 기준 사용자 DB 조회: {email}")
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalars().first()

    async def get_by_id(self, user_id: int, tenant_id: str) -> Optional[User]:
        """
        사용자 ID와 테넌트 ID를 기준으로 단건 조회합니다. (테넌트 격리 강제)
        """
        logger.info(f"사용자 단건 DB 조회: {user_id} (Tenant: {tenant_id})")
        stmt = select(User).where(User.id == user_id)
        # 어드민이 아닐 경우 자사 테넌트 쿼리만 필터링
        if tenant_id != "system":
            stmt = stmt.where(User.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_all_by_tenant(self, tenant_id: str) -> List[User]:
        """
        특정 테넌트의 모든 사용자를 조회합니다.
        """
        logger.info(f"테넌트별 사용자 목록 DB 조회: {tenant_id}")
        stmt = select(User)
        if tenant_id != "system":
            stmt = stmt.where(User.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, user: User) -> User:
        """
        사용자 정보를 DB에 생성합니다.
        """
        logger.info(f"사용자 DB 생성: {user.email} (Tenant: {user.tenant_id})")
        self.session.add(user)
        await self.session.commit()
        return user
