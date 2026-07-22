/**
 * 상태 배지 — §7.3/§8. 점(dot) + 텍스트 라벨을 항상 함께 표시한다.
 * 색만으로 상태를 표현하지 않는다(색맹 접근성, §4.3).
 */
import { cn } from "@/lib/cn";

export type StatusTone = "ok" | "warn" | "crit";

const STATUS_LABEL: Record<StatusTone, string> = {
  ok: "정상",
  warn: "경고",
  crit: "심각",
};

interface StatusBadgeProps {
  status: StatusTone;
  /** 기본 라벨(정상/경고/심각) 대신 쓸 커스텀 텍스트가 있을 때만 지정 */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const color = `var(--${status})`;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", className)}
      style={{ color }}
    >
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
