from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional, List

# 프로젝트 루트 절대경로 — 이 파일(backend/app/core/config.py) 위치 기준 4단계 상위.
# 실행 CWD(작업 디렉터리)가 어디든(집 PC/회사 PC, 서버를 backend/에서 띄우든 루트에서
# 띄우든) 항상 같은 파일을 가리키도록, 상대경로 대신 __file__ 기준 절대경로로 anchor한다.
# repo를 어느 경로에 clone하든(예: C:/AI_Projects/ddalkkak_Aiops) 자동으로 맞춰진다.
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_DB_PATH = _PROJECT_ROOT / "aiops_mvp.db"
_DEFAULT_ENV_FILE = _PROJECT_ROOT / ".env"

class Settings(BaseSettings):
    PROJECT_NAME: str = "ddalkkak_Aiops"
    API_V1_STR: str = "/api/v1"
    JWT_SECRET: str  # 필수 - .env에서 주입 (기본값 없음, 미설정 시 앱 기동 실패)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 1 day (60 * 24)

    # 자격증명 봉투암호화 KEK 유도용 전용 마스터 키 - 필수 (기본값 없음)
    MASTER_KEK: str

    # 배포 모델 프로파일 및 라이선스 파일 경로 설정
    DEPLOYMENT_PROFILE: str = "central"  # central | dedicated
    LICENSE_FILE: str = "license.key"

    # 데이터베이스 접속 URL (session.py가 settings 통해 일원화 참조)
    # 기본값은 프로젝트 루트 기준 절대경로 — 실행 CWD와 무관하게 항상 같은 DB 파일을
    # 읽도록 보장한다(버그: 상대경로였을 때 CWD가 다르면 다른 빈 DB를 생성해 등록한
    # 자격증명이 사라지는 문제가 있었음). .env에서 DATABASE_URL을 별도 지정하면(예:
    # 운영 PostgreSQL) 그 값이 이 기본값보다 우선한다.
    DATABASE_URL: str = f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH.as_posix()}"

    # CORS 허용 오리진 (콤마 구분)
    CORS_ALLOW_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # 백그라운드 탐지 사이클 루프 - 기본 비활성(false)으로 테스트/데모 중 인시던트 폭주 방지
    DETECTION_LOOP_ENABLED: bool = False
    DETECTION_INTERVAL_SECONDS: int = 60

    # --- L4 LLM 게이트웨이 (Phase 0 헌법: 외부 유료 API 호출은 옵트인만 허용) ---
    # 키가 설정되지 않으면 자동으로 규칙 기반(template) 폴백으로 동작한다.
    LLM_ENABLED: bool = True
    LLM_PROVIDER: str = "auto"  # auto | anthropic | openai_compat | template
    ANTHROPIC_API_KEY: str = ""
    LLM_GATEWAY_BASE_URL: str = ""  # 사내/에어갭 OpenAI 호환 게이트웨이 (/chat/completions)
    LLM_API_KEY: str = ""  # OpenAI 호환 게이트웨이용 API 키 (선택)
    LLM_MODEL: str = "claude-sonnet-5"

    # --- SCP Cloud Monitoring / Cloud Logging 실연동 엔드포인트 (설정가능 상수, 레거시 폴백) ---
    # 2026-07-20 P0 실측(모노스(monos) 실 테넌트 자격증명, GET 전용 조사) 결론:
    # - Cloud Monitoring 실 호스트는 확정됨: https://cloudmonitoring.{region}.{env}.
    #   samsungsdscloud.com (virtualserver와 동일 게이트웨이 IP, GET /v1/cloudmonitorings/
    #   product/{v1/product-types, v2/accounts/products, v2/metrics}가 200 실증됨).
    #   이제 credential_service.resolve_scp_credential_fields()가 이 값을 region/env로
    #   파생해 SCPAdapter에 직접 전달하므로, 아래 SCP_MONITORING_ENDPOINT 상수는 그 값이
    #   없을 때만 쓰이는 레거시 폴백이다. 단, 실제 시계열 "값" 조회는 GET이 아니라
    #   POST /v1/cloudmonitorings/product/v2/metric-data 라 확인했고(공식 삼성SDS
    #   terraform-provider-samsungcloudplatformv2 소스 기준), 이번 세션은 "SCP GET만
    #   허용" 제약이라 그 POST 호출 자체는 미검증이다 - 상세는 SCPAdapter.fetch_metrics_real
    #   docstring 참조.
    # - Cloud Logging은 host 후보(servicewatch.*, loggingaudit.*)만 DNS로 실존 확인했고,
    #   추정 경로는 403 Forbidden(권한 부족)으로 막혀 host/path 모두 미확정이다 - 상세는
    #   SCPAdapter.fetch_logs_real docstring 참조. 아래 값은 예전 잠정값을 그대로 유지한다.
    SCP_MONITORING_ENDPOINT: str = "https://openapi.samsungsdscloud.com"
    SCP_MONITORING_PATH: str = "/cloudmonitoring/v1/metrics"
    SCP_LOGGING_ENDPOINT: str = "https://openapi.samsungsdscloud.com"
    SCP_LOGGING_PATH: str = "/cloudlogging/v1/logs"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]

    class Config:
        case_sensitive = True
        # 상대경로(".env")면 서버를 다른 CWD에서 띄울 때 못 찾아 필수값(JWT_SECRET 등)
        # 로드가 실패할 수 있어, 프로젝트 루트 기준 절대경로로 고정한다.
        env_file = str(_DEFAULT_ENV_FILE)

settings = Settings()
