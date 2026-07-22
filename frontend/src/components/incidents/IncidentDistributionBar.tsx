/**
 * 인시던트 심각도 구성비 — 한 줄 스택 바.
 * severityTone(ok/warn/crit) 기준으로 묶는다 — 의미색(§4.3)만 사용, 장식 목적 색상 추가 금지.
 */
import type { Incident } from "@/lib/types";
import { countBySeverityTone } from "./utils";

interface IncidentDistributionBarProps {
  incidents: Incident[];
}

const SEGMENTS: { key: "crit" | "warn" | "ok"; color: string; label: string }[] = [
  { key: "crit", color: "var(--crit)", label: "심각" },
  { key: "warn", color: "var(--warn)", label: "경고" },
  { key: "ok", color: "var(--ok)", label: "정상/정보" },
];

export function IncidentDistributionBar({ incidents }: IncidentDistributionBarProps) {
  const counts = countBySeverityTone(incidents);
  const total = incidents.length;

  if (total === 0) {
    return <div className="h-1.5 w-full rounded-full bg-[var(--bg-2)]" aria-hidden />;
  }

  const summary = SEGMENTS.map(({ key, label }) => `${label} ${counts[key]}건`).join(" · ");

  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)]"
      role="img"
      aria-label={`심각도 구성비 — ${summary}`}
      title={summary}
    >
      {SEGMENTS.map(({ key, color }) => {
        const pct = (counts[key] / total) * 100;
        if (pct <= 0) return null;
        return (
          <span
            key={key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}
