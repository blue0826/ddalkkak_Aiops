/**
 * 토폴로지 노드 타입 → 한국어 라벨 변환. useProviders()가 제공하는 실 용어(가상 서버 vs
 * EC2 인스턴스 등)를 우선 쓰고, 프로바이더 무관 인프라 타입(로드밸런서 등)만 고정 라벨을 쓴다.
 * 하드코딩 대신 API에서 온 Provider 객체를 우선하는 것이 핵심 — provider가 없을 때만 폴백한다.
 */
import type { DataSource, MetricPoint, MetricSeriesResponse, Provider } from "@/lib/types";

const GENERIC_TYPE_LABEL: Record<string, string> = {
  loadbalancer: "로드밸런서",
  firewall: "방화벽",
  gateway: "게이트웨이",
  subnet: "서브넷",
  vpc: "VPC",
};

export function nodeTypeLabel(type: string, provider?: Provider): string {
  const key = type.toLowerCase();
  if (key === "vm" || key === "instance") return provider?.compute_term_ko ?? "가상 서버";
  if (key === "database") return provider?.database_term ?? "데이터베이스";
  if (key === "storage" || key === "object_storage" || key === "backup") return provider?.storage_term_ko ?? "스토리지";
  return GENERIC_TYPE_LABEL[key] ?? type;
}

export function statusTone(status: string): "ok" | "warn" | "crit" {
  return status === "warning" ? "crit" : "ok";
}

/**
 * 방어적 정규화 — 검증 중 실 서버(GET /monitor/metrics)가 문서화된 계약(MetricSeriesResponse,
 * types.ts·backend response_model에 명시)과 달리 points 배열을 래핑 없이 그대로 반환하는 경우를
 * 확인했다(운영 중인 백엔드 프로세스가 최신 소스와 어긋난 것으로 추정 — 프론트 소유 범위 밖).
 * 계약대로 오면 그대로, 배열로 오면 감싸서 흡수해 상세 패널 미니 차트가 깨지지 않게 한다.
 */
export function normalizeMetricSeries(
  raw: MetricSeriesResponse | MetricPoint[] | null | undefined
): { points: MetricPoint[]; dataSource: DataSource | undefined } {
  if (!raw) return { points: [], dataSource: undefined };
  if (Array.isArray(raw)) return { points: raw, dataSource: undefined };
  return { points: raw.points ?? [], dataSource: raw.data_source };
}
