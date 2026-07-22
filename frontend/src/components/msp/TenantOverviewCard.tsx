"use client";

/**
 * 고객사 카드 — MSP 전체 보기(고객사별) 그리드의 카드 1개.
 * health는 색만이 아니라 StatusBadge(점+텍스트)로 표현해 색맹 접근성을 지킨다.
 */
import { AlertTriangle, BellRing, Boxes, type LucideIcon, Wallet } from "lucide-react";
import type { Provider, TenantOverview } from "@/lib/types";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { ProviderBadge } from "@/components/ui/ProviderBadge";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { fmtCount, fmtKRW } from "@/components/ui/format";

const HEALTH_TONE: Record<TenantOverview["health"], StatusTone> = {
  healthy: "ok",
  warning: "warn",
  critical: "crit",
};

const HEALTH_TOOLTIP: Record<TenantOverview["health"], string> = {
  healthy: "활성 인시던트·경보·경고 상태 자원이 없는 정상 상태입니다.",
  warning: "활성 인시던트 또는 경고 상태 자원이 있어 확인이 필요합니다.",
  critical: "심각(CRITICAL) 인시던트가 열려 있어 즉시 조치가 필요합니다.",
};

interface MetricProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

function Metric({ icon: Icon, label, value }: MetricProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
        <Icon size={11} aria-hidden />
        {label}
      </span>
      <span className="num font-semibold" style={{ font: "var(--text-h2)" }}>
        {value}
      </span>
    </div>
  );
}

interface TenantOverviewCardProps {
  tenant: TenantOverview;
  providers: Provider[];
  onClick: () => void;
}

export function TenantOverviewCard({ tenant, providers, onClick }: TenantOverviewCardProps) {
  const tone = HEALTH_TONE[tenant.health];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4 text-left transition-colors hover:bg-[var(--bg-2)] cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="truncate font-semibold" style={{ font: "var(--text-h2)" }}>
            {tenant.name}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {tenant.providers.length === 0 && (
              <span className="text-[11px] text-[var(--muted)]">연동된 프로바이더 없음</span>
            )}
            {tenant.providers.map((providerId) => {
              const provider = providers.find((p) => p.id === providerId);
              return provider ? (
                <ProviderBadge key={providerId} provider={provider} />
              ) : (
                <span
                  key={providerId}
                  className="rounded-[var(--radius-badge)] border border-[var(--border)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]"
                >
                  {providerId}
                </span>
              );
            })}
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={tone} />
          <InfoTooltip label="고객사 상태 설명">{HEALTH_TOOLTIP[tenant.health]}</InfoTooltip>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric icon={Boxes} label="관제 자원" value={fmtCount(tenant.resource_count)} />
        <Metric icon={AlertTriangle} label="활성 인시던트" value={fmtCount(tenant.active_incidents)} />
        <Metric icon={BellRing} label="활성 경보" value={fmtCount(tenant.active_alerts)} />
        <Metric icon={Wallet} label="월 비용" value={fmtKRW(tenant.monthly_cost)} />
      </div>
    </div>
  );
}
