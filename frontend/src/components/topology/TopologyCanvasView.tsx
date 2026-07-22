"use client";

/**
 * 토폴로지 그래프 뷰 — 결정론적 레이아웃(topologyLayout.ts)이 계산한 존/좌표를 Canvas에
 * 그린다(실제 드로잉은 topologyCanvasRender.ts에 위임, 파일 <500줄 유지를 위한 분리). 이
 * 컴포넌트는 마우스/키보드 입력·RAF 루프·리사이즈·reduced-motion 가드만 담당한다. 색상은 전부
 * canvasTokens.ts로 런타임에 CSS 토큰을 읽어와 사용한다(원시 hex 금지, §4.3).
 *
 * 2026-07-15 전면 재작업: 자유 force 물리를 제거하고 결정론적 레이아웃 + 은은한 idle
 * jitter(topologyPhysics.ts)로 교체했다(§자원맵이 서브넷/VPC에 안 맞는 문제 근본 수정).
 * 이에 따라 노드를 직접 드래그해 재배치하는 기능은 제거했다(레이아웃이 항상 정답이므로).
 * 캔버스 드로잉 버퍼 크기는 window resize뿐 아니라 ResizeObserver로 부모 컨테이너 크기
 * 변화(우측 상세패널 스플리터 드래그 등 레이아웃만 바뀌는 경우 포함)에도 반응한다.
 * prefers-reduced-motion이면 위치를 한 번만 정착(홈 좌표로 고정)시키고 계속 도는
 * requestAnimationFrame 루프를 걸지 않는다(§11 품질 기준). matchMedia change 이벤트를 구독해
 * OS 설정이 세션 중 바뀌어도 즉시 반영한다.
 */
import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import type { Provider, TopologyLink, TopologyNode } from "@/lib/types";
import { readCanvasTokens } from "./canvasTokens";
import { renderFrame } from "./topologyCanvasRender";
import { computeTopologyLayout, type LayoutRect, type ZoneBox } from "./topologyLayout";
import { applyIdleJitter, buildPhysicsNodes, findNodeAtPoint, type PhysicsNode } from "./topologyPhysics";

interface TopologyCanvasViewProps {
  nodes: TopologyNode[];
  links: TopologyLink[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  scpAccentColor: string;
  awsAccentColor: string;
  scpRegionCaption: string;
  awsRegionCaption: string;
  getProviderById: (id: string) => Provider | undefined;
}

/** clientHeight 측정이 아직 안정되지 않은 첫 프레임을 대비한 하한선(§ 높이 확대: 최소 640px). */
const MIN_CANVAS_HEIGHT = 640;

// 관제 월 효과는 OS reduced-motion이 아니라 앱 모션 토글(data-motion)을 따른다(기본 on).
function motionDisabled(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.motion === "off";
}

export function TopologyCanvasView({
  nodes,
  links,
  selectedNodeId,
  onSelectNode,
  scpAccentColor,
  awsAccentColor,
  scpRegionCaption,
  awsRegionCaption,
  getProviderById,
}: TopologyCanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<PhysicsNode[]>([]);
  const linksRef = useRef<TopologyLink[]>([]);
  const zonesRef = useRef<ZoneBox[]>([]);
  const hitRectsRef = useRef<Map<string, LayoutRect>>(new Map());
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const startPanRef = useRef({ x: 0, y: 0 });

  // RAF 루프(마운트 시 1회만 시작)가 재구독 없이 최신 선택/색상/프로바이더 값을 읽기 위한 ref.
  // ref는 렌더 중이 아니라 커밋 후 effect에서만 갱신한다(React Compiler purity 규칙).
  const latestRef = useRef({
    selectedNodeId,
    scpAccentColor,
    awsAccentColor,
    scpRegionCaption,
    awsRegionCaption,
    getProviderById,
  });
  useEffect(() => {
    latestRef.current = {
      selectedNodeId,
      scpAccentColor,
      awsAccentColor,
      scpRegionCaption,
      awsRegionCaption,
      getProviderById,
    };
  });

  const redrawStatic = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    renderFrame(ctx, canvas, nodesRef.current, linksRef.current, zonesRef.current, {
      tokens: readCanvasTokens(),
      selectedNodeId,
      zoom: zoomRef.current,
      offset: offsetRef.current,
      scpAccentColor,
      awsAccentColor,
      scpRegionCaption,
      awsRegionCaption,
      getProviderById,
      animate: false,
      hitRects: hitRectsRef.current,
    });
  };

