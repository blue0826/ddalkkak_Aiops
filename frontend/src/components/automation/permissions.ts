"use client";

/**
 * L2~L5 운영 액션 권한 게이트.
 * 백엔드 RoleChecker(["SYSTEM_ADMIN", "TENANT_OPERATOR"])와 동일한 기준을 프론트에서도 적용한다 —
 * TENANT_VIEWER는 읽기만 가능하고, 탐지 실행/네트워크 우회/SOAR 차단 같은 상태변경 액션은 막는다.
 * (서버도 동일 RoleChecker로 재검증하므로 이 게이트는 UX 방어선이지 유일한 방어선이 아니다.)
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
