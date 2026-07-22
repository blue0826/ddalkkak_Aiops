"use client";

/**
 * Rightsizing 추천 테이블(§7.3) — 노드/사유/조치/현재₩/목표₩/절감₩.
 * 인스턴스 타입(action 문자열)은 백엔드가 프로바이더별로 이미 정합화해 반환하므로(SCP Standard-*,
 * AWS t3.*) 그대로 노출한다 — 프론트에서 재가공하지 않는다.
 */
import { DataTable, TruncateCell, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtKRW } from "@/components/ui/format";
import type { RightsizingRecommendation } from "@/lib/types";

interface RightsizingTableProps {
  rows: RightsizingRecommendation[];
}

export function RightsizingTable({ rows }: RightsizingTableProps) {
  const columns: DataTableColumn<RightsizingRecommendation>[] = [
    {
      key: "node",
      header: "노드",
      width: "170px",
      render: (row) => <TruncateCell text={row.node_label || row.node_id} maxWidth={170} />,
    },
    {
      key: "reason",
      header: "사유",
      render: (row) => <TruncateCell text={row.reason} maxWidth={360} />,
    },
    {
      key: "action",
      header: "조치",
      width: "220px",
      render: (row) => <TruncateCell text={row.action} maxWidth={220} />,
    },
    {
      key: "current",
      header: "현재 비용",
      numeric: true,
      width: "120px",
      render: (row) => fmtKRW(row.current_monthly_cost),
    },
    {
      key: "target",
      header: "목표 비용",
      numeric: true,
      width: "120px",
      render: (row) => fmtKRW(row.target_monthly_cost),
    },
    {
      key: "savings",
      header: "예상 절감",
      numeric: true,
      width: "120px",
      render: (row) => <span className="text-[var(--ok)]">{fmtKRW(row.savings)}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.node_id}
      emptyState={
        <EmptyState
          variant="onboarding"
          title="추천할 Rightsizing 항목이 없습니다"
          description="현재 유휴 자원 기준으로 절감 가능한 리소스가 발견되지 않았습니다."
        />
      }
    />
  );
}
