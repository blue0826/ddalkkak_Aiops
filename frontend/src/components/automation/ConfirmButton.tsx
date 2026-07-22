"use client";

/**
 * 확인 후 실행 버튼 — 상태변경 액션 공통 패턴(§8: alert()/confirm() 네이티브 다이얼로그 금지).
 * 클릭하면 인라인 확인 UI(설명 + 확인/취소)로 전환되고, 확인을 눌러야 onConfirm이 실행된다.
 * disabled일 때는 이유를 title 툴팁 + 보조 텍스트로 함께 보여준다(색만으로 상태 표현 금지, §4.3).
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  /** 확인 단계에서 보여줄 설명(예: "192.0.2.1 을 차단합니다.") */
  description?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  disabledReason?: string;
  /** 실패 시 호출부가 자체 에러 상태로 표시한다 — 이 컴포넌트는 확인 UI를 닫기만 한다. */
  onConfirm: () => Promise<void> | void;
}

export function ConfirmButton({
  label,
  confirmLabel = "확인",
  description,
  tone = "default",
  disabled = false,
  disabledReason,
  onConfirm,
}: ConfirmButtonProps) {
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
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {description && <span className="text-[var(--muted)]">{description}</span>}
        <button
          type="button"
          disabled={isRunning}
          onClick={handleConfirm}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[var(--radius-input)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50",
            tone === "danger" ? "bg-[var(--crit)]" : "bg-[var(--brand)]"
          )}
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
        className={cn(
          "rounded-[var(--radius-input)] border px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-[var(--bg-2)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
          tone === "danger" ? "border-[var(--crit)]/40 text-[var(--crit)]" : "border-[var(--border)] text-[var(--foreground)]"
        )}
      >
        {label}
      </button>
      {disabled && disabledReason && <span className="text-[11px] text-[var(--muted)]">{disabledReason}</span>}
    </span>
  );
}
