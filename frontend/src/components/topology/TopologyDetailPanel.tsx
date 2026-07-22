"use client";

/**
 * 우측 노드 상세 패널 — 선택된 노드의 메타데이터 + 해당 노드의 CPU·메모리 골든시그널 전체
 * 시계열을 함께 보여준다(CEO 지시 "상세 패널 강화" — 토폴로지에서 메트릭 화면으로 이동하지
 * 않아도 되게). 패널 내 범위 선택기(1시간/24시간/7일)로 조회 구간을 바꿀 수 있으며 기본값은
 * 기존 동작과 동일한 1시간이다. 데이터 페칭·차트 병합은 메트릭 화면의 useNodeMetrics /
 * mergeCpuMemory를 그대로 재사용해 로직이 두 곳에서 갈라지지 않게 한다.
 * 노드가 선택되지 않았으면 안내 문구만 표시한다.
 */
import { useState, type ReactNode } from "react";
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
import { cn } from "@/lib/cn";
import { SPARSE_REAL_DATA_MESSAGE, isRealEmptySeries, mergeCpuMemory } from "@/components/metrics/metricsUtils";
import { useNodeMetrics } from "@/components/metrics/useNodeMetrics";
import { nodeTypeLabel, statusTone } from "./topologyLabels";
import { useMinutesAgo } from "./useMinutesAgo";

interface TopologyDetailPanelProps {
  node: TopologyNode | null;
  provider?: Provider;
  onClose: () => void;
}

interface RangeOption {
  value: string;
  label: string;
  minutes: number;
  caption: string;
}

// 메트릭 화면(FilterBar) 범위 어휘와 동일한 값을 쓴다. 7일은 백엔드 시뮬레이터가 분당 1포인트를
// 생성하는 특성상 그대로 넘기면 포인트가 과도해지므로 3일로 상한을 두고 자막에 명시한다
// (§메트릭 페이지 RANGE_CONFIG와 동일 정책 — 조용히 다른 데이터를 보여주지 않는다).
const RANGE_OPTIONS: RangeOption[] = [
  { value: "1h", label: "1시간", minutes: 60, caption: "최근 1시간" },
  { value: "24h", label: "24시간", minutes: 1440, caption: "최근 24시간" },
  { value: "7d", label: "7일", minutes: 4320, caption: "최근 3일 (7일 범위 상한 적용)" },
];
const DEFAULT_RANGE_VALUE = "1h";

export function TopologyDetailPanel({ node, provider, onClose }: TopologyDetailPanelProps) {
  const [rangeValue, setRangeValue] = useState(DEFAULT_RANGE_VALUE);
  const rangeOption = RANGE_OPTIONS.find((r) => r.value === rangeValue) ?? RANGE_OPTIONS[0];

  const metrics = useNodeMetrics(node?.id ?? "", node?.provider, rangeOption.minutes, node?.tenant_id);
  const minutesAgo = useMinutesAgo(metrics.lastUpdated);

  if (!node) {
    return (
      <div className="flex h-[calc(100vh-260px)] min-h-[640px] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] p-6 text-center text-[12px] text-[var(--muted)]">
        노드를 선택하면 상세 정보가 표시됩니다.
      </div>
    );
  }

  const [title, subtitle] = node.label.split("\n");
  const hardError = !metrics.data && metrics.error;
  const cpuPoints = metrics.data?.cpu ?? [];
  const memoryPoints = metrics.data?.memory ?? [];
  const isRealEmpty = isRealEmptySeries(metrics.data?.dataSource, cpuPoints, memoryPoints);

  return (
    <div className="flex h-[calc(100vh-260px)] min-h-[640px] flex-col gap-4 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold" style={{ font: "var(--text-h2)" }}>
            {title}
          </div>
          {subtitle && <div className="text-[11px] text-[var(--muted)]">{subtitle}</div>}
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

      <dl className="grid grid-cols-2 gap-3 text-[12px]">
        <DetailRow label="상태">
          <span className="inline-flex items-center gap-1.5">
            {node.status === "warning" && (
              <span className="live-pulse inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--crit)]" aria-hidden />
            )}
            <StatusBadge status={statusTone(node.status)} label={node.status === "warning" ? "경고" : "정상"} />
          </span>
        </DetailRow>
        <DetailRow label="프로바이더">{provider ? <ProviderBadge provider={provider} /> : node.provider}</DetailRow>
        <DetailRow label="유형">{nodeTypeLabel(node.type, provider)}</DetailRow>
        <DetailRow label="테넌트">{node.tenant_id}</DetailRow>
        <DetailRow label="CPU">
          <span className="num">{fmtPctOrUnmeasured(node.cpu)}</span>
        </DetailRow>
        <DetailRow label="메모리">
          <span className="num">{fmtPctOrUnmeasured(node.memory)}</span>
        </DetailRow>
        {node.subnet && <DetailRow label="서브넷">{node.subnet}</DetailRow>}
        {node.region && <DetailRow label="리전">{node.region}</DetailRow>}
      </dl>

      {/*
        ChartContainer 헤더(title/action)는 flex-wrap이 없어 폭이 280px까지 좁아지면
        긴 제목("CPU · 메모리 추이") + 배지 2개가 한 줄에서 넘칠 수 있다. 공유 컴포넌트는
        건드리지 않고, 배지·범위 버튼을 children 쪽의 자체 flex-wrap 행으로 옮겨 좁은 폭에서도
        줄바꿈되게 한다(overflow 방지).
      */}
      <ChartContainer title="CPU · 메모리 추이" subtitle={rangeOption.caption}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="메트릭 조회 범위 선택">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRangeValue(opt.value)}
                aria-pressed={opt.value === rangeValue}
                className={cn(
                  "rounded-[var(--radius-badge)] border px-2 py-1 text-[11px] font-medium transition-colors",
                  opt.value === rangeValue
                    ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--bg-2)]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {metrics.data?.dataSource && <DataSourceBadge source={metrics.data.dataSource} />}
            {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
          </div>
        </div>

        {metrics.isLoading ? (
          <Skeleton height={180} />
        ) : hardError ? (
          <ErrorState
            cause="메트릭 조회에 실패했습니다."
            remedy={metrics.error?.message || "잠시 후 다시 시도하십시오."}
            onRetry={metrics.refetch}
          />
        ) : (
          <TimeSeriesChart
            data={mergeCpuMemory(cpuPoints, memoryPoints)}
            series={[
              { key: "cpu", label: "CPU", color: "var(--chart-1)" },
              { key: "memory", label: "메모리", color: "var(--chart-2)" },
            ]}
            height={180}
            valueFormatter={fmtPct}
            emptyMessage={isRealEmpty ? SPARSE_REAL_DATA_MESSAGE : "이 범위에 표시할 메트릭 데이터가 없습니다."}
            emptyAction={
              isRealEmpty && rangeOption.minutes < 1440 ? (
                <button
                  type="button"
                  onClick={() => setRangeValue("24h")}
                  className="rounded-[var(--radius-input)] border border-[var(--brand)] px-2 py-1 text-[11px] font-semibold text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10"
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
