/**
 * KPI / 스탯 카드 — §7.1. 카드당 숫자는 하나만. 델타는 반드시 비교 기준(comparisonLabel)을 함께 밝힌다.
 *
 *   ┌──────────────────────────┐
 *   │ P95 LATENCY               │  ← label (12px uppercase muted)
 *   │ 342ms          ▲ 12.4%   │  ← value(.num, ≥32px) + DeltaBadge
 *   │ ▁▂▃▅▄▆▇▆▅▃▂▁              │  ← sparkline (선택)
 *   │ vs. 지난 24시간            │  ← comparisonLabel
 *   └──────────────────────────┘
 */
import type { LucideIcon } from "lucide-react";
import type { DataSource } from "@/lib/types";
import { cn } from "@/lib/cn";
import { DataSourceBadge } from "./DataSourceBadge";
import { DeltaBadge, type DeltaPolarity } from "./DeltaBadge";
import { Sparkline } from "./Sparkline";

interface KpiCardProps {
  label: string;
  /** 이미 fmtLatency/fmtCount/fmtKRW/fmtPct 등으로 포맷된 문자열을 전달한다. */
  value: string;
  delta?: { value: number; polarity?: DeltaPolarity };
  comparisonLabel?: string;
  sparkline?: number[];
  dataSource?: DataSource;
  icon?: LucideIcon;
  className?: string;
  /** 관제 월 실시간 효과(스네이크 외곽선·글로우·깊이감). 기본 true */
  live?: boolean;
}

export function KpiCard({
  label,
  value,
  delta,
  comparisonLabel,
  sparkline,
  dataSource,
  icon: Icon,
  className,
  live = true,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-card)] p-4",
        // live면 fx-card가 회전 테두리+배경을 제공, 아니면 일반 테두리+배경.
        live ? "fx-card live-glow" : "border border-[var(--border)] bg-[var(--bg-1)]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</span>
        <div className="flex items-center gap-2">
          {dataSource && <DataSourceBadge source={dataSource} />}
          {Icon && <Icon size={14} className="text-[var(--muted)]" strokeWidth={1.75} aria-hidden />}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        {/* key={value}로 값이 바뀔 때만 리마운트 → value-flash 애니메이션 1회 재생(실시간 갱신 신호) */}
        <span key={value} className="num kpi-value value-flash" style={{ font: "var(--text-kpi)" }}>
          {value}
        </span>
        {delta && <DeltaBadge value={delta.value} polarity={delta.polarity} />}
      </div>

      {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} />}

      {comparisonLabel && <span className="text-[11px] text-[var(--muted)]">{comparisonLabel}</span>}
    </div>
  );
}
