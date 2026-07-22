/**
 * 프로바이더 칩 — useProviders()에서 얻은 accent/short_name으로 SCP(블루)/AWS(오렌지)를 구분한다.
 * accent_color는 항상 API(useProviders)에서만 얻는다 — 하드코딩 금지.
 */
import { cn } from "@/lib/cn";
import type { Provider } from "@/lib/types";

interface ProviderBadgeProps {
  provider: Provider;
  className?: string;
}

export function ProviderBadge({ provider, className }: ProviderBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-badge)] border px-1.5 py-0.5 text-[11px] font-semibold",
        className
      )}
      style={{ borderColor: provider.accent_color, color: provider.accent_color }}
    >
      {provider.short_name}
    </span>
  );
}
