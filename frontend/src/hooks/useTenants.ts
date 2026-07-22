"use client";

/**
 * 테넌트 목록(GET /tenants) 훅 — SYSTEM_ADMIN 전용 엔드포인트이므로
 * enabled=false(비관리자)일 때는 호출 자체를 스킵해 불필요한 403을 만들지 않는다.
 */
import { useEffect, useState } from "react";
import { getTenants } from "@/lib/api";
import type { Tenant } from "@/lib/types";

interface UseTenantsResult {
  tenants: Tenant[];
  isLoading: boolean;
  error: string | null;
}

export function useTenants(enabled: boolean): UseTenantsResult {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  // true로 시작한다 — enabled=true가 되는 순간부터 fetch가 끝날 때까지는 로딩 중이 맞고,
  // effect 본문에서 동기적으로 setIsLoading(true)를 호출하지 않기 위함(react-hooks/set-state-in-effect).
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 비활성 상태(비관리자)일 때는 아무 것도 하지 않는다 — 반환값에서 enabled로 걸러낸다.
    if (!enabled) return;

    let cancelled = false;

    getTenants()
      .then((data) => {
        if (!cancelled) {
          setTenants(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "테넌트 목록 조회에 실패했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    tenants: enabled ? tenants : [],
    isLoading: enabled && isLoading,
    error: enabled ? error : null,
  };
}
