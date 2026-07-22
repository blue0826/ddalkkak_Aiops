/**
 * 토폴로지 그래프 Canvas 드로잉 — TopologyCanvasView.tsx에서 분리한 순수 드로잉 함수 모음
 * (React/DOM 이벤트 의존 없음, 파일 <500줄 유지를 위한 분리). 색상은 전부 canvasTokens.ts로
 * 런타임에 읽어온 CSS 토큰만 참조한다(원시 hex 금지, §4.3).
 *
 * 2026-07-15 전면 재작업: 존 사각형을 canvas 크기의 고정 비율이 아니라 topologyLayout.ts가
 * 계산한 ZoneBox.rect(콘텐츠 바운딩박스)로 그린다. 링크는 대비를 올리고 parent_child/
 * network_flow를 명확히 구분했으며, network_flow에는 source→target 흐름 입자 애니메이션을
 * 추가했다. 노드는 아이콘+라벨 pill 전체를 히트박스로 등록하고(자원명 클릭 지원), vpc/subnet은
 * 점 마커 대신 존 캡션 텍스트 자체를 히트박스로 등록한다(opts.hitRects, renderFrame이 매 프레임
 * 초기화 후 다시 채운다).
 */
import type { Provider, TopologyLink } from "@/lib/types";
import { withAlpha, type CanvasTokens } from "./canvasTokens";
import type { LayoutRect, ZoneBox } from "./topologyLayout";
import { nodeTypeLabel } from "./topologyLabels";
import type { PhysicsNode } from "./topologyPhysics";

export interface RenderOptions {
  tokens: CanvasTokens;
  selectedNodeId: string | null;
  zoom: number;
  offset: { x: number; y: number };
  scpAccentColor: string;
  awsAccentColor: string;
  scpRegionCaption: string;
  awsRegionCaption: string;
  getProviderById: (id: string) => Provider | undefined;
  animate: boolean;
  /** renderFrame이 매 프레임 clear 후 다시 채우는 클릭 판정용 히트박스(월드 좌표). */
  hitRects: Map<string, LayoutRect>;
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  nodes: PhysicsNode[],
  links: TopologyLink[],
  zones: ZoneBox[],
  opts: RenderOptions
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  opts.hitRects.clear();
  ctx.save();
  ctx.translate(opts.offset.x, opts.offset.y);
  ctx.scale(opts.zoom, opts.zoom);

  drawGrid(ctx, opts.tokens);
  drawZones(ctx, zones, opts);
  drawLinks(ctx, nodes, links, opts.tokens, opts.animate);
  drawNodes(ctx, nodes, opts);

  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, tokens: CanvasTokens) {
  ctx.strokeStyle = withAlpha(tokens.border, 0.6);
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = -1000; x < 3000; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, -1000);
    ctx.lineTo(x, 2500);
    ctx.stroke();
  }
  for (let y = -1000; y < 2500; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(-1000, y);
    ctx.lineTo(3000, y);
    ctx.stroke();
  }
}

function drawBox(ctx: CanvasRenderingContext2D, rect: LayoutRect, stroke: string, fill: string, lineWidth: number, dash: number[] | null) {
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = lineWidth;
  if (dash) ctx.setLineDash(dash);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (dash) ctx.setLineDash([]);
}

/** 존 캡션을 그리고, nodeId가 있으면(vpc/subnet 실 노드) 텍스트 영역을 클릭 히트박스로 등록한다. */
function drawCaption(
  ctx: CanvasRenderingContext2D,
  rect: LayoutRect,
  text: string,
  color: string,
  font: string,
  hitRects: Map<string, LayoutRect>,
  nodeId: string | null
) {
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.fillStyle = color;
  const paddingX = 15;
  const baselineY = rect.y + 20;
  ctx.fillText(text, rect.x + paddingX, baselineY);
  if (nodeId) {
    const textWidth = ctx.measureText(text).width;
    hitRects.set(nodeId, { x: rect.x + paddingX - 4, y: baselineY - 15, w: textWidth + 8, h: 21 });
  }
}

