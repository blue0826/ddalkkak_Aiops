"use client";

/**
 * 관제 로그 라이브 피드 — 대시보드 하단. 중요 로그(warning/error)를 터미널 tail처럼
 * 한 줄씩, 최신을 위에, 새 로그는 살짝 슬라이드-인 하며 표시한다(읽기 쉬운 세로 피드).
 * 전역 폴링으로 라이브 갱신. 각 행은 절대 줄바꿈하지 않고 넘치면 …로 자른다.
 */
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Radio } from "lucide-react";
import { getLogs } from "@/lib/api";
import { getParam } from "@/lib/url-state";
import { fmtAxisTime } from "@/components/ui/format";
import { useApiResource } from "@/hooks/useApiResource";
import type { LogEntry } from "@/lib/types";

const IMPORTANT = new Set(["warning", "error"]);
const MAX_ROWS = 40;

function levelColor(level: string): string {
  return level === "error" ? "var(--crit)" : "var(--warn)";
}

function LogRow({ log }: { log: LogEntry }) {
  const color = levelColor(log.level);
  return (
    <div className="log-row-in flex items-center gap-3 whitespace-nowrap px-3 py-1 font-mono text-[12px] leading-5">
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="num shrink-0 text-[var(--muted)]">{fmtAxisTime(log.timestamp)}</span>
      <span className="shrink-0 font-semibold" style={{ color }}>
        {log.level === "error" ? "ERR" : "WRN"}
      </span>
      <span className="shrink-0 font-medium text-[var(--foreground)]">{log.node_label}</span>
      <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{log.message}</span>
    </div>
  );
}

interface LogTickerProps {
  /**
   * true면 조회 자체를 건너뛴다 — 관리자인데 등록된 고객사가 0곳이라 tenant_id 없이 조회하면
   * 백엔드가 admin의 "system" 스코프로 처리해 지어낸 로그가 노출될 수 있는 경우에 쓴다.
   */
  disabled?: boolean;
}

export function LogTicker({ disabled = false }: LogTickerProps) {
  const searchParams = useSearchParams();
  const tenantId = getParam(searchParams, "tenant");
  const provider = getParam(searchParams, "provider");
  const [collapsed, setCollapsed] = useState(false);

  const { data } = useApiResource<LogEntry[]>(
    () => getLogs({ tenant_id: tenantId || undefined, provider: provider || undefined, limit: 120 }),
    [tenantId, provider],
    { enabled: !disabled }
  );

  // 중요 로그만, 최신순, 상한.
  const important = (data ?? [])
    .filter((l) => IMPORTANT.has(l.level))
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, MAX_ROWS);

  const errorCount = important.filter((l) => l.level === "error").length;
  const warnCount = important.length - errorCount;

  return (
    <section className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          <Radio size={13} className="text-[var(--ok)] live-pulse" aria-hidden />
          관제 로그 · 실시간
        </span>
        <span className="flex items-center gap-2 text-[11px]">
          <span style={{ color: "var(--crit)" }}>ERR {errorCount}</span>
          <span style={{ color: "var(--warn)" }}>WRN {warnCount}</span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "로그 펼치기" : "로그 접기"}
            aria-label={collapsed ? "로그 펼치기" : "로그 접기"}
            aria-expanded={!collapsed}
            className="ml-1 flex h-6 w-6 items-center justify-center rounded-[var(--radius-badge)] text-[var(--muted)] transition-colors hover:bg-[var(--bg-2)]"
          >
            {collapsed ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
        </span>
      </header>

      {collapsed ? null : important.length === 0 ? (
        <div className="px-3 py-4 text-[12px] text-[var(--muted)]">현재 주의가 필요한 중요 로그가 없습니다.</div>
      ) : (
        <div className="max-h-[184px] overflow-y-auto">
          {important.map((log) => (
            // key에 내용을 포함해, 새 로그만 새로 마운트되며 slide-in 애니메이션이 1회 재생된다.
            <LogRow key={`${log.timestamp}-${log.node_id}-${log.message}`} log={log} />
          ))}
        </div>
      )}
    </section>
  );
}
