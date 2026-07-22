"use client";

/**
 * 로그 화면 — getLogs({tenant,provider,limit}) → DataTable(§7.3).
 * 로그 실 API(Cloud Logging)는 아직 미검증이라 백엔드가 항목마다 data_source=SIMULATED를
 * 고정 반환한다(backend/app/schemas/monitor.py LogSchema) — 행마다 반복하지 않고
 * 페이지 상단에 전체 출처 배지 하나로 정직하게 표시한다.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApiResource } from "@/hooks/useApiResource";
import { useAuth } from "@/hooks/useAuth";
import { useProviders } from "@/hooks/useProviders";
import { useServiceStatus } from "@/hooks/useServiceStatus";
import { getLogs } from "@/lib/api";
import { getParam, resolveActiveProviderId } from "@/lib/url-state";
import { GLOSSARY } from "@/lib/glossary";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { ServiceDisabledNotice } from "@/components/ui/ServiceDisabledNotice";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { LogFilters } from "@/components/logs/LogFilters";
import { LogsTable, type LogRow } from "@/components/logs/LogsTable";

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

export default function LogsPage() {
  const searchParams = useSearchParams();
  const { providers } = useProviders();
  const { user } = useAuth();

  const tenantParam = getParam(searchParams, "tenant");
  const providerId = resolveActiveProviderId(searchParams, providers);

  const [level, setLevel] = useState("");
  const [limit, setLimit] = useState(100);

  const logsState = useApiResource(
    () => getLogs({ tenant_id: tenantParam || undefined, provider: providerId || undefined, limit }),
    [tenantParam, providerId, limit]
  );

  // 이 화면은 SCP Cloud Logging(과금 서비스)에 의존한다 — URL에 ?tenant=가 없으면(비관리자
  // 기본 경로) 본인 고객사(user.tenant_id)로 스코프를 대신한다. 미활성화/권한없음이면
  // 테이블 대신 안내로 데이터 영역을 대체한다(§CEO 지시: 필터는 유지하되 빈 테이블로
  // 오해받지 않게 한다).
  const serviceTenantId = tenantParam || user?.tenant_id;
  const serviceStatus = useServiceStatus(serviceTenantId);
  const loggingService = serviceStatus.data?.find((s) => s.service_key === "logging");
  const loggingUnavailable = Boolean(
    loggingService && (!loggingService.enabled || loggingService.last_status === "forbidden")
  );

  const rows = useMemo<LogRow[]>(() => {
    const source = logsState.data ?? [];
    const filtered = level ? source.filter((log) => log.level.toLowerCase() === level) : source;
    return filtered.map((log, index) => ({ ...log, _rowId: `${index}-${log.timestamp}-${log.node_id}` }));
  }, [logsState.data, level]);

  const overallDataSource = logsState.data?.[0]?.data_source;
  const minutesAgo = useMinutesAgo(logsState.lastUpdated);

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
            로그
          </h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">테넌트·프로바이더 범위의 최근 로그 스트림입니다.</p>
        </div>
        <div className="flex items-center gap-3">
          {overallDataSource && (
            <span className="flex items-center gap-1.5">
              <DataSourceBadge source={overallDataSource} />
              <InfoTooltip label="데이터 출처 설명">
                {overallDataSource === "REAL" ? GLOSSARY.data_source_real : GLOSSARY.data_source_simulated}
              </InfoTooltip>
            </span>
          )}
          {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
        </div>
      </header>

      <LogFilters level={level} onLevelChange={setLevel} limit={limit} onLimitChange={setLimit} />

      {loggingUnavailable && loggingService ? (
        <ServiceDisabledNotice service={loggingService} />
      ) : (
        <>
          {logsState.isLoading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} height={36} />
              ))}
            </div>
          )}

          {!logsState.isLoading && logsState.error && (
            <ErrorState
              cause="로그 조회에 실패했습니다."
              remedy={`${logsState.error.message} 잠시 후 다시 시도하십시오.`}
              onRetry={logsState.refetch}
            />
          )}

          {!logsState.isLoading && !logsState.error && (
            <LogsTable rows={rows} providers={providers} hasActiveFilter={Boolean(level)} />
          )}
        </>
      )}
    </div>
  );
}
