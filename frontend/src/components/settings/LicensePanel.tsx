"use client";

/** 라이선스 상태 카드 — GET /license. 설치된 Ed25519 서명 라이선스의 유효성/기한을 표시한다. */
import { getLicense } from "@/lib/api";
import { useApiResource } from "@/hooks/useApiResource";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { useMinutesAgo } from "./useMinutesAgo";

export function LicensePanel() {
  const { data, error, isLoading, lastUpdated, refetch } = useApiResource(() => getLicense(), [], {
    intervalMs: false,
  });
  const minutesAgo = useMinutesAgo(lastUpdated);

  return (
    <ChartContainer title="라이선스" subtitle="설치된 Ed25519 서명 라이선스 상태">
      {isLoading && <Skeleton height={88} />}
      {error && <ErrorState cause="라이선스 정보를 불러오지 못했습니다." remedy={error.message} onRetry={refetch} />}
      {!isLoading && !error && data && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">에디션</span>
              <span className="num font-semibold" style={{ font: "var(--text-h2)" }}>
                {data.edition}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">만료일</span>
              <span className="num text-[13px]">{data.expire_date}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">상태</span>
              <StatusBadge
                status={data.is_valid && !data.is_expired ? "ok" : "crit"}
                label={data.is_expired ? "만료됨" : !data.is_valid ? "유효하지 않음" : data.is_evaluation ? "평가판" : "유효"}
              />
            </div>
            {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
          </div>
          {data.error && <p className="text-[12px] text-[var(--warn)]">{data.error}</p>}
        </div>
      )}
    </ChartContainer>
  );
}
