from pydantic import BaseModel, Field
from datetime import datetime

class CredentialCreate(BaseModel):
    provider: str = Field(..., example="aws")
    name: str = Field(..., min_length=2, max_length=50, example="AWS-Prod-Account")
    auth_data: str = Field(..., example="aws_access_key:aws_secret_key")

class CredentialResponse(BaseModel):
    id: int
    tenant_id: str
    provider: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True
