/**
 * 도메인 타입 — backend/app/schemas/*.py, backend/app/routers/*.py,
 * backend/app/services/*.py 의 실제 응답 형태를 기준으로 작성한다.
 * `any` 금지. 백엔드에 pydantic 스키마가 없는 엔드포인트(예: FinOps 이상탐지)는
 * 서비스 코드의 반환 dict 리터럴을 그대로 옮겨 타입화한다.
 */

// ── 데이터 출처 정직 라벨 (backend/app/schemas/monitor.py DataSourceLabel과 1:1 대응) ──
// 실 라이브 API 응답에서 온 값만 REAL, 그 외(시뮬레이터/폴백/하드코딩)는 전부 SIMULATED.
// REAL_EMPTY(2026-07-20 추가) - 실 고객사(non-demo)에 실 API 경로를 탔지만 이 구간에
// 반환할 실측 포인트가 없는 경우(SCP 기본 에이전트리스 수집은 수 시간 간격이라 흔함).
// 절대 시뮬레이터 값으로 채워지지 않는다 - points는 항상 빈 배열.

export type DataSource = "REAL" | "SIMULATED" | "REAL_EMPTY";

// ── 인증 ──────────────────────────────────────────────────────────────────

export type UserRole = "SYSTEM_ADMIN" | "TENANT_OPERATOR" | string;

export interface AuthToken {
  access_token: string;
  token_type: string;
  role: UserRole;
  tenant_id: string;
  email: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

// ── 테넌트 / 라이선스 ─────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
}

export interface License {
  edition: string;
  expire_date: string;
  max_nodes?: number;
  max_tenants?: number;
  is_valid: boolean;
  is_expired: boolean;
  is_evaluation: boolean;
  error?: string;
}

// ── 프로바이더 레지스트리 (GET /providers, GET /providers/{id}) ───────────
// backend/app/core/providers.py PROVIDER_REGISTRY 와 1:1 대응.

export type ProviderId = "scp" | "aws" | string;
export type ProviderIntegrationMode = "REAL_CAPABLE" | "SIMULATED";

export interface Provider {
  id: ProviderId;
  display_name: string;
  short_name: string;
  full_name_en: string;
  compute_term_ko: string;
  compute_term_en: string;
  compute_kind: string;
  network_term: string;
  subnet_term: string;
  storage_term_ko: string;
  storage_term_en: string;
  object_storage: string;
  database_term: string;
  monitoring_service: string;
  logging_service: string;
  billing_service: string;
  event_service: string;
  region_label: string;
  default_region: string;
  regions: string[];
  auth_method: string;
  endpoint: string;
  instance_type_family: string;
  instance_types: string[];
  currency: string;
  source_currency: string;
  accent_color: string;
  integration_mode: ProviderIntegrationMode;
}

// ── 토폴로지 (GET /monitor/topology) ───────────────────────────────────────

export interface TopologyNode {
  id: string;
  label: string;
  type: string;
  status: string;
  provider: string;
  tenant_id: string;
  /** 실측값(SCP Cloud Monitoring 등 유료 API) 미동의/미수집 시 null - backend NodeSchema.cpu와 1:1 대응.
   * null을 0으로 대체하거나 !로 단언하지 말 것 - "미측정"을 "0%(정상)"으로 오인시키는 것이 이 필드가
   * null을 갖게 된 이유다(§backend/app/services/scp_real_topology.py 버그 배경). */
  cpu: number | null;
  memory: number | null;
  tier?: string | null;
  subnet?: string | null;
  region?: string | null;
}

export interface TopologyLink {
  source: string;
  target: string;
  type: string;
}

export interface Topology {
  nodes: TopologyNode[];
  links: TopologyLink[];
  /** 실 SCP VM(fetch_real_vms) 주입 성공 시에만 REAL, 그 외에는 SIMULATED (기본값) */
  data_source: DataSource;
}

// ── 메트릭 (GET /monitor/metrics) ──────────────────────────────────────────

export interface MetricPoint {
  timestamp: string;
  value: number;
}

