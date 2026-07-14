from fastapi import APIRouter, HTTPException, status
from loguru import logger
from backend.app.core.auth import get_user_by_email, verify_password, create_access_token
from backend.app.schemas.monitor import Token, LoginRequest
from backend.app.core.config import settings

router = APIRouter()

@router.post("/auth/login", response_model=Token)
def login(login_data: LoginRequest):
    logger.info(f"로그인 요청 수신 - 사용자: {login_data.username}")
    user = get_user_by_email(login_data.username)
    if not user or not verify_password(login_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다."
        )
    
    token_payload = {
        "sub": user["email"],
        "tenant_id": user["tenant_id"],
        "role": user["role"]
    }
    access_token = create_access_token(data=token_payload)
    return Token(
        access_token=access_token,
        token_type="bearer",
        role=user["role"],
        tenant_id=user["tenant_id"],
        email=user["email"]
    )
