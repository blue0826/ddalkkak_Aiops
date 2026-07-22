"use client";

/**
 * 메트릭 화면 — 전 자원 다중 그리드(§CEO 피드백: "1개 자원만 선택되는 게 아니라 모든 자원이
 * 카드로 보여야 한다"). vm/database 노드마다 미니 카드(현재값+스파크라인)를 그리드로 배치하고,
 * 카드를 클릭하면 해당 자원의 확장 차트(CPU+메모리, 더 긴 범위)를 상세 패널로 연다.
 * 필터바(range/tenant/provider)는 URL을 단일 진실 소스로 삼는다(§7.4) — 이 화면은 URL만 읽는다.
 * 선택된 노드도 동일 원칙으로 URL(`?node=`)에 반영해 링크 공유 시 동일 화면을 재현한다.
 *
 * minutes 매핑 비고: 백엔드 시뮬레이터는 분당 1포인트를 동기 루프로 생성하므로(간이 성능 특성),
 * 7일/30일 요청을 그대로 분단위로 넘기면 각각 10,080/43,200 포인트가 되어 네트워크·차트 렌더
 * 모두에 무리가 있다. 7일/30일 선택 시 최근 3일(4,320분)로 상한을 두고 그 사실을 자막에 명시한다
 * (§8 — 조용히 다른 데이터를 보여주는 것은 정확성 버그이므로 상한 적용 사실을 항상 노출한다).
 */
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { useApiResource } from "@/hooks/useApiResource";
import { useAuth } from "@/hooks/useAuth";
import { useProviders } from "@/hooks/useProviders";
import { useServiceStatus } from "@/hooks/useServiceStatus";
import { useTenants } from "@/hooks/useTenants";
import { getTopology } from "@/lib/api";
import { GLOSSARY } from "@/lib/glossary";
import { getParam, resolveActiveProviderId, withParam } from "@/lib/url-state";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { ServiceDisabledNotice } from "@/components/ui/ServiceDisabledNotice";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { NoTenantsEmptyState } from "@/components/msp/NoTenantsEmptyState";
import { TenantCycler } from "@/components/msp/TenantCycler";
import { ResourceMetricCard } from "@/components/metrics/ResourceMetricCard";
import { ResourceMetricDetail } from "@/components/metrics/ResourceMetricDetail";
import { sortWarningFirst } from "@/components/metrics/metricsUtils";
import { useMinutesAgo } from "@/components/metrics/useMinutesAgo";

// 메트릭이 의미있는 자원 타입만 카드 대상으로 삼는다 (백엔드 monitoring_service.TARGET_NODE_TYPES와 동일)
const TARGET_NODE_TYPES = new Set(["vm", "database"]);

// 카드 스파크라인은 전역 range와 무관하게 가볍게 고정한다 — 자원 수 × 요청이 늘어나므로
// 카드는 짧고 저렴한 범위, 상세 패널만 전역 range(더 긴 범위)를 따른다.
const CARD_RANGE_MINUTES = 60;

// "더 보기" 이전 기본 노출 카드 수 — 자원이 아주 많을 때 초기 폴링 부하를 제한한다.
const INITIAL_VISIBLE_COUNT = 12;

const RANGE_CONFIG: Record<string, { minutes: number; label: string }> = {
  "1h": { minutes: 60, label: "최근 1시간" },
  "24h": { minutes: 1440, label: "최근 24시간" },
  "7d": { minutes: 4320, label: "최근 3일 (7일 범위 중 상한 적용 — 분 단위 원시 데이터 특성상 3일까지만 표시)" },
  "30d": { minutes: 4320, label: "최근 3일 (30일 범위 중 상한 적용 — 분 단위 원시 데이터 특성상 3일까지만 표시)" },
};

