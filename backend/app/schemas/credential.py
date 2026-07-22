from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class CredentialCreate(BaseModel):
    provider: str = Field(..., example="aws")
    name: str = Field(..., min_length=2, max_length=50, example="AWS-Prod-Account")
    auth_data: str = Field(..., example="aws_access_key:aws_secret_key")
    # 관리자(SYSTEM_ADMIN) 전용 - 특정 고객사에 자격증명을 대신 등록할 때 지정.
    # 비관리자가 보내도 무시되고 본인 테넌트로 강제된다 (라우터에서 처리).
    tenant_id: Optional[str] = Field(default=None, example="tenant-scp")

class CredentialResponse(BaseModel):
    id: int
    tenant_id: str
    provider: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True
