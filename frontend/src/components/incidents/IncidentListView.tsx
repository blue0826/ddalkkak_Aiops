"use client";

/**
 * 인시던트 목록 — 디자인 가이드 §7.3(테이블) + 실시간 요약/라이브 피드.
 * CEO 피드백("표로만 있는데 실시간 맞냐") 대응: 상단 요약 행·분포 바·신규 행 flash-in을 더했다.
 * 행 클릭 시 상세로 이동하는 기존 흐름은 그대로 유지한다.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { getIncidents } from "@/lib/api";
import { useApiResource } from "@/hooks/useApiResource";
import { useProviders } from "@/hooks/useProviders";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProviderBadge } from "@/components/ui/ProviderBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { cn } from "@/lib/cn";
import type { Incident } from "@/lib/types";
import {
  deriveProviderIdFromTitle,
  diffNewIncidentIds,
  incidentStatusLabel,
  severityLabel,
  severityTone,
  sortIncidentsByCreatedAtDesc,
} from "./utils";
import { useMinutesAgo } from "./useMinutesAgo";
import { IncidentSummaryBar } from "./IncidentSummaryBar";

interface IncidentListViewProps {
  onSelect: (id: number) => void;
}

/** 상단 N개만 우선 표시하고 "더보기"로 확장한다(§ 사용성 — 목록이 매우 길 수 있음). */
const PAGE_SIZE = 30;
/** flash-in CSS 애니메이션(1.4s)보다 살짝 길게 잡아 잔상 없이 정리한다. */
const FLASH_DURATION_MS = 1600;

function fmtTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 셀 콘텐츠 래퍼 — 새로 생긴 행이면 flash-in으로 한 번 강조한다.
 * DataTable(공유 컴포넌트)은 셀 render만 넘길 수 있어 tr에 직접 className을 줄 수 없으므로,
 * td의 padding(px-3)을 음수 마진으로 상쇄해 배경이 셀 전체 너비를 덮도록 한다.
 */
function FlashCell({ active, children }: { active: boolean; children: ReactNode }) {
  return <span className={cn("-mx-3 block px-3", active && "flash-in")}>{children}</span>;
}

export function IncidentListView({ onSelect }: IncidentListViewProps) {
  const { data, error, isLoading, lastUpdated, refetch } = useApiResource(() => getIncidents(), []);
  const { getProviderById } = useProviders();
  const minutesAgo = useMinutesAgo(lastUpdated);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [newIds, setNewIds] = useState<ReadonlySet<number>>(() => new Set());
  const prevIdsRef = useRef<Set<number> | null>(null);

  // 라이브 피드 — 직전 폴링 대비 새로 생긴 인시던트만 한 번 flash-in으로 강조한다.
  // 최초 로드(prevIdsRef.current === null)는 강조하지 않는다(목록 전체가 "새로" 뜬 것은 아니므로).
  useEffect(() => {
    if (!data) return;
    const addedIds = diffNewIncidentIds(data, prevIdsRef.current);
    prevIdsRef.current = new Set(data.map((incident) => incident.id));

    if (addedIds.length === 0) return;
    const showTimer = setTimeout(() => setNewIds(new Set(addedIds)), 0);
    const hideTimer = setTimeout(() => setNewIds(new Set()), FLASH_DURATION_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [data]);

  const incidents = useMemo(() => sortIncidentsByCreatedAtDesc(data ?? []), [data]);

  const columns = useMemo<DataTableColumn<Incident>[]>(
    () => [
      {
        key: "title",
        header: "제목",
        render: (row) => (
          <FlashCell active={newIds.has(row.id)}>
            <span className="block max-w-[420px] truncate">{row.title}</span>
          </FlashCell>
        ),
      },
      {
        key: "severity",
        header: "심각도",
        render: (row) => (
          <FlashCell active={newIds.has(row.id)}>
            <StatusBadge status={severityTone(row.severity)} label={severityLabel(row.severity)} />
          </FlashCell>
        ),
      },
      {
        key: "status",
        header: "상태",
        render: (row) => <FlashCell active={newIds.has(row.id)}>{incidentStatusLabel(row.status)}</FlashCell>,
      },
      {
        key: "created_at",
        header: "생성시각",
        numeric: true,
        render: (row) => <FlashCell active={newIds.has(row.id)}>{fmtTimestamp(row.created_at)}</FlashCell>,
      },
      {
        key: "provider",
        header: "프로바이더",
        render: (row) => {
          const providerId = deriveProviderIdFromTitle(row.title);
          const provider = providerId ? getProviderById(providerId) : undefined;
          return (
            <FlashCell active={newIds.has(row.id)}>
              {provider ? <ProviderBadge provider={provider} /> : <span className="text-[var(--muted)]">-</span>}
            </FlashCell>
          );
        },
      },
    ],
    [getProviderById, newIds]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} height={36} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        cause={`인시던트 목록을 불러오지 못했습니다: ${error.message}`}
        remedy="네트워크 상태를 확인한 뒤 다시 시도하십시오."
        onRetry={refetch}
      />
    );
  }

  const visibleIncidents = incidents.slice(0, visibleCount);
  const hasMore = incidents.length > visibleIncidents.length;

  return (
    <div className="flex flex-col gap-3">
      <IncidentSummaryBar incidents={incidents} newCount={newIds.size} />

      {minutesAgo !== null && (
        <div className="flex justify-end">
          <StaleIndicator minutesAgo={minutesAgo} />
        </div>
      )}

      <DataTable
        columns={columns}
        rows={visibleIncidents}
        getRowKey={(row) => row.id}
        onRowClick={(row) => onSelect(row.id)}
        emptyState={
          <EmptyState
            variant="onboarding"
            title="아직 등록된 인시던트가 없습니다"
            description="AIOps 탐지 사이클이 이상 징후를 발견하면 인시던트가 자동으로 생성됩니다."
            icon={AlertTriangle}
          />
        }
      />

      {incidents.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--muted)]">
          <span>
            전체 <span className="num">{incidents.length}</span>건 중 <span className="num">{visibleIncidents.length}</span>건 표시
          </span>
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="rounded-[var(--radius-input)] border border-[var(--border)] px-3 py-1.5 font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--bg-2)]"
            >
              더보기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
