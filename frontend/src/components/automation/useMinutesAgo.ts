"use client";

/**
 * lastUpdated(Date)로부터 경과 분을 렌더에 안전한 값으로 제공한다.
 * React Compiler의 purity 규칙(렌더 중 Date.now() 같은 비순수 함수 호출 금지)을 지키기 위해,
 * 시각 계산은 항상 useEffect(커밋 이후) 안에서만 하고 결과를 state로 보관한다.
 * StaleIndicator(§8)를 구동하는 용도.
 */
import { useEffect, useState } from "react";

export function useMinutesAgo(date: Date | null, tickMs = 15000): number | null {
  const [minutesAgo, setMinutesAgo] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setMinutesAgo(date ? (Date.now() - date.getTime()) / 60000 : null);
    update();
    if (!date) return;
    const id = setInterval(update, tickMs);
    return () => clearInterval(id);
  }, [date, tickMs]);

  return minutesAgo;
}
