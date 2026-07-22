"use client";

/**
 * 일별 비용 추이 — TimeSeriesChart(§6.1 defaults-off) + ₩ 포매터.
 * X축은 일 단위이므로 fmtAxisDate(월/일)를 넘겨 날짜 라벨을 표시한다.
 */
import { ChartContainer } from "@/components/ui/ChartContainer";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { TimeSeriesChart, type TimeSeriesPoint } from "@/components/ui/TimeSeriesChart";
import { fmtAxisDate, fmtKRW } from "@/components/ui/format";
import type { DailyCostTrend, DataSource } from "@/lib/types";
import { GLOSSARY } from "@/lib/glossary";

interface CostTrendChartProps {
  trends: DailyCostTrend[];
  dataSource: DataSource;
}

export function CostTrendChart({ trends, dataSource }: CostTrendChartProps) {
  const data: TimeSeriesPoint[] = trends.map((trend) => ({ ts: trend.date, amount: trend.amount }));
  const rangeLabel =
    trends.length > 0 ? `${trends[0].date} ~ ${trends[trends.length - 1].date} · 일 단위 합계` : undefined;

  return (
    <ChartContainer
      title="일별 비용 추이"
      subtitle={rangeLabel}
      action={
        <span className="flex items-center gap-1.5">
          <DataSourceBadge source={dataSource} />
          <InfoTooltip label="데이터 출처 설명">
            {dataSource === "REAL" ? GLOSSARY.data_source_real : GLOSSARY.data_source_simulated}
          </InfoTooltip>
        </span>
      }
    >
      <TimeSeriesChart
        data={data}
        series={[{ key: "amount", label: "일별 비용", color: "var(--chart-1)" }]}
        variant="area"
        valueFormatter={fmtKRW}
        xTickFormatter={fmtAxisDate}
        emptyMessage="이 기간에 비용 추이 데이터가 없습니다."
      />
    </ChartContainer>
  );
}
