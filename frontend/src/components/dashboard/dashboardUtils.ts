/**
 * 대시보드 화면 전용 순수 함수 모음 — API 응답을 KPI/차트/테이블 props로 가공한다.
 * React/DOM에 의존하지 않는다(테스트 용이성, page.tsx와 하위 컴포넌트 간 로직 공유).
 */
import type { DeltaPolarity } from "@/components/ui/DeltaBadge";
import type { StatusTone } from "@/components/ui/StatusBadge";
import type { TimeSeriesPoint } from "@/components/ui/TimeSeriesChart";
import type { DailyCostTrend, DataSource, Incident, MetricPoint, MetricSeriesResponse, Topology, TopologyNode } from "@/lib/types";

/**
 * 방어적 정규화 — 검증 중 실 서버(GET /monitor/metrics)가 문서화된 계약(MetricSeriesResponse,
 * backend/app/schemas/monitor.py·routers/monitor.py response_model과 types.ts에 명시)과 달리
 * points 배열을 그대로(래핑 없이) 반환하는 경우를 확인했다(운영 중인 백엔드 프로세스가 최신 소스와
 * 어긋난 것으로 추정 — 백엔드 재기동으로 해결될 사안, 프론트 소유 범위 밖). 계약대로 오면 그대로 쓰고,
 * 배열로 오면 감싸서 흡수해 화면이 깨지지 않게 한다.
 */
export function normalizeMetricSeries(
  raw: MetricSeriesResponse | MetricPoint[] | null | undefined
): { points: MetricPoint[]; dataSource: DataSource | undefined } {
  if (!raw) return { points: [], dataSource: undefined };
  if (Array.isArray(raw)) return { points: raw, dataSource: undefined };
  return { points: raw.points ?? [], dataSource: raw.data_source };
}

/** FilterBar의 range 값(1h/24h/7d/30d)을 getMetrics의 minutes 파라미터로 변환한다. */
export function rangeToMinutes(range: string): number {
  switch (range) {
    case "1h":
      return 60;
    case "7d":
      return 60 * 24 * 7;
    case "30d":
      return 60 * 24 * 30;
    case "24h":
    default:
      return 60 * 24;
  }
}

/**
 * 골든 시그널 패널에 띄울 "핵심 노드"를 고른다 — 현재 CPU 사용률이 가장 높은
 * vm/database 노드(가장 관찰할 가치가 있는 자원). 후보가 없으면 null.
 */
export function pickFeaturedNode(topology: Topology | null): TopologyNode | null {
  if (!topology) return null;
  const candidates = topology.nodes.filter((n) => n.type === "vm" || n.type === "database");
  if (candidates.length === 0) return null;
  // cpu가 null(미측정)인 노드는 최저값(-1)으로 취급해 실측치가 있는 노드에 밀리게 한다 -
  // 전부 미측정이면 지어낸 순위 없이 그냥 첫 후보를 그대로 반환한다.
  return candidates.reduce((worst, n) => ((n.cpu ?? -1) > (worst.cpu ?? -1) ? n : worst), candidates[0]);
}

/** OPEN 인시던트 중 최고 심각도를 5초 규칙용 전체 상태 톤으로 환산한다. */
export function computeHealthTone(incidents: Incident[] | null): StatusTone {
  if (!incidents) return "ok";
  const open = incidents.filter((i) => i.status === "OPEN");
  if (open.some((i) => i.severity === "CRITICAL")) return "crit";
  if (open.length > 0) return "warn";
  return "ok";
}

export function severityToTone(severity: string): StatusTone {
  if (severity === "CRITICAL") return "crit";
  if (severity === "WARNING") return "warn";
  return "ok";
}

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "심각",
  WARNING: "경고",
  INFO: "정보",
};

export function severityLabel(severity: string): string {
  return SEVERITY_LABEL[severity] ?? severity;
}

const INCIDENT_STATUS_TONE: Record<string, StatusTone> = {
  OPEN: "crit",
  INVESTIGATING: "warn",
  RESOLVED: "ok",
};

export function incidentStatusTone(status: string): StatusTone {
  return INCIDENT_STATUS_TONE[status] ?? "warn";
}

const INCIDENT_STATUS_LABEL: Record<string, string> = {
  OPEN: "신규",
  INVESTIGATING: "조치중",
  RESOLVED: "해결됨",
};

export function incidentStatusLabel(status: string): string {
  return INCIDENT_STATUS_LABEL[status] ?? status;
}

/** CPU/메모리 두 시계열을 timestamp 기준으로 병합해 TimeSeriesChart 입력 형태로 만든다. */
export function mergeMetricSeries(cpu: MetricPoint[], memory: MetricPoint[]): TimeSeriesPoint[] {
  const merged = new Map<string, TimeSeriesPoint>();
  for (const point of cpu) {
    merged.set(point.timestamp, { ts: point.timestamp, cpu: point.value });
  }
  for (const point of memory) {
    const existing = merged.get(point.timestamp);
    if (existing) existing.memory = point.value;
    else merged.set(point.timestamp, { ts: point.timestamp, memory: point.value });
  }
  return Array.from(merged.values()).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

/**
 * 방어적 숫자 변환 — 검증 중 실 서버가 CostSummary의 Decimal 필드(daily_average, amount 등)를
 * JSON 숫자가 아니라 문자열("26730.0")로 내려주는 것을 확인했다(FastAPI Decimal 직렬화 방식·백엔드
 * 프로세스 이슈로 추정, 프론트 소유 범위 밖). types.ts는 number로 선언돼 있어 Number.isFinite가
 * 문자열엔 항상 false이므로, 소비 지점에서 Number()로 한 번 정규화해 값이 "-"로 죽지 않게 한다.
 */
function toNumber(value: number): number {
  return typeof value === "number" ? value : Number(value);
}

/** 최근 일별 비용 추이에서 "마지막 날 vs 이전 평균" 증감률을 구한다. 실데이터 없이 델타를 지어내지 않는다. */
export function computeCostDelta(
  trends: DailyCostTrend[]
): { value: number; polarity: DeltaPolarity } | undefined {
  if (trends.length < 2) return undefined;
  const last = toNumber(trends[trends.length - 1].amount);
  const rest = trends.slice(0, -1);
  const avgRest = rest.reduce((sum, t) => sum + toNumber(t.amount), 0) / rest.length;
  if (!Number.isFinite(avgRest) || avgRest === 0 || !Number.isFinite(last)) return undefined;
  const pctChange = ((last - avgRest) / avgRest) * 100;
  return { value: pctChange, polarity: "increase-bad" };
}

/** costs.daily_average/daily_trends[].amount를 화면에 쓰기 전 안전한 number로 정규화한다. */
export const normalizeAmount = toNumber;

/** 마지막 성공 조회 시각 여러 개 중 가장 오래된 것을 StaleIndicator 기준으로 쓴다(가장 보수적인 신선도). */
export function oldestUpdate(...dates: Array<Date | null>): Date | null {
  const valid = dates.filter((d): d is Date => d !== null);
  if (valid.length === 0) return null;
  return valid.reduce((oldest, d) => (d < oldest ? d : oldest), valid[0]);
}