function drawZones(ctx: CanvasRenderingContext2D, zones: ZoneBox[], opts: RenderOptions) {
  const { tokens } = opts;
  for (const zone of zones) {
    const accent = zone.provider === "aws" ? opts.awsAccentColor : opts.scpAccentColor;
    const isSelected = opts.selectedNodeId === zone.id;

    if (zone.kind === "provider") {
      const caption = zone.provider === "aws" ? opts.awsRegionCaption : opts.scpRegionCaption;
      drawBox(ctx, zone.rect, withAlpha(accent, 0.32), withAlpha(tokens.bg0, 0.22), 2, [8, 4]);
      drawCaption(ctx, zone.rect, caption, withAlpha(accent, 0.9), `700 12px ${tokens.fontFamily}`, opts.hitRects, null);
    } else if (zone.kind === "vpc") {
      drawBox(ctx, zone.rect, withAlpha(accent, 0.5), withAlpha(accent, 0.045), 1.4, null);
      drawCaption(
        ctx,
        zone.rect,
        zone.label,
        isSelected ? tokens.brand : withAlpha(accent, 0.85),
        `700 11px ${tokens.fontFamily}`,
        opts.hitRects,
        zone.id
      );
    } else {
      const tierColor = zone.variant === "public" ? tokens.chart2 : zone.variant === "private" ? tokens.chart4 : tokens.muted;
      drawBox(ctx, zone.rect, withAlpha(tierColor, 0.32), withAlpha(tierColor, 0.06), 1, null);
      drawCaption(
        ctx,
        zone.rect,
        zone.label,
        isSelected ? tokens.brand : withAlpha(tierColor, 0.8),
        `600 10px ${tokens.fontFamily}`,
        opts.hitRects,
        zone.id
      );
    }
  }
}

/** parent_child=옅은 실선(구조), 그 외(network_flow/association)=강조 실선 + source→target 흐름 입자. */
function drawLinks(ctx: CanvasRenderingContext2D, nodes: PhysicsNode[], links: TopologyLink[], tokens: CanvasTokens, animate: boolean) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const now = Date.now();

  for (const link of links) {
    const n1 = byId.get(link.source);
    const n2 = byId.get(link.target);
    // vpc/subnet은 점 마커가 없으므로(존 박스로 표현) 그 노드를 잇는 링크는 그리지 않는다 —
    // 포함 관계는 이미 시각적으로 존 박스 안에 자원이 들어있는 것으로 표현되어 중복이다.
    if (!n1 || !n2) continue;

    const isWarning = n1.status === "warning" || n2.status === "warning";
    const isStructural = link.type === "parent_child";

    ctx.beginPath();
    ctx.moveTo(n1.x, n1.y);
    ctx.lineTo(n2.x, n2.y);
    if (isStructural) {
      ctx.strokeStyle = withAlpha(tokens.foreground, 0.24);
      ctx.lineWidth = 1.3;
    } else {
      ctx.strokeStyle = isWarning ? withAlpha(tokens.crit, 0.85) : withAlpha(tokens.chart2, 0.8);
      ctx.lineWidth = isWarning ? 2.6 : 2.2;
    }
    ctx.stroke();

    if (!animate || isStructural) continue;

    // 흐름 입자 2개를 위상차를 두고 source→target으로 이동시켜 데이터 흐름을 표현한다.
    const baseColor = isWarning ? tokens.crit : tokens.chart2;
    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const particleCount = 2;
    for (let i = 0; i < particleCount; i++) {
      const phase = i / particleCount;
      const progress = (now * 0.0011 + phase) % 1;
      const px = n1.x + dx * progress;
      const py = n1.y + dy * progress;
      ctx.save();
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 6;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  }
}

function nodeAccentColor(node: PhysicsNode, opts: RenderOptions): string {
  return node.provider === "aws" ? opts.awsAccentColor : opts.scpAccentColor;
}

