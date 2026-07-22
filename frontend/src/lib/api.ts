/**
 * 백엔드(FastAPI) 타입드 fetch 클라이언트.
 *
 * - NEXT_PUBLIC_API_BASE_URL 기반, 기본값 http://127.0.0.1:8000/api/v1
 * - Authorization 헤더 자동 부착, 401 응답 시 토큰 폐기 + onUnauthorized 구독자 통지
 * - 자격증명·시크릿은 절대 쿼리스트링에 싣지 않는다 — 반드시 POST 바디로 전달한다.
 */
import { getAuthToken, notifyUnauthorized } from "./auth-storage";
import type {
  ActionScriptResult,
  AlertEvent,
  AlertRule,
  AlertRuleCreate,
  AuditLog,
  AuthToken,
  BlockedIp,
  CostAnomaly,
  CostSummary,
  DetectionRunResult,
  DiskPrediction,
  Incident,
  IncidentDetail,
  IncidentTimelineCard,
  IncidentUpdatePayload,
  License,
  LoginPayload,
  LogEntry,
  MetricSeriesResponse,
  MonthlyReport,
  NetworkPaths,
  Provider,
  RightsizingRecommendation,
  RightsizingSimulationPoint,
  ServiceStatus,
  Tenant,
  TenantCreatePayload,
  TenantOverview,
  Topology,
} from "./types";
import type { CloudCredential } from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export class ApiError extends Error {
  status: number;
  detail?: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** 쿼리 파라미터. 값은 항상 string|number|boolean|undefined여야 한다(자격증명 절대 금지). */
  query?: object;
  /** 로그인처럼 아직 토큰이 없는 요청에 사용 */
  skipAuth?: boolean;
}

