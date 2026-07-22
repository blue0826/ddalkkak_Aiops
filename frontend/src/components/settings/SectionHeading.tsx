/** 설정 화면 섹션 구분 헤더 — 아이콘 + 제목 + 설명으로 "고객사 관리"/"시스템 정보" 위계를 명확히 한다. */
import type { LucideIcon } from "lucide-react";

interface SectionHeadingProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export function SectionHeading({ icon: Icon, title, description }: SectionHeadingProps) {
  return (
    <div className="flex items-start gap-2.5 border-b border-[var(--border)] pb-3">
      <Icon size={16} className="mt-0.5 shrink-0 text-[var(--muted)]" strokeWidth={1.75} aria-hidden />
      <div>
        <h2 className="font-semibold" style={{ font: "var(--text-h1)" }}>
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[12px] text-[var(--muted)]">{description}</p>}
      </div>
    </div>
  );
}
