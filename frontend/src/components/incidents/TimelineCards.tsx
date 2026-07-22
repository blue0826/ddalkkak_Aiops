"use client";

/**
 * AI 분석 타임라인 카드 — GET /aiops/incidents/{id}/timeline-cards.
 * meta의 z_score/baseline_range 등은 백엔드가 근거를 산출하지 못하면 "미산출"/"해당 없음" 문자열을
 * 그대로 내려보낸다(backend/app/services/incident_service.py get_timeline_cards) — 가짜 상수로 대체하지 않고
 * meta 값을 있는 그대로 렌더링한다.
 */
import { CheckCircle2, GitMerge, Search, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { IncidentTimelineCard } from "@/lib/types";
import { severityLabel, severityTone } from "./utils";

const EVENT_ICON: Record<string, LucideIcon> = {
  TRIGGERED: Zap,
  ANOMALY_DETECT: Search,
  CORRELATION: GitMerge,
  RECOMMENDATION: Sparkles,
};

function renderMetaValue(value: unknown): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "해당 없음";
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function fmtTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface TimelineCardsProps {
  cards: IncidentTimelineCard[];
}

export function TimelineCards({ cards }: TimelineCardsProps) {
  if (cards.length === 0) {
    return <p className="text-[13px] text-[var(--muted)]">분석 카드가 아직 없습니다.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {cards.map((card, index) => {
        const Icon = EVENT_ICON[card.event_type] ?? CheckCircle2;
        const metaEntries = Object.entries(card.meta);
        return (
          <li
            key={`${card.event_type}-${index}`}
            className="flex gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-3"
          >
            <Icon size={16} className="mt-0.5 shrink-0 text-[var(--muted)]" strokeWidth={1.75} aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{card.title}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge status={severityTone(card.severity)} label={severityLabel(card.severity)} />
                  <span className="text-[11px] text-[var(--muted)]">{fmtTimestamp(card.timestamp)}</span>
                </div>
              </div>
              <p className="text-[13px] text-[var(--muted)]">{card.description}</p>
              {metaEntries.length > 0 && (
                <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                  {metaEntries.map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="text-[var(--muted)]">{key}</dt>
                      <dd className="truncate">{renderMetaValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
