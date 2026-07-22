"use client";

/**
 * 화면 공통 데이터 페칭 훅 — 로딩/에러/폴링/stale 상태를 표준화한다 (디자인 가이드 §8).
 *
 * - 최초 마운트 시 1회 로드 후 `intervalMs`마다 자동 갱신(기본 30초; §8 "30초면 충분하면 30초").
 * - `lastUpdated`로 StaleIndicator("N분 전 업데이트")를 구동한다.
 * - 갱신 실패는 직전 데이터를 유지하고 `error`만 갱신한다(패널 단위 장애 격리, §8 partial failure).
 * - `deps`가 바뀌면(테넌트·프로바이더 전환 등) 즉시 재로드한다.
 *
 * 사용 예:
 *   const { data, error, isLoading, lastUpdated, refetch } =
 *     useApiResource(() => getCosts({ tenant_id, provider }), [tenant_id, provider]);
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRefreshControl } from "./useRefreshInterval";

export interface ApiResourceState<T> {
  data: T | null;
  error: Error | null;
  /** 표시할 데이터가 아직 없는 최초 로딩 (스켈레톤 트리거) */
  isLoading: boolean;
  /** 데이터는 있으나 백그라운드 갱신 중 (미세 표시용) */
  isRefreshing: boolean;
  /** 마지막으로 성공한 시각 (stale 표시용). 성공 전 null */
  lastUpdated: Date | null;
  /** 수동 재조회 */
  refetch: () => void;
}

export interface UseApiResourceOptions {
  /**
   * 자동 폴링 주기(ms). 지정하지 않으면 전역 갱신 설정(RefreshProvider)을 따른다.
   * 0/false면 폴링 없이 1회만(예: 월간 리포트).
   */
  intervalMs?: number | false;
  /** false면 아직 조회하지 않는다(예: 필수 파라미터 미충족) */
  enabled?: boolean;
}

export function useApiResource<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  options: UseApiResourceOptions = {}
): ApiResourceState<T> {
  const { intervalMs, enabled = true } = options;
  // 화면이 명시하지 않으면 전역 실시간 주기를 따른다. 수동 새로고침(refreshNonce)은
  // 아래 effect deps에 포함되어 모든 리소스를 즉시 재조회시킨다.
  const { intervalMs: globalIntervalMs, refreshNonce } = useRefreshControl();
  const effectiveIntervalMs = intervalMs ?? globalIntervalMs;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 최신 fetcher를 ref로 잡아, deps만 폴링/재조회 트리거로 쓴다(fetcher 신원 변화로 인한 무한루프 방지).
  // ref 갱신은 render가 아닌 effect에서 수행한다(React 컴파일러 규칙 react-hooks/refs).
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // 마운트 여부 및 요청 세대(경쟁 조건에서 오래된 응답 폐기).
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  const load = useCallback(
    async (isBackground: boolean) => {
      if (!enabled) return;
      const generation = ++generationRef.current;
      if (isBackground) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        const result = await fetcherRef.current();
        if (!mountedRef.current || generation !== generationRef.current) return;
        setData(result);
        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        if (!mountedRef.current || generation !== generationRef.current) return;
        // 갱신 실패 시 직전 데이터는 유지하고 에러만 표시(§8 partial failure).
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (mountedRef.current && generation === generationRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    mountedRef.current = true;
    // enabled=false면 조회하지 않는다. isLoading 초기값이 이미 enabled를 반영한다.
    if (!enabled) {
      return () => {
        mountedRef.current = false;
      };
    }
    // 최초 로드도 콜백(타이머)에서 호출해 effect 본문의 동기 setState를 피한다
    // (React 컴파일러 규칙 react-hooks/set-state-in-effect). 0ms 지연은 체감되지 않는다.
    const kickoff = setTimeout(() => load(false), 0);
    const pollId =
      effectiveIntervalMs && effectiveIntervalMs > 0
        ? setInterval(() => load(true), effectiveIntervalMs)
        : null;
    return () => {
      mountedRef.current = false;
      clearTimeout(kickoff);
      if (pollId) clearInterval(pollId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, effectiveIntervalMs, refreshNonce, ...deps]);

  const refetch = useCallback(() => {
    load(true);
  }, [load]);

  return { data, error, isLoading, isRefreshing, lastUpdated, refetch };
}
