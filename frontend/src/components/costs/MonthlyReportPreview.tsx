"use client";

/**
 * 월간 리포트(getMonthlyReport) 마크다운 미리보기 — 선택 섹션. 있으면 렌더, 없으면 호출부가 생략한다.
 * 마크다운 렌더 라이브러리가 프로젝트에 없어(package.json 기준) 원문을 pre로 안전하게 표시한다
 * (임의 HTML 파싱/삽입이 아니므로 XSS 위험이 없다).
 */
import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/cn";

interface MonthlyReportPreviewProps {
  markdown: string;
}

export function MonthlyReportPreview({ markdown }: MonthlyReportPreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-2 self-start text-[13px] font-semibold"
      >
        <FileText size={14} className="text-[var(--muted)]" aria-hidden />
        월간 리포트 미리보기
        <ChevronDown
          size={14}
          className={cn("text-[var(--muted)] transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4 text-[12px] leading-relaxed text-[var(--foreground)]">
          {markdown}
        </pre>
      )}
    </section>
  );
}
