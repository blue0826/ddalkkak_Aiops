"use client";

/**
 * Recharts 시계열 차트 — §6.1 "defaults-off"를 전부 적용한 기본 프리셋.
 * 수직 격자 없음, axis/tickLine 없음, Y틱 ≤4, dot 없음, 애니메이션 없음, 범례 대신 직접 라벨(≤2시리즈).
 * area variant는 단일 시리즈에서만 ≤12% 그라데이션을 허용한다(§6.3 하드 NO — 다중 시리즈 그라데이션 금지).
 * 데이터가 비어 있어도 축/격자는 그대로 그리고 "데이터 없음" 메시지를 오버레이한다(§8 — 빈 사각형 금지).
 */
import { useId, type ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { useMotionEnabled } from "@/hooks/useMotion";
import { fmtAxisTime, fmtCount } from "./format";

export interface TimeSeriesPoint {
  ts: string | number;
  [seriesKey: string]: string | number;
}

export interface TimeSeriesSeries {
  key: string;
  label: string;
  color: string;
}

/**
 * Recharts는 content 엘리먼트를 cloneElement로 감싸 active/payload/label 등을 런타임에 주입한다.
 * JSX 호출부(<OpsTooltip valueFormatter={...} />)에서는 이 필드들을 넘기지 않으므로 Partial로 둔다.
 */
type OpsTooltipProps = Partial<TooltipContentProps<number, string>> & {
  valueFormatter: (value: number) => string;
  /** Recharts 자체 labelFormatter와 이름이 겹치지 않도록 별칭 사용 */
  xLabelFormatter: (value: string | number) => string;
};

function OpsTooltip({ active, payload, label, valueFormatter, xLabelFormatter }: OpsTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  // 흐름 오버레이(flow-line)는 본선과 동일한 dataKey(cpu/memory)를 가지므로 payload에 같은
  // 시리즈가 2번 들어온다. dataKey 기준으로 첫 항목만 남겨 React key 중복 경고와 툴팁 중복 행을
  // 동시에 없앤다.
  const seen = new Set<string>();
  const uniquePayload = payload.filter((entry) => {
    const key = String(entry.dataKey);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <div className="rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-[12px]">
      <div className="mb-1 text-[var(--muted)]">
        {label !== undefined && label !== null ? xLabelFormatter(label as string | number) : ""}
      </div>
      {uniquePayload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
          <span className="num">{typeof entry.value === "number" ? valueFormatter(entry.value) : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  series: TimeSeriesSeries[];
  height?: number;
  variant?: "line" | "area";
  /** Y틱/툴팁 값 포맷터. 지정하지 않으면 fmtCount로 폴백한다(축은 항상 단위 포맷 — 원시 float 금지). */
  valueFormatter?: (value: number) => string;
  /** X축/툴팁 라벨 포맷터. 기본은 시각(HH:MM). 일 단위 데이터(날짜)는 fmtAxisDate 등을 넘긴다. */
  xTickFormatter?: (value: string | number) => string;
  emptyMessage?: string;
  /** 빈 상태 메시지 아래에 끼워 넣을 액션(예: "24시간으로 보기" 버튼). 지정 시에만 렌더링. */
  emptyAction?: ReactNode;
  /**
   * 관제 월용 "흐르는" 실시간 효과 — 폴링마다 라인이 부드럽게 다시 그려지고(스트리밍),
   * 최신 지점에 펄스 링을 표시한다. 기본 true. reduced-motion이면 자동 정지.
   * (디자인 가이드는 정적 차트를 권하나 벽 디스플레이 용도로 의도적으로 켠다.)
   */
  live?: boolean;
}

export function TimeSeriesChart({
  data,
  series,
  height = 200,
  variant = "line",
  valueFormatter = fmtCount,
  xTickFormatter = fmtAxisTime,
  emptyMessage = "이 기간에 데이터가 없습니다.",
  emptyAction,
  live = true,
}: TimeSeriesChartProps) {
  const gradientId = useId();
  const motionOn = useMotionEnabled();
  const animate = live && motionOn;
  const hasData = data.length > 0;
  const lastIndex = data.length - 1;
  const isSingleArea = variant === "area" && series.length === 1;
  const showDirectLabels = series.length > 0 && series.length <= 2;

  // 최신 지점(리딩 엣지)에만 펄스 링 + 점을 그린다("지금 들어오는 데이터" 신호).
  const renderLeadingDot = (props: { cx?: number; cy?: number; index?: number; stroke?: string }) => {
    const { cx, cy, index, stroke } = props;
    if (index !== lastIndex || cx == null || cy == null) {
      return <g key={`ld-${index}`} />;
    }
    return (
      <g key={`ld-${index}`}>
        {animate && <circle cx={cx} cy={cy} className="live-ring" fill="none" stroke={stroke} strokeWidth={1.5} />}
        <circle cx={cx} cy={cy} r={3} fill={stroke} />
      </g>
    );
  };

  return (
    <div style={{ height }} className="relative w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {isSingleArea && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series[0].color} stopOpacity={0.12} />
                <stop offset="100%" stopColor={series[0].color} stopOpacity={0} />
              </linearGradient>
            </defs>
          )}

          <CartesianGrid horizontal vertical={false} stroke="var(--border)" strokeOpacity={0.5} />

          <XAxis
            dataKey="ts"
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            minTickGap={32}
            tickFormatter={xTickFormatter}
            tick={{ fontSize: 12, fill: "var(--muted)" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={44}
            tickCount={4}
            // Recharts는 tickFormatter(value, index)로 호출한다. valueFormatter가 2번째
            // 인자(fmtPct의 decimals 등)를 index로 오인하지 않도록 value만 넘긴다.
            tickFormatter={(value) => valueFormatter(value as number)}
            tick={{ fontSize: 12, fill: "var(--muted)" }}
          />

          <Tooltip
            content={<OpsTooltip valueFormatter={valueFormatter} xLabelFormatter={xTickFormatter} />}
            cursor={{ stroke: "var(--border)" }}
          />

          {/* 메인 라인/영역 — 재그리기 애니메이션 OFF(깜빡임 제거), 최신 지점 리딩 펄스 점 유지 */}
          {series.map((s) =>
            variant === "area" ? (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                fill={isSingleArea ? `url(#${gradientId})` : "transparent"}
                strokeWidth={1.5}
                dot={renderLeadingDot}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={1.5}
                dot={renderLeadingDot}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            )
          )}

          {/* 흐름 오버레이 — 라인 위를 마칭 대시가 흐른다(데이터가 흐르는 느낌). CSS .flow-line */}
          {animate &&
            series.map((s) => (
              <Line
                key={`flow-${s.key}`}
                className="flow-line"
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeOpacity={0.9}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                legendType="none"
              />
            ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* 스캔 스윕 — 좌→우로 지나가는 옅은 광택(실시간 스캐닝 느낌) */}
      {animate && hasData && <div className="scan-sweep" aria-hidden />}

      {showDirectLabels && hasData && (
        <div className="pointer-events-none absolute right-2 top-2 flex gap-3 text-[11px]">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1" style={{ color: s.color }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {!hasData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-[13px] text-[var(--muted)]">
          <span>{emptyMessage}</span>
          {emptyAction}
        </div>
      )}
    </div>
  );
}
