/**
 * 빈 상태 — §8. "데이터 없음(온보딩)"과 "필터 결과 없음"은 서로 다른 카피/액션을 쓰는 별개 변형이다.
 * 이미 데이터가 있는 사용자에게 온보딩 문구를 보여주지 않는다.
 */
import type { LucideIcon } from "lucide-react";
import { FilterX, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  variant: "onboarding" | "filtered";
  title: string;
  description: string;
  action?: EmptyStateAction;
  icon?: LucideIcon;
  className?: string;
}

export function EmptyState({ variant, title, description, action, icon, className }: EmptyStateProps) {
  const Icon = icon ?? (variant === "onboarding" ? Inbox : FilterX);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] px-6 py-12 text-center",
        className
      )}
    >
      <Icon size={28} className="text-[var(--muted)]" strokeWidth={1.5} aria-hidden />
      <div>
        <p className="font-semibold" style={{ font: "var(--text-h2)" }}>
          {title}
        </p>
        <p className="mt-1 text-[13px] text-[var(--muted)]">{description}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 rounded-[var(--radius-input)] bg-[var(--brand)] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
