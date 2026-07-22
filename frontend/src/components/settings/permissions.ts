"use client";

/**
 * 설정 화면 쓰기 액션(자격증명 등록) 권한 게이트.
 * 백엔드 RoleChecker(["SYSTEM_ADMIN", "TENANT_OPERATOR"])와 동일한 기준.
 * (automation/permissions.ts와 로직이 동일하지만, 이 화면 소유 범위(components/settings/**)
 * 밖의 공유 hooks/*를 새로 만들지 않기 위해 폴더별로 각자 소유한다.)
 */
import { useAuth } from "@/hooks/useAuth";

const ACTION_ROLES = new Set(["SYSTEM_ADMIN", "TENANT_OPERATOR"]);

const ROLE_LABEL: Record<string, string> = {
  SYSTEM_ADMIN: "시스템 관리자",
  TENANT_OPERATOR: "테넌트 운영자",
  TENANT_VIEWER: "뷰어",
};

export function useCanAct(): { canAct: boolean; roleLabel: string } {
  const { user } = useAuth();
  const role = user?.role ?? "";
  return {
    canAct: ACTION_ROLES.has(role),
    roleLabel: ROLE_LABEL[role] ?? (role || "알 수 없음"),
  };
}
