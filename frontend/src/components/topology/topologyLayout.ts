/**
 * 토폴로지 그래프 뷰의 결정론적(deterministic) 레이아웃 계산 — 순수 함수, DOM/Canvas 의존 없음.
 *
 * 2026-07-15 전면 재작업 배경: 기존 자유 force 물리(topologyPhysics.ts 구버전)는 척력·장력이
 * 매 프레임 누적되며 노드가 고정 비율로 그려지던 존(zone) 사각형 밖으로 흘러나가는 근본적인
 * 정렬 오류가 있었다("자원맵이 서브넷/VPC에 안 맞는다"). 이를 해결하기 위해 물리 시뮬레이션을
 * 완전히 제거하고, parent_child 링크 그래프를 따라 provider → VPC → subnet → tier 4단계
 * 계층을 구성한 뒤 각 서브넷 안에 노드를 그리드로 배치하는 결정론적 알고리즘으로 교체했다.
 *
 * 핵심 설계: 실 데이터(backend/app/services/simulator.py, simulator_data.py)를 확인한 결과
 * TopologyNode.subnet/tier 필드는 SCP 실서버 VM 주입 시에만 채워지고, 시뮬레이션 데이터는
 * vpc/subnet이 별도 노드(type: "vpc"/"subnet")로 존재하며 parent_child 링크로 자원과
 * 연결된다. 따라서 그룹핑은 필드가 아니라 parent_child 링크의 부모 체인을 타고 올라가
 * 가장 가까운 subnet(없으면 vpc) 조상을 찾는 방식으로 통일했다 — 실서버/시뮬레이션 데이터
 * 양쪽에서 동일하게 동작한다(실서버 VM도 parent_node로 기존 subnet 노드 id에 연결됨).
 *
 * 존 사각형(ZoneBox)은 canvas 크기의 고정 비율이 아니라, 그 그룹에 속한 노드들을 그리드로
 * 배치한 뒤 실제 바운딩박스+여백으로 산출한다 — "존이 노드를 감싸게" 하라는 요구사항의 핵심.
 * VPC/서브넷 노드 자신은 더 이상 점 마커로 그리지 않고(중복 표시 방지), 존 캡션 텍스트
 * 자체를 클릭 히트영역으로 등록해(topologyCanvasRender.ts) 상세 패널을 열 수 있게 한다.
 */
import type { TopologyLink, TopologyNode } from "@/lib/types";

export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SubnetVariant = "public" | "private" | "other";

export interface ZoneBox {
  /** vpc/subnet: 해당 구조 노드의 id. provider: 프로바이더 id(scp/aws) — 대응하는 노드가 없다(클릭 불가). */
  id: string;
  kind: "provider" | "vpc" | "subnet";
  provider: string;
  /** vpc/subnet은 노드의 실제 label(1행), provider는 provider id(호출부가 캡션 문자열로 치환). */
  label: string;
  variant?: SubnetVariant;
  rect: LayoutRect;
}

export interface LayoutResult {
  /** 점 마커로 그려지는 노드(자원·게이트웨이 등)의 world 좌표 anchor. vpc/subnet 노드는 포함하지 않는다. */
  anchors: Map<string, { x: number; y: number }>;
  /** provider → vpc → subnet 순서로 정렬됨(렌더가 이 순서대로 그려야 큰 박스가 작은 박스에 가려지지 않는다). */
  zones: ZoneBox[];
}

// ── 그리드 배치 상수 ─────────────────────────────────────────────────────
const NODE_PITCH_X = 150;
const NODE_PITCH_Y = 64;
const GRID_PAD_LEFT = 26;
const GRID_PAD_RIGHT = 14;
const GRID_LABEL_H = 36;
const GRID_PAD_BOTTOM = 16;
const MAX_COLS = 4;

const BLOCK_GAP = 20;
const VPC_PAD = 18;
const VPC_LABEL_H = 30;
const PROVIDER_PAD = 22;
const PROVIDER_LABEL_H = 32;
const PROVIDER_GAP_X = 44;
const PROVIDER_ORIGIN_X = 24;
const PROVIDER_ORIGIN_Y = 24;

