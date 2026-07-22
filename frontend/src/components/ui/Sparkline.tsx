"use client";

/**
 * 축·격자·툴팁이 전혀 없는 미니 차트 — KPI 카드용(§7.1). 단독으로도 재사용 가능.
 * 최신 지점에 펄스 점을 그려 "실시간으로 흐르는" 느낌을 준다(reduced-motion이면 정지).
 */
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { useMotionEnabled } from "@/hooks/useMotion";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  /** 실시간 흐름 효과(펄스 점). 기본 true */
  live?: boolean;
}

export function Sparkline({ data, color = "var(--chart-1)", height = 32, live = true }: SparklineProps) {
  const motionOn = useMotionEnabled();
  const animate = live && motionOn;

  if (data.length < 2) return null;

  const points = data.map((value, index) => ({ index, value }));
  const lastIndex = points.length - 1;

  const renderLeadingDot = (props: { cx?: number; cy?: number; index?: number }) => {
    const { cx, cy, index } = props;
    if (index !== lastIndex || cx == null || cy == null) {
      return <g key={`sld-${index}`} />;
    }
    return (
      <g key={`sld-${index}`}>
        {animate && <circle cx={cx} cy={cy} className="live-ring" fill="none" stroke={color} strokeWidth={1} />}
        <circle cx={cx} cy={cy} r={2} fill={color} />
      </g>
    );
  };

  return (
    <div style={{ height }} className="w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 3, right: 4, bottom: 3, left: 1 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={renderLeadingDot}
            isAnimationActive={animate}
            animationDuration={700}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
