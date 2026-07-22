"use client";

/**
 * 네트워크 이중화 패널 — GET /monitor/network/paths(전용회선/VPN 상태) +
 * POST /monitor/network/bypass(장애 트리거/복구). 운영자/관리자만 트리거 가능.
 */
import { useState } from "react";
import { ApiError, getNetworkPaths, triggerNetworkBypass } from "@/lib/api";
import type { NetworkPathStatus } from "@/lib/types";
import { useApiResource } from "@/hooks/useApiResource";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { fmtPct } from "@/components/ui/format";
import { ConfirmButton } from "./ConfirmButton";
import { useCanAct } from "./permissions";
import { useAutomationScope } from "./scope";
import { useMinutesAgo } from "./useMinutesAgo";

const STATUS_TONE: Record<NetworkPathStatus["status"], StatusTone> = {
  ACTIVE: "ok",
  STANDBY: "warn",
  FAILED: "crit",
};
const STATUS_LABEL: Record<NetworkPathStatus["status"], string> = {
  ACTIVE: "활성",
  STANDBY: "대기",
  FAILED: "장애",
};

function PathCard({ title, status }: { title: string; status: NetworkPathStatus }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">{title}</span>
        <StatusBadge status={STATUS_TONE[status.status]} label={STATUS_LABEL[status.status]} />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="num text-[13px]">패킷 손실 {fmtPct(status.packet_loss)}</span>
        <span className="num text-[13px]">{status.bandwidth_mbps.toFixed(0)} Mbps</span>
      </div>
    </div>
  );
}

export function NetworkPanel() {
  const { canAct, roleLabel } = useCanAct();
  const { tenant_id, provider } = useAutomationScope();
  const { data, error, isLoading, lastUpdated, refetch } = useApiResource(
    () => getNetworkPaths({ tenant_id, provider }),
    [tenant_id, provider]
  );
  const minutesAgo = useMinutesAgo(lastUpdated);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleBypass(action: "trigger" | "recover") {
    setActionError(null);
    try {
      await triggerNetworkBypass(action, { tenant_id, provider });
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "네트워크 액션 실행 중 알 수 없는 오류가 발생했습니다.");
    }
  }

  return (
    <ChartContainer
      title="네트워크 이중화"
      subtitle="전용회선/VPN 경로 상태"
      action={
        <span className="flex items-center gap-2">
          <InfoTooltip label="네트워크 이중화 설명">
            전용회선(주)과 VPN(백업) 두 경로 중 하나에 장애가 발생해도 자동으로 우회해 서비스를 유지하는 이중화
            구성입니다.
          </InfoTooltip>
          {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
        </span>
      }
    >
      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton height={84} />
          <Skeleton height={84} />
        </div>
      )}
      {error && <ErrorState cause="네트워크 경로 상태를 불러오지 못했습니다." remedy={error.message} onRetry={refetch} />}
      {!isLoading && !error && data && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PathCard title="전용회선" status={data.dedicated} />
            <PathCard title="VPN" status={data.vpn} />
          </div>
          {actionError && <ErrorState cause="네트워크 액션 실행에 실패했습니다." remedy={actionError} />}
          <div className="flex flex-wrap items-center gap-3">
            <ConfirmButton
              label="장애 트리거"
              confirmLabel="트리거"
              tone="danger"
              description="전용회선 장애 상황을 시뮬레이션합니다."
              disabled={!canAct}
              disabledReason={!canAct ? `${roleLabel}은 읽기 전용입니다` : undefined}
              onConfirm={() => handleBypass("trigger")}
            />
            <ConfirmButton
              label="복구"
              confirmLabel="복구"
              description="경로를 정상 상태로 복구합니다."
              disabled={!canAct}
              disabledReason={!canAct ? `${roleLabel}은 읽기 전용입니다` : undefined}
              onConfirm={() => handleBypass("recover")}
            />
          </div>
        </div>
      )}
    </ChartContainer>
  );
}