/** GET /monitor/metrics 응답 — backend MetricSeriesResponse와 1:1 대응 */
export interface MetricSeriesResponse {
  data_source: DataSource;
  node_id: string;
  metric_name: string;
  points: MetricPoint[];
}

// ── 로그 / 이벤트 (GET /monitor/logs, GET /monitor/events) ────────────────

export interface LogEntry {
  timestamp: string;
  node_id: string;
  node_label: string;
  provider: string;
  message: string;
  level: string;
  /** 로그 실 API(Cloud Logging)는 아직 미검증이므로 항목별로 항상 SIMULATED (구조만 준비) */
  data_source: DataSource;
}

export interface AlertEvent {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  node_id: string;
  provider: string;
  tenant_id: string;
  created_at: string;
}

// ── FinOps 비용 (GET /monitor/costs, /costs/anomalies, /costs/rightsizing) ─

export interface CostRecommendation {
  node_id: string;
  reason: string;
  action: string;
  current_monthly_cost: number;
  target_monthly_cost: number;
  savings: number;
}

export interface DailyCostTrend {
  date: string;
  amount: number;
}

export interface CostSummary {
  currency: string;
  monthly_total: number;
  daily_average: number;
  daily_trends: DailyCostTrend[];
  recommendations: CostRecommendation[];
  /** 비용 실 API(Billing)는 아직 미검증이므로 항상 SIMULATED (구조만 준비) */
  data_source: DataSource;
}

/** FinOpsService.detect_cost_anomalies() 반환 형태 (전용 pydantic 스키마 없음) */
export interface CostAnomaly {
  date: string;
  average_amount: number;
  anomaly_amount: number;
  difference: number;
  severity: "CRITICAL" | "WARNING";
  reason: string;
}

/** FinOpsService.get_dynamic_rightsizing() 반환 형태 */
export interface RightsizingRecommendation {
  node_id: string;
  node_label: string;
  avg_cpu: number;
  action: "Downgrade (Scale-Down)" | "Upgrade (Scale-Up)";
  reason: string;
  current_monthly_cost: number;
  target_monthly_cost: number;
  savings: number;
  recommendation_text: string;
}

/** POST /aiops/costs/simulate-rightsizing — FinOpsService.simulate_rightsizing() 반환 형태 */
export interface RightsizingSimulationPoint {
  timestamp: string;
  original_value: number;
  simulated_value: number;
}

// ── AIOps 예측 / 탐지 ───────────────────────────────────────────────────────

/** GET /monitor/predictions — PredictionService.predict_disk_saturation() + history/node_id 병합 */
export interface DiskPrediction {
  current_usage_pct: number;
  growth_rate_pct_day: number;
  days_to_saturation: number;
  saturates_soon: boolean;
  reason: string;
  history: number[];
  node_id: string;
}

/** POST /aiops/detection/run — MonitoringService.run_detection_cycle() 반환 형태 */
export interface DetectionRunDetail {
  source: "threshold" | "anomaly" | string;
  node_id: string;
  metric_name: string;
  current_value: number;
  threshold?: number;
  operator?: string;
  z_score?: number;
  incident_id: number | null;
}

export interface DetectionRunResult {
  tenant_id: string;
  scanned_nodes: number;
  candidates: number;
  suppressed: number;
  incidents_created: number[];
  details: DetectionRunDetail[];
}

/** GET /aiops/incidents/{id}/timeline-cards */
export interface IncidentTimelineCard {
  timestamp: string;
  event_type: "TRIGGERED" | "ANOMALY_DETECT" | "CORRELATION" | "RECOMMENDATION" | string;
  title: string;
  description: string;
  severity: "CRITICAL" | "WARNING" | "INFO" | "SUCCESS" | string;
  meta: Record<string, unknown>;
}

/** POST /aiops/incidents/{id}/run-action-script */
export interface ActionScriptResult {
  status: "SUCCESS" | "FAILED";
  message?: string;
  execution_log?: string;
}

// ── 네트워크 / 보안 ─────────────────────────────────────────────────────────

