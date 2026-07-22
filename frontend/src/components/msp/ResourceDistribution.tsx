"use client";

/**
 * 전 고객사 통합 자원 분포 — GET /monitor/topology?tenant_id=system의 노드 배열을
 * 프로바이더/리전/유형별로 클라이언트에서 집계해 3개 차트 패널로 보여준다.
 * 토폴로지 조회가 실패해도 위의 KPI 롤업 스트립(FleetSummaryStrip)은 영향받지 않는다
 * (패널 단위 장애 격리 — useFleetOverview가 두 리소스를 독립적으로 조회하기 때문).
 */
import type { Provider, Topology } from "@/lib/types";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { GLOSSARY } from "@/lib/glossary";
import { nodeTypeLabel } from "@/components/topology/topologyLabels";
import { CategoryDistributionChart } from "./CategoryDistributionChart";
import { ProviderDistributionChart } from "./ProviderDistributionChart";
import { countByRegion, countByType } from "./resourceDistributionUtils";

interface ResourceDistributionProps {
  topology: Topology | null;
  providers: Provider[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function ResourceDistribution({ topology, providers, isLoading, error, onRetry }: ResourceDistributionProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={200} />
        ))}
      </div>
    );
  }

  if (!topology && error) {
    return (
      <ErrorState
        cause="자원 분포 조회에 실패했습니다."
        remedy={error.message || "잠시 후 다시 시도하십시오."}
        onRetry={onRetry}
      />
    );
  }

  if (!topology) return null;

  const nodes = topology.nodes;
  const regionEntries = countByRegion(nodes);
  const typeEntries = countByType(nodes, (type) => nodeTypeLabel(type));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <ChartContainer
        title="프로바이더별 분포"
        subtitle={`총 ${nodes.length}개 자원`}
        action={<InfoTooltip label="자원 분포 설명">{GLOSSARY.resource_distribution}</InfoTooltip>}
      >
        <ProviderDistributionChart nodes={nodes} providers={providers} />
      </ChartContainer>

      <ChartContainer title="리전별 분포" subtitle="자원이 배치된 리전 기준">
        <CategoryDistributionChart
          entries={regionEntries}
          emptyDescription="현재 조회된 자원에 리전 정보가 없습니다."
        />
      </ChartContainer>

      <ChartContainer title="유형별 분포" subtitle="VM·DB·스토리지 등 자원 유형 기준">
        <CategoryDistributionChart entries={typeEntries} emptyDescription="현재 조회된 자원이 없습니다." />
      </ChartContainer>
    </div>
  );
}