interface GridResult {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

/** 문자열 id로부터 결정적 정렬 우선순위를 만들지는 않지만, 동일 입력에 항상 동일 결과를 보장하기 위해 배열 순회 순서(원본 nodes 순서)만 사용한다 — Math.random 등 비결정 요소 금지. */
function pushTo<K>(map: Map<K, TopologyNode[]>, key: K, node: TopologyNode): void {
  const list = map.get(key);
  if (list) list.push(node);
  else map.set(key, [node]);
}

function firstLine(label: string): string {
  return (label || "").split("\n")[0];
}

/** parent_child 링크만으로 childId → parentId 맵을 만든다(한 노드가 여러 부모를 가지면 첫 링크가 우선). */
function buildParentMap(links: TopologyLink[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const link of links) {
    if (link.type !== "parent_child") continue;
    if (!map.has(link.target)) map.set(link.target, link.source);
  }
  return map;
}

/** 부모 체인을 최대 8단계까지 타고 올라가 가장 가까운 subnet(없으면 vpc) 조상을 찾는다. */
function resolveGroup(
  nodeId: string,
  parentMap: Map<string, string>,
  nodeById: Map<string, TopologyNode>
): { kind: "subnet" | "vpc" | "orphan"; id?: string } {
  let cur = nodeId;
  for (let hops = 0; hops < 8; hops++) {
    const parentId = parentMap.get(cur);
    if (!parentId) return { kind: "orphan" };
    const parentNode = nodeById.get(parentId);
    if (!parentNode) return { kind: "orphan" };
    if (parentNode.type === "subnet") return { kind: "subnet", id: parentId };
    if (parentNode.type === "vpc") return { kind: "vpc", id: parentId };
    cur = parentId;
  }
  return { kind: "orphan" };
}

/** 서브넷 내 그리드 정렬 순서 — 엣지 인프라(LB/방화벽/게이트웨이) → web → app(vm 기본) → db → 스토리지. */
function memberRank(node: TopologyNode): number {
  const type = (node.type || "").toLowerCase();
  const tier = (node.tier || "").toLowerCase();
  if (type === "loadbalancer" || type === "firewall" || type === "gateway") return 0;
  if (tier === "web") return 1;
  if (tier === "db" || type === "database") return 3;
  if (type === "storage" || type === "object_storage" || type === "backup" || type === "nas") return 4;
  if (tier === "app") return 2;
  if (type === "vm" || type === "instance") return 2; // 티어 정보 없는 기본 vm은 app 취급(레거시 layerYFor 관례).
  return 2;
}

function subnetVariant(node: TopologyNode): SubnetVariant {
  const key = `${node.id} ${node.label}`.toLowerCase();
  if (key.includes("pub")) return "public";
  if (key.includes("priv")) return "private";
  return "other";
}

function subnetVariantRank(variant: SubnetVariant): number {
  return variant === "public" ? 0 : variant === "private" ? 1 : 2;
}

/** rank(계층) 순서대로 행을 나누고, 한 행 안에서는 MAX_COLS까지 채운 뒤 다음 행으로 넘긴다. */
function layoutGrid(members: TopologyNode[]): GridResult {
  if (members.length === 0) {
    return { positions: new Map(), width: GRID_PAD_LEFT + GRID_PAD_RIGHT + NODE_PITCH_X, height: GRID_LABEL_H + GRID_PAD_BOTTOM };
  }

  const ranked = members.map((n, i) => ({ n, i, rank: memberRank(n) })).sort((a, b) => a.rank - b.rank || a.i - b.i);

  const positions = new Map<string, { x: number; y: number }>();
  let row = 0;
  let col = 0;
  let colsUsed = 1;
  let prevRank = ranked[0].rank;

  for (const item of ranked) {
    if (item.rank !== prevRank) {
      row += 1;
      col = 0;
      prevRank = item.rank;
    }
    positions.set(item.n.id, {
      x: GRID_PAD_LEFT + col * NODE_PITCH_X + 12,
      y: GRID_LABEL_H + row * NODE_PITCH_Y + 14,
    });
    col += 1;
    colsUsed = Math.max(colsUsed, col);
    if (col >= MAX_COLS) {
      row += 1;
      col = 0;
    }
  }
  const rowsUsed = row + (col > 0 ? 1 : 0);

  return {
    positions,
    width: GRID_PAD_LEFT + Math.min(colsUsed, MAX_COLS) * NODE_PITCH_X + GRID_PAD_RIGHT,
    height: GRID_LABEL_H + rowsUsed * NODE_PITCH_Y + GRID_PAD_BOTTOM,
  };
}

function applyGridAnchors(
  anchors: Map<string, { x: number; y: number }>,
  grid: GridResult,
  originX: number,
  originY: number
): void {
  grid.positions.forEach((pos, id) => {
    anchors.set(id, { x: originX + pos.x, y: originY + pos.y });
  });
}

interface VpcSubnetPlacement {
  node: TopologyNode;
  variant: SubnetVariant;
  originX: number;
  originY: number;
  grid: GridResult;
}

interface VpcContent {
  width: number;
  height: number;
  perimeter: { originX: number; originY: number; grid: GridResult } | null;
  subnets: VpcSubnetPlacement[];
}

/** VPC 하나의 내용(직속 멤버 페리미터 행 + 서브넷들을 세로로 스택) 크기를 계산한다. */
function layoutVpcContent(directMembers: TopologyNode[], subnetNodes: TopologyNode[], bySubnetMembers: Map<string, TopologyNode[]>): VpcContent {
  const perimeterGrid = directMembers.length ? layoutGrid(directMembers) : null;
  const orderedSubnets = [...subnetNodes].sort(
    (a, b) => subnetVariantRank(subnetVariant(a)) - subnetVariantRank(subnetVariant(b))
  );

  let cursorY = VPC_LABEL_H;
  let contentWidth = perimeterGrid ? perimeterGrid.width : 0;
  const subnets: VpcSubnetPlacement[] = [];
  let perimeter: VpcContent["perimeter"] = null;

  if (perimeterGrid) {
    perimeter = { originX: VPC_PAD, originY: cursorY, grid: perimeterGrid };
    cursorY += perimeterGrid.height + BLOCK_GAP;
  }

  for (const subnetNode of orderedSubnets) {
    const grid = layoutGrid(bySubnetMembers.get(subnetNode.id) ?? []);
    subnets.push({ node: subnetNode, variant: subnetVariant(subnetNode), originX: VPC_PAD, originY: cursorY, grid });
    contentWidth = Math.max(contentWidth, grid.width);
    cursorY += grid.height + BLOCK_GAP;
  }

  const hasContent = perimeterGrid || subnets.length > 0;
  const height = (hasContent ? cursorY - BLOCK_GAP : cursorY) + VPC_PAD;
  const width = VPC_PAD * 2 + Math.max(contentWidth, 160);

  return { width, height: Math.max(height, VPC_LABEL_H + VPC_PAD + 60), perimeter, subnets };
}

type ProviderBlock =
  | { kind: "vpc"; node: TopologyNode; content: VpcContent }
  | { kind: "subnet"; node: TopologyNode; grid: GridResult; variant: SubnetVariant };

/** 프로바이더 하나에 속한 vpc/(부모 없는) 느슨한 subnet 블록을 원본 노드 배열 순서대로 세로 스택한다. */
function layoutProviderContent(blocks: ProviderBlock[]): {
  width: number;
  height: number;
  placed: Array<{ block: ProviderBlock; originX: number; originY: number }>;
} {
  let cursorY = PROVIDER_LABEL_H;
  let contentWidth = 0;
  const placed: Array<{ block: ProviderBlock; originX: number; originY: number }> = [];

  for (const block of blocks) {
    const w = block.kind === "vpc" ? block.content.width : block.grid.width;
    const h = block.kind === "vpc" ? block.content.height : block.grid.height;
    placed.push({ block, originX: PROVIDER_PAD, originY: cursorY });
    contentWidth = Math.max(contentWidth, w);
    cursorY += h + BLOCK_GAP;
  }

  const height = (placed.length ? cursorY - BLOCK_GAP : cursorY) + PROVIDER_PAD;
  const width = PROVIDER_PAD * 2 + Math.max(contentWidth, 240);
  return { width, height: Math.max(height, PROVIDER_LABEL_H + PROVIDER_PAD + 80), placed };
}

/** 노드 배열에 등장하는 순서대로 프로바이더 목록을 만든다(scp/aws를 우선하되, 그 외 값도 방어적으로 지원). */
function uniqueProvidersInOrder(nodes: TopologyNode[]): string[] {
  const preferred = ["scp", "aws"];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const p of preferred) {
    if (nodes.some((n) => n.provider === p)) {
      ordered.push(p);
      seen.add(p);
    }
  }
  for (const n of nodes) {
    if (!seen.has(n.provider)) {
      seen.add(n.provider);
      ordered.push(n.provider);
    }
  }
  return ordered;
}

