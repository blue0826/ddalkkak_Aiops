"use client";

/**
 * 프로바이더(SCP/AWS) 연동 상태 카드 — GET /providers 레지스트리 기반.
 * integration_mode를 정직하게 표기한다: REAL_CAPABLE(자격증명 등록 시 실 API 전환 가능) vs
 * SIMULATED(어댑터 미구현, 시뮬레이션만 제공). 하드코딩 금지 — 전부 useProviders()에서만 얻는다.
 */
import { useProviders } from "@/hooks/useProviders";
import { GLOSSARY } from "@/lib/glossary";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";

export function ProviderStatusPanel() {
  const { providers, isLoading, error, reload } = useProviders();

  return (
    <ChartContainer title="프로바이더 연동 상태" subtitle="테넌트에 연결된 클라우드 프로바이더의 실연동 여부">
      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
      )}
      {error && <ErrorState cause="프로바이더 레지스트리 조회에 실패했습니다." remedy={error} onRetry={reload} />}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold" style={{ font: "var(--text-h2)" }}>
                  {provider.display_name}
                  {provider.id === "scp" && (
                    <InfoTooltip label="SCP 설명">{GLOSSARY.provider_scp}</InfoTooltip>
                  )}
                  {provider.id === "aws" && (
                    <InfoTooltip label="AWS 설명">{GLOSSARY.provider_aws}</InfoTooltip>
                  )}
                </span>
                <DataSourceBadge source={provider.integration_mode === "REAL_CAPABLE" ? "REAL" : "SIMULATED"} />
              </div>
              <p className="text-[12px] text-[var(--muted)]">
                {provider.integration_mode === "REAL_CAPABLE"
                  ? "자격증명 등록 시 토폴로지/메트릭이 실 API로 전환됩니다."
                  : "시뮬레이션(실연동 예정) — 아직 실 API 어댑터가 구현되지 않았습니다."}
              </p>
            </div>
          ))}
        </div>
      )}
    </ChartContainer>
  );
}
