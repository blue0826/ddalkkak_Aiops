"use client";

/**
 * 고객사 상세 — 서비스 활성화 토글 패널.
 * SCP Cloud Monitoring/Cloud Logging처럼 과금이 발생하는 서비스는 고객사·서비스 단위 명시
 * 동의(기본 OFF) 전에는 절대 호출하지 않는다(CEO 결정). PUT /tenants/{id}/services/{key}는
 * SYSTEM_ADMIN 전용이며, 이 패널은 TenantDetailPanel(관리자 전용 화면)에서만 쓰인다.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useServiceStatus } from "@/hooks/useServiceStatus";
import { ApiError, updateTenantService } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ServiceLastStatus, ServiceStatus } from "@/lib/types";

const LAST_STATUS_LABEL: Record<ServiceLastStatus, string> = {
  ok: "정상 연동",
  forbidden: "권한 없음 — 해당 고객사 계정에 API 권한이 없습니다",
  error: "연동 오류 — 마지막 호출이 실패했습니다",
  unknown: "확인 전",
};

const LAST_STATUS_TONE: Record<ServiceLastStatus, string> = {
  ok: "text-[var(--ok)]",
  forbidden: "text-[var(--crit)]",
  error: "text-[var(--crit)]",
  unknown: "text-[var(--muted)]",
};

interface TenantServiceTogglePanelProps {
  tenantId: string;
  tenantName: string;
}

export function TenantServiceTogglePanel({ tenantId, tenantName }: TenantServiceTogglePanelProps) {
  const { isAdmin } = useAuth();
  const { data: services, isLoading, error, refetch } = useServiceStatus(tenantId);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function handleToggle(service: ServiceStatus) {
    if (!isAdmin || pendingKey) return;
    setPendingKey(service.service_key);
    setToggleError(null);
    try {
      await updateTenantService(tenantId, service.service_key, !service.enabled);
      refetch();
    } catch (err) {
      setToggleError(
        err instanceof ApiError
          ? err.message
          : `${service.display_name} 상태 변경 중 알 수 없는 오류가 발생했습니다.`
      );
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <ChartContainer
      title="서비스 활성화"
      subtitle={`${tenantName}에서 사용할 SCP 서비스를 켜고 끕니다. 과금 서비스는 활성화 시 요금이 발생할 수 있습니다.`}
    >
      <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        )}

        {!isLoading && error && (
          <ErrorState cause="서비스 활성화 상태 조회에 실패했습니다." remedy={error.message} onRetry={refetch} />
        )}

        {!isLoading && !error && (services?.length ?? 0) === 0 && (
          <p className="text-[12px] text-[var(--muted)]">등록된 서비스가 없습니다.</p>
        )}

        {!isLoading && !error && services && services.length > 0 && (
          <ul className="flex flex-col gap-2">
            {services.map((service) => {
              const isPending = pendingKey === service.service_key;
              return (
                <li
                  key={`${service.provider}-${service.service_key}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-input)] border border-[var(--border)] px-3 py-2.5"
                >
                  <div className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                      {service.display_name}
                      <span className="uppercase text-[10px] text-[var(--muted)]">{service.provider}</span>
                      {service.billable && (
                        <span className="rounded-[var(--radius-badge)] border border-[var(--warn-border)] bg-[var(--warn-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warn)]">
                          과금 서비스
                        </span>
                      )}
                    </span>
                    <span className={cn("text-[11px]", LAST_STATUS_TONE[service.last_status])}>
                      {LAST_STATUS_LABEL[service.last_status]}
                    </span>
                    {service.billable && !service.enabled && (
                      <span className="text-[11px] text-[var(--muted)]">
                        활성화하면 이 고객사 계정으로 {service.display_name} API를 호출하며 요금이 발생할 수
                        있습니다.
                      </span>
                    )}
                  </div>

                  <span className="inline-flex shrink-0 items-center gap-2">
                    {isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted)]" aria-hidden />
                    )}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={service.enabled}
                      aria-label={`${service.display_name} ${service.enabled ? "비활성화" : "활성화"}`}
                      disabled={!isAdmin || isPending}
                      onClick={() => handleToggle(service)}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50",
                        service.enabled ? "bg-[var(--brand)]" : "border border-[var(--border)] bg-[var(--bg-2)]"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                          service.enabled ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {!isAdmin && (
          <p className="text-[11px] text-[var(--muted)]">서비스 활성화 전환은 시스템 관리자만 가능합니다.</p>
        )}

        {toggleError && (
          <p role="alert" className="text-[12px] text-[var(--crit)]">
            {toggleError}
          </p>
        )}
      </div>
    </ChartContainer>
  );
}
