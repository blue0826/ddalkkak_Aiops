"use client";

/**
 * 대시보드 라우트 — 관리자/비관리자, 뷰 토글(고객사별↔통합), 고객사 드릴다운 분기만 담당한다.
 * 실제 화면 콘텐츠는 재사용 컴포넌트에 위임하고, 하단에는 관제 로그 자막 티커를 공통 배치한다.
 *  - 비관리자: 항상 TenantDashboard(자기 테넌트, 기존 동작과 동일).
 *  - 관리자 + ?tenant=<id>: TenantDashboard(해당 고객사) + "← 전체 보기" 링크.
 *  - 관리자 + 고객사 0곳: 뷰(고객사별/통합) 무관하게 NoTenantsEmptyState.
 *    통합 뷰는 "system" 스코프를 직접 조회하므로, 고객사 목록이 로딩 중인 동안에도 마운트하지
 *    않는다(CEO 지시: 지어낸 고객사 제거, 실데이터만 — system 폴백으로 데모 데이터가 잠깐이라도
 *    노출되는 것을 막는다).
 *  - 관리자 + ?view=unified(고객사 1곳 이상): TenantDashboard(tenant=system, 전 고객사 합산) + 뷰 토글.
 *  - 관리자 + ?view=byTenant(기본, 고객사 1곳 이상): TenantOverviewGrid(고객사 카드 그리드) + 뷰 토글.
 */
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTenants } from "@/hooks/useTenants";
import { getParam } from "@/lib/url-state";
import { Skeleton } from "@/components/ui/Skeleton";
import { BackToOverviewLink } from "@/components/dashboard/BackToOverviewLink";
import { DashboardViewToggle, type DashboardView } from "@/components/dashboard/DashboardViewToggle";
import { LogTicker } from "@/components/dashboard/LogTicker";
import { TenantDashboard } from "@/components/dashboard/TenantDashboard";
import { FleetOverviewSection } from "@/components/msp/FleetOverviewSection";
import { NoTenantsEmptyState } from "@/components/msp/NoTenantsEmptyState";
import { TenantOverviewGrid } from "@/components/msp/TenantOverviewGrid";

/** "대시보드" h1 + 뷰 토글 — TenantDashboard가 마운트되지 않는 분기(로딩·빈 상태)에서 공통으로 쓴다. */
function DashboardHeader({ view }: { view: DashboardView }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
        대시보드
      </h1>
      <DashboardViewToggle view={view} />
    </header>
  );
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();
  const { tenants, isLoading: tenantsLoading } = useTenants(isAdmin);

  const tenantId = getParam(searchParams, "tenant") || undefined;
  const view: DashboardView = getParam(searchParams, "view", "byTenant") === "unified" ? "unified" : "byTenant";
  // 관리자 + 특정 고객사 미선택 + 고객사 0곳 확정 — 본문뿐 아니라 하단 LogTicker도 tenant_id 없이
  // 조회하면 system 스코프로 처리돼 지어낸 로그가 노출될 수 있으므로 함께 막는다.
  const noTenantsForAdmin = isAdmin && !tenantId && !tenantsLoading && tenants.length === 0;

  let content: ReactNode;

  if (!isAdmin) {
    // 비관리자 — 기존 대시보드 그대로(자기 테넌트).
    content = <TenantDashboard />;
  } else if (tenantId) {
    // 관리자 + 특정 고객사 선택 — 그 고객사 상세 + 전체 보기로 돌아가는 링크.
    const tenantName = tenants.find((t) => t.id === tenantId)?.name;
    content = (
      <TenantDashboard tenantIdOverride={tenantId} title={tenantName ?? "대시보드"} headerExtra={<BackToOverviewLink />} />
    );
  } else if (view === "unified") {
    // 관리자 + 통합 뷰 — 고객사 목록이 확정(로딩 완료 + 1곳 이상)된 뒤에만 system 스코프를 조회한다.
    if (tenantsLoading) {
      content = (
        <>
          <DashboardHeader view={view} />
          <Skeleton height={480} />
        </>
      );
    } else if (noTenantsForAdmin) {
      content = (
        <>
          <DashboardHeader view={view} />
          <NoTenantsEmptyState />
        </>
      );
    } else {
      content = (
        <TenantDashboard tenantIdOverride="system" title="전 고객사 통합" headerExtra={<DashboardViewToggle view={view} />} />
      );
    }
  } else if (noTenantsForAdmin) {
    // 관리자 + 고객사별 뷰(기본) + 고객사 0곳 — 카드 그리드 대신 온보딩 유도.
    content = (
      <>
        <DashboardHeader view={view} />
        <NoTenantsEmptyState />
      </>
    );
  } else {
    // 관리자 + 고객사별 뷰(기본) — 통합 현황(롤업 스트립 + 분포 차트) 다음에 고객사 카드
    // 그리드(헬스 매트릭스 역할 겸용)를 배치한다. 둘 다 자체적으로 로딩/빈 상태를 처리한다.
    content = (
      <>
        <DashboardHeader view={view} />
        <FleetOverviewSection />
        <TenantOverviewGrid />
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <div className="flex flex-1 flex-col gap-6">{content}</div>
      {/* 관제 로그 자막 — 하단 고정 흐름. 관리자가 특정 고객사 미선택이면 목록 로딩 중에도
          조회를 막는다(tenants가 []인 로딩 구간에 system 스코프 데모 로그가 한 번 캐시되는 것 방지). */}
      <div className="sticky bottom-0">
        <LogTicker disabled={isAdmin && !tenantId && tenants.length === 0} />
      </div>
    </div>
  );
}
