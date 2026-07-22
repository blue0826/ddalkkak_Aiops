"use client";

/**
 * 고객사별 서비스 활성화 상태(GET /monitor/service-status) 훅 — useApiResource 재사용.
 * 라이선스/테넌트 목록과 같은 설정성 자원이라 폴링 없이 1회 조회 + 수동 refetch만 지원한다
 * (TenantManagementPanel.getTenants/getLicense와 동일 방침).
 * tenantId가 아직 확정되지 않은 구간(테넌트 목록 로딩 중 등)에는 조회를 미룬다.
 */
import { useApiResource, type ApiResourceState } from "./useApiResource";
import { getServiceStatus } from "@/lib/api";
import type { ServiceStatus } from "@/lib/types";

export function useServiceStatus(tenantId: string | undefined): ApiResourceState<ServiceStatus[]> {
  return useApiResource(() => getServiceStatus(tenantId as string), [tenantId], {
    enabled: Boolean(tenantId),
    intervalMs: false,
  });
}
