"use client";

/**
 * 상단 sticky 필터바(tenant/provider) URL 쿼리를 자동화 액션 스코프로 읽어온다.
 * FilterBar가 이미 URL을 단일 진실 소스로 쓰므로(§7.4) 이 훅도 같은 쿼리 키를 읽기만 하고
 * 별도 로컬 state로 이중 보관하지 않는다.
 */
import { useSearchParams } from "next/navigation";
import { getParam } from "@/lib/url-state";
import type { ScopeQuery } from "@/lib/api";

export function useAutomationScope(): ScopeQuery {
  const searchParams = useSearchParams();
  const tenant_id = getParam(searchParams, "tenant") || undefined;
  const provider = getParam(searchParams, "provider") || undefined;
  return { tenant_id, provider };
}