/** 노드 라벨을 배경 pill과 함께 항상 그린다(호버 의존 금지) — 자원명(1행) + IP/타입(2행)을 상시 표시. 그려진 pill의 월드 좌표 사각형을 반환한다(히트박스 합성용). */
function drawNodeLabel(ctx: CanvasRenderingContext2D, node: PhysicsNode, title: string, subtitle: string, opts: RenderOptions): LayoutRect {
  const { tokens } = opts;
  const isSelected = opts.selectedNodeId === node.id;
  const titleFont = `700 11px ${tokens.fontFamily}`;
  const subtitleFont = `500 10px ${tokens.fontFamily}`;

  ctx.font = titleFont;
  const titleWidth = ctx.measureText(title).width;
  ctx.font = subtitleFont;
  const subtitleWidth = subtitle ? ctx.measureText(subtitle).width : 0;
  const textWidth = Math.max(titleWidth, subtitleWidth);

  const paddingX = 6;
  const lineHeight = 13;
  const pillW = textWidth + paddingX * 2;
  const pillH = subtitle ? lineHeight * 2 + 6 : lineHeight + 6;
  const pillX = node.x + 14;
  const pillY = node.y - pillH / 2;

  ctx.fillStyle = withAlpha(tokens.bg0, 0.82);
  ctx.strokeStyle = withAlpha(tokens.border, 0.85);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 4);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = isSelected ? tokens.brand : tokens.foreground;
  ctx.font = titleFont;
  ctx.fillText(title, pillX + paddingX, pillY + lineHeight - 1);
  if (subtitle) {
    ctx.fillStyle = withAlpha(tokens.muted, 0.95);
    ctx.font = subtitleFont;
    ctx.fillText(subtitle, pillX + paddingX, pillY + lineHeight * 2 + 2);
  }

  return { x: pillX, y: pillY, w: pillW, h: pillH };
}

function drawNodes(ctx: CanvasRenderingContext2D, nodes: PhysicsNode[], opts: RenderOptions) {
  const { tokens } = opts;
  for (const node of nodes) {
    const isWarning = node.status === "warning";
    const isSelected = opts.selectedNodeId === node.id;
    const accent = nodeAccentColor(node, opts);

    if (isWarning) {
      const glowRadius = opts.animate ? 16 + Math.sin(Date.now() * 0.007) * 4.5 : 18;
      ctx.fillStyle = withAlpha(tokens.crit, 0.16);
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = withAlpha(tokens.crit, 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (isSelected) {
      ctx.strokeStyle = tokens.brand;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 14.5, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // 노드 외곽 링은 프로바이더 액센트(SCP=blue/AWS=orange)로 그려 그래프 전체에서 소속을 한눈에 구분한다.
    ctx.fillStyle = tokens.foreground;
    ctx.strokeStyle = isWarning ? tokens.crit : accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 11, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = isWarning ? tokens.crit : tokens.bg0;
    ctx.lineWidth = 1.5;
    if (node.type === "database") {
      ctx.beginPath();
      ctx.ellipse(node.x, node.y - 3, 5, 2, 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(node.x - 5, node.y - 3);
      ctx.lineTo(node.x - 5, node.y + 3);
      ctx.arc(node.x, node.y + 3, 5, 0, Math.PI, false);
      ctx.lineTo(node.x + 5, node.y - 3);
      ctx.stroke();
    } else if (node.type === "vm" || node.type === "instance") {
      ctx.strokeRect(node.x - 5, node.y - 5, 10, 10);
      ctx.beginPath();
      ctx.moveTo(node.x - 3, node.y - 1);
      ctx.lineTo(node.x + 3, node.y - 1);
      ctx.moveTo(node.x - 3, node.y + 2);
      ctx.lineTo(node.x + 3, node.y + 2);
      ctx.stroke();
    } else if (node.type === "loadbalancer") {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(node.x - 5, node.y);
      ctx.lineTo(node.x + 5, node.y);
      ctx.moveTo(node.x, node.y - 5);
      ctx.lineTo(node.x, node.y + 5);
      ctx.stroke();
    } else {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    const [title, rawSubtitle] = (node.label || "").split("\n");
    const provider = opts.getProviderById(node.provider);
    const subtitle = rawSubtitle ?? nodeTypeLabel(node.type, provider);
    const labelRect = drawNodeLabel(ctx, node, title ?? "", subtitle, opts);

    // 클릭 히트박스 = 아이콘 원(반지름 14로 여유) ∪ 라벨 pill — "자원명 클릭"도 선택되게 한다.
    const iconRadius = 14;
    const hitX = Math.min(node.x - iconRadius, labelRect.x);
    const hitY = Math.min(node.y - iconRadius, labelRect.y);
    const hitRight = Math.max(node.x + iconRadius, labelRect.x + labelRect.w);
    const hitBottom = Math.max(node.y + iconRadius, labelRect.y + labelRect.h);
    opts.hitRects.set(node.id, { x: hitX, y: hitY, w: hitRight - hitX, h: hitBottom - hitY });
  }
}
