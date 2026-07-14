from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from decimal import Decimal

# JWT 토큰 응답 스키마
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    tenant_id: str
    email: str

class LoginRequest(BaseModel):
    username: EmailStr
    password: str

# 테넌트 정보 스키마
class TenantSchema(BaseModel):
    id: str
    name: str

# 토폴로지 노드 스키마
class NodeSchema(BaseModel):
    id: str
    label: str
    type: str
    status: str
    provider: str
    tenant_id: str
    cpu: float
    memory: float
    tier: Optional[str] = None
    subnet: Optional[str] = None

# 토폴로지 링크 스키마
class LinkSchema(BaseModel):
    source: str
    target: str
    type: str

# 토폴로지 응답 스키마
class TopologySchema(BaseModel):
    nodes: List[NodeSchema]
    links: List[LinkSchema]

# 시계열 메트릭 포인트 스키마
class MetricPoint(BaseModel):
    timestamp: str
    value: float

# 로그 스키마
class LogSchema(BaseModel):
    timestamp: str
    node_id: str
    node_label: str
    provider: str
    message: str
    level: str

# 경보/이벤트 스키마
class EventSchema(BaseModel):
    id: str
    title: str
    description: str
    severity: str
    status: str
    node_id: str
    provider: str
    tenant_id: str
    created_at: str

# FinOps 비용 절감 추천 (돈 관련: Decimal 사용)
class CostRecommendationSchema(BaseModel):
    node_id: str
    reason: str
    action: str
    current_monthly_cost: Decimal = Field(..., max_digits=12, decimal_places=2)
    target_monthly_cost: Decimal = Field(..., max_digits=12, decimal_places=2)
    savings: Decimal = Field(..., max_digits=12, decimal_places=2)

# 일별 비용 트렌드 (돈 관련: Decimal 사용)
class DailyTrendSchema(BaseModel):
    date: str
    amount: Decimal = Field(..., max_digits=12, decimal_places=2)

# FinOps 비용 응답 스키마 (돈 관련: Decimal 사용)
class CostSchema(BaseModel):
    currency: str
    monthly_total: Decimal = Field(..., max_digits=15, decimal_places=2)
    daily_average: Decimal = Field(..., max_digits=12, decimal_places=2)
    daily_trends: List[DailyTrendSchema]
    recommendations: List[CostRecommendationSchema]
