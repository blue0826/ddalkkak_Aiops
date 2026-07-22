"use client";

/**
 * StaleIndicator에 넘길 "N분 전" 값을 렌더 중 Date.now() 직접 호출 없이 계산한다
 * (React Compiler purity 규칙 — impure 함수는 effect 안에서만 호출). 30초마다 갱신하면
 * 충분하다(§8 폴링 주기와 동일 리듬).
 */
import { useEffect, useState } from "react";

export function useMinutesAgo(date: Date | null): number | null {
  const [minutesAgo, setMinutesAgo] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setMinutesAgo(date ? (Date.now() - date.getTime()) / 60000 : null);
    update();
    if (!date) return;
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [date]);

  return minutesAgo;
}
