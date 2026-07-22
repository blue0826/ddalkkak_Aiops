"use client";

/**
 * 계층형 자원 트리 뷰 — 레거시 HierarchicalTreeView(src/app/page.tsx 약 13~113행)를 포팅.
 * 이모지 아이콘을 lucide로, 하드코딩 색을 토큰/프로바이더 accent_color로,
 * 지어낸 VPC UUID·CIDR 캡션을 실 데이터(node.subnet)로 대체했다. 버튼 기반이라 키보드 포커스가
 * 기본으로 동작한다(그래프 뷰의 완전 접근 가능한 대안).
 * 2026-07-15: 서브넷 그룹 안을 실 데이터(node.tier)로 web→app→db 티어 서브그룹으로 한 번 더 나눠
 * 그래프 뷰와 동일한 Region → 서브넷 → 티어 계층이 트리에서도 읽히게 했다.
 */
import { Cpu, Database, Globe2, HardDrive, Lock, Network, Server, Unlock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Provider, TopologyNode } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtPctOrUnmeasured } from "@/components/ui/format";
import { nodeTypeLabel, statusTone } from "./topologyLabels";

interface TopologyTreeViewProps {
  nodes: TopologyNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  getProviderById: (id: string) => Provider | undefined;
}

/** 트리뷰 컨테이너/그래프 뷰와 동일한 높이 기준 — 뷰포트에 맞춰 크게, 최소 640px(§ 높이 확대). */
const TOPOLOGY_PANEL_HEIGHT = "h-[calc(100vh-260px)] min-h-[640px]";

const NODE_ICON: Record<string, LucideIcon> = {
  vm: Server,
  instance: Server,
  database: Database,
  storage: HardDrive,
};

const TIER_ORDER = ["web", "app", "db"] as const;
const TIER_LABEL: Record<string, string> = {
  web: "웹 티어",
  app: "앱 티어",
  db: "DB 티어",
};

interface TierGroup {
  key: string;
  label: string;
  nodes: TopologyNode[];
}

/** node.tier(실 데이터) 기준 web→app→db 순으로 묶는다. tier 없는/그 외 값은 "기타 자원"으로 뒤에 붙인다. */
function groupByTier(nodes: TopologyNode[]): TierGroup[] {
  const groups = new Map<string, TopologyNode[]>();
  for (const node of nodes) {
    const key = (node.tier || "other").toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }
  const knownKeys = TIER_ORDER.filter((key) => groups.has(key));
  const otherKeys = Array.from(groups.keys()).filter((key) => !TIER_ORDER.includes(key as (typeof TIER_ORDER)[number]));
  return [...knownKeys, ...otherKeys].map((key) => ({
    key,
    label: TIER_LABEL[key] ?? "기타 자원",
    nodes: groups.get(key) ?? [],
  }));
}

export function TopologyTreeView({ nodes, selectedNodeId, onSelectNode, getProviderById }: TopologyTreeViewProps) {
  const resources = nodes.filter((n) => n.type === "vm" || n.type === "instance" || n.type === "database");

  if (resources.length === 0) {
    return (
      <EmptyState
        variant="filtered"
        icon={Network}
        title="표시할 자원이 없습니다"
        description="현재 조회 범위에 가상 서버·데이터베이스 노드가 없습니다."
      />
    );
  }

  const byProvider = new Map<string, TopologyNode[]>();
  for (const node of resources) {
    const list = byProvider.get(node.provider) ?? [];
    list.push(node);
    byProvider.set(node.provider, list);
  }

  return (
    <div
      className={cn(
        TOPOLOGY_PANEL_HEIGHT,
        "overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-5 text-[12px]"
      )}
    >
      {Array.from(byProvider.entries()).map(([providerId, providerNodes]) => (
        <ProviderRegionBlock
          key={providerId}
          providerId={providerId}
          nodes={providerNodes}
          provider={getProviderById(providerId)}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
      ))}
    </div>
  );
}

