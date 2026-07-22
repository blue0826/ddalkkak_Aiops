"use client";

/**
 * 프로바이더별 자원 분포 — 도넛 차트. 색/표시명은 프로바이더 레지스트리(useProviders)에서
 * 그대로 가져온다(SCP/AWS 색 하드코딩 금지 — 프로젝트 규칙).
 */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Provider, TopologyNode } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtCount } from "@/components/ui/format";
import { DistributionLegend } from "./DistributionLegend";
import { DistributionTooltip } from "./DistributionTooltip";
import { chartColorAt, countByProviderId, type DistributionEntry } from "./resourceDistributionUtils";

interface ProviderDistributionChartProps {
  nodes: TopologyNode[];
  providers: Provider[];
}

export function ProviderDistributionChart({ nodes, providers }: ProviderDistributionChartProps) {
  const rawEntries = countByProviderId(nodes);

  if (rawEntries.length === 0) {
    return (
      <EmptyState
        variant="filtered"
        title="분포 데이터가 없습니다"
        description="현재 조회된 자원이 없어 프로바이더 분포를 계산할 수 없습니다."
      />
    );
  }

  // 레지스트리에 등록된 프로바이더는 표시명(display_name)으로 라벨을 덮어쓴다. 미등록 ID는 대문자 그대로 둔다.
  const entries: DistributionEntry[] = rawEntries.map((entry) => {
    const provider = providers.find((p) => p.id === entry.key);
    return provider ? { ...entry, label: provider.display_name } : entry;
  });

  const colorFor = (entry: DistributionEntry, index: number) => {
    const provider = providers.find((p) => p.id === entry.key);
    return provider?.accent_color ?? chartColorAt(index);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div style={{ width: 140, height: 140 }} className="mx-auto shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={entries}
              dataKey="count"
              nameKey="label"
              innerRadius={40}
              outerRadius={64}
              paddingAngle={2}
              isAnimationActive={false}
              stroke="var(--bg-0)"
              strokeWidth={2}
            >
              {entries.map((entry, index) => (
                <Cell key={entry.key} fill={colorFor(entry, index)} />
              ))}
            </Pie>
            <Tooltip content={<DistributionTooltip valueFormatter={fmtCount} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1">
        <DistributionLegend entries={entries} colorFor={colorFor} />
      </div>
    </div>
  );
}
