/**
 * 대시보드 행2 · 골든 시그널 — §5.2 Row 2. 가장 부하가 높은 vm/database 노드의
 * CPU·메모리를 한 차트에 직접 라벨(≤2시리즈)로 겹쳐 그린다(같은 단위=%이므로 비교 가능, §5.3).
 */
import { Activity } from "lucide-react";
import type { ApiResourceState } from "@/hooks/useApiResource";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { TimeSeriesChart } from "@/components/ui/TimeSeriesChart";
import { fmtPct } from "@/components/ui/format";
import type { MetricSeriesResponse, TopologyNode } from "@/lib/types";
import { GLOSSARY } from "@/lib/glossary";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SPARSE_REAL_DATA_MESSAGE, isRealEmptySeries } from "@/components/metrics/metricsUtils";
import { mergeMetricSeries, normalizeMetricSeries } from "./dashboardUtils";

interface GoldenSignalsPanelProps {
  featuredNode: TopologyNode | null;
  topologyLoading: boolean;
  cpuState: ApiResourceState<MetricSeriesResponse>;
  memoryState: ApiResourceState<MetricSeriesResponse>;
  rangeLabel: string;
  /** getMetrics에 실제 전달된 조회 범위(분) — 24시간 미만일 때만 원클릭 확대 액션을 노출한다. */
  rangeMinutes: number;
  /** 지정 시(24시간 미만 범위) 빈 상태에 "24시간으로 보기" 원클릭 액션을 노출한다. */
  onWidenRange?: () => void;
}

export function GoldenSignalsPanel({
  featuredNode,
  topologyLoading,
  cpuState,
  memoryState,
  rangeLabel,
  rangeMinutes,
  onWidenRange,
}: GoldenSignalsPanelProps) {
  const goldenSignalsTooltip = <InfoTooltip label="골든 시그널 설명">{GLOSSARY.golden_signals}</InfoTooltip>;

  if (topologyLoading) {
    return (
      <ChartContainer title="골든 시그널" subtitle={`CPU · 메모리 · 최근 ${rangeLabel}`} action={goldenSignalsTooltip}>
        <Skeleton height={200} />
      </ChartContainer>
    );
  }

  if (!featuredNode) {
    return (
      <ChartContainer title="골든 시그널" subtitle={`CPU · 메모리 · 최근 ${rangeLabel}`} action={goldenSignalsTooltip}>
        <EmptyState
          variant="filtered"
          icon={Activity}
          title="관측할 자원이 없습니다"
          description="현재 조회 범위(테넌트/프로바이더)에 가상 서버 또는 데이터베이스 노드가 없습니다."
        />
      </ChartContainer>
    );
  }

  const isLoading = cpuState.isLoading || memoryState.isLoading;
  const hasNoData = !cpuState.data && !memoryState.data;
  const hardError = hasNoData && (cpuState.error ?? memoryState.error);

  const cpu = normalizeMetricSeries(cpuState.data);
  const memory = normalizeMetricSeries(memoryState.data);
  const dataSource = cpu.dataSource ?? memory.dataSource;
  const isRealEmpty = isRealEmptySeries(dataSource, cpu.points, memory.points);

  return (
    <ChartContainer
      title={`골든 시그널 · ${featuredNode.label}`}
      subtitle={`CPU · 메모리 · 최근 ${rangeLabel}`}
      action={
        <span className="flex items-center gap-2">
          {goldenSignalsTooltip}
          {dataSource && <DataSourceBadge source={dataSource} />}
        </span>
      }
    >
      {isLoading ? (
        <Skeleton height={200} />
      ) : hardError ? (
        <ErrorState
          cause="메트릭 조회에 실패했습니다."
          remedy={hardError.message || "잠시 후 다시 시도하십시오."}
          onRetry={() => {
            cpuState.refetch();
            memoryState.refetch();
          }}
        />
      ) : (
        <TimeSeriesChart
          data={mergeMetricSeries(cpu.points, memory.points)}
          series={[
            { key: "cpu", label: "CPU", color: "var(--chart-1)" },
            { key: "memory", label: "메모리", color: "var(--chart-2)" },
          ]}
          valueFormatter={fmtPct}
          emptyMessage={isRealEmpty ? SPARSE_REAL_DATA_MESSAGE : "이 기간에 데이터가 없습니다."}
          emptyAction={
            isRealEmpty && onWidenRange && rangeMinutes < 1440 ? (
              <button
                type="button"
                onClick={onWidenRange}
                className="rounded-[var(--radius-input)] border border-[var(--brand)] px-2.5 py-1 text-[12px] font-semibold text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10"
              >
                24시간으로 보기
              </button>
            ) : undefined
          }
        />
      )}
    </ChartContainer>
  );
}
