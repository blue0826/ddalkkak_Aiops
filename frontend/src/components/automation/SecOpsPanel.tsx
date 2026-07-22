"use client";

/**
 * SecOps 차단 IP 패널 — GET /monitor/security/blocked + POST /monitor/security/soar.
 * 운영자/관리자만 수동 차단 가능.
 */
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { ApiError, getBlockedIps, triggerSoarBlock } from "@/lib/api";
import type { BlockedIp } from "@/lib/types";
import { useApiResource } from "@/hooks/useApiResource";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { ConfirmButton } from "./ConfirmButton";
import { useCanAct } from "./permissions";
import { useAutomationScope } from "./scope";
import { useMinutesAgo } from "./useMinutesAgo";

const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;

const COLUMNS: DataTableColumn<BlockedIp>[] = [
  { key: "ip", header: "차단된 IP", render: (ip) => <span className="font-mono">{ip}</span> },
];

export function SecOpsPanel() {
  const { canAct, roleLabel } = useCanAct();
  const { tenant_id, provider } = useAutomationScope();
  const { data, error, isLoading, lastUpdated, refetch } = useApiResource(
    () => getBlockedIps({ tenant_id, provider }),
    [tenant_id, provider]
  );
  const minutesAgo = useMinutesAgo(lastUpdated);
  const [ip, setIp] = useState("");
  const [blockError, setBlockError] = useState<string | null>(null);

  const isValidIp = IPV4_PATTERN.test(ip.trim());

  async function handleBlock() {
    setBlockError(null);
    try {
      await triggerSoarBlock(ip.trim(), { tenant_id, provider });
      setIp("");
      refetch();
    } catch (err) {
      setBlockError(err instanceof ApiError ? err.message : "IP 차단 중 알 수 없는 오류가 발생했습니다.");
    }
  }

  return (
    <ChartContainer
      title="SecOps 차단 IP"
      subtitle="SOAR가 자동 차단한(또는 수동 차단한) 공격자 IP 목록"
      action={
        <span className="flex items-center gap-2">
          <InfoTooltip label="SOAR 차단 설명">
            SOAR(Security Orchestration, Automation and Response) — 탐지된 공격 패턴에 대해 자동으로 IP를 차단하는
            보안 자동화입니다.
          </InfoTooltip>
          {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="soar-block-ip">
            차단할 IP
          </label>
          <input
            id="soar-block-ip"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            disabled={!canAct}
            placeholder="예: 203.0.113.10"
            className="h-9 w-52 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-3 font-mono text-[13px] text-[var(--foreground)] disabled:opacity-50"
          />
          <ConfirmButton
            label="IP 차단"
            confirmLabel="차단"
            tone="danger"
            description={`${ip.trim()} 을(를) 보안 그룹에서 차단합니다.`}
            disabled={!canAct || !isValidIp}
            disabledReason={!canAct ? `${roleLabel}은 읽기 전용입니다` : "유효한 IPv4 주소를 입력하십시오"}
            onConfirm={handleBlock}
          />
        </div>
        {blockError && <ErrorState cause="IP 차단에 실패했습니다." remedy={blockError} />}

        {isLoading && <Skeleton height={140} />}
        {error && <ErrorState cause="차단 IP 목록을 불러오지 못했습니다." remedy={error.message} onRetry={refetch} />}
        {!isLoading && !error && data && (
          <DataTable
            columns={COLUMNS}
            rows={data}
            getRowKey={(row) => row}
            emptyState={
              <EmptyState
                variant="onboarding"
                icon={ShieldAlert}
                title="차단된 IP가 없습니다"
                description="SOAR 자동 차단 또는 수동 차단이 발생하면 이 목록에 표시됩니다."
              />
            }
          />
        )}
      </div>
    </ChartContainer>
  );
}
