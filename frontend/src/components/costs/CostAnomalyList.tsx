/**
 * 이상 비용 목록 — CRITICAL/WARNING을 색+아이콘+텍스트로 함께 표시한다(§4.3 색맹 접근성).
 * 발견되면 눈에 띄게 강조하고, 없으면 호출부가 별도 안내 문구를 보여준다(빈 컴포넌트를 렌더링하지 않음).
 */
import { AlertTriangle, TrendingUp } from "lucide-react";
import { fmtKRW } from "@/components/ui/format";
import type { CostAnomaly } from "@/lib/types";

const SEVERITY_STYLE: Record<CostAnomaly["severity"], { text: string; border: string; bg: string; label: string }> = {
  CRITICAL: { text: "text-[var(--crit)]", border: "border-[var(--crit)]/30", bg: "bg-[var(--crit)]/5", label: "심각" },
  WARNING: { text: "text-[var(--warn)]", border: "border-[var(--warn)]/30", bg: "bg-[var(--warn)]/5", label: "경고" },
};

interface CostAnomalyListProps {
  anomalies: CostAnomaly[];
}

export function CostAnomalyList({ anomalies }: CostAnomalyListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {anomalies.map((anomaly) => {
        const style = SEVERITY_STYLE[anomaly.severity];
        return (
          <li
            key={`${anomaly.date}-${anomaly.anomaly_amount}`}
            className={`flex flex-col gap-1.5 rounded-[var(--radius-card)] border px-4 py-3 ${style.border} ${style.bg}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${style.text}`}>
                <AlertTriangle size={12} strokeWidth={2.5} aria-hidden />
                {style.label}
              </span>
              <span className="num text-[12px] text-[var(--muted)]">{anomaly.date}</span>
            </div>
            <p className="text-[13px]">{anomaly.reason}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--muted)]">
              <span>
                평소 평균 <span className="num">{fmtKRW(anomaly.average_amount)}</span>
              </span>
              <span>
                이상 발생일 <span className="num">{fmtKRW(anomaly.anomaly_amount)}</span>
              </span>
              <span className={`inline-flex items-center gap-1 ${style.text}`}>
                <TrendingUp size={12} aria-hidden />
                <span className="num">+{fmtKRW(anomaly.difference)}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
