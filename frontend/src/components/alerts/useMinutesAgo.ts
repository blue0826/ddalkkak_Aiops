"use client";

/**
 * StaleIndicator용 "N분 전" 계산 훅.
 * Date.now()는 렌더 중 직접 호출하면 impure(react-hooks/purity)로 걸리므로,
 * 마운트 시 및 주기적으로 useEffect 안에서만 "현재 시각"을 상태로 캡처해 순수하게 계산한다.
 */
import { useEffect, useState } from "react";

export function useMinutesAgo(since: Date | null): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const intervalId = setInterval(tick, 30000);
    const timeoutId = setTimeout(tick, 0);
    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, []);

  if (since === null || now === null) return null;
  return (now - since.getTime()) / 60000;
}
