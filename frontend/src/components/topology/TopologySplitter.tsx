"use client";

/**
 * 자원 맵 ↔ 우측 상세패널 사이 폭 조절 스플리터 — 마우스 드래그로 상세패널 폭을 조절한다.
 * 드래그 상태는 window에 mousemove/mouseup을 구독해 마우스가 핸들 밖으로 빠르게 나가도
 * 드래그가 끊기지 않게 한다(핸들 자체의 onMouseMove만 쓰면 빠른 드래그 시 누락될 수 있음).
 * 키보드 접근성: 포커스 후 ←/→로도 폭을 조절할 수 있다(role="separator").
 */
import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { cn } from "@/lib/cn";

interface TopologySplitterProps {
  /** 우측 상세패널의 현재 폭(px). */
  width: number;
  onWidthChange: (width: number) => void;
  min: number;
  max: number;
  className?: string;
}

const KEY_STEP = 24;

export function TopologySplitter({ width, onWidthChange, min, max, className }: TopologySplitterProps) {
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const clamp = useCallback((value: number) => Math.min(max, Math.max(min, value)), [min, max]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      // 스플리터를 왼쪽으로 끌수록(마우스가 시작점보다 왼쪽) 우측 패널이 넓어진다.
      const delta = startXRef.current - e.clientX;
      onWidthChange(clamp(startWidthRef.current + delta));
    };
    const onMouseUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onWidthChange, clamp]);

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onWidthChange(clamp(width + KEY_STEP));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onWidthChange(clamp(width - KEY_STEP));
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="자원 맵과 상세 패널 사이 폭 조절"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      className={cn("group relative w-2.5 shrink-0 cursor-col-resize select-none", className)}
    >
      <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-[var(--border)] transition-colors group-hover:bg-[var(--brand)] group-focus-visible:bg-[var(--brand)]" />
    </div>
  );
}
