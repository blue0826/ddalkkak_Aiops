"use client";

/**
 * 전 고객사 통합 현황(NOC 벽) 전용 데이터 훅 — GET /monitor/overview(고객사별 요약)와
 * GET /monitor/topology?tenant_id=system(전 고객사 합산 토폴로지)을 각각 독립적으로 조회한다.
 * 두 리소스를 하나로 합치지 않고 따로 반환하는 이유: 한쪽이 실패해도 다른 쪽 위젯은 그대로
 * 동작해야 하기 때문이다(패널 단위 장애 격리, useApiResource 설계 원칙과 동일).
 * useApiResource가 전역 갱신 주기(RefreshProvider)를 그대로 따르므로 별도 폴링을 만들지 않는다.
 */
import { useApiResource, type ApiResourceState } from "@/hooks/useApiResource";
import { getTenantOverview, getTopology } from "@/lib/api";
import type { TenantOverview, Topology } from "@/lib/types";

export interface FleetOverviewResult {
  overview: ApiResourceState<TenantOverview[]>;
  topology: ApiResourceState<Topology>;
}

export function useFleetOverview(): FleetOverviewResult {
  const overview = useApiResource(() => getTenantOverview(), []);
  const topology = useApiResource(() => getTopology({ tenant_id: "system" }), []);

  return { overview, topology };
}
