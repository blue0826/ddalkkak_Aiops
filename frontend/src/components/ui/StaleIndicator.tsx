/**
 * 최근 갱신 표시 — §8. 오래된 데이터를 조용히 보여주는 것은 관제 도구에서 정확성 버그다.
 * 임계값(기본 5분)을 넘기면 amber 톤 + 미세 desaturation으로 눈에 띄게 한다.
 */
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtRelativeTime } from "./format";

interface StaleIndicatorProps {
  minutesAgo: number;
  staleThresholdMinutes?: number;
  className?: string;
}

export function StaleIndicator({ minutesAgo, staleThresholdMinutes = 5, className }: StaleIndicatorProps) {
  const isStale = minutesAgo >= staleThresholdMinutes;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px]",
        isStale ? "text-[var(--warn)]" : "text-[var(--muted)]",
        className
      )}
      style={isStale ? { filter: "saturate(0.6)" } : undefined}
      title={isStale ? "데이터가 지연되고 있습니다" : undefined}
    >
      <Clock size={11} aria-hidden />
      {fmtRelativeTime(minutesAgo)}
    </span>
  );
}
