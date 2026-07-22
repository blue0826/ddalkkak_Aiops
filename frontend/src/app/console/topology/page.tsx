"use client";

/**
 * 토폴로지 맵 — getTopology(tenant/provider)로 로드하고 graph/tree 뷰를 URL(view=)로 전환한다.
 * data_source 배지로 실 SCP VM 주입 성공 여부(REAL/SIMULATED)를 정직하게 노출한다.
 */
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Share2 } from "lucide-react";
import { useApiResource } from "@/hooks/useApiResource";
import { useAuth } from "@/hooks/useAuth";
import { useProviders } from "@/hooks/useProviders";
import { useTenants } from "@/hooks/useTenants";
import { getTopology } from "@/lib/api";
import { getParam, resolveActiveProviderId, withParam } from "@/lib/url-state";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { GLOSSARY } from "@/lib/glossary";
import { NoTenantsEmptyState } from "@/components/msp/NoTenantsEmptyState";
import { TenantCycler } from "@/components/msp/TenantCycler";
import { TopologyCanvasView } from "@/components/topology/TopologyCanvasView";
import { TopologyDetailPanel } from "@/components/topology/TopologyDetailPanel";
import { TopologySplitter } from "@/components/topology/TopologySplitter";
import { TopologyTreeView } from "@/components/topology/TopologyTreeView";
import { TopologyViewToggle, type TopologyViewMode } from "@/components/topology/TopologyViewToggle";
import { useMinutesAgo } from "@/components/topology/useMinutesAgo";

/** 상세 패널 폭(px) 조절 범위 — 최소는 StatusBadge/차트가 찌그러지지 않는 선, 최대는 맵이 너무 좁아지지 않는 선. */
const DETAIL_PANEL_MIN_WIDTH = 280;
const DETAIL_PANEL_MAX_WIDTH = 640;
const DETAIL_PANEL_DEFAULT_WIDTH = 340;

