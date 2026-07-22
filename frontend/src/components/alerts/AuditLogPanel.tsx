"use client";

/**
 * 감사로그 — GET /alerts/audit-logs. 헌법 §3: 감사로그는 5년간 보관된다.
 */
import { ScrollText } from "lucide-react";
import { getAuditLogs } from "@/lib/api";
import { useApiResource } from "@/hooks/useApiResource";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import type { AuditLog } from "@/lib/types";
import { useMinutesAgo } from "./useMinutesAgo";

const AUDIT_LOG_LIMIT = 100;

function fmtTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AuditLogPanel() {
  const { data, error, isLoading, lastUpdated, refetch } = useApiResource(() => getAuditLogs(AUDIT_LOG_LIMIT), []);
  const minutesAgo = useMinutesAgo(lastUpdated);

  const columns: DataTableColumn<AuditLog>[] = [
    { key: "created_at", header: "시각", numeric: true, render: (row) => fmtTimestamp(row.created_at) },
    { key: "user_email", header: "사용자", render: (row) => row.user_email },
    { key: "action", header: "액션", render: (row) => <span className="font-mono">{row.action}</span> },
    {
      key: "resource",
      header: "리소스",
      render: (row) => (
        <span className="font-mono">
          {row.resource_type} #{row.resource_id}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
          헌법 §3에 따라 감사로그는 5년간 보관됩니다 (최근 {AUDIT_LOG_LIMIT}건 표시).
          <InfoTooltip label="감사로그 설명">
            알람 규칙 생성·삭제, SCP 자격증명 등록, L5 조치 승인·실행 등 민감한 작업을 누가·언제 수행했는지 기록한
            이력입니다.
          </InfoTooltip>
        </p>
        {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={36} />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          cause={`감사로그를 불러오지 못했습니다: ${error.message}`}
          remedy="네트워크 상태를 확인한 뒤 다시 시도하십시오."
          onRetry={refetch}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              variant="onboarding"
              title="감사로그가 없습니다"
              description="알람 규칙 생성·삭제, L5 조치 승인/실행 등 주요 작업이 기록되면 여기에 표시됩니다."
              icon={ScrollText}
            />
          }
        />
      )}
    </div>
  );
}