interface ProviderRegionBlockProps {
  providerId: string;
  nodes: TopologyNode[];
  provider?: Provider;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

function ProviderRegionBlock({ providerId, nodes, provider, selectedNodeId, onSelectNode }: ProviderRegionBlockProps) {
  const accent = provider?.accent_color ?? "var(--muted)";
  const regionLabel = provider ? `${provider.display_name} · ${provider.region_label} [${provider.default_region}]` : providerId;

  const subnetGroups = new Map<string, TopologyNode[]>();
  for (const node of nodes) {
    const key = node.subnet || "미지정 서브넷";
    const list = subnetGroups.get(key) ?? [];
    list.push(node);
    subnetGroups.set(key, list);
  }

  return (
    <div className="mb-4 border-l-2 pl-4" style={{ borderColor: accent }}>
      <div className="mb-3 flex items-center gap-2 text-[13px] font-bold" style={{ color: accent }}>
        <Globe2 size={14} aria-hidden />
        {regionLabel}
      </div>
      <div className="space-y-3 border-l-2 border-[var(--border)] pl-4">
        {Array.from(subnetGroups.entries()).map(([subnetName, subnetNodes]) => {
          const isPublic = subnetName.toLowerCase().includes("pub");
          return (
            <div key={subnetName} className="space-y-2 border-l-2 border-[var(--border)] pl-4">
              <div className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
                {isPublic ? (
                  <Unlock size={12} className="text-[var(--muted)]" aria-hidden />
                ) : (
                  <Lock size={12} className="text-[var(--muted)]" aria-hidden />
                )}
                {subnetName}
                <span className="text-[10px] font-normal text-[var(--muted)]">({subnetNodes.length}개)</span>
              </div>
              <div className="space-y-2 pl-2">
                {groupByTier(subnetNodes).map((tierGroup) => (
                  <div key={tierGroup.key} className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {tierGroup.label}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {tierGroup.nodes.map((node) => (
                        <TreeNodeCard
                          key={node.id}
                          node={node}
                          provider={provider}
                          isSelected={selectedNodeId === node.id}
                          onSelect={() => onSelectNode(node.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TreeNodeCardProps {
  node: TopologyNode;
  provider?: Provider;
  isSelected: boolean;
  onSelect: () => void;
}

function TreeNodeCard({ node, provider, isSelected, onSelect }: TreeNodeCardProps) {
  const isWarning = node.status === "warning";
  const Icon = NODE_ICON[node.type] ?? Cpu;
  const [title, subtitle] = node.label.split("\n");
  const typeLabel = nodeTypeLabel(node.type, provider);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "flex items-center justify-between gap-2 rounded-[var(--radius-input)] border p-3 text-left transition-colors",
        isSelected
          ? "border-[var(--brand)] bg-[var(--brand)]/10"
          : isWarning
            ? "border-[var(--crit)]/40 bg-[var(--crit)]/5 hover:bg-[var(--crit)]/10"
            : "border-[var(--border)] bg-[var(--bg-2)]/40 hover:bg-[var(--bg-2)]"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon size={14} className="shrink-0 text-[var(--muted)]" aria-hidden />
        <div>
          <div className="font-semibold text-[var(--foreground)]">{title}</div>
          <div className="text-[10px] text-[var(--muted)]">{subtitle ?? typeLabel}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="inline-flex items-center gap-1.5">
          {isWarning && (
            <span
              className="live-pulse inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--crit)]"
              aria-hidden
            />
          )}
          <StatusBadge status={statusTone(node.status)} label={isWarning ? "경고" : "정상"} />
        </div>
        <div className="num mt-1 text-[10px] text-[var(--muted)]">
          CPU {fmtPctOrUnmeasured(node.cpu, 0)} · MEM {fmtPctOrUnmeasured(node.memory, 0)}
        </div>
      </div>
    </button>
  );
}
