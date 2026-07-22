/**
 * 증감 배지 — §6.4/§7.1. +/- % 숫자 + 방향 아이콘을 항상 함께 표시한다(색만으로 표현 금지).
 * "상승 = 좋음" 여부는 지표마다 다르므로(예: 에러율은 상승이 나쁨) polarity로 지정한다.
 */
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDelta } from "./format";

/** increase-good: 상승이 좋은 지표(트래픽 등). increase-bad: 상승이 나쁜 지표(에러율, 지연시간 등). */
export type DeltaPolarity = "increase-good" | "increase-bad";

interface DeltaBadgeProps {
  value: number;
  polarity?: DeltaPolarity;
  /** 비교 기준을 배지 안에 함께 표기할 때만 지정 (예: "vs 24시간"). KpiCard는 별도 캡션으로 표시한다. */
  windowLabel?: string;
  className?: string;
}

export function DeltaBadge({ value, polarity = "increase-good", windowLabel, className }: DeltaBadgeProps) {
  const isIncrease = value >= 0;
  const isGood = polarity === "increase-good" ? isIncrease : !isIncrease;
  const color = value === 0 ? "var(--muted)" : isGood ? "var(--ok)" : "var(--crit)";
  const Icon = isIncrease ? ArrowUp : ArrowDown;

  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-semibold", className)} style={{ color }}>
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      <span className="num">{fmtDelta(value)}</span>
      {windowLabel && <span className="font-normal text-[var(--muted)]">{windowLabel}</span>}
    </span>
  );
}
