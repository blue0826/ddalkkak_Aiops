/**
 * 대시보드 행1 · 상태 요약 — §5.2 Row 1. KPI 카드 4개.
 * 개별 리소스가 아직 조회되지 않았으면(null) 해당 카드만 "—"로 표시해 다른 카드를 막지 않는다.
 */
import type { ReactNode } from "react";
import { AlertTriangle, BellRing, Boxes, Wallet } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { fmtCount, fmtKRW } from "@/components/ui/format";
import type { DeltaPolarity } from "@/components/ui/DeltaBadge";
import type { CostSummary, Topology } from "@/lib/types";
import { GLOSSARY } from "@/lib/glossary";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { computeCostDelta, normalizeAmount } from "./dashboardUtils";

/**
 * KpiCard(components/ui, 공유 파일)는 라벨 옆에 설명을 넣을 슬롯이 없어 수정할 수 없으므로,
 * 카드 바깥 모서리에 살짝 걸치는 ⓘ 배지로 설명을 붙인다(카드 내부 아이콘과 겹치지 않음).
 */
function KpiWithTooltip({ tooltipLabel, tooltip, children }: { tooltipLabel: string; tooltip: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="absolute -right-1.5 -top-1.5 z-10">
        <InfoTooltip label={tooltipLabel}>{tooltip}</InfoTooltip>
      </span>
    </div>
  );
}

interface StatusSummaryRowProps {
  isLoading: boolean;
  topology: Topology | null;
  openIncidentCount: number | null;
  totalIncidentCount: number | null;
  activeEventCount: number | null;
  totalEventCount: number | null;
  costs: CostSummary | null;
}

export function StatusSummaryRow({
  isLoading,
  topology,
  openIncidentCount,
  totalIncidentCount,
  activeEventCount,
  totalEventCount,
  costs,
}: StatusSummaryRowProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={132} />
        ))}
      </div>
    );
  }

  const scpCount = topology?.nodes.filter((n) => n.provider === "scp").length ?? 0;
  const awsCount = topology?.nodes.filter((n) => n.provider === "aws").length ?? 0;
  const costDelta: { value: number; polarity: DeltaPolarity } | undefined = costs
    ? computeCostDelta(costs.daily_trends)
    : undefined;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiWithTooltip tooltipLabel="관제 자원 수 설명" tooltip={GLOSSARY.managed_resources}>
        <KpiCard
          label="관제 자원 수"
          value={topology ? fmtCount(topology.nodes.length) : "—"}
          comparisonLabel={topology ? `SCP ${scpCount} · AWS ${awsCount}` : undefined}
          dataSource={topology?.data_source}
          icon={Boxes}
        />
      </KpiWithTooltip>
      <KpiWithTooltip tooltipLabel="활성 인시던트 설명" tooltip={GLOSSARY.active_incidents}>
        <KpiCard
          label="활성 인시던트"
          value={openIncidentCount !== null ? fmtCount(openIncidentCount) : "—"}
          comparisonLabel={totalIncidentCount !== null ? `전체 ${totalIncidentCount}건 중` : undefined}
          icon={AlertTriangle}
        />
      </KpiWithTooltip>
      <KpiWithTooltip tooltipLabel="활성 경보 설명" tooltip={GLOSSARY.active_alerts}>
        <KpiCard
          label="활성 경보"
          value={activeEventCount !== null ? fmtCount(activeEventCount) : "—"}
          comparisonLabel={totalEventCount !== null ? `전체 ${totalEventCount}건 중` : undefined}
          icon={BellRing}
        />
      </KpiWithTooltip>
      <KpiWithTooltip tooltipLabel="오늘 예상 비용 설명" tooltip={GLOSSARY.today_cost}>
        <KpiCard
          label="오늘 예상 비용"
          value={costs ? fmtKRW(normalizeAmount(costs.daily_average)) : "—"}
          delta={costDelta}
          comparisonLabel={costDelta ? "최근 추이 평균 대비" : undefined}
          sparkline={costs?.daily_trends.map((t) => normalizeAmount(t.amount))}
          dataSource={costs?.data_source}
          icon={Wallet}
        />
      </KpiWithTooltip>
    </div>
  );
}
