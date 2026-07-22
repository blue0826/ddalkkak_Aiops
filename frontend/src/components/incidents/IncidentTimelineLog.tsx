/**
 * 원본 이벤트 로그 — IncidentDetail.timeline (IncidentTimelineEntry[]).
 * 생성/상태변경/L5 추천·승인·실행 감사 메시지가 시간순으로 쌓인다(incident_service.py add_timeline).
 * 상호작용이 없는 순수 표시 컴포넌트라 서버 컴포넌트로 유지한다.
 */
import type { IncidentTimelineEntry } from "@/lib/types";

function fmtTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface IncidentTimelineLogProps {
  entries: IncidentTimelineEntry[];
}

export function IncidentTimelineLog({ entries }: IncidentTimelineLogProps) {
  if (entries.length === 0) {
    return <p className="text-[13px] text-[var(--muted)]">기록된 이벤트가 없습니다.</p>;
  }

  return (
    <ol className="flex flex-col">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-start gap-x-3 gap-y-0.5 border-t border-[var(--border)] py-2 first:border-t-0">
          <span className="shrink-0 text-[11px] text-[var(--muted)]">{fmtTimestamp(entry.created_at)}</span>
          <span className="shrink-0 text-[11px] font-medium text-[var(--muted)]">{entry.actor}</span>
          <span className="min-w-0 flex-1 text-[13px]">{entry.message}</span>
        </li>
      ))}
    </ol>
  );
}
