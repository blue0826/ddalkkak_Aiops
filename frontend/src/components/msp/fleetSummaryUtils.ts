/**
 * 전 고객사 통합 KPI/SLA 롤업 집계 — GET /monitor/overview 배열을 클라이언트에서 합산한다.
 * React/DOM에 의존하지 않는 순수 함수(테스트 용이성, dashboardUtils.ts와 동일한 원칙).
 */
import type { TenantHealth, TenantOverview } from "@/lib/types";

export interface FleetStats {
  totalCustomers: number;
  healthCounts: Record<TenantHealth, number>;
  totalResources: number;
  totalIncidents: number;
  totalAlerts: number;
  totalCost: number;
}

export function computeFleetStats(overview: TenantOverview[]): FleetStats {
  const healthCounts: Record<TenantHealth, number> = { healthy: 0, warning: 0, critical: 0 };
  let totalResources = 0;
  let totalIncidents = 0;
  let totalAlerts = 0;
  let totalCost = 0;

  for (const tenant of overview) {
    healthCounts[tenant.health] += 1;
    totalResources += tenant.resource_count;
    totalIncidents += tenant.active_incidents;
    totalAlerts += tenant.active_alerts;
    totalCost += tenant.monthly_cost;
  }

  return {
    totalCustomers: overview.length,
    healthCounts,
    totalResources,
    totalIncidents,
    totalAlerts,
    totalCost,
  };
}
