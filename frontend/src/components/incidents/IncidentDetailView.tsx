"use client";

/**
 * 인시던트 상세 — GET /incidents/{id} + GET /aiops/incidents/{id}/timeline-cards를 조합한다.
 * L5 액션(추천/승인/실행) 이후에는 두 리소스를 모두 재조회해 상태·타임라인을 최신화한다.
 */
import { useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { getIncident, getIncidentTimelineCards } from "@/lib/api";
import { useApiResource } from "@/hooks/useApiResource";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { RemediationPanel } from "./RemediationPanel";
import { RcaPanel } from "./RcaPanel";
import { TimelineCards } from "./TimelineCards";
import { IncidentTimelineLog } from "./IncidentTimelineLog";
import { incidentStatusLabel, severityLabel, severityTone } from "./utils";
import { useMinutesAgo } from "./useMinutesAgo";

interface IncidentDetailViewProps {
  incidentId: number;
  onBack: () => void;
}

function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return "-";
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

export function IncidentDetailView({ incidentId, onBack }: IncidentDetailViewProps) {
  const detail = useApiResource(() => getIncident(incidentId), [incidentId]);
  const timelineCards = useApiResource(() => getIncidentTimelineCards(incidentId), [incidentId]);
  const minutesAgo = useMinutesAgo(detail.lastUpdated);

  const refetchAll = useCallback(() => {
    detail.refetch();
    timelineCards.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  const backLink = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex w-fit items-center gap-1.5 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
    >
      <ArrowLeft size={14} aria-hidden />
      인시던트 목록으로
    </button>
  );

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <Skeleton height={92} />
        <Skeleton height={120} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <ErrorState
          cause={detail.error ? `인시던트를 불러오지 못했습니다: ${detail.error.message}` : "인시던트를 찾을 수 없습니다."}
          remedy="ID가 올바른지 확인하거나 목록에서 다시 선택하십시오."
          onRetry={detail.refetch}
        />
      </div>
    );
  }

  const { incident, timeline } = detail.data;

  return (
    <div className="flex flex-col gap-4">
      {backLink}

      <header className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold" style={{ font: "var(--text-h1)" }}>
            {incident.title}
          </h2>
          <StatusBadge status={severityTone(incident.severity)} label={severityLabel(incident.severity)} />
        </div>
        {incident.description && <p className="text-[13px] text-[var(--muted)]">{incident.description}</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[var(--muted)]">
          <span>상태: {incidentStatusLabel(incident.status)}</span>
          <span>생성: {fmtTimestamp(incident.created_at)}</span>
          <span>해결: {fmtTimestamp(incident.resolved_at)}</span>
          <span>담당자: {incident.assigned_to || "-"}</span>
        </div>
        {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
      </header>

      <RcaPanel incidentId={incident.id} />

      <RemediationPanel incident={incident} onChanged={refetchAll} />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold" style={{ font: "var(--text-h2)" }}>
          AI 분석 타임라인
        </h2>
        {timelineCards.isLoading ? (
          <Skeleton height={160} />
        ) : timelineCards.error ? (
          <ErrorState
            cause={`분석 타임라인을 불러오지 못했습니다: ${timelineCards.error.message}`}
            remedy="새로고침을 시도하십시오."
            onRetry={timelineCards.refetch}
          />
        ) : (
          <TimelineCards cards={timelineCards.data ?? []} />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold" style={{ font: "var(--text-h2)" }}>
          이벤트 로그
        </h2>
        <IncidentTimelineLog entries={timeline} />
      </section>
    </div>
  );
}
