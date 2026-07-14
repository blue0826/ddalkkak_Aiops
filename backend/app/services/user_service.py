from backend.app.repositories.user import UserRepository
from backend.app.models.base import User
from backend.app.core.auth import hash_password, verify_password
from typing import Optional, List
from loguru import logger

class UserService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def authenticate_user(self, email: str, password: str) -> Optional[User]:
        """
        사용자 이메일과 비밀번호를 검증하여 인증 성공 시 User 객체를 반환합니다.
        """
        logger.info(f"사용자 인증 로직 실행: {email}")
        user = await self.user_repo.get_by_email(email)
        if not user:
            logger.warning(f"인증 실패 - 존재하지 않는 사용자: {email}")
            return None
        if not verify_password(password, user.hashed_password):
            logger.warning(f"인증 실패 - 패스워드 불일치: {email}")
            return None
        return user

    async def register_user(self, email: str, password: str, tenant_id: str, role: str) -> User:
        """
        패스워드를 해싱하여 새로운 테넌트 사용자를 생성합니다.
        """
        logger.info(f"신규 사용자 등록 로직 실행: {email} (Tenant: {tenant_id}, Role: {role})")
        existing_user = await self.user_repo.get_by_email(email)
        if existing_user:
            raise ValueError("이미 존재하는 사용자 이메일입니다.")
            
        hashed_pwd = hash_password(password)
        new_user = User(
            email=email,
            hashed_password=hashed_pwd,
            tenant_id=tenant_id,
            role=role
        )
        return await self.user_repo.create(new_user)

    async def list_users(self, tenant_id: str) -> List[User]:
        """
        권한 범위(tenant_id)에 부합하는 사용자 리스트를 반환합니다.
        """
        logger.info(f"사용자 목록 조회 로직 실행 - Tenant: {tenant_id}")
        return await self.user_repo.get_all_by_tenant(tenant_id)
