/**
 * 필터바(§7.4) 상태를 URL 쿼리스트링에 반영하기 위한 순수 헬퍼.
 * on-call 엔지니어가 링크를 그대로 공유해도 동일한 화면을 보게 하는 것이 목적이므로,
 * 상태는 항상 URL이 단일 진실 소스다 (컴포넌트 로컬 state에 이중 보관하지 않는다).
 */
import type { ReadonlyURLSearchParams } from "next/navigation";

export function getParam(
  searchParams: ReadonlyURLSearchParams,
  key: string,
  fallback = ""
): string {
  return searchParams.get(key) ?? fallback;
}

/** 활성 프로바이더 ID — URL의 provider 쿼리를 우선하고, 없으면 첫 번째 등록 프로바이더로 폴백한다. */
export function resolveActiveProviderId(
  searchParams: ReadonlyURLSearchParams,
  providers: { id: string }[]
): string {
  return searchParams.get("provider") || providers[0]?.id || "scp";
}

/** 현재 searchParams에 key=value를 병합(또는 제거)한 새 쿼리스트링을 만든다. */
export function withParam(searchParams: ReadonlyURLSearchParams, key: string, value: string): string {
  const params = new URLSearchParams(searchParams.toString());
  if (value) params.set(key, value);
  else params.delete(key);
  return params.toString();
}
