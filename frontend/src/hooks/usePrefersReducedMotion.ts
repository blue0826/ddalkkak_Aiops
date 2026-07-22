"use client";

/**
 * OS의 "동작 줄이기(prefers-reduced-motion)" 설정을 구독한다.
 * 실시간 시각 효과(흐르는 그래프·펄스·카운터)를 이 값에 따라 끈다(§11 품질 기준).
 */
import { useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // 초기값 반영은 타이머 콜백으로 지연해 effect 본문 동기 setState를 피한다.
    const t = setTimeout(() => setReduced(mq.matches), 0);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => {
      clearTimeout(t);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  return reduced;
}