export interface NetworkPathStatus {
  status: "ACTIVE" | "STANDBY" | "FAILED";
  packet_loss: number;
  bandwidth_mbps: number;
}

export interface NetworkPaths {
  dedicated: NetworkPathStatus;
  vpn: NetworkPathStatus;
}

export type BlockedIp = string;

// ── 인시던트 (L1~L5 대응) ──────────────────────────────────────────────────

/** 헌법 #4: L5 자동조치 추천→승인→실행 3단계 상태머신 */
export type RemediationStatus = "NONE" | "RECOMMENDED" | "APPROVED" | "EXECUTED";

export interface Incident {
  id: number;
  tenant_id: string;
  title: string;
  description?: string | null;
  status: string;
  severity: string;
  assigned_to?: string | null;
  created_at: string;
  resolved_at?: string | null;
  remediation_status: RemediationStatus;
  remediation_action?: string | null;
  remediation_approved_by?: string | null;
}

export interface IncidentTimelineEntry {
  id: number;
  incident_id: number;
  event_type: string;
  actor: string;
  message: string;
  created_at: string;
}

export interface IncidentDetail {
  incident: Incident;
  timeline: IncidentTimelineEntry[];
}

export interface IncidentUpdatePayload {
  status: string;
  assigned_to?: string;
}

export interface MonthlyReport {
  report_markdown: string;
}

// ── 알람 / 감사로그 (§헌법 3: 감사로그 5년 보관) ───────────────────────────

export interface AlertRuleCreate {
  name: string;
  metric_name: string;
  operator: "gt" | "lt" | "eq";
  threshold: number;
  duration_minutes: number;
}

export interface AlertRule {
  id: number;
  tenant_id: string;
  name: string;
  metric_name: string;
  operator: string;
  threshold: number;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
}

export interface AuditLog {
  id: number;
  tenant_id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  created_at: string;
}

// ── MSP 멀티테넌트 전체 보기 / 온보딩 (GET /monitor/overview, POST /tenants) ─
// backend/app/schemas/monitor.py TenantOverviewSchema · TenantCreateRequest와 1:1 대응.

/** 인시던트/경보/경고 자원 유무로 파생되는 고객사 헬스 라벨 */
export type TenantHealth = "healthy" | "warning" | "critical";

/** GET /monitor/overview(admin 전용) — 고객사별 요약 집계 카드 1건 */
export interface TenantOverview {
  tenant_id: string;
  name: string;
  providers: string[];
  resource_count: number;
  active_incidents: number;
  active_alerts: number;
  monthly_cost: number;
  health: TenantHealth;
}

/** POST /tenants(admin 전용, license write gate) 요청 바디 — 신규 고객사 온보딩 */
export interface TenantCreatePayload {
  id: string;
  name: string;
}

// ── 클라우드 자격증명 (GET/POST/DELETE /credentials) — append ──────────────
// backend/app/schemas/credential.py CredentialResponse와 1:1 대응.
// 평문 자격증명(access_key/secret_key 등)은 절대 담기지 않는다 — 항상 마스킹된 메타데이터만.

export interface CloudCredential {
  id: number;
  tenant_id: string;
  provider: ProviderId;
  name: string;
  created_at: string;
}

// ── 서비스 활성화 (GET /monitor/service-status, PUT /tenants/{id}/services/{key}) — append ──
// 과금 서비스(SCP Cloud Monitoring/Cloud Logging 등)는 고객사·서비스 단위 명시 동의 전에는
// 절대 호출하지 않는다(CEO 결정). 데모 테넌트는 항상 enabled:true, billable:false, last_status:"ok"로
// 응답해, 데모 워크스페이스 화면에는 미활성화 안내가 절대 노출되지 않는다.

export type ServiceLastStatus = "unknown" | "ok" | "forbidden" | "error";

export interface ServiceStatus {
  provider: ProviderId;
  service_key: string;
  display_name: string;
  enabled: boolean;
  billable: boolean;
  last_status: ServiceLastStatus;
  last_checked_at: string | null;
}
