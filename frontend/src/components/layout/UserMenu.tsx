"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const ROLE_LABEL: Record<string, string> = {
  SYSTEM_ADMIN: "시스템 관리자",
  TENANT_OPERATOR: "테넌트 운영자",
};

/** 상단 필터바 우측의 사용자 정보 + 로그아웃 버튼. 로그인 전에는 아무것도 렌더링하지 않는다. */
export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <UserIcon size={14} className="text-[var(--muted)]" aria-hidden />
        <div className="text-right leading-tight">
          <div className="text-[12px] font-medium">{user.email}</div>
          <div className="text-[11px] text-[var(--muted)]">{ROLE_LABEL[user.role] ?? user.role}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={logout}
        title="로그아웃"
        aria-label="로그아웃"
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-input)] border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--crit)]"
      >
        <LogOut size={14} aria-hidden />
      </button>
    </div>
  );
}
