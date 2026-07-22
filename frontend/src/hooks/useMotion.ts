"use client";

/**
 * 관제 월 실시간 효과(흐름·글로우·펄스·입자)의 전역 on/off.
 * 기본은 켜짐 — 벽 디스플레이에서 운영자가 명시적으로 효과를 원한다(OS의 reduced-motion을
 * 무조건 따르지 않는다). data-motion 속성으로 CSS 애니메이션을 제어하고, JS 애니메이션
 * (Recharts·Canvas 입자)은 useMotionEnabled로 구독한다. 사용자는 필터바 토글로 끌 수 있다.
 */
import { useEffect, useState } from "react";

const STORAGE_KEY = "aiops.motion";
const EVENT = "aiops-motion";

export function readMotionEnabled(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.dataset.motion !== "off";
}

export function setMotionEnabled(on: boolean): void {
  document.documentElement.dataset.motion = on ? "on" : "off";
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* 저장 실패 무시 */
  }
  window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: on }));
}

/** 저장된 설정을 마운트 시 1회 반영(기본 on). 앱 루트에서 한 번 호출. */
export function useMotionInit(): void {
  useEffect(() => {
    const t = setTimeout(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "off") setMotionEnabled(false);
    }, 0);
    return () => clearTimeout(t);
  }, []);
}

/** 현재 모션 on 여부를 구독한다(토글 시 즉시 반영). */
export function useMotionEnabled(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(readMotionEnabled()), 0);
    const handler = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, handler);
    return () => {
      clearTimeout(t);
      window.removeEventListener(EVENT, handler);
    };
  }, []);
  return on;
}
