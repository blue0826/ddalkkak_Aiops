/**
 * 알림 화면 표시 헬퍼 — 순수 함수만 둔다(컴포넌트 아님).
 */
const OPERATOR_LABEL: Record<string, string> = {
  gt: "초과 (>)",
  lt: "미만 (<)",
  eq: "같음 (=)",
};

export function operatorLabel(operator: string): string {
  return OPERATOR_LABEL[operator] ?? operator;
}

/** 운영자(TENANT_OPERATOR) 이상만 알람 규칙 생성/삭제 권한을 가진다 (백엔드 RoleChecker와 동일 기준). */
export function canManageAlerts(role: string | undefined): boolean {
  return role === "SYSTEM_ADMIN" || role === "TENANT_OPERATOR";
}
