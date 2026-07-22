"use client";

/**
 * AI 근본원인 분석(RCA) 패널 — POST /incidents/{id}/analyze를 사용자 액션으로 트리거한다.
 * engine 필드는 백엔드가 실제 사용한 방식을 그대로 담아 보낸다(LLMService.generate_incident_rca).
 * "규칙 기반 분석 (LLM 미연결)"이면 그대로 정직하게 표기하고 폴백임을 부연한다 — 가짜로 실 LLM인 척하지 않는다.
 */
import { useState } from "react";
import { Wand2 } from "lucide-react";
import { analyzeIncident } from "@/lib/api";
import { InlineError } from "./InlineError";

interface RcaPanelProps {
  incidentId: number;
}

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-[var(--radius-input)] border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-[var(--bg-2)] disabled:cursor-not-allowed disabled:opacity-50";

export function RcaPanel({ incidentId }: RcaPanelProps) {
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const data = await analyzeIncident(incidentId);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  const engine = result?.engine ?? "";
  const isRuleBased = engine.startsWith("규칙 기반");

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold" style={{ font: "var(--text-h2)" }}>
          AI 근본원인 분석 (RCA)
        </h2>
        <button type="button" disabled={pending} onClick={run} className={buttonClass}>
          <Wand2 size={14} aria-hidden />
          {pending ? "분석 중..." : result ? "다시 분석" : "분석 실행"}
        </button>
      </div>

      {result && (
        <div className="flex flex-col gap-2 text-[13px]">
          <p>
            <span className="text-[var(--muted)]">요약: </span>
            {result.summary || "-"}
          </p>
          <p>
            <span className="text-[var(--muted)]">추정 원인: </span>
            {result.probable_cause || "-"}
          </p>
          <p className="whitespace-pre-wrap">
            <span className="text-[var(--muted)]">권장 런북: </span>
            {result.recommended_runbook || "-"}
          </p>
          <p className="text-[11px] text-[var(--muted)]">
            분석 엔진: {engine || "-"}
            {isRuleBased && " — LLM 미연결로 규칙 기반 폴백 결과입니다."}
          </p>
        </div>
      )}

      {error && <InlineError message={error} />}
    </section>
  );
}
