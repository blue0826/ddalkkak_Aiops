/**
 * 대시보드 행3 · 최근 인시던트 — §5.2 Row 3 / §7.3.
 * 행 클릭 시 /console/incidents?id=… 로 이동한다(현재 필터 쿼리스트링은 유지해 공유 가능하게 함, §7.4).
 *
 * 참고: 백엔드 IncidentResponse(backend/app/schemas/incident.py)에는 provider/node_id 필드가 없어
 * 이 표에는 ProviderBadge 대신 처리 상태 배지를 쓴다 — 인시던트에 프로바이더를 직접 노출하려면
 * 백엔드 스키마 확장이 선행되어야 한다(회귀 방지를 위해 없는 데이터를 지어내지 않음).
 */
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { DataTable, TruncateCell, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Incident } from "@/lib/types";
import { incidentStatusLabel, incidentStatusTone, severityLabel, severityToTone } from "./dashboardUtils";

interface RecentIncidentsTableProps {
  incidents: Incident[] | null;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onRowClick: (incident: Incident) => void;
  headerAction?: ReactNode;
  /** 지정 시(통합 뷰) "고객사" 열을 표시하고 tenant_id를 이 함수로 이름 변환한다. */
  tenantNameFor?: (tenantId: string) => string;
}

/** StaleIndicator용 fmtRelativeTime("N분 전 업데이트")는 "발생 시각" 의미와 어긋나 이 표 전용으로 따로 둔다. */
function occurredAgo(iso: string): string {
  const minutes = (Date.now() - new Date(iso).getTime()) / 60000;
  if (!Number.isFinite(minutes) || minutes < 1) return "방금";
  if (minutes < 60) return `${Math.round(minutes)}분 전`;
  return `${Math.round(minutes / 60)}시간 전`;
}

export function RecentIncidentsTable({
  incidents,
  isLoading,
  error,
  onRetry,
  onRowClick,
  headerAction,
  tenantNameFor,
}: RecentIncidentsTableProps) {
  const columns: DataTableColumn<Incident>[] = [
    {
      key: "severity",
      header: "심각도",
      width: "88px",
      render: (row) => <StatusBadge status={severityToTone(row.severity)} label={severityLabel(row.severity)} />,
    },
    // 통합 뷰: 어느 고객사의 인시던트인지 표시.
    ...(tenantNameFor
      ? [
          {
            key: "tenant",
            header: "고객사",
            width: "128px",
            render: (row: Incident) => (
              <TruncateCell text={tenantNameFor(row.tenant_id) ?? row.tenant_id} maxWidth={120} />
            ),
          } as DataTableColumn<Incident>,
        ]
      : []),
    {
      key: "title",
      header: "제목",
      render: (row) => <TruncateCell text={row.title} maxWidth={320} />,
    },
    {
      key: "status",
      header: "상태",
      width: "88px",
      render: (row) => <StatusBadge status={incidentStatusTone(row.status)} label={incidentStatusLabel(row.status)} />,
    },
    {
      key: "created_at",
      header: "발생",
      numeric: true,
      width: "96px",
      render: (row) => occurredAgo(row.created_at),
    },
  ];

  const recent = (incidents ?? [])
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return (
    <ChartContainer title="최근 인시던트" subtitle="최신 발생 순 8건" action={headerAction}>
      {isLoading ? (
        <Skeleton height={220} />
      ) : !incidents && error ? (
        <ErrorState cause="인시던트 목록 조회에 실패했습니다." remedy={error.message || "잠시 후 다시 시도하십시오."} onRetry={onRetry} />
      ) : (
        <DataTable
          columns={columns}
          rows={recent}
          getRowKey={(row) => row.id}
          onRowClick={onRowClick}
          emptyState={
            <EmptyState
              variant="onboarding"
              icon={AlertTriangle}
              title="인시던트 없음"
              description="현재 조회 범위에서 감지된 인시던트가 없습니다."
            />
          }
        />
      )}
    </ChartContainer>
  );
}
