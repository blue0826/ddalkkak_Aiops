/**
 * 메트릭 화면 전용 순수 함수 모음 — API 응답을 카드/상세 패널 props로 가공한다.
 * React/DOM에 의존하지 않는다(테스트 용이성, page.tsx와 하위 컴포넌트 간 로직 공유).
 */
import type { StatusTone } from "@/components/ui/StatusBadge";
import type { TimeSeriesPoint } from "@/components/ui/TimeSeriesChart";
import type { DataSource, MetricPoint, MetricSeriesResponse, TopologyNode } from "@/lib/types";

export const NODE_TYPE_LABEL: Record<string, string> = { vm: "VM", database: "DB" };

/**
 * 실 고객사(non-demo) 메트릭이 정직하게 비어 있을 때(backend data_source="REAL_EMPTY")
 * 쓰는 공통 안내 문구 — 원인(SCP 기본 에이전트리스 수집의 수 시간 간격)과 해결책(범위 확대)을
 * 함께 담는다. 지어낸 값 대신 빈 차트를 그대로 보여주지 않기 위해 이 메시지를 항상 곁들인다.
 */
export const SPARSE_REAL_DATA_MESSAGE =
  "이 구간에 수집된 데이터가 없습니다 — SCP 기본(에이전트리스) 수집은 수 시간 간격이므로 조회 범위를 24시간으로 넓혀 보십시오.";

/** cpu/memory 두 시계열이 모두 비어 있고 data_source가 REAL_EMPTY인지(=지어낸 값이 전혀 없는 정직한 빈 상태) 판별한다. */
export function isRealEmptySeries(
  dataSource: DataSource | undefined,
  cpuPoints: MetricPoint[],
  memoryPoints: MetricPoint[]
): boolean {
  return dataSource === "REAL_EMPTY" && cpuPoints.length === 0 && memoryPoints.length === 0;
}

/** 토폴로지 노드 status → StatusBadge 톤. "warning"만 경고, 그 외는 정상(§CEO 피드백: 경고 강조). */
export function statusTone(status: string): StatusTone {
  return status === "warning" ? "warn" : "ok";
}

/**
 * 방어적 정규화 — 검증 중 실 서버(GET /monitor/metrics)가 문서화된 계약(MetricSeriesResponse,
 * backend/app/schemas/monitor.py·routers/monitor.py response_model과 types.ts에 명시)과 달리
 * points 배열을 래핑 없이 그대로 반환하는 경우가 관측되었다(dashboardUtils.ts·topologyLabels.ts와
 * 동일 이슈 — 운영 중인 백엔드 프로세스가 최신 소스와 어긋난 것으로 추정, 프론트 소유 범위 밖).
 * 계약대로 오면 그대로, 배열로 오면 감싸서 흡수해 카드/상세 차트가 깨지지 않게 한다.
 */
export function normalizeMetricSeries(
  raw: MetricSeriesResponse | MetricPoint[] | null | undefined
): { points: MetricPoint[]; dataSource: DataSource | undefined } {
  if (!raw) return { points: [], dataSource: undefined };
  if (Array.isArray(raw)) return { points: raw, dataSource: undefined };
  return { points: raw.points ?? [], dataSource: raw.data_source };
}

/**
 * 경고(warning) 자원을 상단으로 정렬하고, 그 외에는 원래 순서를 유지하는 안정 정렬.
 * CEO 피드백 반영: "경고 자원이 눈에 먼저 띄어야 한다".
 */
export function sortWarningFirst(nodes: TopologyNode[]): TopologyNode[] {
  return [...nodes].sort((a, b) => {
    const aWarn = a.status === "warning" ? 0 : 1;
    const bWarn = b.status === "warning" ? 0 : 1;
    return aWarn - bWarn;
  });
}

/** 노드 label("이름\n부가정보")을 제목/부제로 분리한다. */
export function splitNodeLabel(label: string): { title: string; subtitle?: string } {
  const [title, subtitle] = label.split("\n");
  return { title, subtitle };
}

/** CPU/메모리 두 시계열을 timestamp 기준으로 병합해 TimeSeriesChart 입력 형태로 만든다(상세 패널용). */
export function mergeCpuMemory(cpu: MetricPoint[], memory: MetricPoint[]): TimeSeriesPoint[] {
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