export default function TopologyPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { providers, getProviderById, getAccentColor } = useProviders();
  const { isAdmin } = useAuth();

  // 관리자는 전 테넌트를 한 화면에 쏟아내지 않고, 항상 고객사 하나만 스코프해서 본다(CEO 지시).
  // 비관리자는 기존과 동일하게 자기 테넌트만(쿼리 없으면 undefined → 백엔드가 인증 컨텍스트로 스코프).
  const { tenants: rawTenants, isLoading: tenantsLoading } = useTenants(isAdmin);
  const tenants = useMemo(() => rawTenants.filter((t) => t.id !== "system"), [rawTenants]);

  const urlTenantId = getParam(searchParams, "tenant") || undefined;
  // 관리자가 특정 고객사 없이 진입하면(전체) 첫 고객사를 기본 선택한다.
  const tenantId = isAdmin ? urlTenantId || tenants[0]?.id : urlTenantId;
  const activeTenantName = tenants.find((t) => t.id === tenantId)?.name;
  // 테넌트 목록이 아직 로딩 중이라 기본 고객사를 정하지 못한 구간에는 "전체" 조회를 피하려고 fetch를 미룬다.
  const waitingForDefaultTenant = isAdmin && !urlTenantId && tenantsLoading;
  // 관리자 + 등록된 고객사 0곳 — tenants[0]?.id가 undefined가 되어 getTopology가 admin의
  // "system" 스코프로 처리되면 지어낸 데모 노드가 노출된다. 로딩이 끝난 뒤 0곳으로 확정되면
  // 조회 자체를 막고(enabled=false) 맵 대신 온보딩 유도 빈 상태를 보여준다.
  const noTenants = isAdmin && !tenantsLoading && tenants.length === 0;

  const providerId = resolveActiveProviderId(searchParams, providers);
  const rawView = getParam(searchParams, "view", "graph");
  const viewMode: TopologyViewMode = rawView === "tree" ? "tree" : "graph";
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailPanelWidth, setDetailPanelWidth] = useState(DETAIL_PANEL_DEFAULT_WIDTH);

  const topologyState = useApiResource(
    () => getTopology({ tenant_id: tenantId, provider: providerId }),
    [tenantId, providerId],
    { enabled: !waitingForDefaultTenant && !noTenants }
  );

  // 기본 선택된 고객사를 URL에 반영한다(공유 가능한 링크 + FilterBar 테넌트 드롭다운과 표시 일관성).
  useEffect(() => {
    if (isAdmin && !urlTenantId && tenants.length > 0) {
      router.replace(`${pathname}?${withParam(searchParams, "tenant", tenants[0].id)}`, { scroll: false });
    }
  }, [isAdmin, urlTenantId, tenants, pathname, router, searchParams]);

  const setViewMode = (mode: TopologyViewMode) => {
    router.replace(`${pathname}?${withParam(searchParams, "view", mode)}`, { scroll: false });
  };

  const handleTenantChange = (id: string) => {
    router.replace(`${pathname}?${withParam(searchParams, "tenant", id)}`, { scroll: false });
  };

  const scpProvider = getProviderById("scp");
  const awsProvider = getProviderById("aws");
  const scpRegionCaption = scpProvider ? `${scpProvider.display_name} · ${scpProvider.region_label}` : "SCP";
  const awsRegionCaption = awsProvider ? `${awsProvider.display_name} · ${awsProvider.region_label}` : "AWS";

  const nodes = topologyState.data?.nodes ?? [];
  const links = topologyState.data?.links ?? [];
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedProvider = selectedNode ? getProviderById(selectedNode.provider) : undefined;

  const staleMinutes = useMinutesAgo(topologyState.lastUpdated);
  const hasHardError = !topologyState.data && topologyState.error;

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
            토폴로지 맵
          </h1>
          <InfoTooltip label="토폴로지 맵 설명">{GLOSSARY.topology}</InfoTooltip>
          {topologyState.data && <DataSourceBadge source={topologyState.data.data_source} />}
          {isAdmin && activeTenantName && (
            <span className="text-[12px] text-[var(--muted)]">현재 고객사: {activeTenantName}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {staleMinutes !== null && <StaleIndicator minutesAgo={staleMinutes} />}
          <TopologyViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </header>

      {isAdmin && <TenantCycler tenants={tenants} value={tenantId ?? ""} onChange={handleTenantChange} />}

      {noTenants ? (
        <NoTenantsEmptyState description="관제할 고객사가 아직 등록되지 않았습니다. 설정 화면에서 첫 고객사를 온보딩하면 토폴로지 맵이 표시됩니다." />
      ) : topologyState.isLoading || waitingForDefaultTenant ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <Skeleton height={640} />
          <Skeleton height={640} />
        </div>
      ) : hasHardError ? (
        <ErrorState
          cause="토폴로지 조회에 실패했습니다."
          remedy={topologyState.error?.message || "잠시 후 다시 시도하십시오."}
          onRetry={topologyState.refetch}
        />
      ) : nodes.length === 0 ? (
        <EmptyState
          variant="onboarding"
          icon={Share2}
          title="표시할 토폴로지가 없습니다"
          description="현재 테넌트·프로바이더 범위에 등록된 자원이 없습니다."
        />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1 lg:max-w-[920px]">
            <ChartContainer
              title="자원 맵"
              subtitle={viewMode === "graph" ? "드래그로 화면 이동·스크롤로 확대·방향키로 탐색" : "리전 > 서브넷 > 자원 계층"}
            >
              {viewMode === "graph" ? (
                <TopologyCanvasView
                  nodes={nodes}
                  links={links}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                  scpAccentColor={getAccentColor("scp")}
                  awsAccentColor={getAccentColor("aws")}
                  scpRegionCaption={scpRegionCaption}
                  awsRegionCaption={awsRegionCaption}
                  getProviderById={getProviderById}
                />
              ) : (
                <TopologyTreeView
                  nodes={nodes}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                  getProviderById={getProviderById}
                />
              )}
            </ChartContainer>
          </div>
          <TopologySplitter
            width={detailPanelWidth}
            onWidthChange={setDetailPanelWidth}
            min={DETAIL_PANEL_MIN_WIDTH}
            max={DETAIL_PANEL_MAX_WIDTH}
            className="hidden lg:block"
          />
          <div className="shrink-0" style={{ width: detailPanelWidth, maxWidth: "100%" }}>
            <TopologyDetailPanel node={selectedNode} provider={selectedProvider} onClose={() => setSelectedNodeId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
