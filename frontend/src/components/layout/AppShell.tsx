"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useProviders } from "@/hooks/useProviders";
import { resolveActiveProviderId } from "@/lib/url-state";
import { FilterBar } from "./FilterBar";
import { SidebarNav } from "./SidebarNav";

interface AppShellProps {
  children: ReactNode;
}

const SIDEBAR_KEY = "aiops.sidebarCollapsed";

/**
 * 인증된 콘솔의 실제 앱 골격 — 상단 sticky 필터바 + 좌측(접기 가능) 사이드바 내비 + 콘텐츠.
 * 내비/필터 상태는 URL에서 읽는다. 사이드바 접힘만 로컬 UI 상태로 유지(localStorage 저장).
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { providers, isLoading, getProviderById, getAccentColor } = useProviders();

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (window.localStorage.getItem(SIDEBAR_KEY) === "1") setCollapsed(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toggleSidebar = () =>
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* 무시 */
      }
      return next;
    });

  const activeMenuId = pathname.split("/")[2] || "dashboard";
  const activeProviderId = resolveActiveProviderId(searchParams, providers);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-0)] text-[var(--foreground)]">
      <FilterBar providers={providers} providersLoading={isLoading} />

      <div className="flex min-h-0 flex-1">
        <aside
          className={`hidden shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-0)] p-2 transition-[width] duration-200 md:flex ${
            collapsed ? "w-16" : "w-60"
          }`}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
            aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
            aria-expanded={!collapsed}
            className={`mb-2 flex h-8 items-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--bg-2)] ${
              collapsed ? "justify-center px-0" : "justify-end px-2"
            }`}
          >
            {collapsed ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
          </button>

          <SidebarNav
            activeMenuId={activeMenuId}
            activeProvider={getProviderById(activeProviderId)}
            accentColor={getAccentColor(activeProviderId)}
            collapsed={collapsed}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
