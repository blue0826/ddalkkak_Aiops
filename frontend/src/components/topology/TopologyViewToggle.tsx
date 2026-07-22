"use client";

/** 그래프/트리 뷰 전환 스위치 — ProviderSwitcher와 동일한 시각 언어(§7.4 URL 반영은 호출부 책임). */
import type { LucideIcon } from "lucide-react";
import { GitFork, ListTree } from "lucide-react";

export type TopologyViewMode = "graph" | "tree";

interface TopologyViewToggleProps {
  mode: TopologyViewMode;
  onChange: (mode: TopologyViewMode) => void;
}

const OPTIONS: { value: TopologyViewMode; label: string; icon: LucideIcon }[] = [
  { value: "graph", label: "그래프", icon: GitFork },
  { value: "tree", label: "트리", icon: ListTree },
];

export function TopologyViewToggle({ mode, onChange }: TopologyViewToggleProps) {
  return (
    <div className="flex gap-1 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] p-1">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = opt.value === mode;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={{ backgroundColor: active ? "var(--bg-2)" : "transparent", color: active ? "var(--brand)" : "var(--muted)" }}
          >
            <Icon size={13} aria-hidden />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
