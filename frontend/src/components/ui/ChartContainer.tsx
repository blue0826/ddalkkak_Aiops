/**
 * 차트 패널 래퍼 — 제목/부제/우측 액션만 담당한다. 차트 자체(축·격자·툴팁)는 TimeSeriesChart가 그린다.
 * 카드 남발 금지 원칙(§4.4)에 따라 기본은 테두리 없는 섹션이며, border는 호출부에서 필요할 때만 추가한다.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartContainer({ title, subtitle, action, children, className }: ChartContainerProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold" style={{ font: "var(--text-h2)" }}>
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-[var(--muted)]">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
