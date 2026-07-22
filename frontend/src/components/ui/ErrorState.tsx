/**
 * 에러 상태 — §8. 원인과 해결책을 명시한다. 사과·모호한 문구("문제가 발생했습니다") 금지.
 * 예: "쿼리가 30초 후 시간 초과되었습니다. 더 짧은 시간 범위를 사용하십시오."
 */
import { AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";

interface ErrorStateProps {
  /** 무엇이 잘못됐는지 (원인) */
  cause: string;
  /** 어떻게 해결하는지 (해결책) */
  remedy: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ cause, remedy, onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--crit)]/30 bg-[var(--crit)]/5 px-6 py-10 text-center",
        className
      )}
    >
      <AlertCircle size={28} className="text-[var(--crit)]" strokeWidth={1.5} aria-hidden />
      <div>
        <p className="font-semibold" style={{ font: "var(--text-h2)" }}>
          {cause}
        </p>
        <p className="mt-1 text-[13px] text-[var(--muted)]">{remedy}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 rounded-[var(--radius-input)] border border-[var(--border)] px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-[var(--bg-2)]"
        >
          <RotateCcw size={14} aria-hidden />
          다시 시도
        </button>
      )}
    </div>
  );
}
