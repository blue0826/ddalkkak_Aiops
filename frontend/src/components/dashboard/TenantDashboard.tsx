"use client";

/**
 * 단일 테넌트 대시보드 — 디자인 가이드 §5.2 수직 계층(상태 요약 → 골든 시그널 → 최근 인시던트).
 * 5초 규칙: 최상단 좌측 StatusBadge가 "지금 건강한가?"에 즉시 답한다(OPEN 인시던트 심각도 기준).
 * 모든 데이터는 useApiResource로 로딩/에러/폴링/stale을 표준화해 실 엔드포인트에서만 가져온다.
 *
 * MSP 전체 보기(page.tsx)에서 3가지 컨텍스트로 재사용된다:
 *  - 비관리자: 파라미터 없이 그대로(자기 테넌트, 기존 동작과 100% 동일).
 *  - 관리자 드릴다운(?tenant=<id>): tenantIdOverride로 특정 고객사에 스코프.
 *  - 관리자 통합 뷰(?view=unified): tenantIdOverride="system"으로 전 고객사 합산에 스코프.
 * tenantIdOverride가 없으면 기존과 동일하게 URL의 tenant 쿼리를 그대로 따른다.
 */
import { useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useApiResource } from "@/hooks/useApiResource";
import { useAuth } from "@/hooks/useAuth";
import { useProviders } from "@/hooks/useProviders";
import { useTenants } from "@/hooks/useTenants";
import { getCosts, getEvents, getIncidents, getMetrics, getTopology } from "@/lib/api";
import { getParam, resolveActiveProviderId, withParam } from "@/lib/url-state";
import type { Incident } from "@/lib/types";
import { GLOSSARY } from "@/lib/glossary";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { CriticalAlertsBar } from "@/components/dashboard/CriticalAlertsBar";
import { DetectionRunButton } from "@/components/dashboard/DetectionRunButton";
import { GoldenSignalsPanel } from "@/components/dashboard/GoldenSignalsPanel";
import { RecentIncidentsTable } from "@/components/dashboard/RecentIncidentsTable";
import { StatusSummaryRow } from "@/components/dashboard/StatusSummaryRow";
import { computeHealthTone, oldestUpdate, pickFeaturedNode, rangeToMinutes } from "@/components/dashboard/dashboardUtils";
import { useMinutesAgo } from "@/components/dashboard/useMinutesAgo";

const RANGE_LABEL: Record<string, string> = { "1h": "1시간", "24h": "24시간", "7d": "7일", "30d": "30일" };

interface TenantDashboardProps {
  /** 지정 시 URL의 tenant 쿼리 대신 이 값으로 스코프를 강제한다(예: 통합 뷰의 "system"). */
  tenantIdOverride?: string;
  /** 헤더 h1 텍스트. 기본 "대시보드". */
  title?: string;
  /** 헤더 우측(StaleIndicator 앞)에 끼워 넣을 요소 — 뷰 토글, "← 전체 보기" 링크 등. */
  headerExtra?: ReactNode;
}

