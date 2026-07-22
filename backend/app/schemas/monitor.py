from pydantic import BaseModel, Field, EmailStr, PlainSerializer
from typing import Annotated, List, Optional, Literal
from decimal import Decimal
from datetime import datetime

# 데이터 출처 정직 라벨 - 실 라이브 API 응답에서 온 값만 REAL, 그 외(시뮬레이터/폴백/
# 하드코딩)는 전부 SIMULATED로 표기한다. is_demo 데모 워크스페이스(demo-*) 전용 데이터는
# 실 고객사 SIMULATED와 절대 혼동되지 않도록 DEMO로 명시 라벨링한다.
# REAL_EMPTY(2026-07-20 추가) - 실 고객사(non-demo)에 대해 실 API 경로를 탔지만(동의 ON+
# 호출 성공/실패, 동의 OFF, 자격증명 미등록 등 사유 불문) 이 구간에 반환할 실측 포인트가
# 없는 경우 전용. 절대 SIMULATED 시뮬레이터 값으로 대체하지 않는다(§CEO 하드룰: 실 고객사
# 화면에 지어낸 데이터 금지) - points는 항상 빈 배열이다. 다른 값은 허용하지 않는다.
DataSourceLabel = Literal["REAL", "SIMULATED", "DEMO", "REAL_EMPTY"]

# 금액 타입 - 내부는 Decimal(정밀도)로 다루되, JSON 응답에서는 숫자(float)로 직렬화한다.
# (Pydantic 기본은 Decimal을 문자열로 직렬화 → 프론트 fmtKRW가 값을 못 읽던 문제 방지.)
_money_to_number = PlainSerializer(lambda v: float(v), return_type=float, when_used="json")
Money15 = Annotated[Decimal, Field(max_digits=15, decimal_places=2), _money_to_number]
Money12 = Annotated[Decimal, Field(max_digits=12, decimal_places=2), _money_to_number]

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
    # 데모 워크스페이스 여부 - True면 프론트가 DEMO 배지를 노출한다 (실 고객사는 항상 False)
    is_demo: bool = False

# 신규 고객사 온보딩 요청 스키마 (POST /tenants)
class TenantCreateRequest(BaseModel):
    id: str
    name: str

# 고객사 이름 수정 요청 스키마 (PATCH /tenants/{tenant_id}) - id는 불변, name만 수정한다
class TenantUpdateRequest(BaseModel):
    name: str

# 테넌트 헬스 상태 라벨 - 인시던트/경보 유무로 derive
TenantHealthLabel = Literal["healthy", "warning", "critical"]

# MSP 전체 보기(GET /monitor/overview) - 고객사별 요약 집계 스키마
class TenantOverviewSchema(BaseModel):
    tenant_id: str
    name: str
    providers: List[str]
    resource_count: int
    active_incidents: int
    active_alerts: int
    monthly_cost: Money15
    health: TenantHealthLabel
    # 데모 워크스페이스 카드 배지용 - True면 데모 엔진 데이터, False면 실 고객사 데이터
    is_demo: bool = False

# 토폴로지 노드 스키마
class NodeSchema(BaseModel):
    id: str
    label: str
    type: str
    status: str
    provider: str
    tenant_id: str
    # 실측값(SCP Cloud Monitoring 등 유료 API) 미동의/미수집 시 None - 0.0으로 채우면
    # "0% 정상"으로 오인되므로 절대 채우지 않는다(§scp_real_topology.py 버그 배경 참조).
    cpu: Optional[float] = None
    memory: Optional[float] = None
    tier: Optional[str] = None
    subnet: Optional[str] = None
    region: Optional[str] = None

# 토폴로지 링크 스키마
class LinkSchema(BaseModel):
    source: str
    target: str
    type: str

# 토폴로지 응답 스키마
class TopologySchema(BaseModel):
    nodes: List[NodeSchema]
    links: List[LinkSchema]
    # 실 SCP VM(fetch_real_vms) 주입 성공 시 REAL, 그 외에는 SIMULATED (기본값)
    data_source: DataSourceLabel = "SIMULATED"

# 시계열 메트릭 포인트 스키마
class MetricPoint(BaseModel):
    timestamp: str
    value: float

# 시계열 메트릭 응답 스키마 - 데이터 출처를 함께 정직하게 노출한다
class MetricSeriesResponse(BaseModel):
    data_source: DataSourceLabel
    node_id: str
    metric_name: str
    points: List[MetricPoint]

# 로그 스키마
class LogSchema(BaseModel):
    timestamp: str
    node_id: str
    node_label: str
    provider: str
    message: str
    level: str
    # 로그 실 API(Cloud Logging)는 아직 미검증이므로 현재는 항상 SIMULATED (구조만 준비)
    data_source: DataSourceLabel = "SIMULATED"

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

# FinOps 비용 절감 추천 (돈: 내부 Decimal, JSON은 숫자)
class CostRecommendationSchema(BaseModel):
    node_id: str
    reason: str
    action: str
    current_monthly_cost: Money12
    target_monthly_cost: Money12
    savings: Money12

# 일별 비용 트렌드 (돈: 내부 Decimal, JSON은 숫자)
class DailyTrendSchema(BaseModel):
    date: str
    amount: Money12

# FinOps 비용 응답 스키마 (돈: 내부 Decimal, JSON은 숫자)
class CostSchema(BaseModel):
    currency: str
    monthly_total: Money15
    daily_average: Money12
    daily_trends: List[DailyTrendSchema]
    recommendations: List[CostRecommendationSchema]
    # 비용 실 API(Billing)는 아직 미검증이므로 현재는 항상 SIMULATED (구조만 준비)
    data_source: DataSourceLabel = "SIMULATED"

# 테넌트별 유료(과금) 서비스 마지막 호출 결과 - unknown(호출 이력 없음)|ok|forbidden(403)|error
ServiceCallStatusLabel = Literal["unknown", "ok", "forbidden", "error"]

# GET /monitor/service-status 응답 항목 - 프론트가 이 값으로 "미활성화(과금 서비스)"
# 안내 배너를 그릴지 결정한다. billable=False는 데모 테넌트처럼 실제 과금이 발생하지
# 않는(=항상 사용 가능한) 항목을 뜻한다.
class ServiceStatusSchema(BaseModel):
    provider: str
    service_key: str
    display_name: str
    enabled: bool
    billable: bool
    last_status: ServiceCallStatusLabel
    last_checked_at: Optional[datetime] = None

# PUT /tenants/{tenant_id}/services/{service_key} 요청 바디
class ServiceEnabledUpdateRequest(BaseModel):
    enabled: bool
