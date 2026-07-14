import jwt
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from backend.app.core.config import settings
from loguru import logger
import hashlib

# FastAPI oauth2 스키마 정의
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

# 비밀번호 SHA-256 해싱 헬퍼 (의존성 무관 작동 보장)
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

class User(BaseModel):
    email: str
    tenant_id: str
    role: str

# 환경 설정으로부터 가상 사용자 계정 데이터베이스 파싱
MOCK_USERS_DB = {}
for user_str in settings.MOCK_USERS_RAW.split(","):
    parts = user_str.split(":")
    if len(parts) == 4:
        email, pwd, tenant_id, role = parts
        MOCK_USERS_DB[email] = {
            "email": email,
            "hashed_password": hash_password(pwd),
            "tenant_id": tenant_id,
            "role": role
        }

def get_user_by_email(email: str) -> Optional[dict]:
    return MOCK_USERS_DB.get(email)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="유효하지 않은 자격 증명입니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        tenant_id: str = payload.get("tenant_id")
        role: str = payload.get("role")
        if email is None or tenant_id is None or role is None:
            raise credentials_exception
        return User(email=email, tenant_id=tenant_id, role=role)
    except jwt.PyJWTError:
        raise credentials_exception

# 권한 검증을 위한 데코레이터 클래스 (SYSTEM_ADMIN은 모든 권한 허용)
class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == "SYSTEM_ADMIN":
            return current_user
        if current_user.role not in self.allowed_roles:
            logger.warning(
                f"권한 없는 접근 시도 감지: 사용자 {current_user.email} (Role: {current_user.role}) -> 허용된 권한: {self.allowed_roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"해당 리소스에 접근할 권한({current_user.role})이 없습니다."
            )
        return current_user
