/**
 * 인시던트 실시간 요약 — CEO 피드백("표로만 있는데 실시간 맞냐") 대응.
 * getIncidents() 폴링 결과를 그대로 집계해 심각도별·상태별 건수를 stat 칩으로 보여주고,
 * 전역 갱신 주기(useApiResource)를 그대로 따르므로 별도 폴링을 만들지 않는다.
 */
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Hourglass,
  ListChecks,
  Radar,
  Siren,
  type LucideIcon,
} from "lucide-react";
import type { Incident } from "@/lib/types";
import { GLOSSARY } from "@/lib/glossary";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/cn";
import { computeIncidentStats } from "./utils";
import { IncidentDistributionBar } from "./IncidentDistributionBar";

interface IncidentSummaryBarProps {
  incidents: Incident[];
  newCount: number;
}

type ChipTone = "crit" | "warn" | "ok" | "brand" | "neutral";

interface StatChip {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: ChipTone;
}

const TONE_CLASS: Record<ChipTone, string> = {
  crit: "border-[var(--crit-border)] bg-[var(--crit-bg)] text-[var(--crit)]",
  warn: "border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn)]",
  ok: "border-[var(--ok-border)] bg-[var(--ok-bg)] text-[var(--ok)]",
  brand: "border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]",
  neutral: "border-[var(--border)] bg-[var(--bg-1)] text-[var(--foreground)]",
};

export function IncidentSummaryBar({ incidents, newCount }: IncidentSummaryBarProps) {
  const stats = computeIncidentStats(incidents);

  const chips: StatChip[] = [
    { label: "전체", value: stats.total, icon: ListChecks, tone: "neutral" },
    { label: "활성", value: stats.active, icon: Radar, tone: "brand" },
    { label: "심각", value: stats.critical, icon: Siren, tone: "crit" },
    { label: "경고", value: stats.warning, icon: AlertTriangle, tone: "warn" },
    { label: "신규", value: stats.open, icon: CircleDot, tone: "neutral" },
    { label: "처리중", value: stats.investigating, icon: Hourglass, tone: "neutral" },
    { label: "해결", value: stats.resolved, icon: CheckCircle2, tone: "ok" },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            감지 기준
            <InfoTooltip label="감지 기준 설명">
              <span className="block">{GLOSSARY.detection_l1}</span>
              <span className="mt-1 block">{GLOSSARY.detection_l2}</span>
            </InfoTooltip>
          </span>
          <span className="inline-flex items-center gap-1">
            자동조치 흐름
            <InfoTooltip label="L5 자동조치 흐름 설명">{GLOSSARY.l5_flow}</InfoTooltip>
          </span>
          <span className="inline-flex items-center gap-1">
            데이터 출처
            <InfoTooltip label="데이터 출처 설명">{GLOSSARY.data_source_simulated}</InfoTooltip>
          </span>
        </div>

        {newCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-badge)] border border-[var(--brand)]/40 bg-[var(--brand)]/10 px-2 py-1 text-[11px] font-semibold text-[var(--brand)]">
            <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            <span className="num">{newCount}</span>개 신규
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <div
            key={chip.label}
            className={cn("flex items-center gap-2 rounded-[var(--radius-badge)] border px-2.5 py-1.5", TONE_CLASS[chip.tone])}
          >
            <chip.icon size={13} strokeWidth={1.75} aria-hidden />
            <span className="text-[11px] font-medium uppercase tracking-wide">{chip.label}</span>
            <span className="num text-[13px] font-semibold">{chip.value}</span>
          </div>
        ))}
      </div>

      <IncidentDistributionBar incidents={incidents} />
    </div>
  );
}
