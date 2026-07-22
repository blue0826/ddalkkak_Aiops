/**
 * Canvas 2D는 CSS 커스텀 프로퍼티(var(--x))를 fillStyle/strokeStyle에 직접 쓸 수 없다.
 * 그리기 직전에 실제 계산값을 읽어와 하드코딩 hex 없이 토큰만 참조하게 한다(§4.3).
 * fallback 값은 globals.css :root의 동일 토큰과 항상 같게 유지할 것(useProviders.ts의
 * ACCENT_COLOR_FALLBACK과 동일한 패턴 — CSS 로드 전 첫 프레임 대비용일 뿐, 신뢰원은 항상 CSS).
 */
export interface CanvasTokens {
  ok: string;
  warn: string;
  crit: string;
  brand: string;
  border: string;
  bg0: string;
  bg1: string;
  muted: string;
  foreground: string;
  chart2: string;
  chart4: string;
  /** 캔버스 fillText는 var(--font-sans)를 못 읽으므로 body의 계산된 폰트 스택을 그대로 재사용한다. */
  fontFamily: string;
}

export function readCanvasTokens(): CanvasTokens {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    ok: read("--ok", "#22c55e"),
    warn: read("--warn", "#f59e0b"),
    crit: read("--crit", "#ef4444"),
    brand: read("--brand", "#3b82f6"),
    border: read("--border", "#1e293b"),
    bg0: read("--bg-0", "#060913"),
    bg1: read("--bg-1", "#0d121f"),
    muted: read("--muted", "#8b96a8"),
    foreground: read("--foreground", "#f8fafc"),
    chart2: read("--chart-2", "#38bdf8"),
    chart4: read("--chart-4", "#94a3b8"),
    fontFamily: getComputedStyle(document.body).fontFamily || "sans-serif",
  };
}

/** "#rrggbb" 형태 토큰 값에 알파를 입혀 Canvas용 rgba() 문자열로 바꾼다. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return hex;
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
