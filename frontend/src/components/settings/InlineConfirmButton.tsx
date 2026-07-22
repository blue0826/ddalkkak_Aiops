"use client";

/**
 * 파괴적 작업(고객사 삭제·자격증명 해제) 전용 인라인 2-Step 확인 버튼.
 * alert()/confirm() 네이티브 다이얼로그를 쓰지 않는다(§8) — 클릭하면 같은 자리에서
 * 설명(선택) + 확인/취소로 전환된다. components/automation/ConfirmButton과 동일한 패턴이지만,
 * 이 화면 소유 범위(components/settings/**) 밖의 공유 컴포넌트를 새로 만들지 않기 위해
 * 폴더별로 각자 소유한다(permissions.ts·useMinutesAgo.ts와 동일한 방침).
 * description을 생략하면 한 줄 안에서만 전환되어 DataTable의 고정 행높이(§7.3) 안에도 들어간다.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface InlineConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  /** 확인 단계에서 보여줄 설명. 표 셀처럼 좁은 공간에서는 생략해 한 줄을 유지한다. */
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** 실패 시 호출부가 자체 에러 상태로 표시한다 — 이 컴포넌트는 확인 UI를 닫기만 한다. */
  onConfirm: () => Promise<void> | void;
}

export function InlineConfirmButton({
  label,
  confirmLabel = "확인",
  description,
  disabled = false,
  disabledReason,
  onConfirm,
}: InlineConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  async function handleConfirm() {
    setIsRunning(true);
    try {
      await onConfirm();
    } catch {
      // no-op: 호출부가 자체 에러 상태로 인라인 표시한다.
    } finally {
      setIsRunning(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
        {description && <span className="text-[var(--muted)]">{description}</span>}
        <button
          type="button"
          disabled={isRunning}
          onClick={handleConfirm}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-input)] bg-[var(--crit)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {confirmLabel}
        </button>
        <button
          type="button"
          disabled={isRunning}
          onClick={() => setConfirming(false)}
          className="rounded-[var(--radius-input)] border border-[var(--border)] px-3 py-1.5 text-[12px] hover:bg-[var(--bg-2)]"
        >
          취소
        </button>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => setConfirming(true)}
        className="rounded-[var(--radius-input)] border border-[var(--crit)]/40 px-3 py-1.5 text-[12px] font-semibold text-[var(--crit)] transition-colors hover:bg-[var(--crit)]/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {label}
      </button>
      {disabled && disabledReason && <span className="text-[11px] text-[var(--muted)]">{disabledReason}</span>}
    </span>
  );
}
