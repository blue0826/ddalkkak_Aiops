/**
 * 로딩 스켈레톤 — §8. 최종 레이아웃과 동일한 치수로 지정해 데이터 도착 시 레이아웃 시프트가 없게 한다.
 * prefers-reduced-motion 환경에서는 pulse 애니메이션을 끈다(motion-reduce:animate-none).
 */
import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  radius?: string;
}

export function Skeleton({ className, width, height, radius = "var(--radius-card)" }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse bg-[var(--bg-2)] motion-reduce:animate-none", className)}
      style={{ width, height, borderRadius: radius }}
    />
  );
}