export default function MetricsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { providers, getProviderById } = useProviders();
  const { isAdmin, user } = useAuth();

  // 관리자는 전 테넌트를 한 화면에 쏟아내지 않고, 항상 고객사 하나만 스코프해서 본다
  // (CEO 지시 — topology/page.tsx와 동일 패턴). 비관리자는 기존과 동일하게 자기 테넌트만
  // (쿼리 없으면 undefined → 백엔드가 인증 컨텍스트로 스코프).
  const { tenants: rawTenants, isLoading: tenantsLoading } = useTenants(isAdmin);
  const tenants = useMemo(() => rawTenants.filter((t) => t.id !== "system"), [rawTenants]);

  const range = getParam(searchParams, "range", "24h");
  const urlTenantId = getParam(searchParams, "tenant") || undefined;
  // 관리자가 특정 고객사 없이 진입하면(전체) 첫 고객사를 기본 선택한다.
  const tenantId = isAdmin ? urlTenantId || tenants[0]?.id : urlTenantId;
  // 테넌트 목록이 아직 로딩 중이라 기본 고객사를 정하지 못한 구간에는 "전체" 조회를 피하려고 fetch를 미룬다.
  const waitingForDefaultTenant = isAdmin && !urlTenantId && tenantsLoading;
  // 관리자 + 등록된 고객사 0곳 — tenants[0]?.id가 undefined가 되어 getTopology가 admin의
  // "system" 스코프로 처리되면 지어낸 데모 노드가 노출된다. 로딩이 끝난 뒤 0곳으로 확정되면
  // 조회 자체를 막고(enabled=false) 카드 그리드 대신 온보딩 유도 빈 상태를 보여준다.
  const noTenants = isAdmin && !tenantsLoading && tenants.length === 0;
  const providerId = resolveActiveProviderId(searchParams, providers);
  const rangeConfig = RANGE_CONFIG[range] ?? RANGE_CONFIG["24h"];
  const selectedNodeId = getParam(searchParams, "node") || null;
  const [showAll, setShowAll] = useState(false);

  const topology = useApiResource(
    () => getTopology({ tenant_id: tenantId, provider: providerId || undefined }),
    [tenantId, providerId],
    { enabled: !waitingForDefaultTenant && !noTenants }
  );

  // 이 화면은 SCP Cloud Monitoring(과금 서비스)에 의존한다 — 비관리자는 URL에 ?tenant=가
  // 없으면 본인 고객사(user.tenant_id)로 스코프를 대신한다(백엔드가 인증 컨텍스트로 스코프하는
  // topology 조회와 동일 취지). 미활성화/권한없음이면 카드 그리드 대신 안내로 데이터 영역을 대체한다
  // (§CEO 지시: 메뉴는 유지하되 빈 차트로 오해받지 않게 한다).
  const serviceTenantId = tenantId ?? user?.tenant_id;
  const serviceStatus = useServiceStatus(serviceTenantId);
  const monitoringService = serviceStatus.data?.find((s) => s.service_key === "monitoring");
  const monitoringUnavailable = Boolean(
    monitoringService && (!monitoringService.enabled || monitoringService.last_status === "forbidden")
  );

  // 기본 선택된 고객사를 URL에 반영한다(공유 가능한 링크 + FilterBar 테넌트 드롭다운과 표시 일관성).
  useEffect(() => {
    if (isAdmin && !urlTenantId && tenants.length > 0) {
      router.replace(`${pathname}?${withParam(searchParams, "tenant", tenants[0].id)}`, { scroll: false });
    }
  }, [isAdmin, urlTenantId, tenants, pathname, router, searchParams]);

  const handleTenantChange = (id: string) => {
    router.replace(`${pathname}?${withParam(searchParams, "tenant", id)}`, { scroll: false });
  };

  const nodes = useMemo(
    () => sortWarningFirst((topology.data?.nodes ?? []).filter((node) => TARGET_NODE_TYPES.has(node.type))),
    [topology.data]
  );
  const visibleNodes = showAll ? nodes : nodes.slice(0, INITIAL_VISIBLE_COUNT);
  const hiddenCount = nodes.length - visibleNodes.length;
  const selectedNode = selectedNodeId ? (nodes.find((node) => node.id === selectedNodeId) ?? null) : null;

  const selectNode = (id: string | null) => {
    router.replace(`${pathname}?${withParam(searchParams, "node", id ?? "")}`, { scroll: false });
  };

  // 실 고객사(REAL_EMPTY) 빈 상태의 "24시간으로 보기" 원클릭 액션 — 전역 필터바와 동일한
  // ?range= 쿼리를 갱신해 단일 진실 소스(URL) 원칙을 유지한다.
  const widenRangeTo24h = () => {
    router.replace(`${pathname}?${withParam(searchParams, "range", "24h")}`, { scroll: false });
  };

  const staleMinutes = useMinutesAgo(topology.lastUpdated);
  const hasHardError = !topology.data && topology.error;
  // 고객사 목록 대기 구간도 스켈레톤으로 취급 — 그 사이 topology.isLoading은 아직 false일 수 있다(enabled=false 구간).
  const isInitialLoading = topology.isLoading || waitingForDefaultTenant;

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
            메트릭
          </h1>
          <InfoTooltip label="메트릭 화면 설명">{GLOSSARY.golden_signals}</InfoTooltip>
        </div>
        {staleMinutes !== null && <StaleIndicator minutesAgo={staleMinutes} />}
      </header>

      <p className="-mt-4 text-[13px] text-[var(--muted)]">
        VM·데이터베이스 자원의 CPU·메모리 현황을 카드로 표시합니다. 카드를 클릭하면 상세 추이({rangeConfig.label})를 볼 수 있습니다.
      </p>

      {/* 관리자만 — 고객사 선택/자동 순환. 값은 URL ?tenant=로 배선해 FilterBar와 일관된 단일 진실 소스를 유지한다. */}
      {isAdmin && <TenantCycler tenants={tenants} value={tenantId ?? ""} onChange={handleTenantChange} />}

      {noTenants && (
        <NoTenantsEmptyState description="관제할 고객사가 아직 등록되지 않았습니다. 설정 화면에서 첫 고객사를 온보딩하면 자원 카드가 표시됩니다." />
      )}

      {!noTenants && monitoringUnavailable && monitoringService && (
        <ServiceDisabledNotice service={monitoringService} />
      )}

      {!noTenants && !monitoringUnavailable && isInitialLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height={172} />
          ))}
        </div>
      )}

      {!noTenants && !monitoringUnavailable && !isInitialLoading && hasHardError && (
        <ErrorState
          cause="토폴로지 조회에 실패했습니다."
          remedy={`${topology.error?.message ?? ""} 네트워크 연결을 확인한 뒤 다시 시도하십시오.`}
          onRetry={topology.refetch}
        />
      )}

      {!noTenants && !monitoringUnavailable && !isInitialLoading && !hasHardError && nodes.length === 0 && (
        <EmptyState
          variant="filtered"
          icon={LayoutGrid}
          title="표시할 노드가 없습니다"
          description="이 테넌트·프로바이더 범위에 CPU·메모리 지표를 제공하는 VM·데이터베이스 노드가 없습니다."
        />
      )}

      {!noTenants && !monitoringUnavailable && !isInitialLoading && !hasHardError && nodes.length > 0 && (
        <div className="flex flex-col gap-4">
          {selectedNode && (
            <ResourceMetricDetail
              node={selectedNode}
              provider={getProviderById(selectedNode.provider)}
              rangeMinutes={rangeConfig.minutes}
              rangeLabel={rangeConfig.label}
              onClose={() => selectNode(null)}
              onWidenRange={widenRangeTo24h}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleNodes.map((node) => (
              <ResourceMetricCard
                key={node.id}
                node={node}
                provider={getProviderById(node.provider)}
                rangeMinutes={CARD_RANGE_MINUTES}
                isSelected={selectedNode?.id === node.id}
                onSelect={selectNode}
              />
            ))}
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="self-center rounded-[var(--radius-input)] border border-[var(--border)] px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-[var(--bg-2)]"
            >
              {`더 보기 (${hiddenCount}개 더)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
