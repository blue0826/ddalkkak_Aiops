"use client";

/**
 * 로그 테이블(§7.3) — 시각/레벨/노드/메시지/프로바이더 컬럼.
 * 각 로그 항목의 data_source는 상단(페이지 헤더)에 전체 출처로 요약 표시하므로
 * 행마다 반복 배지를 두지 않는다(§5.3 카드/배지 남발 금지).
 */
import { DataTable, TruncateCell, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProviderBadge } from "@/components/ui/ProviderBadge";
import type { LogEntry, Provider } from "@/lib/types";
import { LogLevelBadge } from "./LogLevelBadge";

/** DataTable getRowKey용 안정적인 합성 키 — LogEntry 자체에는 고유 id가 없다. */
export interface LogRow extends LogEntry {
  _rowId: string;
}

function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

interface LogsTableProps {
  rows: LogRow[];
  providers: Provider[];
  hasActiveFilter: boolean;
}

export function LogsTable({ rows, providers, hasActiveFilter }: LogsTableProps) {
  const columns: DataTableColumn<LogRow>[] = [
    {
      key: "timestamp",
      header: "시각",
      width: "150px",
      render: (row) => <span className="num">{formatLogTime(row.timestamp)}</span>,
    },
    {
      key: "level",
      header: "레벨",
      width: "90px",
      render: (row) => <LogLevelBadge level={row.level} />,
    },
    {
      key: "node",
      header: "노드",
      width: "200px",
      render: (row) => <TruncateCell text={row.node_label || row.node_id} maxWidth={200} />,
    },
    {
      key: "message",
      header: "메시지",
      render: (row) => <TruncateCell text={row.message} maxWidth={560} />,
    },
    {
      key: "provider",
      header: "프로바이더",
      width: "110px",
      render: (row) => {
        const provider = providers.find((p) => p.id === row.provider);
        return provider ? (
          <ProviderBadge provider={provider} />
        ) : (
          <span className="text-[11px] text-[var(--muted)]">{row.provider}</span>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row._rowId}
      emptyState={
        <EmptyState
          variant={hasActiveFilter ? "filtered" : "onboarding"}
          title={hasActiveFilter ? "조건에 맞는 로그가 없습니다" : "표시할 로그가 아직 없습니다"}
          description={
            hasActiveFilter
              ? "레벨 필터를 초기화하면 더 많은 로그를 볼 수 있습니다."
              : "선택한 테넌트·프로바이더 범위에서 수집된 로그가 없습니다."
          }
        />
      }
    />
  );
}
