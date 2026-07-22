"use client";

/**
 * 전 자원 다중 그리드의 미니 카드 하나 — CEO 피드백("1개만 보이는 게 아니라 자원마다 카드로")
 * 반영. 현재값(node.cpu/node.memory, 토폴로지 스냅샷이라 즉시 표시 가능)과 히스토리 스파크라인
 * (useNodeMetrics, 폴링)을 함께 보여준다. 카드 전체가 클릭 가능한 버튼 — 상세 패널을 연다.
 */
import { AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Provider, TopologyNode } from "@/lib/types";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { ProviderBadge } from "@/components/ui/ProviderBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtPctOrUnmeasured } from "@/components/ui/format";
import { NODE_TYPE_LABEL, isRealEmptySeries, splitNodeLabel, statusTone } from "./metricsUtils";
import { useMinutesAgo } from "./useMinutesAgo";
import { useNodeMetrics } from "./useNodeMetrics";

interface ResourceMetricCardProps {
  node: TopologyNode;
  provider?: Provider;
  /** 카드 스파크라인 조회 범위(분) — 페이지 전역 range와 무관하게 가볍게 고정 */
  rangeMinutes: number;
  isSelected: boolean;
  onSelect: (nodeId: string) => void;
}

export function ResourceMetricCard({ node, provider, rangeMinutes, isSelected, onSelect }: ResourceMetricCardProps) {
  const metrics = useNodeMetrics(node.id, node.provider, rangeMinutes, node.tenant_id);
  const minutesAgo = useMinutesAgo(metrics.lastUpdated);

  const { title, subtitle } = splitNodeLabel(node.label);
  const tone = statusTone(node.status);
  const isWarning = node.status === "warning";
  const cpuPoints = metrics.data?.cpu ?? [];
  const memoryPoints = metrics.data?.memory ?? [];
  const hasSparklineData = !metrics.isLoading && (cpuPoints.length >= 2 || memoryPoints.length >= 2);
  const hardError = !metrics.data && metrics.error;
  // 실 고객사(REAL_EMPTY) 빈 상태 — 카드는 자체 범위 선택기가 없으므로(고정 CARD_RANGE_MINUTES)
  // 액션은 카드 클릭과 동일하게 상세 패널을 여는 것으로 안내한다(상세는 페이지 전역 range를 따름).
  const isRealEmpty = !metrics.isLoading && isRealEmptySeries(metrics.data?.dataSource, cpuPoints, memoryPoints);

  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      aria-pressed={isSelected}
      // fx-card live-glow — KpiCard와 동일한 실시간 회전 테두리+글로우(§globals.css). live면 카드 자체
      // border/bg는 fx-card가 대신 제공하므로 제거한다. 경고 자원은 --glow-color를 위험색으로 오버라이드.
      className={cn(
        "fx-card live-glow flex flex-col gap-3 p-4 text-left transition hover:brightness-110",
        isSelected && "outline outline-2 outline-offset-2 outline-[var(--brand)]"
      )}
      style={isWarning ? { ["--glow-color" as string]: "var(--warn)" } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 rounded-[var(--radius-badge)] border border-[var(--border)] px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
              {NODE_TYPE_LABEL[node.type] ?? node.type}
            </span>
            <span className="truncate font-semibold" style={{ font: "var(--text-h2)" }}>
              {title}
            </span>
          </div>
          {subtitle && <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{subtitle}</p>}
        </div>
        {provider && <ProviderBadge provider={provider} className="shrink-0" />}
      </div>

      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={tone} label={isWarning ? "경고" : "정상"} />
        <div className="flex items-center gap-2">
          {metrics.data?.dataSource && <DataSourceBadge source={metrics.data.dataSource} />}
          {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
        </div>
      </div>

      {hardError ? (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-input)] border border-[var(--crit)]/30 bg-[var(--crit)]/5 px-2.5 py-2 text-[11px] text-[var(--crit)]">
          <span className="flex items-center gap-1.5">
            <AlertCircle size={12} aria-hidden />
            추이 조회 실패
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              metrics.refetch();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                metrics.refetch();
              }
            }}
            className="inline-flex items-center gap-1 font-semibold hover:opacity-80"
          >
            <RotateCcw size={11} aria-hidden />
            재시도
          </span>
        </div>
      ) : (
        <>
          <MetricRow label="CPU" value={node.cpu} color="var(--chart-1)" points={cpuPoints} isLoading={metrics.isLoading} />
          <MetricRow label="메모리" value={node.memory} color="var(--chart-2)" points={memoryPoints} isLoading={metrics.isLoading} />
          {!metrics.isLoading && !hasSparklineData && isRealEmpty && (
            <p className="text-[11px] text-[var(--muted)]">
              이 구간에 수집된 데이터가 없습니다.{" "}
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(node.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation();
                    onSelect(node.id);
                  }
                }}
                className="font-semibold text-[var(--brand)] hover:underline"
              >
                상세에서 24시간으로 보기
              </span>
            </p>
          )}
          {!metrics.isLoading && !hasSparklineData && !isRealEmpty && (
            <p className="text-[11px] text-[var(--muted)]">이 범위에 추이 데이터가 없습니다.</p>
          )}
        </>
      )}
    </button>
  );
}

interface MetricRowProps {
  label: string;
  value: number | null;
  color: string;
  points: { value: number }[] | undefined;
  isLoading: boolean;
}

function MetricRow({ label, value, color, points, isLoading }: MetricRowProps) {
  const sparklineData = (points ?? []).map((p) => p.value);

  return (
    <div className="flex items-center gap-3">
      <div className="w-16 shrink-0">
        <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
        <div className="num text-[15px] font-semibold">{fmtPctOrUnmeasured(value)}</div>
      </div>
      <div className="min-w-0 flex-1">
        {isLoading ? (
          <Skeleton height={28} />
        ) : sparklineData.length >= 2 ? (
          <Sparkline data={sparklineData} color={color} height={28} />
        ) : null}
      </div>
    </div>
  );
}
