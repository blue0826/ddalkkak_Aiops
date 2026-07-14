from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "ddalkkak_Aiops"
    API_V1_STR: str = "/api/v1"
    JWT_SECRET: str = "supersecretjwtkeyforaiopsdev12345!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 1 day (60 * 24)
    
    # 배포 모델 프로파일 및 라이선스 파일 경로 설정
    DEPLOYMENT_PROFILE: str = "central"  # central | dedicated
    LICENSE_FILE: str = "license.key"
    
    # 가상 테넌트 정의 및 가상 사용자 계정 (이메일:비밀번호:테넌트ID:역할)
    # 역할: SYSTEM_ADMIN, TENANT_OPERATOR, TENANT_VIEWER
    MOCK_USERS_RAW: str = (
        "sysadmin@company.com:sysadmin123!:system:SYSTEM_ADMIN,"
        "op_scp@client.com:op123!:tenant-scp:TENANT_OPERATOR,"
        "op_aws@client.com:op123!:tenant-aws:TENANT_OPERATOR,"
        "view_scp@client.com:view123!:tenant-scp:TENANT_VIEWER"
    )

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
