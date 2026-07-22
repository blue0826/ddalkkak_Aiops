/**
 * 숫자/시간 포매터 유틸 — 디자인 가이드 §6.4.
 * KPI 카드·테이블 숫자 셀·차트 눈금 표시는 항상 이 유틸을 거친다.
 * 통화는 원화(₩)만 지원한다 — 헌법 §3 "AIOPS 순수 KRW 빌링" 원칙, 달러 표기 금지.
 */

export function fmtLatency(ms: number): string {
  if (!Number.isFinite(ms)) return "-";
  if (Math.abs(ms) < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function fmtCount(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

export function fmtKRW(amount: number): string {
  if (!Number.isFinite(amount)) return "-";
  return `₩${Math.round(amount).toLocaleString("ko-KR")}`;
}

export function fmtPct(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(decimals)}%`;
}

/**
 * cpu/memory처럼 실측값이 없을 수 있는 지표 전용 포매터 - null/undefined면 "0%"이 아니라
 * "미측정"을 반환한다("0%(정상)"으로 오인되는 것을 막기 위함, §TopologyNode.cpu/memory 참조).
 * 값이 있으면 fmtPct와 동일하게 처리한다.
 */
export function fmtPctOrUnmeasured(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "미측정";
  return fmtPct(value, decimals);
}

/** 부호가 있는 증감률. 색상/아이콘은 붙이지 않는다 — 그건 DeltaBadge의 역할. */
export function fmtDelta(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}

export function fmtRelativeTime(minutesAgo: number): string {
  if (!Number.isFinite(minutesAgo) || minutesAgo < 1) return "방금 업데이트";
  if (minutesAgo < 60) return `${Math.round(minutesAgo)}분 전 업데이트`;
  return `${Math.round(minutesAgo / 60)}시간 전 업데이트`;
}

/** 차트 X축 틱 / 툴팁 라벨용 짧은 시각 포맷 (예: 14:32). 파싱 불가 값은 원본을 그대로 반환. */
export function fmtAxisTime(value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** 일 단위 데이터(예: 비용 일별 추이)용 짧은 날짜 포맷 (예: 7월 14일). 파싱 불가 값은 원본 반환. */
export function fmtAxisDate(value: string | number): string {
  // "YYYY-MM-DD" 문자열은 로컬 자정으로 파싱해 타임존에 따른 하루 밀림을 피한다.
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}
