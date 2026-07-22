"use client";

/**
 * L5 자동조치 추천→승인→실행 상태머신 UI — 헌법 #4 "AI 추천, 사람 결정" 쇼케이스.
 * remediation_status(NONE/RECOMMENDED/APPROVED/EXECUTED)에 따라 다음 단계 버튼만 노출한다.
 * 승인/실행은 운영자(TENANT_OPERATOR)·관리자(SYSTEM_ADMIN)만 가능 — 뷰어는 버튼 대신 안내 문구를 본다.
 * 실행 결과는 항상 [시뮬레이션]임을 명시한다(실제 인프라 변경 아님, backend/incident_service.py 참고).
 */
import { useState } from "react";
import { CheckCircle2, PlayCircle, Sparkles, UserCheck } from "lucide-react";
import { approveRemediation, executeRemediation, recommendRemediation } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { Incident } from "@/lib/types";
import { canOperate, remediationStatusLabel } from "./utils";
import { InlineError } from "./InlineError";

interface RemediationPanelProps {
  incident: Incident;
  /** 추천/승인/실행 이후 상세·타임라인을 재조회하기 위한 콜백 */
  onChanged: () => void;
}

const primaryBtn =
  "inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-input)] bg-[var(--brand)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function RemediationPanel({ incident, onChanged }: RemediationPanelProps) {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = canOperate(user?.role);

  async function run(action: () => Promise<Incident>) {
    setPending(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold" style={{ font: "var(--text-h2)" }}>
          L5 자동조치 (추천 → 승인 → 실행)
        </h2>
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
          {remediationStatusLabel(incident.remediation_status)}
        </span>
      </div>

      {incident.remediation_status === "NONE" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--muted)]">
            AI가 타임라인·메트릭을 분석해 권장 조치를 도출합니다. 이 단계에서는 아무 것도 실행되지 않습니다.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => recommendRemediation(incident.id))}
            className={primaryBtn}
          >
            <Sparkles size={14} aria-hidden />
            {pending ? "도출 중..." : "AI 권장 조치 도출"}
          </button>
        </div>
      )}

      {incident.remediation_status === "RECOMMENDED" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px]">
            <span className="text-[var(--muted)]">권장 조치: </span>
            {incident.remediation_action || "-"}
          </p>
          {allowed ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => approveRemediation(incident.id))}
              className={primaryBtn}
            >
              <UserCheck size={14} aria-hidden />
              {pending ? "승인 중..." : "승인"}
            </button>
          ) : (
            <p className="text-[12px] text-[var(--muted)]">승인 권한이 없습니다 (운영자/관리자 전용).</p>
          )}
        </div>
      )}

      {incident.remediation_status === "APPROVED" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px]">
            <span className="text-[var(--muted)]">권장 조치: </span>
            {incident.remediation_action || "-"}
          </p>
          <p className="text-[12px] text-[var(--muted)]">승인자: {incident.remediation_approved_by || "-"}</p>
          {allowed ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => executeRemediation(incident.id))}
              className={primaryBtn}
            >
              <PlayCircle size={14} aria-hidden />
              {pending ? "실행 중..." : "실행 (시뮬레이션)"}
            </button>
          ) : (
            <p className="text-[12px] text-[var(--muted)]">실행 권한이 없습니다 (운영자/관리자 전용).</p>
          )}
        </div>
      )}

      {incident.remediation_status === "EXECUTED" && (
        <div className="flex items-center gap-2 text-[13px] text-[var(--ok)]">
          <CheckCircle2 size={16} aria-hidden />
          [시뮬레이션] 조치가 완료되었습니다 (실제 인프라 변경 아님). 승인자: {incident.remediation_approved_by || "-"}
        </div>
      )}

      {error && <InlineError message={error} />}
    </section>
  );
}