export function TenantDashboard({ tenantIdOverride, title = "대시보드", headerExtra }: TenantDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { providers } = useProviders();

  // 통합 뷰(전 고객사 합산)에서는 인시던트가 어느 고객사 것인지 표시한다.
  const isUnified = tenantIdOverride === "system";
  const { tenants } = useTenants(isAdmin && isUnified);
  const tenantNameFor = isUnified
    ? (tid: string) => tenants.find((t) => t.id === tid)?.name ?? tid
    : undefined;

  const tenantId = tenantIdOverride ?? (getParam(searchParams, "tenant") || undefined);
  const range = getParam(searchParams, "range", "24h");
  const providerId = resolveActiveProviderId(searchParams, providers);
  const minutes = rangeToMinutes(range);

  // 실 고객사(REAL_EMPTY) 골든 시그널 빈 상태의 "24시간으로 보기" 원클릭 액션 — 전역
  // 필터바와 동일한 ?range= 쿼리를 갱신해 단일 진실 소스(URL) 원칙을 유지한다.
  const widenRangeTo24h = () => {
    router.replace(`${pathname}?${withParam(searchParams, "range", "24h")}`, { scroll: false });
  };

  // ScopeQuery는 값이 바뀔 때만 재조회를 트리거해야 하므로 원시 필드를 deps로 사용한다(객체 재생성 방지).
  const scope = useMemo(() => ({ tenant_id: tenantId, provider: providerId }), [tenantId, providerId]);

  const topologyState = useApiResource(() => getTopology(scope), [scope.tenant_id, scope.provider]);
  // 관리자 드릴다운/통합 뷰에서 올바른 고객사 인시던트가 걸리도록 tenantId를 넘긴다.
  const incidentsState = useApiResource(() => getIncidents(tenantId), [tenantId]);
  const eventsState = useApiResource(() => getEvents(scope), [scope.tenant_id, scope.provider]);
  const costsState = useApiResource(() => getCosts(scope), [scope.tenant_id, scope.provider]);

  const featuredNode = pickFeaturedNode(topologyState.data);
  const featuredNodeId = featuredNode?.id;
  const cpuState = useApiResource(
    () => {
      if (!featuredNodeId) throw new Error("골든 시그널 대상 노드가 없습니다.");
      return getMetrics({ node_id: featuredNodeId, metric_name: "cpu", minutes, provider: providerId, tenant_id: tenantId });
    },
    [featuredNodeId, minutes, providerId, tenantId],
    { enabled: Boolean(featuredNodeId) }
  );
  const memoryState = useApiResource(
    () => {
      if (!featuredNodeId) throw new Error("골든 시그널 대상 노드가 없습니다.");
      return getMetrics({ node_id: featuredNodeId, metric_name: "memory", minutes, provider: providerId, tenant_id: tenantId });
    },
    [featuredNodeId, minutes, providerId, tenantId],
    { enabled: Boolean(featuredNodeId) }
  );

  const summaryLoading =
    topologyState.isLoading || incidentsState.isLoading || eventsState.isLoading || costsState.isLoading;

  const openIncidents = incidentsState.data?.filter((i) => i.status === "OPEN") ?? null;
  const activeEvents = eventsState.data?.filter((e) => e.status === "active") ?? null;

  const healthTone = incidentsState.isLoading ? null : computeHealthTone(incidentsState.data);
  const healthLabel = healthTone === "crit" ? "심각 인시던트 발생" : healthTone === "warn" ? "주의 필요" : "정상 운영 중";

  const lastUpdated = oldestUpdate(topologyState.lastUpdated, incidentsState.lastUpdated, eventsState.lastUpdated, costsState.lastUpdated);
  const staleMinutes = useMinutesAgo(lastUpdated);

  const canRunDetection = user?.role === "SYSTEM_ADMIN" || user?.role === "TENANT_OPERATOR";

  const handleRowClick = (incident: Incident) => {
    const query = searchParams.toString();
    const params = new URLSearchParams(query);
    params.set("id", String(incident.id));
    router.push(`/console/incidents?${params.toString()}`);
  };

  const refetchAll = () => {
    topologyState.refetch();
    incidentsState.refetch();
    eventsState.refetch();
    costsState.refetch();
  };

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
            {title}
          </h1>
          {healthTone === null ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
              <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />
              상태 확인 중
            </span>
          ) : (
            <StatusBadge status={healthTone} label={healthLabel} />
          )}
          <InfoTooltip label="상태 요약 설명">{GLOSSARY.health_summary}</InfoTooltip>
        </div>
        <div className="flex items-center gap-3">
          {headerExtra}
          {staleMinutes !== null && <StaleIndicator minutesAgo={staleMinutes} />}
        </div>
      </header>

      <CriticalAlertsBar incidents={incidentsState.data} onRowClick={handleRowClick} tenantNameFor={tenantNameFor} />

      <StatusSummaryRow
        isLoading={summaryLoading}
        topology={topologyState.data}
        openIncidentCount={openIncidents?.length ?? null}
        totalIncidentCount={incidentsState.data?.length ?? null}
        activeEventCount={activeEvents?.length ?? null}
        totalEventCount={eventsState.data?.length ?? null}
        costs={costsState.data}
      />

      <GoldenSignalsPanel
        featuredNode={featuredNode}
        topologyLoading={topologyState.isLoading}
        cpuState={cpuState}
        memoryState={memoryState}
        rangeLabel={RANGE_LABEL[range] ?? range}
        rangeMinutes={minutes}
        onWidenRange={widenRangeTo24h}
      />

      <RecentIncidentsTable
        incidents={incidentsState.data}
        isLoading={incidentsState.isLoading}
        error={incidentsState.error}
        onRetry={refetchAll}
        onRowClick={handleRowClick}
        headerAction={canRunDetection ? <DetectionRunButton onCompleted={incidentsState.refetch} /> : undefined}
        tenantNameFor={tenantNameFor}
      />
    </>
  );
}
