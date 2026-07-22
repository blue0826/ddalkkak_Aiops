/**
 * 데이터 출처 배지 — 정직성 핵심 프리미티브.
 * 패널이 시뮬레이션 데이터를 보여주고 있다면 반드시 이 배지를 붙인다.
 * REAL은 중립/저채도로, SIMULATED는 amber로 뚜렷하게 구분한다.
 */
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DataSource } from "@/lib/types";

interface DataSourceBadgeProps {
  source: DataSource;
  className?: string;
}

export function DataSourceBadge({ source, className }: DataSourceBadgeProps) {
  if (source === "REAL") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-[var(--radius-badge)] border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]",
          className
        )}
      >
        REAL
      </span>
    );
  }

  // REAL_EMPTY: 실 연동 경로를 탔지만 이 구간에 샘플이 없는 정직한 빈 결과 - "지어낸 값"을
  // 뜻하는 시뮬레이션(amber) 배지와 절대 혼동되면 안 되므로 REAL과 동일한 중립 톤을 쓰되
  // 문구만 구분한다.
  if (source === "REAL_EMPTY") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-[var(--radius-badge)] border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]",
          className
        )}
      >
        REAL · 데이터없음
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-badge)] border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warn)]",
        className
      )}
    >
      <FlaskConical size={10} strokeWidth={2.5} aria-hidden />
      시뮬레이션
    </span>
  );
}