function buildUrl(path: string, query?: object): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query as Record<string, QueryValue>)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, skipAuth = false } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!skipAuth) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    throw new ApiError(
      "네트워크 요청에 실패했습니다. 백엔드 서버 연결 상태를 확인하십시오.",
      0,
      networkError
    );
  }

  if (res.status === 401) {
    notifyUnauthorized();
    throw new ApiError("인증이 만료되었습니다. 다시 로그인하십시오.", 401);
  }

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text().catch(() => undefined);
    }
    const detailMessage =
      typeof detail === "object" && detail !== null && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : undefined;
    throw new ApiError(detailMessage ?? `요청이 실패했습니다 (HTTP ${res.status}).`, res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── 인증 ──────────────────────────────────────────────────────────────────

export function login(payload: LoginPayload): Promise<AuthToken> {
  return request<AuthToken>("/auth/login", { method: "POST", body: payload, skipAuth: true });
}

// ── 프로바이더 레지스트리 ────────────────────────────────────────────────

export function getProviders(): Promise<Provider[]> {
  return request<Provider[]>("/providers");
}

export function getProvider(id: string): Promise<Provider> {
  return request<Provider>(`/providers/${id}`);
}

// ── 테넌트 / 라이선스 ─────────────────────────────────────────────────────

export function getTenants(): Promise<Tenant[]> {
  return request<Tenant[]>("/tenants");
}

export function getLicense(): Promise<License> {
  return request<License>("/license");
}

// ── 모니터링 ──────────────────────────────────────────────────────────────

export interface ScopeQuery {
  tenant_id?: string;
  provider?: string;
}

export function getTopology(query?: ScopeQuery): Promise<Topology> {
  return request<Topology>("/monitor/topology", { query });
}

export function getMetrics(params: {
  node_id: string;
  metric_name: string;
  minutes?: number;
  provider?: string;
  tenant_id?: string;
}): Promise<MetricSeriesResponse> {
  return request<MetricSeriesResponse>("/monitor/metrics", { query: params });
}

export function getLogs(query?: ScopeQuery & { limit?: number }): Promise<LogEntry[]> {
  return request<LogEntry[]>("/monitor/logs", { query });
}

export function getEvents(query?: ScopeQuery): Promise<AlertEvent[]> {
  return request<AlertEvent[]>("/monitor/events", { query });
}

export function getCosts(query?: ScopeQuery): Promise<CostSummary> {
  return request<CostSummary>("/monitor/costs", { query });
}

export function getCostAnomalies(query?: ScopeQuery): Promise<CostAnomaly[]> {
  return request<CostAnomaly[]>("/monitor/costs/anomalies", { query });
}

export function getRightsizingRecommendations(
  query?: ScopeQuery
): Promise<RightsizingRecommendation[]> {
  return request<RightsizingRecommendation[]>("/monitor/costs/rightsizing", { query });
}

export function getDiskPrediction(query?: ScopeQuery & { node_id?: string }): Promise<DiskPrediction> {
  return request<DiskPrediction>("/monitor/predictions", { query });
}

export function getNetworkPaths(query?: ScopeQuery): Promise<NetworkPaths> {
  return request<NetworkPaths>("/monitor/network/paths", { query });
}

export function triggerNetworkBypass(
  action: "trigger" | "recover",
  query?: ScopeQuery
): Promise<NetworkPaths> {
  return request<NetworkPaths>("/monitor/network/bypass", { method: "POST", query: { action, ...query } });
}

export function getBlockedIps(query?: ScopeQuery): Promise<BlockedIp[]> {
  return request<BlockedIp[]>("/monitor/security/blocked", { query });
}

export function triggerSoarBlock(ip: string, query?: ScopeQuery): Promise<boolean> {
  return request<boolean>("/monitor/security/soar", { method: "POST", query: { ip, ...query } });
}

// ── AIOps 탐지 / FinOps 시뮬레이션 ─────────────────────────────────────────

export function runDetectionCycle(): Promise<DetectionRunResult> {
  return request<DetectionRunResult>("/aiops/detection/run", { method: "POST" });
}

export function simulateRightsizing(query: {
  node_id: string;
  scale_ratio?: number;
}): Promise<RightsizingSimulationPoint[]> {
  return request<RightsizingSimulationPoint[]>("/aiops/costs/simulate-rightsizing", { query });
}

export function getIncidentTimelineCards(incidentId: number): Promise<IncidentTimelineCard[]> {
  return request<IncidentTimelineCard[]>(`/aiops/incidents/${incidentId}/timeline-cards`);
}

export function runActionScript(incidentId: number, script: string): Promise<ActionScriptResult> {
  return request<ActionScriptResult>(`/aiops/incidents/${incidentId}/run-action-script`, {
    method: "POST",
    body: { script },
  });
}

// ── 인시던트 (L1~L5) ────────────────────────────────────────────────────────

export function getIncidents(tenantId?: string): Promise<Incident[]> {
  // 관리자는 tenant_id로 특정 고객사 인시던트를 조회할 수 있다(MSP 드릴다운). 비관리자는 무시된다.
  return request<Incident[]>("/incidents", { query: { tenant_id: tenantId } });
}

export function getIncident(id: number): Promise<IncidentDetail> {
  return request<IncidentDetail>(`/incidents/${id}`);
}

export function updateIncident(id: number, payload: IncidentUpdatePayload): Promise<Incident> {
  return request<Incident>(`/incidents/${id}`, { method: "PUT", body: payload });
}

export function analyzeIncident(id: number): Promise<Record<string, string>> {
  return request<Record<string, string>>(`/incidents/${id}/analyze`, { method: "POST" });
}

/** [L5 1단계: 추천] AI가 권장 조치를 산출한다. 절대 실행하지 않는다. */
export function recommendRemediation(id: number): Promise<Incident> {
  return request<Incident>(`/incidents/${id}/remediation/recommend`, { method: "POST" });
}

/** [L5 2단계: 승인] 사람이 승인한다 (헌법 #4: AI 추천, 사람 결정). */
export function approveRemediation(id: number): Promise<Incident> {
  return request<Incident>(`/incidents/${id}/remediation/approve`, { method: "POST" });
}

/** [L5 3단계: 실행] APPROVED 상태의 조치를 [시뮬레이션] 실행한다. */
export function executeRemediation(id: number): Promise<Incident> {
  return request<Incident>(`/incidents/${id}/remediation/execute`, { method: "POST" });
}

export function getMonthlyReport(): Promise<MonthlyReport> {
  return request<MonthlyReport>("/incidents/report/monthly");
}

// ── 알람 규칙 / 감사로그 (헌법 §3: 감사로그 5년 보관) ──────────────────────

export function getAlertRules(): Promise<AlertRule[]> {
  return request<AlertRule[]>("/alerts/rules");
}

export function createAlertRule(payload: AlertRuleCreate): Promise<AlertRule> {
  return request<AlertRule>("/alerts/rules", { method: "POST", body: payload });
}

export function deleteAlertRule(id: number): Promise<void> {
  return request<void>(`/alerts/rules/${id}`, { method: "DELETE" });
}

export function getAuditLogs(limit?: number): Promise<AuditLog[]> {
  return request<AuditLog[]>("/alerts/audit-logs", { query: { limit } });
}

// ── MSP 멀티테넌트 전체 보기 / 온보딩 (admin 전용) ───────────────────────────

/** 전 고객사(system 제외) 요약 집계 — 대시보드 "고객사별" 카드 그리드가 이 API 하나로 그려진다. */
export function getTenantOverview(): Promise<TenantOverview[]> {
  return request<TenantOverview[]>("/monitor/overview");
}

/** 신규 고객사 온보딩. 중복 ID는 409, 라이선스 쓰기 게이트 미충족 시 별도 오류로 거부된다. */
export function createTenant(payload: TenantCreatePayload): Promise<Tenant> {
  return request<Tenant>("/tenants", { method: "POST", body: payload });
}

// ── 고객사 삭제 / 자격증명 관리 (관리자, append) ────────────────────────────

/** 고객사 삭제(관리자 전용). 연결된 자격증명도 함께 삭제된다. */
export function deleteTenant(id: string): Promise<void> {
  return request<void>(`/tenants/${id}`, { method: "DELETE" });
}

/** 고객사 이름 수정(관리자 전용). id는 불변이며 name만 수정한다. */
export function updateTenant(id: string, payload: { name: string }): Promise<Tenant> {
  return request<Tenant>(`/tenants/${id}`, { method: "PATCH", body: payload });
}

export interface CredentialCreatePayload {
  provider: string;
  name: string;
  /** 암호화 전 평문 페이로드(JSON 문자열). 시크릿은 절대 쿼리스트링에 싣지 않는다 — POST 바디 전용. */
  auth_data: string;
  /** 관리자가 본인 테넌트가 아닌 특정 고객사에 등록할 때만 지정한다. */
  tenant_id?: string;
}

/** 자격증명 등록. 관리자는 tenant_id로 대상 고객사를 지정할 수 있다. */
export function createCredential(payload: CredentialCreatePayload): Promise<CloudCredential> {
  return request<CloudCredential>("/credentials", { method: "POST", body: payload });
}

/** 자격증명 목록(마스킹). 관리자는 tenant_id로 특정 고객사만 조회할 수 있다(생략 시 전체/본인 테넌트). */
export function listCredentials(tenantId?: string): Promise<CloudCredential[]> {
  return request<CloudCredential[]>("/credentials", { query: { tenant_id: tenantId } });
}

/** 자격증명 삭제(관리자는 임의 고객사의 자격증명도 삭제 가능). */
export function deleteCredential(id: number): Promise<void> {
  return request<void>(`/credentials/${id}`, { method: "DELETE" });
}

// ── 서비스 활성화 (과금 서비스 옵트인, append) ──────────────────────────────
// SCP Cloud Monitoring/Cloud Logging처럼 과금이 발생하는 서비스는 고객사·서비스 단위로
// 명시 동의(기본 OFF) 전에는 호출하지 않는다(CEO 결정).

/** 고객사별 서비스 활성화 상태 조회 — 미활성/권한없음일 때 화면이 안내를 대체 표시하는 데 쓴다. */
export function getServiceStatus(tenantId: string): Promise<ServiceStatus[]> {
  return request<ServiceStatus[]>("/monitor/service-status", { query: { tenant_id: tenantId } });
}

/** 서비스 활성화 전환(SYSTEM_ADMIN 전용). billable 서비스를 켜면 다음 호출부터 과금 API를 부른다. */
export function updateTenantService(
  tenantId: string,
  serviceKey: string,
  enabled: boolean
): Promise<ServiceStatus> {
  return request<ServiceStatus>(`/tenants/${tenantId}/services/${serviceKey}`, {
    method: "PUT",
    body: { enabled },
  });
}
