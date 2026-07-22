"use client";

/**
 * 관리자 전용 대시보드 뷰 토글 — [고객사별] [통합] (URL ?view=byTenant|unified, 기본 byTenant).
 * FilterBar와 동일하게 URL을 단일 진실 소스로 삼는다(withParam) — on-call 엔지니어가
 * 링크를 그대로 공유해도 동일한 화면을 보게 하기 위함.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { withParam } from "@/lib/url-state";

export type DashboardView = "byTenant" | "unified";

const VIEW_OPTIONS: ReadonlyArray<{ value: DashboardView; label: string }> = [
  { value: "byTenant", label: "고객사별" },
  { value: "unified", label: "통합" },
];

interface DashboardViewToggleProps {
  view: DashboardView;
}

export function DashboardViewToggle({ view }: DashboardViewToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div
      role="tablist"
      aria-label="대시보드 보기 전환"
      className="inline-flex items-center gap-0.5 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] p-0.5"
    >
      {VIEW_OPTIONS.map((option) => {
        const active = option.value === view;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => router.replace(`${pathname}?${withParam(searchParams, "view", option.value)}`, { scroll: false })}
            className={cn(
              "rounded-[var(--radius-input)] px-3 py-1 text-[12px] font-semibold transition-colors",
              active ? "bg-[var(--brand)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
