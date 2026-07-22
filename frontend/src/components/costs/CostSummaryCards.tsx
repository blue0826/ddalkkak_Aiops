/**
 * FinOps 상단 KPI(§7.1) — 월 누적 / 일 평균. 카드당 숫자는 하나만, 통화는 원화(₩)만 표기한다.
 */
import type { ReactNode } from "react";
import { KpiCard } from "@/components/ui/KpiCard";
import { fmtKRW } from "@/components/ui/format";
import type { DataSource } from "@/lib/types";
import { GLOSSARY } from "@/lib/glossary";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

interface CostSummaryCardsProps {
  monthlyTotal: number;
  dailyAverage: number;
  dataSource: DataSource;
}

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

export function CostSummaryCards({ monthlyTotal, dailyAverage, dataSource }: CostSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <KpiWithTooltip
        tooltipLabel="이번 달 누적 비용 설명"
        tooltip="이번 달 1일부터 지금까지 누적된 비용 합계입니다(₩)."
      >
        <KpiCard
          label="이번 달 누적 비용"
          value={fmtKRW(monthlyTotal)}
          dataSource={dataSource}
          comparisonLabel="당월 누적 기준"
        />
      </KpiWithTooltip>
      <KpiWithTooltip tooltipLabel="일 평균 비용 설명" tooltip={GLOSSARY.today_cost}>
        <KpiCard
          label="일 평균 비용"
          value={fmtKRW(dailyAverage)}
          dataSource={dataSource}
          comparisonLabel="최근 추이 평균"
        />
      </KpiWithTooltip>
    </div>
  );
}
