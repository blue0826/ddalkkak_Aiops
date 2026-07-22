/**
 * 토폴로지 그래프 뷰의 노드 상태 — 2026-07-15 전면 재작업으로 자유 force 물리(척력/장력/댐핑)를
 * 완전히 제거했다. 위치는 topologyLayout.ts가 계산한 결정론적 anchor(홈 좌표)를 그대로 쓰고,
 * 여기서는 "살아있는 느낌"을 위한 은은한 idle 흔들림(sin/cos 기반, 매 프레임 홈 좌표에서 다시
 * 계산하므로 절대 발산하지 않는다)만 얹는다. 진폭(JITTER_AMPLITUDE)이 존 여백보다 훨씬 작아
 * 노드가 자기 서브넷/VPC 박스를 벗어나는 일이 구조적으로 불가능하다.
 *
 * 클릭 판정도 반지름 기반 findNodeAt에서, 렌더가 매 프레임 채우는 히트박스 맵(아이콘+라벨 pill
 * 전체를 감싸는 사각형, vpc/subnet은 캡션 텍스트 영역) 기반 findNodeAtPoint로 교체했다 —
 * "자원명을 클릭해도 선택되게" 요구사항 대응.
 */
import type { TopologyNode } from "@/lib/types";
import type { LayoutRect, LayoutResult } from "./topologyLayout";

export interface PhysicsNode extends TopologyNode {
  x: number;
  y: number;
  /** topologyLayout.ts가 계산한 결정론적 홈 좌표 — idle jitter의 중심점. */
  homeX: number;
  homeY: number;
}

/**
 * layout.anchors에 홈 좌표가 있는 노드(자원/게이트웨이 등 점 마커 노드)만 PhysicsNode로 만든다.
 * vpc/subnet 타입은 존 박스 자체로 표현되므로 점 마커를 갖지 않는다(topologyLayout.ts 설계 참고).
 */
export function buildPhysicsNodes(nodes: TopologyNode[], layout: LayoutResult): PhysicsNode[] {
  const result: PhysicsNode[] = [];
  for (const n of nodes) {
    const anchor = layout.anchors.get(n.id);
    if (!anchor) continue;
    result.push({ ...n, homeX: anchor.x, homeY: anchor.y, x: anchor.x, y: anchor.y });
  }
  return result;
}

/** 문자열 id로부터 결정적 0~1 시드를 만든다 — 노드마다 다른 위상으로 은은히 떠다니게 한다. */
function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 10007;
  return h / 10007;
}

/** 존 여백(최소 14px)보다 훨씬 작게 잡아 항상 자기 그리드 셀/존 안에 머물게 한다. */
const JITTER_AMPLITUDE = 2.4;

/**
 * 매 프레임(RAF의 time=Date.now() 기준) 노드 위치를 홈 좌표 + 은은한 부유로 갱신한다.
 * time<=0(reduced-motion 정착 패스)이면 완전히 정지한 홈 좌표로 고정한다 — 적분(속도) 없이
 * 매번 홈 좌표에서 다시 계산하므로 절대 발산하지 않는다(구버전 force 물리의 근본 문제 해결).
 */
export function applyIdleJitter(nodes: PhysicsNode[], time = 0): void {
  for (const n of nodes) {
    if (time <= 0) {
      n.x = n.homeX;
      n.y = n.homeY;
      continue;
    }
    const seed = seedFromId(n.id) * Math.PI * 2;
    n.x = n.homeX + Math.sin(time * 0.0009 + seed) * JITTER_AMPLITUDE;
    n.y = n.homeY + Math.cos(time * 0.0013 + seed * 1.7) * JITTER_AMPLITUDE;
  }
}

/** world 좌표(worldX, worldY)를 포함하는 히트박스를 가진 노드 id를 찾는다(없으면 undefined). */
export function findNodeAtPoint(hitRects: Map<string, LayoutRect>, worldX: number, worldY: number): string | undefined {
  for (const [id, rect] of hitRects) {
    if (worldX >= rect.x && worldX <= rect.x + rect.w && worldY >= rect.y && worldY <= rect.y + rect.h) {
      return id;
    }
  }
  return undefined;
}
