"use client";

/**
 * 탐지 실행 패널 — POST /aiops/detection/run.
 * L1(임계치) + L2(이상탐지) + L3(노이즈 억제)를 한 번에 수행하고 신규 인시던트 생성 요약을 반환한다.
 * 운영자/관리자만 실행 가능(헌법 §3.5: 알람 노이즈 억제(L3)는 이상탐지(L2)와 한 세트).
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { Activity } from "lucide-react";
import { ApiError, runDetectionCycle } from "@/lib/api";
import type { DetectionRunDetail, DetectionRunResult } from "@/lib/types";
import { GLOSSARY } from "@/lib/glossary";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { KpiCard } from "@/components/ui/KpiCard";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { fmtCount } from "@/components/ui/format";
import { ConfirmButton } from "./ConfirmButton";
import { useCanAct } from "./permissions";

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

const DETAIL_COLUMNS: DataTableColumn<DetectionRunDetail>[] = [
  {
    key: "source",
    header: "소스",
    render: (row) => (row.source === "threshold" ? "임계치(L1)" : row.source === "anomaly" ? "이상탐지(L2)" : row.source),
  },
  { key: "node_id", header: "노드", render: (row) => <span className="font-mono">{row.node_id}</span> },
  { key: "metric_name", header: "지표", render: (row) => row.metric_name },
  { key: "current_value", header: "현재값", numeric: true, render: (row) => fmtCount(row.current_value) },
  { key: "incident_id", header: "인시던트", numeric: true, render: (row) => (row.incident_id ? `#${row.incident_id}` : "-") },
];

export function DetectionPanel() {
  const { canAct, roleLabel } = useCanAct();
  const [result, setResult] = useState<DetectionRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setError(null);
    try {
      const res = await runDetectionCycle();
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "탐지 실행 중 알 수 없는 오류가 발생했습니다.");
    }
  }

  return (
    <ChartContainer
      title="탐지 실행"
      subtitle="현재 테넌트 인프라를 스캔해 임계치·이상탐지·노이즈 억제를 한 번에 수행합니다."
      action={
        <span className="flex items-center gap-2">
          <InfoTooltip label="탐지 실행 설명">{GLOSSARY.detection_run}</InfoTooltip>
          <ConfirmButton
            label="탐지 실행"
            confirmLabel="실행"
            description="탐지 사이클을 지금 실행합니다."
            disabled={!canAct}
            disabledReason={!canAct ? `${roleLabel}은 읽기 전용입니다` : undefined}
            onConfirm={handleRun}
          />
        </span>
      }
    >
      {error && <ErrorState cause="탐지 실행에 실패했습니다." remedy={error} />}

      {!error && !result && (
        <EmptyState
          variant="onboarding"
          icon={Activity}
          title="아직 탐지를 실행하지 않았습니다"
          description="탐지 실행 버튼을 누르면 스캔 결과와 생성된 인시던트를 확인할 수 있습니다."
        />
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiWithTooltip tooltipLabel="스캔 노드 설명" tooltip="이번 탐지 사이클에서 스캔한 자원(노드) 수입니다.">
              <KpiCard label="스캔 노드" value={fmtCount(result.scanned_nodes)} />
            </KpiWithTooltip>
            <KpiWithTooltip
              tooltipLabel="탐지 후보 설명"
              tooltip={`${GLOSSARY.detection_l1} ${GLOSSARY.detection_l2}`}
            >
              <KpiCard label="탐지 후보" value={fmtCount(result.candidates)} />
            </KpiWithTooltip>
            <KpiWithTooltip
              tooltipLabel="노이즈 억제 설명"
              tooltip="중복이거나 일시적으로 튄 값으로 판단해 인시던트 생성에서 제외한 건수입니다(L3 노이즈 억제)."
            >
              <KpiCard label="노이즈 억제" value={fmtCount(result.suppressed)} />
            </KpiWithTooltip>
            <KpiWithTooltip
              tooltipLabel="생성된 인시던트 설명"
              tooltip="이번 실행으로 새로 생성된 인시던트 건수입니다."
            >
              <KpiCard label="생성된 인시던트" value={fmtCount(result.incidents_created.length)} />
            </KpiWithTooltip>
          </div>
          <DataTable
            columns={DETAIL_COLUMNS}
            rows={result.details}
            getRowKey={(row) => `${row.node_id}-${row.metric_name}-${row.source}`}
            emptyState={
              <EmptyState
                variant="filtered"
                title="탐지된 후보가 없습니다"
                description="현재 스캔 범위 안에서 임계치·이상탐지 후보가 발견되지 않았습니다."
              />
            }
          />
        </div>
      )}
    </ChartContainer>
  );
}
