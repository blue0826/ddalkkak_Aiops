/**
 * 전 고객사 통합 자원 분포 집계 — GET /monitor/topology?tenant_id=system 노드 배열을
 * 프로바이더·리전·유형별로 클라이언트에서 집계한다. React/DOM에 의존하지 않는 순수 함수.
 */
import type { TopologyNode } from "@/lib/types";

export interface DistributionEntry {
  key: string;
  label: string;
  count: number;
}

/** 차트 계열색 램프(§4.3, 비-의미 시리즈용 최대 5개) — 카테고리가 5개를 넘으면 순환한다. */
const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function chartColorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

function countBy(
  nodes: TopologyNode[],
  keyFn: (node: TopologyNode) => string | null | undefined,
  labelFn: (key: string) => string,
  fallbackLabel: string
): DistributionEntry[] {
  const FALLBACK_KEY = "__unspecified__";
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const raw = keyFn(node);
    const key = raw && raw.trim() ? raw : FALLBACK_KEY;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count, label: key === FALLBACK_KEY ? fallbackLabel : labelFn(key) }))
    .sort((a, b) => b.count - a.count);
}

/** 프로바이더 ID(scp/aws 등)별 자원 수 — 레지스트리 표시명/색은 호출부(ProviderDistributionChart)가 입힌다. */
export function countByProviderId(nodes: TopologyNode[]): DistributionEntry[] {
  return countBy(
    nodes,
    (n) => n.provider,
    (key) => key.toUpperCase(),
    "기타"
  );
}

export function countByRegion(nodes: TopologyNode[]): DistributionEntry[] {
  return countBy(
    nodes,
    (n) => n.region,
    (key) => key,
    "미지정"
  );
}

export function countByType(nodes: TopologyNode[], typeLabel: (type: string) => string): DistributionEntry[] {
  return countBy(nodes, (n) => n.type, typeLabel, "기타");
}

export function totalCount(entries: DistributionEntry[]): number {
  return entries.reduce((sum, e) => sum + e.count, 0);
}

export function percentOf(count: number, total: number): number {
  if (total <= 0) return 0;
  return (count / total) * 100;
}
