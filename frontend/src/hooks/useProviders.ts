"use client";

/**
 * 프로바이더 레지스트리(GET /providers) 훅.
 * SCP/AWS의 명칭·용어·액센트 컬러·리전 메타데이터를 API에서 불러와
 * 프론트 전역에서 프로바이더별 렌더링에 사용한다. 하드코딩 금지 — 반드시 이 훅을 통해서만 참조한다.
 */
import { useCallback, useEffect, useState } from "react";
import { getProviders } from "@/lib/api";
import type { Provider, ProviderId } from "@/lib/types";

/**
 * API 응답이 도착하기 전 색상 깜빡임을 막기 위한 최소 폴백.
 * backend/app/core/providers.py PROVIDER_REGISTRY.accent_color와 항상 동일하게 유지할 것.
 * 라벨·리전 등 그 외 모든 값은 API 응답만을 신뢰원으로 한다.
 */
const ACCENT_COLOR_FALLBACK: Record<string, string> = {
  scp: "#1E4FD8",
  aws: "#FF9900",
};

interface UseProvidersResult {
  providers: Provider[];
  isLoading: boolean;
  error: string | null;
  getProviderById: (id: ProviderId) => Provider | undefined;
  getAccentColor: (id: ProviderId) => string;
  reload: () => void;
}

export function useProviders(): UseProvidersResult {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getProviders()
      .then((data) => {
        if (!cancelled) setProviders(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "프로바이더 레지스트리 조회에 실패했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const getProviderById = useCallback(
    (id: ProviderId) => providers.find((provider) => provider.id === id),
    [providers]
  );

  const getAccentColor = useCallback(
    (id: ProviderId) => getProviderById(id)?.accent_color ?? ACCENT_COLOR_FALLBACK[id] ?? "var(--brand)",
    [getProviderById]
  );

  const reload = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setReloadToken((token) => token + 1);
  }, []);

  return { providers, isLoading, error, getProviderById, getAccentColor, reload };
}
