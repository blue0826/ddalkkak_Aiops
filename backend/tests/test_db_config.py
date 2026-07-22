"""
DB 영속성 버그(서버 재시작·CWD 변경 시 DB가 통째로 사라지던 문제) 재발 방지 테스트.

핵심 회귀 지점: backend/app/core/config.py의 DATABASE_URL 기본값이 상대경로로
되돌아가면, 서버를 다른 작업 디렉터리(CWD)에서 띄울 때 다른(빈) SQLite 파일을
읽게 되어 등록된 테넌트·SCP 자격증명이 사라진 것처럼 보이는 사고가 재발한다.
"""
from pathlib import Path

from backend.app.core import config as config_module
from backend.app.core.config import settings


def test_database_url_is_absolute_path_not_relative():
    """
    DATABASE_URL의 sqlite 파일 경로는 반드시 절대경로여야 한다. 상대경로(예:
    "sqlite+aiosqlite:///./aiops_mvp.db")로 회귀하면 실행 CWD에 따라 서로 다른
    DB 파일을 읽게 되는 버그가 재발한다.
    """
    assert settings.DATABASE_URL.startswith("sqlite+aiosqlite:///")
    raw_path = settings.DATABASE_URL.removeprefix("sqlite+aiosqlite:///")

    # Windows: "C:/...", POSIX: "/..." 모두 절대경로로 인식되어야 한다.
    assert Path(raw_path).is_absolute(), (
        f"DATABASE_URL의 파일 경로가 절대경로가 아닙니다: {raw_path!r} "
        "(config.py의 _DEFAULT_DB_PATH 계산 회귀 의심)"
    )


def test_default_db_path_anchored_to_project_root():
    """
    config.py가 계산한 기본 DB 경로는 항상 프로젝트 루트(backend/의 상위 디렉터리)
    바로 아래의 aiops_mvp.db를 가리켜야 한다 - __file__ 기준 계산이므로 이 파일이
    이동하지 않는 한 어떤 CWD에서 임포트해도 동일해야 한다.
    """
    default_db_path = config_module._DEFAULT_DB_PATH
    project_root = config_module._PROJECT_ROOT

    assert default_db_path.is_absolute()
    assert default_db_path.name == "aiops_mvp.db"
    assert default_db_path.parent == project_root
    # 프로젝트 루트 표식(backend 디렉터리, CLAUDE.md)이 실제로 그 자리에 있는지 확인 -
    # parents[3] 계산식이 어긋나면(예: 파일 이동) 엉뚱한 디렉터리를 가리키게 된다.
    assert (project_root / "backend").is_dir()
    assert (project_root / "CLAUDE.md").is_file()


def test_env_file_path_is_absolute():
    """
    Settings.Config.env_file도 CWD 무관하게 항상 같은 .env를 읽도록 절대경로여야
    한다. 상대경로(".env")로 회귀하면 서버를 다른 CWD에서 띄울 때 JWT_SECRET/
    MASTER_KEK 같은 필수값을 못 찾아 기동 실패하거나(그나마 안전), 최악의 경우
    엉뚱한 .env를 읽는다.
    """
    # pydantic-settings v1 스타일 class Config를 쓰고 있으므로 그 경로 그대로 접근한다.
    env_file = settings.Config.env_file
    assert Path(env_file).is_absolute()
