"use client";

/**
 * 분포 차트(도넛/가로 막대) 공용 툴팁 — TimeSeriesChart의 OpsTooltip과 동일한 시각 스타일.
 * Recharts는 content 엘리먼트를 cloneElement로 감싸 active/payload를 런타임에 주입하므로 Partial로 둔다.
 */
import type { TooltipContentProps } from "recharts";
import type { DistributionEntry } from "./resourceDistributionUtils";

type DistributionTooltipProps = Partial<TooltipContentProps<number, string>> & {
  valueFormatter: (value: number) => string;
};

export function DistributionTooltip({ active, payload, valueFormatter }: DistributionTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as DistributionEntry;

  return (
    <div className="rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[12px]">
      <div className="mb-1 font-medium text-[var(--foreground)]">{data.label}</div>
      <div className="num text-[var(--muted)]">{valueFormatter(data.count)}</div>
    </div>
  );
}
