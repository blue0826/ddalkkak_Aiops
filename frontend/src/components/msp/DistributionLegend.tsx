/**
 * 분포 차트 공용 범례 — 색 점 + 한글 라벨 + 카운트(tabular-nums) + 비중(%).
 * Recharts 기본 Legend 대신 커스텀으로 그려 앱 전역 디자인 토큰(폰트·색)을 그대로 따른다.
 */
import { fmtCount, fmtPct } from "@/components/ui/format";
import { percentOf, totalCount, type DistributionEntry } from "./resourceDistributionUtils";

interface DistributionLegendProps {
  entries: DistributionEntry[];
  colorFor: (entry: DistributionEntry, index: number) => string;
}

export function DistributionLegend({ entries, colorFor }: DistributionLegendProps) {
  const total = totalCount(entries);

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map((entry, index) => (
        <li key={entry.key} className="flex items-center justify-between gap-3 text-[12px]">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(entry, index) }}
              aria-hidden
            />
            <span className="truncate text-[var(--foreground)]">{entry.label}</span>
          </span>
          <span className="num flex shrink-0 items-center gap-1.5">
            <span className="font-semibold text-[var(--foreground)]">{fmtCount(entry.count)}</span>
            <span className="text-[var(--muted)]">({fmtPct(percentOf(entry.count, total), 0)})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
