"use client";

/**
 * 상단 sticky 전역 필터바 — §5.2 Row 0 / §7.4.
 * 시간범위·테넌트(관리자 전용)·프로바이더·검색 상태를 URL 쿼리스트링에 반영해
 * on-call 엔지니어가 링크를 그대로 공유해도 동일한 화면을 보게 한다.
 */
import { useCallback } from "react";
import { Search as SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTenants } from "@/hooks/useTenants";
import { getParam, resolveActiveProviderId, withParam } from "@/lib/url-state";
import type { Provider } from "@/lib/types";
import { ProviderSwitcher } from "./ProviderSwitcher";
import { RefreshControl } from "./RefreshControl";
import { UserMenu } from "./UserMenu";

const TIME_RANGES = [
  { value: "1h", label: "1시간" },
  { value: "24h", label: "24시간" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
] as const;

interface FilterBarProps {
  providers: Provider[];
  providersLoading: boolean;
}

export function FilterBar({ providers, providersLoading }: FilterBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();
  const { tenants } = useTenants(isAdmin);

  const setParam = useCallback(
    (key: string, value: string) => {
      router.replace(`${pathname}?${withParam(searchParams, key, value)}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const range = getParam(searchParams, "range", "24h");
  const tenantId = getParam(searchParams, "tenant");
  const search = getParam(searchParams, "q");
  const activeProviderId = resolveActiveProviderId(searchParams, providers);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-0)]/95 px-4 backdrop-blur">
      <span className="shrink-0 text-[13px] font-semibold">AIOps 통합 관제</span>
      <div className="h-5 w-px shrink-0 bg-[var(--border)]" aria-hidden />

      <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
        <label className="sr-only" htmlFor="filter-range">
          시간 범위
        </label>
        <select
          id="filter-range"
          value={range}
          onChange={(event) => setParam("range", event.target.value)}
          className="h-8 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-2 text-[12px] text-[var(--foreground)]"
        >
          {TIME_RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        {isAdmin && (
          <>
            <label className="sr-only" htmlFor="filter-tenant">
              테넌트
            </label>
            <select
              id="filter-tenant"
              value={tenantId}
              onChange={(event) => setParam("tenant", event.target.value)}
              className="h-8 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-2 text-[12px] text-[var(--foreground)]"
            >
              <option value="">전체 테넌트</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </>
        )}

        <ProviderSwitcher
          providers={providers}
          isLoading={providersLoading}
          activeProviderId={activeProviderId}
          onChange={(id) => setParam("provider", id)}
        />
      </div>

      <div className="relative min-w-0 max-w-xs flex-1">
        <SearchIcon
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          aria-hidden
        />
        <label className="sr-only" htmlFor="filter-search">
          검색
        </label>
        <input
          id="filter-search"
          type="search"
          placeholder="검색..."
          defaultValue={search}
          onChange={(event) => setParam("q", event.target.value)}
          className="h-8 w-full rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] pl-8 pr-2 text-[12px] text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
      </div>

      <RefreshControl />

      <div className="ml-auto shrink-0">
        <UserMenu />
      </div>
    </header>
  );
}
