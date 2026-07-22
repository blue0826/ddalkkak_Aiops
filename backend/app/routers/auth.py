from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger
from backend.app.core.auth import create_access_token
from backend.app.db.session import get_db
from backend.app.repositories.user import UserRepository
from backend.app.services.user_service import UserService
from backend.app.schemas.monitor import Token, LoginRequest

router = APIRouter()

@router.post("/auth/login", response_model=Token)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    logger.info(f"로그인 요청 수신 - 사용자: {login_data.username}")
    user_repo = UserRepository(db)
    user_service = UserService(user_repo)
    user = await user_service.authenticate_user(login_data.username, login_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다."
        )

    token_payload = {
        "sub": user.email,
        "tenant_id": user.tenant_id,
        "role": user.role
    }
    access_token = create_access_token(data=token_payload)
    return Token(
        access_token=access_token,
        token_type="bearer",
        role=user.role,
        tenant_id=user.tenant_id,
        email=user.email
    )
