"use client";

/**
 * 자원 하나의 CPU+메모리 시계열을 한 번의 폴링 훅으로 묶어 가져온다.
 * 다중 그리드에서는 자원 수만큼 카드가 늘어나므로, 카드당 useApiResource를 두 번(cpu/memory
 * 각각) 쓰는 대신 Promise.all로 한 번에 묶어 폴링 인스턴스·setInterval 수를 절반으로 줄인다.
 * intervalMs는 넘기지 않는다 — 전역 갱신 주기(RefreshProvider)를 그대로 상속한다.
 */
import { useApiResource, type ApiResourceState } from "@/hooks/useApiResource";
import { getMetrics } from "@/lib/api";
import type { DataSource, MetricPoint } from "@/lib/types";
import { normalizeMetricSeries } from "./metricsUtils";

export interface NodeMetricsData {
  cpu: MetricPoint[];
  memory: MetricPoint[];
  dataSource: DataSource | undefined;
}

export function useNodeMetrics(
  nodeId: string,
  provider: string | undefined,
  minutes: number,
  tenantId?: string
): ApiResourceState<NodeMetricsData> {
  return useApiResource<NodeMetricsData>(
    async () => {
      const [cpuRaw, memoryRaw] = await Promise.all([
        getMetrics({ node_id: nodeId, metric_name: "cpu", minutes, provider, tenant_id: tenantId }),
        getMetrics({ node_id: nodeId, metric_name: "memory", minutes, provider, tenant_id: tenantId }),
      ]);
      const cpu = normalizeMetricSeries(cpuRaw);
      const memory = normalizeMetricSeries(memoryRaw);
      return { cpu: cpu.points, memory: memory.points, dataSource: cpu.dataSource ?? memory.dataSource };
    },
    [nodeId, provider, minutes, tenantId],
    { enabled: Boolean(nodeId) }
  );
}
