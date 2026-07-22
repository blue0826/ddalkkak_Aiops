"use client";

/**
 * 카드 클릭 시 펼쳐지는 상세 패널 — 해당 자원의 CPU+메모리를 하나의 큰 시계열 차트에 겹쳐
 * 그린다(같은 단위=%라 비교 가능, §5.3). 카드 스파크라인보다 더 긴 범위(rangeMinutes, 페이지
 * 전역 range 필터를 따름)로 조회한다.
 */
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { Provider, TopologyNode } from "@/lib/types";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProviderBadge } from "@/components/ui/ProviderBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TimeSeriesChart } from "@/components/ui/TimeSeriesChart";
import { fmtPct, fmtPctOrUnmeasured } from "@/components/ui/format";
import { NODE_TYPE_LABEL, SPARSE_REAL_DATA_MESSAGE, isRealEmptySeries, mergeCpuMemory, splitNodeLabel, statusTone } from "./metricsUtils";
import { useMinutesAgo } from "./useMinutesAgo";
import { useNodeMetrics } from "./useNodeMetrics";

interface ResourceMetricDetailProps {
  node: TopologyNode;
  provider?: Provider;
  rangeMinutes: number;
  rangeLabel: string;
  onClose: () => void;
  /** 지정 시(24시간 미만 범위) 빈 상태에 "24시간으로 보기" 원클릭 액션을 노출한다. */
  onWidenRange?: () => void;
}

export function ResourceMetricDetail({ node, provider, rangeMinutes, rangeLabel, onClose, onWidenRange }: ResourceMetricDetailProps) {
  const metrics = useNodeMetrics(node.id, node.provider, rangeMinutes, node.tenant_id);
  const minutesAgo = useMinutesAgo(metrics.lastUpdated);

  const { title, subtitle } = splitNodeLabel(node.label);
  const tone = statusTone(node.status);
  const isWarning = node.status === "warning";
  const hardError = !metrics.data && metrics.error;
  const cpuPoints = metrics.data?.cpu ?? [];
  const memoryPoints = metrics.data?.memory ?? [];
  const isRealEmpty = isRealEmptySeries(metrics.data?.dataSource, cpuPoints, memoryPoints);

  return (
    // 카드와 동일 톤의 실시간 효과 — 경고 자원은 글로우색을 위험색으로 오버라이드(§ResourceMetricCard와 동일 패턴).
    <div
      className="fx-card live-glow p-4"
      style={isWarning ? { ["--glow-color" as string]: "var(--warn)" } : undefined}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-[var(--radius-badge)] border border-[var(--border)] px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
            {NODE_TYPE_LABEL[node.type] ?? node.type}
          </span>
          <div>
            <div className="font-semibold" style={{ font: "var(--text-h2)" }}>
              {title}
            </div>
            {subtitle && <div className="text-[11px] text-[var(--muted)]">{subtitle}</div>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 패널 닫기"
          className="rounded-[var(--radius-input)] p-1 text-[var(--muted)] transition-colors hover:bg-[var(--bg-2)]"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
        <DetailRow label="상태">
          <StatusBadge status={tone} label={isWarning ? "경고" : "정상"} />
        </DetailRow>
        <DetailRow label="프로바이더">{provider ? <ProviderBadge provider={provider} /> : node.provider}</DetailRow>
        <DetailRow label="CPU 현재값">
          <span className="num">{fmtPctOrUnmeasured(node.cpu)}</span>
        </DetailRow>
        <DetailRow label="메모리 현재값">
          <span className="num">{fmtPctOrUnmeasured(node.memory)}</span>
        </DetailRow>
      </dl>

      <ChartContainer
        title="CPU · 메모리 추이"
        subtitle={rangeLabel}
        action={
          <div className="flex items-center gap-3">
            {metrics.data?.dataSource && <DataSourceBadge source={metrics.data.dataSource} />}
            {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
          </div>
        }
      >
        {metrics.isLoading ? (
          <Skeleton height={260} />
        ) : hardError ? (
          <ErrorState
            cause="메트릭 추이를 불러오지 못했습니다."
            remedy={`${metrics.error?.message ?? ""} 잠시 후 다시 시도하십시오.`}
            onRetry={metrics.refetch}
          />
        ) : (
          <TimeSeriesChart
            data={mergeCpuMemory(cpuPoints, memoryPoints)}
            series={[
              { key: "cpu", label: "CPU", color: "var(--chart-1)" },
              { key: "memory", label: "메모리", color: "var(--chart-2)" },
            ]}
            height={260}
            valueFormatter={fmtPct}
            emptyMessage={isRealEmpty ? SPARSE_REAL_DATA_MESSAGE : "이 범위에 표시할 메트릭 데이터가 없습니다."}
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
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className="text-[var(--foreground)]">{children}</dd>
    </div>
  );
}
