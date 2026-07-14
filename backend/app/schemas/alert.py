from pydantic import BaseModel, Field
from datetime import datetime

class AlertRuleCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, example="CPU 90% 초과 경보")
    metric_name: str = Field(..., example="cpu")
    operator: str = Field(..., example="gt")  # gt (greater than), lt (less than), eq (equal)
    threshold: float = Field(..., example=90.0)
    duration_minutes: int = Field(5, ge=1, le=60, example=5)

class AlertRuleResponse(BaseModel):
    id: int
    tenant_id: str
    name: str
    metric_name: str
    operator: str
    threshold: float
    duration_minutes: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class AuditLogResponse(BaseModel):
    id: int
    tenant_id: str
    user_email: str
    action: str
    resource_type: str
    resource_id: str
    details: str
    created_at: datetime

    class Config:
        from_attributes = True
