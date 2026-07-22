"use client";

/**
 * "탐지 실행" 액션 — POST /aiops/detection/run. SYSTEM_ADMIN/TENANT_OPERATOR에게만 렌더링한다
 * (page.tsx에서 role 게이팅 후 조건부로 마운트). 성공/실패 메시지는 alert() 대신 인라인 aria-live로 표시한다.
 */
import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { runDetectionCycle } from "@/lib/api";
import { GLOSSARY } from "@/lib/glossary";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

interface DetectionRunButtonProps {
  /** 탐지 완료 후 인시던트 목록을 새로고침하기 위한 콜백 */
  onCompleted: () => void;
}

export function DetectionRunButton({ onCompleted }: DetectionRunButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleClick = async () => {
    setIsRunning(true);
    setMessage(null);
    setIsError(false);
    try {
      const result = await runDetectionCycle();
      setMessage(`탐지 완료 — ${result.scanned_nodes}개 노드 스캔, 신규 인시던트 ${result.incidents_created.length}건`);
      onCompleted();
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "탐지 실행에 실패했습니다.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <InfoTooltip label="탐지 실행 설명">{GLOSSARY.detection_run}</InfoTooltip>
      {message && (
        <span role="status" className={isError ? "text-[11px] text-[var(--crit)]" : "text-[11px] text-[var(--muted)]"}>
          {message}
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isRunning}
        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-3 text-[12px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--bg-2)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? (
          <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Play size={14} aria-hidden />
        )}
        탐지 실행
      </button>
    </div>
  );
}
