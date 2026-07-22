/**
 * L5 조치/RCA 액션 실패 시 쓰는 인라인 에러 배너 — alert() 금지, 원인을 그대로 보여준다.
 * 백엔드가 이미 원인+해결 방법을 담은 한국어 메시지를 detail로 내려주므로 그대로 표기한다
 * (예: 409 "승인 가능한 상태가 아닙니다 (현재 상태: RECOMMENDED). 먼저 AI 권장 조치 추천을 받아야 합니다.").
 */
export function InlineError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-input)] border border-[var(--crit)]/30 bg-[var(--crit)]/5 px-3 py-2 text-[12px] text-[var(--crit)]"
    >
      {message}
    </p>
  );
}
