"use client";

/** 현재 사용자 역할 + 읽기 전용 여부를 헤더에 표시한다. */
import { useCanAct } from "./permissions";

export function RoleBanner() {
  const { canAct, roleLabel } = useCanAct();
  return (
    <span className="text-[11px] text-[var(--muted)]">
      현재 역할: {roleLabel}
      {!canAct && " · 읽기 전용(액션은 운영자/관리자만 가능)"}
    </span>
  );
}
