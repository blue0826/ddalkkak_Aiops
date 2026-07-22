"use client";

/**
 * ⓘ 도움말 툴팁 — "이게 뭔지" 설명을 KPI/차트/메뉴/배지 옆에 붙인다.
 * 호버·키보드 포커스 모두에서 노출(접근성). 원시 hex 금지, 토큰만.
 */
import { Info } from "lucide-react";
import type { ReactNode } from "react";

interface InfoTooltipProps {
  /** 툴팁 본문(설명). 문자열 또는 노드 */
  children: ReactNode;
  /** 접근성 라벨(무엇에 대한 설명인지) */
  label?: string;
  /** 아이콘 크기 */
  size?: number;
}

export function InfoTooltip({ children, label = "설명", size = 13 }: InfoTooltipProps) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="inline-flex items-center justify-center text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
      >
        <Info size={size} aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-max max-w-[260px] -translate-x-1/2 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-2)] px-2.5 py-1.5 text-left text-[11px] font-normal leading-relaxed text-[var(--foreground)] shadow-lg group-hover:block group-focus-within:block"
      >
        {children}
      </span>
    </span>
  );
}