  // 1. 캔버스 해상도를 부모 컨테이너의 실제 렌더 크기(폭·높이 모두)에 맞춘다. ResizeObserver를 써서
  // window 크기 자체는 그대로여도 우측 상세패널 스플리터 드래그처럼 flex 배분만 바뀌는 경우에도 반응한다.
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const handleResize = () => {
      canvas.width = parent.clientWidth;
      canvas.height = Math.max(parent.clientHeight, MIN_CANVAS_HEIGHT);
      if (motionDisabled()) redrawStatic();
    };
    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(parent);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. 토폴로지 데이터가 바뀌면 결정론적 레이아웃을 다시 계산한다. 레이아웃이 순수 함수이므로
  // 동일 데이터에서는 항상 동일 좌표가 나온다(구버전처럼 이전 위치를 보존할 필요가 없다).
  useEffect(() => {
    const layout = computeTopologyLayout(nodes, links);
    nodesRef.current = buildPhysicsNodes(nodes, layout);
    linksRef.current = links;
    zonesRef.current = layout.zones;
    if (motionDisabled()) redrawStatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links]);

  // 3. reduced-motion에서는 RAF 루프가 없으므로, 선택/색상 변경 시 별도로 다시 그려준다.
  useEffect(() => {
    if (motionDisabled()) redrawStatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, scpAccentColor, awsAccentColor, scpRegionCaption, awsRegionCaption, getProviderById]);

  const toWorld = (clientX: number, clientY: number) => ({
    x: (clientX - offsetRef.current.x) / zoomRef.current,
    y: (clientY - offsetRef.current.y) / zoomRef.current,
  });

  const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const world = toWorld(clientX, clientY);
    const hitId = findNodeAtPoint(hitRectsRef.current, world.x, world.y);
    if (hitId) {
      onSelectNode(hitId);
    } else {
      isPanningRef.current = true;
      startPanRef.current = { x: clientX - offsetRef.current.x, y: clientY - offsetRef.current.y };
    }
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isPanningRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    offsetRef.current = { x: clientX - startPanRef.current.x, y: clientY - startPanRef.current.y };
    if (motionDisabled()) redrawStatic();
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (nodesRef.current.length === 0) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const ids = nodesRef.current.map((n) => n.id);
    const currentIndex = selectedNodeId ? ids.indexOf(selectedNodeId) : -1;
    const nextIndex = e.key === "ArrowRight" ? (currentIndex + 1) % ids.length : (currentIndex - 1 + ids.length) % ids.length;
    onSelectNode(ids[nextIndex]);
  };

  // 4. RAF idle-jitter+드로잉 루프 — 마운트 시 1회만 구독(선택/색상 변경으로 재구독하지 않음,
  // latestRef로 최신값 반영). prefers-reduced-motion의 matchMedia change 이벤트를 직접 구독해
  // 세션 중 OS 설정이 바뀌어도 실제 reduce일 때만 멈추고, 그 외에는 은은한 idle 흔들림 루프를
  // 계속 돌린다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tokens = readCanvasTokens();

    const draw = (animate: boolean) => {
      const c = canvasRef.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const latest = latestRef.current;
      renderFrame(ctx, c, nodesRef.current, linksRef.current, zonesRef.current, {
        tokens,
        selectedNodeId: latest.selectedNodeId,
        zoom: zoomRef.current,
        offset: offsetRef.current,
        scpAccentColor: latest.scpAccentColor,
        awsAccentColor: latest.awsAccentColor,
        scpRegionCaption: latest.scpRegionCaption,
        awsRegionCaption: latest.awsRegionCaption,
        getProviderById: latest.getProviderById,
        animate,
        hitRects: hitRectsRef.current,
      });
    };

    let animId = 0;

    const settleOnce = () => {
      applyIdleJitter(nodesRef.current, 0);
      draw(false);
    };

    const loop = () => {
      applyIdleJitter(nodesRef.current, Date.now());
      draw(true);
      animId = requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      if (animId) cancelAnimationFrame(animId);
      animId = 0;
    };

    const applyMotionPreference = () => {
      stopLoop();
      if (motionDisabled()) {
        settleOnce();
      } else {
        animId = requestAnimationFrame(loop);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const worldBefore = toWorld(clientX, clientY);
      const scaleFactor = 1.08;
      zoomRef.current = e.deltaY < 0 ? Math.min(zoomRef.current * scaleFactor, 3.0) : Math.max(zoomRef.current / scaleFactor, 0.4);
      offsetRef.current = { x: clientX - worldBefore.x * zoomRef.current, y: clientY - worldBefore.y * zoomRef.current };
      if (motionDisabled()) draw(false);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    applyMotionPreference();
    window.addEventListener("aiops-motion", applyMotionPreference);

    return () => {
      stopLoop();
      window.removeEventListener("aiops-motion", applyMotionPreference);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div className="relative h-[calc(100vh-260px)] min-h-[640px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] select-none">
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="토폴로지 그래프 — 빈 공간 드래그로 화면 이동, 스크롤로 확대·축소, 자원 아이콘 또는 이름 클릭으로 선택, 방향키로 노드 선택 전환"
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onKeyDown={handleKeyDown}
        className="block h-full w-full cursor-grab active:cursor-grabbing"
      />
    </div>
  );
}
