"use client";

/**
 * 알림 화면 — 알람 규칙(§7.3 테이블 + 생성 폼)과 감사로그를 탭으로 전환한다.
 * 탭 상태는 URL(?tab=)에 반영해 링크 공유 시 동일 화면을 보게 한다.
 */
import { Bell } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getParam, withParam } from "@/lib/url-state";
import { GLOSSARY } from "@/lib/glossary";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { AlertRulesPanel } from "@/components/alerts/AlertRulesPanel";
import { AuditLogPanel } from "@/components/alerts/AuditLogPanel";

const TABS = [
  { value: "rules", label: "알람 규칙" },
  { value: "audit", label: "감사로그" },
] as const;

export default function AlertsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = getParam(searchParams, "tab", "rules");

  const setTab = (tab: string) => {
    router.replace(`${pathname}?${withParam(searchParams, "tab", tab)}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <Bell size={20} className="text-[var(--muted)]" strokeWidth={1.75} aria-hidden />
        <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
          알림
        </h1>
        <InfoTooltip label="AIOps 성숙도 단계 설명">{GLOSSARY.aiops_levels}</InfoTooltip>
      </div>

      <div role="tablist" className="flex w-fit gap-1 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setTab(tab.value)}
            className={
              activeTab === tab.value
                ? "rounded-[var(--radius-badge)] bg-[var(--brand)] px-3 py-1.5 text-[12px] font-semibold text-white"
                : "rounded-[var(--radius-badge)] px-3 py-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "audit" ? <AuditLogPanel /> : <AlertRulesPanel />}
    </div>
  );
}
