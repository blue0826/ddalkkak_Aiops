"use client";

/**
 * 상단 크리티컬 알림 바 — 관제 화면 최상단. 심각(CRITICAL)·미해결 인시던트가 있으면
 * 붉게 강조된 카드로 즉시 노출하고, 클릭하면 해당 인시던트 상세로 이동한다. 통합 뷰에서는
 * 고객사명도 함께 표시한다. 없으면 정상(녹색) 슬림 바를 보여 5초 규칙을 보강한다.
 */
import { AlertOctagon, ChevronRight, ShieldCheck } from "lucide-react";
import type { Incident } from "@/lib/types";
import { severityLabel } from "./dashboardUtils";

interface CriticalAlertsBarProps {
  incidents: Incident[] | null;
  onRowClick: (incident: Incident) => void;
  /** 통합 뷰에서 tenant_id → 고객사명 변환 */
  tenantNameFor?: (tenantId: string) => string;
}

const CRITICAL = new Set(["CRITICAL", "CRIT"]);

export function CriticalAlertsBar({ incidents, onRowClick, tenantNameFor }: CriticalAlertsBarProps) {
  if (!incidents) return null;

  const open = incidents
    .filter((i) => i.status === "OPEN")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const hasCritical = open.some((i) => CRITICAL.has((i.severity || "").toUpperCase()));

  if (open.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-[var(--radius-card)] border px-4 py-2.5 text-[13px]"
        style={{ borderColor: "var(--ok-border)", backgroundColor: "var(--ok-bg)", color: "var(--ok)" }}
      >
        <ShieldCheck size={16} aria-hidden />
        <span className="font-semibold">모든 시스템 정상 — 미해결 인시던트가 없습니다.</span>
      </div>
    );
  }

  // 심각 인시던트가 하나라도 있으면 빨강, 아니면(경고만) 주황 톤.
  const toneColor = hasCritical ? "var(--crit)" : "var(--warn)";
  const toneBorder = hasCritical ? "var(--crit-border)" : "var(--warn-border)";
  const toneBg = hasCritical ? "var(--crit-bg)" : "var(--warn-bg)";
  const titleText = hasCritical ? "긴급 대응 필요" : "활성 인시던트 · 주의";
  // 심각 우선 정렬.
  const sorted = [...open].sort((a, b) => {
    const ac = CRITICAL.has((a.severity || "").toUpperCase()) ? 0 : 1;
    const bc = CRITICAL.has((b.severity || "").toUpperCase()) ? 0 : 1;
    return ac - bc;
  });

  return (
    <section
      className="live-glow overflow-hidden rounded-[var(--radius-card)] border"
      style={{ borderColor: toneBorder, backgroundColor: toneBg, ["--glow-color" as string]: toneColor }}
    >
      <header className="flex items-center gap-2 px-4 py-2.5" style={{ color: toneColor }}>
        <AlertOctagon size={17} className="live-pulse" aria-hidden />
        <span className="text-[13px] font-bold uppercase tracking-wide">{titleText}</span>
        <span className="num rounded-[var(--radius-badge)] px-1.5 py-0.5 text-[12px] font-bold" style={{ backgroundColor: toneColor, color: "#fff" }}>
          {open.length}
        </span>
      </header>

      <ul className="divide-y" style={{ borderColor: toneBorder }}>
        {sorted.slice(0, 4).map((inc) => (
          <li key={inc.id}>
            <button
              type="button"
              onClick={() => onRowClick(inc)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] transition-colors hover:bg-[color-mix(in_srgb,var(--crit)_10%,transparent)]"
            >
              <span
                className="shrink-0 rounded-[var(--radius-badge)] px-1.5 py-0.5 text-[10px] font-bold uppercase"
                style={{
                  backgroundColor: CRITICAL.has((inc.severity || "").toUpperCase()) ? "var(--crit)" : "var(--warn)",
                  color: "#fff",
                }}
              >
                {severityLabel(inc.severity)}
              </span>
              {tenantNameFor && (
                <span className="shrink-0 truncate text-[12px] text-[var(--muted)]" style={{ maxWidth: 120 }}>
                  {tenantNameFor(inc.tenant_id)}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate font-medium text-[var(--foreground)]">{inc.title}</span>
              <ChevronRight size={15} className="shrink-0 text-[var(--muted)]" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