function buildProviderBlocks(
  providerId: string,
  nodes: TopologyNode[],
  subnetParentVpc: Map<string, string | null>,
  bySubnetMembers: Map<string, TopologyNode[]>,
  byVpcDirect: Map<string, TopologyNode[]>,
  subnetNodesByVpc: Map<string, TopologyNode[]>
): ProviderBlock[] {
  const blocks: ProviderBlock[] = [];
  for (const n of nodes) {
    if (n.provider !== providerId) continue;
    if (n.type === "vpc") {
      const subnetsOfVpc = subnetNodesByVpc.get(n.id) ?? [];
      blocks.push({
        kind: "vpc",
        node: n,
        content: layoutVpcContent(byVpcDirect.get(n.id) ?? [], subnetsOfVpc, bySubnetMembers),
      });
    } else if (n.type === "subnet" && !subnetParentVpc.get(n.id)) {
      // 부모 VPC를 찾지 못한 서브넷(방어적 케이스) — VPC 래핑 없이 프로바이더 존 바로 아래 독립 박스로 표시.
      blocks.push({ kind: "subnet", node: n, grid: layoutGrid(bySubnetMembers.get(n.id) ?? []), variant: subnetVariant(n) });
    }
  }
  return blocks;
}

/**
 * 토폴로지 전체의 결정론적 레이아웃을 계산한다.
 * canvas 크기에 의존하지 않는다 — 존 크기는 순수하게 콘텐츠(자식 노드 수)로 결정되고,
 * 화면에 다 안 들어가는 경우는 기존 pan/zoom(TopologyCanvasView)으로 탐색한다.
 */
