"use client";

/**
 * 로그인 상태 훅. localStorage(auth-storage)를 외부 스토어로 다루기 위해
 * useSyncExternalStore를 쓴다 — effect 안에서 동기 setState를 하지 않고,
 * 여러 컴포넌트(FilterBar·UserMenu·AuthGate)가 항상 같은 스냅샷을 본다.
 * 401 응답(onUnauthorized) 수신 시 자동으로 로그아웃 처리한다.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  clearAuthToken,
  clearAuthUser,
  getAuthToken,
  getAuthUser,
  onUnauthorized,
  subscribeAuthChange,
  type StoredAuthUser,
} from "@/lib/auth-storage";

function getServerTokenSnapshot(): null {
  return null;
}

function noopSubscribe(): () => void {
  return () => {};
}

/** SSR에서는 항상 false — 클라이언트에서 하이드레이션이 끝난 뒤에만 true로 재동기화된다. */
function getIsHydratedSnapshot(): boolean {
  return true;
}
function getServerIsHydratedSnapshot(): boolean {
  return false;
}

interface UseAuthResult {
  user: StoredAuthUser | null;
  /** localStorage 판독이 아직 서버 스냅샷과 동일하게 취급되는 구간(SSR/최초 프리렌더)인지 여부. */
  isHydrated: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  logout: () => void;
}

export function useAuth(): UseAuthResult {
  const router = useRouter();
  const token = useSyncExternalStore(subscribeAuthChange, getAuthToken, getServerTokenSnapshot);
  const user = useSyncExternalStore(subscribeAuthChange, getAuthUser, getServerTokenSnapshot);
  const isHydrated = useSyncExternalStore(noopSubscribe, getIsHydratedSnapshot, getServerIsHydratedSnapshot);

  useEffect(() => onUnauthorized(() => router.replace("/login")), [router]);

  const logout = useCallback(() => {
    clearAuthToken();
    clearAuthUser();
    router.replace("/login");
  }, [router]);

  return {
    user,
    isHydrated,
    isAuthenticated: isHydrated && token !== null,
    isAdmin: user?.role === "SYSTEM_ADMIN",
    logout,
  };
}
