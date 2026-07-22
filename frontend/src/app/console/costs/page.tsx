"use client";

/**
 * 비용/FinOps 화면 — getCosts(KPI+추이) + getCostAnomalies(이상탐지) + getRightsizingRecommendations
 * + (선택) getMonthlyReport 미리보기. 통화는 원화(₩)만 사용한다(§헌법 3 순수 KRW 빌링).
 * 세 API는 서로 다른 패널이므로 하나가 실패해도 나머지는 독립적으로 렌더링한다(§8 partial failure).
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApiResource } from "@/hooks/useApiResource";
import { useProviders } from "@/hooks/useProviders";
import { getCostAnomalies, getCosts, getMonthlyReport, getRightsizingRecommendations } from "@/lib/api";
import { getParam, resolveActiveProviderId } from "@/lib/url-state";
import { GLOSSARY } from "@/lib/glossary";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { CostAnomalyList } from "@/components/costs/CostAnomalyList";
import { CostSummaryCards } from "@/components/costs/CostSummaryCards";
import { CostTrendChart } from "@/components/costs/CostTrendChart";
import { MonthlyReportPreview } from "@/components/costs/MonthlyReportPreview";
import { RightsizingTable } from "@/components/costs/RightsizingTable";

/**
 * lastUpdated 이후 경과 분 — Date.now()는 렌더/effect 본문에서 직접 호출하지 않고
 * (React Compiler purity 규칙) 타이머 콜백 안에서만 호출한다.
 */
function useMinutesAgo(since: Date | null): number | null {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!since) return;
    const tick = () => setMinutes((Date.now() - since.getTime()) / 60000);
    const timeoutId = setTimeout(tick, 0);
    const intervalId = setInterval(tick, 30000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [since]);

  return minutes;
}

export default function CostsPage() {
  const searchParams = useSearchParams();
  const { providers } = useProviders();

  const tenantParam = getParam(searchParams, "tenant");
  const providerId = resolveActiveProviderId(searchParams, providers);
  const tenantId = tenantParam || undefined;
  const provider = providerId || undefined;

  const costs = useApiResource(() => getCosts({ tenant_id: tenantId, provider }), [tenantId, provider]);
  const anomalies = useApiResource(() => getCostAnomalies({ tenant_id: tenantId, provider }), [tenantId, provider]);
  const rightsizing = useApiResource(
    () => getRightsizingRecommendations({ tenant_id: tenantId, provider }),
    [tenantId, provider]
  );
  // 월간 리포트는 AI 초안 성격이라 매 30초 폴링 대상이 아니다 — 최초 1회만 조회한다.
  const report = useApiResource(() => getMonthlyReport(), [], { intervalMs: false });

  const minutesAgo = useMinutesAgo(costs.lastUpdated);

  return (
    <div className="flex flex-col gap-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
            비용 관리 (FinOps)
          </h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            테넌트·프로바이더 범위의 비용 추이와 절감 추천입니다. 통화는 원화(₩)만 표기합니다.
          </p>
        </div>
        {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
      </header>

      {costs.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      )}

      {!costs.isLoading && costs.error && (
        <ErrorState
          cause="비용 데이터를 불러오지 못했습니다."
          remedy={`${costs.error.message} 잠시 후 다시 시도하십시오.`}
          onRetry={costs.refetch}
        />
      )}

      {!costs.isLoading && !costs.error && costs.data && (
        <>
          <CostSummaryCards
            monthlyTotal={costs.data.monthly_total}
            dailyAverage={costs.data.daily_average}
            dataSource={costs.data.data_source}
          />
          <CostTrendChart trends={costs.data.daily_trends} dataSource={costs.data.data_source} />
        </>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-1.5 font-semibold" style={{ font: "var(--text-h2)" }}>
          이상 비용 탐지
          <InfoTooltip label="이상 비용 탐지 설명">{GLOSSARY.cost_anomaly}</InfoTooltip>
        </h2>
        {anomalies.isLoading && <Skeleton height={80} />}
        {!anomalies.isLoading && anomalies.error && (
          <ErrorState
            cause="이상 비용 탐지 결과를 불러오지 못했습니다."
            remedy={`${anomalies.error.message} 잠시 후 다시 시도하십시오.`}
            onRetry={anomalies.refetch}
          />
        )}
        {!anomalies.isLoading && !anomalies.error && anomalies.data && anomalies.data.length > 0 && (
          <CostAnomalyList anomalies={anomalies.data} />
        )}
        {!anomalies.isLoading && !anomalies.error && anomalies.data && anomalies.data.length === 0 && (
          <p className="text-[13px] text-[var(--muted)]">최근 기간 동안 탐지된 이상 비용이 없습니다.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-1.5 font-semibold" style={{ font: "var(--text-h2)" }}>
          Rightsizing 추천
          <InfoTooltip label="Rightsizing 추천 설명">{GLOSSARY.rightsizing}</InfoTooltip>
        </h2>
        {rightsizing.isLoading && <Skeleton height={160} />}
        {!rightsizing.isLoading && rightsizing.error && (
          <ErrorState
            cause="Rightsizing 추천을 불러오지 못했습니다."
            remedy={`${rightsizing.error.message} 잠시 후 다시 시도하십시오.`}
            onRetry={rightsizing.refetch}
          />
        )}
        {!rightsizing.isLoading && !rightsizing.error && <RightsizingTable rows={rightsizing.data ?? []} />}
      </section>

      {!report.isLoading && !report.error && report.data?.report_markdown && (
        <MonthlyReportPreview markdown={report.data.report_markdown} />
      )}
    </div>
  );
}
