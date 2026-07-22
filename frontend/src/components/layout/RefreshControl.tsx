"use client";

/**
 * 전역 실시간 갱신 제어 — 필터바에 배치. 관제 월 디스플레이의 "살아있음" 신호.
 * ● LIVE(펄스) + 갱신 주기 선택(5/10/30초·일시정지) + 지금 새로고침.
 */
import { RotateCw, Sparkles } from "lucide-react";
import { REFRESH_OPTIONS, useRefreshControl } from "@/hooks/useRefreshInterval";
import { setMotionEnabled, useMotionEnabled, useMotionInit } from "@/hooks/useMotion";

export function RefreshControl() {
  const { intervalMs, setIntervalMs, refreshNow } = useRefreshControl();
  useMotionInit();
  const motionOn = useMotionEnabled();
  const paused = intervalMs === 0;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className="flex items-center gap-1.5 rounded-[var(--radius-badge)] border px-2 py-1 text-[11px] font-medium"
        style={{
          borderColor: paused ? "var(--warn-border)" : "var(--ok-border)",
          color: paused ? "var(--warn)" : "var(--ok)",
          backgroundColor: paused ? "var(--warn-bg)" : "var(--ok-bg)",
        }}
        title={paused ? "자동 갱신이 멈춰 있습니다" : `${intervalMs / 1000}초마다 자동 갱신 중`}
      >
        <span
          className={paused ? "" : "live-pulse"}
          style={{
            display: "inline-block",
            height: 7,
            width: 7,
            borderRadius: "9999px",
            backgroundColor: "currentColor",
          }}
          aria-hidden
        />
        {paused ? "일시정지" : "LIVE"}
      </span>

      <label className="sr-only" htmlFor="refresh-interval">
        갱신 주기
      </label>
      <select
        id="refresh-interval"
        value={intervalMs}
        onChange={(event) => setIntervalMs(Number(event.target.value))}
        title="자동 갱신 주기"
        className="h-8 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-2 text-[12px] text-[var(--foreground)]"
      >
        {REFRESH_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={refreshNow}
        title="지금 새로고침"
        aria-label="지금 새로고침"
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-input)] border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--bg-2)]"
      >
        <RotateCw size={14} aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => setMotionEnabled(!motionOn)}
        title={motionOn ? "실시간 효과 끄기(흐름·글로우 등)" : "실시간 효과 켜기"}
        aria-label="실시간 효과 토글"
        aria-pressed={motionOn}
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-input)] border transition-colors"
        style={{
          borderColor: motionOn ? "var(--brand)" : "var(--border)",
          color: motionOn ? "var(--brand)" : "var(--muted)",
        }}
      >
        <Sparkles size={14} aria-hidden />
      </button>
    </div>
  );
}
