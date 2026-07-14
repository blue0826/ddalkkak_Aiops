from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from backend.app.core.config import settings
from typing import AsyncGenerator
import os

# 환경 변수가 없을 경우 테스트를 위한 SQLite 인메모리 비동기 URL로 작동
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./aiops_mvp.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI Router Dependency로 주입될 비동기 데이터베이스 세션을 생성 및 반환합니다.
    """
    async with AsyncSessionLocal() as session:
        yield session
