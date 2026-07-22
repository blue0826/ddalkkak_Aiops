"use client";

/**
 * 로그 화면 컨트롤 — 레벨(info/warning/error) 필터 + 조회 개수(getLogs limit).
 * 컴포넌트 로컬 state로 관리한다 — 시간범위/테넌트/프로바이더처럼 다른 화면과 공유되는 상태가
 * 아니라 이 화면 전용 뷰 옵션이므로 URL 동기화 대상(§7.4)에서 제외한다.
 */
import { InfoTooltip } from "@/components/ui/InfoTooltip";

const LEVEL_OPTIONS = [
  { value: "", label: "전체 레벨" },
  { value: "info", label: "정보" },
  { value: "warning", label: "경고" },
  { value: "error", label: "에러" },
] as const;

const LIMIT_OPTIONS = [50, 100, 200, 500] as const;

interface LogFiltersProps {
  level: string;
  onLevelChange: (level: string) => void;
  limit: number;
  onLimitChange: (limit: number) => void;
}

export function LogFilters({ level, onLevelChange, limit, onLimitChange }: LogFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="logs-level-select">
        레벨
      </label>
      <select
        id="logs-level-select"
        value={level}
        onChange={(event) => onLevelChange(event.target.value)}
        className="h-8 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-2 text-[12px] text-[var(--foreground)]"
      >
        {LEVEL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <InfoTooltip label="로그 레벨 설명">
        정보(참고용) · 경고(주의가 필요한 상태) · 에러(장애로 이어질 수 있는 실패)를 구분해 필터링합니다.
      </InfoTooltip>

      <label className="sr-only" htmlFor="logs-limit-select">
        조회 개수
      </label>
      <select
        id="logs-limit-select"
        value={limit}
        onChange={(event) => onLimitChange(Number(event.target.value))}
        className="h-8 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-2 text-[12px] text-[var(--foreground)]"
      >
        {LIMIT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {`최근 ${option}건`}
          </option>
        ))}
      </select>
    </div>
  );
}
