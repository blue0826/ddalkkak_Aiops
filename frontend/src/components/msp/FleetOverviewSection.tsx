"use client";

/**
 * "전 고객사 통합 현황" 섹션 — MSP 관리자 기본(고객사별) 뷰 최상단에 배치되는 NOC 벽 요약.
 * KPI/SLA 롤업 스트립 → 자원 분포 차트 순으로 쌓이고, 그 아래에 기존 TenantOverviewGrid
 * (고객사 카드 그리드)가 헬스 매트릭스 역할을 그대로 겸한다(카드 중복 금지, CEO 지시).
 * 두 데이터 소스(overview/topology)는 useFleetOverview가 독립적으로 조회하므로 한쪽이
 * 실패해도 다른 패널은 그대로 갱신된다.
 */
import { useProviders } from "@/hooks/useProviders";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { GLOSSARY } from "@/lib/glossary";
import { oldestUpdate } from "@/components/dashboard/dashboardUtils";
import { useMinutesAgo } from "@/components/dashboard/useMinutesAgo";
import { FleetSummaryStrip } from "./FleetSummaryStrip";
import { ResourceDistribution } from "./ResourceDistribution";
import { useFleetOverview } from "./useFleetOverview";

export function FleetOverviewSection() {
  const { overview, topology } = useFleetOverview();
  const { providers } = useProviders();

  const lastUpdated = oldestUpdate(overview.lastUpdated, topology.lastUpdated);
  const minutesAgo = useMinutesAgo(lastUpdated);

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <h2 className="font-semibold" style={{ font: "var(--text-h2)" }}>
            전 고객사 통합 현황
          </h2>
          <InfoTooltip label="전 고객사 통합 현황 설명">{GLOSSARY.fleet_summary}</InfoTooltip>
        </span>
        {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
      </header>

      <FleetSummaryStrip
        data={overview.data}
        isLoading={overview.isLoading}
        error={overview.error}
        onRetry={overview.refetch}
      />

      <ResourceDistribution
        topology={topology.data}
        providers={providers}
        isLoading={topology.isLoading}
        error={topology.error}
        onRetry={topology.refetch}
      />
    </section>
  );
}
