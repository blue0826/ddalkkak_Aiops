"use client";

/**
 * 카테고리형 자원 분포(리전·유형 공용) — 가로 막대 차트. 축 라벨 대신 아래 범례에서
 * 라벨/카운트/비중을 함께 보여준다(defaults-off 원칙, §6.1과 동일 사상).
 */
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtCount } from "@/components/ui/format";
import { DistributionLegend } from "./DistributionLegend";
import { DistributionTooltip } from "./DistributionTooltip";
import { chartColorAt, type DistributionEntry } from "./resourceDistributionUtils";

interface CategoryDistributionChartProps {
  entries: DistributionEntry[];
  emptyDescription: string;
}

export function CategoryDistributionChart({ entries, emptyDescription }: CategoryDistributionChartProps) {
  if (entries.length === 0) {
    return <EmptyState variant="filtered" title="분포 데이터가 없습니다" description={emptyDescription} />;
  }

  const colorFor = (_entry: DistributionEntry, index: number) => chartColorAt(index);
  const height = Math.max(entries.length * 26, 48);

  return (
    <div className="flex flex-col gap-3">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={entries} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 4 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" hide />
            <Tooltip content={<DistributionTooltip valueFormatter={fmtCount} />} cursor={{ fill: "var(--bg-2)" }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={14}>
              {entries.map((entry, index) => (
                <Cell key={entry.key} fill={colorFor(entry, index)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DistributionLegend entries={entries} colorFor={colorFor} />
    </div>
  );
}
