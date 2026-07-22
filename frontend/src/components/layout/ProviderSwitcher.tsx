"use client";

import type { Provider, ProviderId } from "@/lib/types";

interface ProviderSwitcherProps {
  providers: Provider[];
  isLoading: boolean;
  activeProviderId: ProviderId;
  onChange: (id: ProviderId) => void;
}

/**
 * SCP/AWS 프로바이더 전환 스위치.
 * 로딩 중에는 최종 레이아웃과 동일한 크기의 스켈레톤을 보여준다 (§8 — 레이아웃 시프트 없음).
 */
export function ProviderSwitcher({ providers, isLoading, activeProviderId, onChange }: ProviderSwitcherProps) {
  if (isLoading && providers.length === 0) {
    return (
      <div className="flex gap-1 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] p-1">
        <div className="h-6 flex-1 animate-pulse rounded bg-[var(--bg-2)]" />
        <div className="h-6 flex-1 animate-pulse rounded bg-[var(--bg-2)]" />
      </div>
    );
  }

  return (
    <div className="flex gap-1 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] p-1">
      {providers.map((provider) => {
        const active = provider.id === activeProviderId;
        return (
          <button
            key={provider.id}
            type="button"
            onClick={() => onChange(provider.id)}
            aria-pressed={active}
            className="flex-1 cursor-pointer rounded px-2 py-1 text-[11px] font-semibold transition-colors"
            style={{
              backgroundColor: active ? "var(--bg-2)" : "transparent",
              color: active ? provider.accent_color : "var(--muted)",
            }}
          >
            {provider.short_name}
          </button>
        );
      })}
    </div>
  );
}
