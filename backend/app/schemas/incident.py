from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List

class IncidentResponse(BaseModel):
    id: int
    tenant_id: str
    title: str
    description: Optional[str] = None
    status: str
    severity: str
    assigned_to: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    # L5 추천→승인→실행 3단계 상태머신 (프론트 버튼 상태 렌더용)
    remediation_status: str = "NONE"
    remediation_action: Optional[str] = None
    remediation_approved_by: Optional[str] = None

    class Config:
        from_attributes = True

class IncidentTimelineResponse(BaseModel):
    id: int
    incident_id: int
    event_type: str
    actor: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True

class IncidentDetailResponse(BaseModel):
    incident: IncidentResponse
    timeline: List[IncidentTimelineResponse]

class IncidentUpdatePayload(BaseModel):
    status: str = Field(..., example="INVESTIGATING")
    assigned_to: Optional[str] = Field(None, example="op_scp@client.com")

class MonthlyReportResponse(BaseModel):
    report_markdown: str
