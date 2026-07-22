"use client";

/**
 * 전역 실시간 갱신 컨텍스트 — 관제 월 디스플레이용.
 * 사용자가 갱신 주기(5/10/30초·일시정지)를 조절하고, 그 값이 모든 화면의
 * useApiResource 폴링에 반영된다. 수동 "지금 새로고침"은 refreshNonce를 올려
 * 모든 리소스를 즉시 재조회시킨다.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export const REFRESH_OPTIONS = [
  { value: 5000, label: "5초" },
  { value: 10000, label: "10초" },
  { value: 30000, label: "30초" },
  { value: 0, label: "일시정지" },
] as const;

export const DEFAULT_REFRESH_MS = 5000;
const STORAGE_KEY = "aiops.refreshIntervalMs";

interface RefreshContextValue {
  /** 0이면 자동 폴링 중지(일시정지) */
  intervalMs: number;
  setIntervalMs: (value: number) => void;
  /** 수동 새로고침 카운터 — 값이 바뀌면 구독 중인 리소스가 즉시 재조회한다 */
  refreshNonce: number;
  refreshNow: () => void;
}

const RefreshContext = createContext<RefreshContextValue>({
  intervalMs: DEFAULT_REFRESH_MS,
  setIntervalMs: () => {},
  refreshNonce: 0,
  refreshNow: () => {},
});

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [intervalMs, setIntervalMsState] = useState<number>(DEFAULT_REFRESH_MS);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  // 저장된 사용자 설정 복원(로컬스토리지는 클라이언트에만 존재하므로 마운트 후 읽는다).
  // setState는 타이머 콜백으로 지연해 effect 본문 동기 setState 규칙을 피하고
  // 하이드레이션 불일치도 방지한다.
  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return;
    const parsed = Number(raw);
    if (REFRESH_OPTIONS.some((o) => o.value === parsed) && parsed !== DEFAULT_REFRESH_MS) {
      const t = setTimeout(() => setIntervalMsState(parsed), 0);
      return () => clearTimeout(t);
    }
  }, []);

  const setIntervalMs = useCallback((value: number) => {
    setIntervalMsState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* 저장 실패는 무시(프라이빗 모드 등) */
    }
  }, []);

  const refreshNow = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  return (
    <RefreshContext.Provider value={{ intervalMs, setIntervalMs, refreshNonce, refreshNow }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefreshControl(): RefreshContextValue {
  return useContext(RefreshContext);
}
