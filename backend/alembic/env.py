import sys
from pathlib import Path
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# backend/alembic/env.py 기준 프로젝트 루트(2단계 상위: alembic -> backend -> root)를
# sys.path에 추가 — alembic 커맨드를 backend/에서 실행하든 다른 CWD에서 실행하든
# `backend.app.*` 임포트가 항상 성공하도록 보장한다(config.py의 CWD 무관 원칙과 동일).
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.app.core.config import settings  # noqa: E402
from backend.app.models.base import Base  # noqa: E402

# NOTE: 신규 모델 파일을 추가하면 Base.metadata에 등록되도록 여기서도 반드시 import할 것.
# 현재는 backend/app/models/base.py 하나에 전 모델이 정의돼 있어 위 import만으로 충분하다.

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# autogenerate가 비교할 타깃 메타데이터 — 앱이 실제 쓰는 SQLAlchemy 모델 그대로.
target_metadata = Base.metadata


def _sync_database_url() -> str:
    """
    settings.DATABASE_URL은 앱이 쓰는 async 드라이버(sqlite+aiosqlite / postgresql+asyncpg)
    URL이다. 마이그레이션 실행은 단순·안전을 위해 동기 드라이버로 처리하므로
    async 드라이버 접두사를 동기 드라이버로 치환해서 사용한다.
    """
    url = settings.DATABASE_URL
    url = url.replace("sqlite+aiosqlite://", "sqlite://")
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = _sync_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    configuration = config.get_section(config.config_ini_section, {}) or {}
    # alembic.ini의 sqlalchemy.url은 플레이스홀더 — settings.DATABASE_URL(단일 소스)에서
    # 계산한 동기 URL로 항상 덮어써 앱과 마이그레이션이 같은 DB를 가리키도록 강제한다.
    configuration["sqlalchemy.url"] = _sync_database_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
