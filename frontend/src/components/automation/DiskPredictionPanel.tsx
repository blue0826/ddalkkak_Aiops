"use client";

/**
 * 디스크 포화 예측 패널 — GET /monitor/predictions. node_id를 직접 지정해 조회할 수 있다.
 * 상태변경이 없는 조회 전용 패널이라 권한 게이트가 필요 없다(뷰어도 조회 가능).
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { getDiskPrediction } from "@/lib/api";
import { useApiResource } from "@/hooks/useApiResource";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { fmtCount, fmtPct } from "@/components/ui/format";
import { useAutomationScope } from "./scope";

/**
 * KpiCard(components/ui, 공유 파일)는 라벨 옆에 설명을 넣을 슬롯이 없어 수정할 수 없으므로,
 * 카드 바깥 모서리에 살짝 걸치는 ⓘ 배지로 설명을 붙인다(카드 내부 아이콘과 겹치지 않음).
 */
function KpiWithTooltip({ tooltipLabel, tooltip, children }: { tooltipLabel: string; tooltip: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="absolute -right-1.5 -top-1.5 z-10">
        <InfoTooltip label={tooltipLabel}>{tooltip}</InfoTooltip>
      </span>
    </div>
  );
}

export function DiskPredictionPanel() {
  const { tenant_id, provider } = useAutomationScope();
  const [nodeIdInput, setNodeIdInput] = useState("");
  const [queriedNodeId, setQueriedNodeId] = useState<string | undefined>(undefined);

  const { data, error, isLoading, refetch } = useApiResource(
    () => getDiskPrediction({ tenant_id, provider, node_id: queriedNodeId }),
    [tenant_id, provider, queriedNodeId]
  );

  return (
    <ChartContainer
      title="디스크 포화 예측"
      subtitle="추세 기반 디스크 사용률 포화 예측(회귀)"
      action={
        <InfoTooltip label="디스크 포화 예측 설명">
          최근 사용률 추세를 선형 회귀로 연장해 디스크가 가득 차는 시점을 예측합니다.
        </InfoTooltip>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="disk-node-id">
          노드 ID
        </label>
        <input
          id="disk-node-id"
          value={nodeIdInput}
          onChange={(e) => setNodeIdInput(e.target.value)}
          placeholder="노드 ID (비우면 기본 노드)"
          className="h-9 w-56 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-3 font-mono text-[13px] text-[var(--foreground)]"
        />
        <button
          type="button"
          onClick={() => setQueriedNodeId(nodeIdInput.trim() || undefined)}
          className="rounded-[var(--radius-input)] border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--bg-2)]"
        >
          조회
        </button>
      </div>

      {isLoading && <Skeleton height={140} />}
      {error && <ErrorState cause="디스크 예측 데이터를 불러오지 못했습니다." remedy={error.message} onRetry={refetch} />}
      {!isLoading && !error && data && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiWithTooltip tooltipLabel="현재 사용률 설명" tooltip="이 노드의 현재 디스크 사용률입니다.">
              <KpiCard label="현재 사용률" value={fmtPct(data.current_usage_pct)} sparkline={data.history} />
            </KpiWithTooltip>
            <KpiWithTooltip tooltipLabel="일 증가율 설명" tooltip="최근 추세 기준 하루에 디스크 사용률이 늘어나는 비율입니다.">
              <KpiCard label="일 증가율" value={fmtPct(data.growth_rate_pct_day)} />
            </KpiWithTooltip>
            <KpiWithTooltip tooltipLabel="포화 예상 설명" tooltip="현재 증가율이 유지될 경우 디스크가 가득 찰 것으로 예상되는 시점까지 남은 일수입니다.">
              <KpiCard label="포화 예상" value={`${fmtCount(data.days_to_saturation)}일 후`} />
            </KpiWithTooltip>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={data.saturates_soon ? "crit" : "ok"} label={data.saturates_soon ? "임박" : "여유 있음"} />
            <span className="text-[12px] text-[var(--muted)]">{data.reason}</span>
          </div>
        </div>
      )}
    </ChartContainer>
  );
}