export function computeTopologyLayout(nodes: TopologyNode[], links: TopologyLink[]): LayoutResult {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const parentMap = buildParentMap(links);

  const vpcNodes = nodes.filter((n) => n.type === "vpc");
  const subnetNodes = nodes.filter((n) => n.type === "subnet");
  const memberNodes = nodes.filter((n) => n.type !== "vpc" && n.type !== "subnet");

  const subnetParentVpc = new Map<string, string | null>();
  const subnetNodesByVpc = new Map<string, TopologyNode[]>();
  for (const s of subnetNodes) {
    const vpcId = parentMap.get(s.id) ?? null;
    const parentIsVpc = vpcId ? nodeById.get(vpcId)?.type === "vpc" : false;
    subnetParentVpc.set(s.id, parentIsVpc ? vpcId : null);
    if (parentIsVpc && vpcId) pushTo(subnetNodesByVpc, vpcId, s);
  }

  const bySubnetMembers = new Map<string, TopologyNode[]>();
  const byVpcDirect = new Map<string, TopologyNode[]>();
  const orphans: TopologyNode[] = [];
  for (const n of memberNodes) {
    const group = resolveGroup(n.id, parentMap, nodeById);
    if (group.kind === "subnet" && group.id) pushTo(bySubnetMembers, group.id, n);
    else if (group.kind === "vpc" && group.id) pushTo(byVpcDirect, group.id, n);
    else orphans.push(n);
  }

  const providerIds = uniqueProvidersInOrder(nodes);
  const zones: ZoneBox[] = [];
  const anchors = new Map<string, { x: number; y: number }>();

  let cursorX = PROVIDER_ORIGIN_X;
  for (const providerId of providerIds) {
    const blocks = buildProviderBlocks(providerId, vpcNodes.concat(subnetNodes), subnetParentVpc, bySubnetMembers, byVpcDirect, subnetNodesByVpc);
    const content = layoutProviderContent(blocks);
    const originX = cursorX;
    const originY = PROVIDER_ORIGIN_Y;

    zones.push({
      id: providerId,
      kind: "provider",
      provider: providerId,
      label: providerId,
      rect: { x: originX, y: originY, w: content.width, h: content.height },
    });

    for (const placed of content.placed) {
      const blockX = originX + placed.originX;
      const blockY = originY + placed.originY;

      if (placed.block.kind === "vpc") {
        const { node: vpcNode, content: vpcContent } = placed.block;
        zones.push({
          id: vpcNode.id,
          kind: "vpc",
          provider: providerId,
          label: firstLine(vpcNode.label) || vpcNode.id,
          rect: { x: blockX, y: blockY, w: vpcContent.width, h: vpcContent.height },
        });

        if (vpcContent.perimeter) {
          applyGridAnchors(anchors, vpcContent.perimeter.grid, blockX + vpcContent.perimeter.originX, blockY + vpcContent.perimeter.originY);
        }
        for (const sub of vpcContent.subnets) {
          const subX = blockX + sub.originX;
          const subY = blockY + sub.originY;
          zones.push({
            id: sub.node.id,
            kind: "subnet",
            provider: providerId,
            label: firstLine(sub.node.label) || sub.node.id,
            variant: sub.variant,
            rect: { x: subX, y: subY, w: sub.grid.width, h: sub.grid.height },
          });
          applyGridAnchors(anchors, sub.grid, subX, subY);
        }
      } else {
        const { node: subnetNode, grid, variant } = placed.block;
        zones.push({
          id: subnetNode.id,
          kind: "subnet",
          provider: providerId,
          label: firstLine(subnetNode.label) || subnetNode.id,
          variant,
          rect: { x: blockX, y: blockY, w: grid.width, h: grid.height },
        });
        applyGridAnchors(anchors, grid, blockX, blockY);
      }
    }

    cursorX += content.width + PROVIDER_GAP_X;
  }

  // 부모 체인이 전혀 없는 고아 노드(예: 레거시 "internet" 타입) — 모든 존 위 상단에 일렬로 배치.
  orphans.forEach((n, i) => {
    anchors.set(n.id, { x: PROVIDER_ORIGIN_X + 30 + i * NODE_PITCH_X, y: 16 });
  });

  return { anchors, zones };
}
