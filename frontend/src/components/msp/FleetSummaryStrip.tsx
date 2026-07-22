"use client";

/**
 * 전 고객사 통합 KPI/SLA 롤업 스트립 — GET /monitor/overview 배열 전체를 클라이언트에서 합산한다.
 * 헬스 분포는 숫자만이 아니라 --ok/--warn/--crit 토큰으로 색상 코드화해 NOC 벽에서 즉시 식별되게 한다.
 */
import { AlertTriangle, BellRing, Boxes, Building2, Wallet } from "lucide-react";
import type { TenantHealth, TenantOverview } from "@/lib/types";
import { ErrorState } from "@/components/ui/ErrorState";
import { KpiCard } from "@/components/ui/KpiCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { fmtCount, fmtKRW } from "@/components/ui/format";
import { computeFleetStats } from "./fleetSummaryUtils";

const HEALTH_CHIP_CLASS: Record<TenantHealth, string> = {
  healthy: "border-[var(--ok-border)] bg-[var(--ok-bg)] text-[var(--ok)]",
  warning: "border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn)]",
  critical: "border-[var(--crit-border)] bg-[var(--crit-bg)] text-[var(--crit)]",
};

const HEALTH_LABEL: Record<TenantHealth, string> = {
  healthy: "정상",
  warning: "주의",
  critical: "심각",
};

const HEALTH_ORDER: TenantHealth[] = ["healthy", "warning", "critical"];

interface FleetSummaryStripProps {
  data: TenantOverview[] | null;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function FleetSummaryStrip({ data, isLoading, error, onRetry }: FleetSummaryStripProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={132} />
        ))}
      </div>
    );
  }

  if (!data && error) {
    return (
      <ErrorState
        cause="전 고객사 통합 현황 조회에 실패했습니다."
        remedy={error.message || "잠시 후 다시 시도하십시오."}
        onRetry={onRetry}
      />
    );
  }

  if (!data) return null;

  const stats = computeFleetStats(data);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {HEALTH_ORDER.map((health) => (
          <div
            key={health}
            className={cn(
              "flex items-center gap-2 rounded-[var(--radius-badge)] border px-2.5 py-1.5",
              HEALTH_CHIP_CLASS[health]
            )}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            <span className="text-[11px] font-medium uppercase tracking-wide">{HEALTH_LABEL[health]}</span>
            <span className="num text-[13px] font-semibold">{stats.healthCounts[health]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="고객사 수" value={fmtCount(stats.totalCustomers)} icon={Building2} />
        <KpiCard label="총 관제 자원" value={fmtCount(stats.totalResources)} icon={Boxes} />
        <KpiCard label="총 활성 인시던트" value={fmtCount(stats.totalIncidents)} icon={AlertTriangle} />
        <KpiCard label="총 활성 경보" value={fmtCount(stats.totalAlerts)} icon={BellRing} />
        <KpiCard label="월 비용 합계" value={fmtKRW(stats.totalCost)} icon={Wallet} />
      </div>
    </div>
  );
}
