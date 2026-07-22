/** 관제 데이터가 실 클라우드 API에서만 온다는 점(시뮬레이션 데이터 없음)을 정직하게 설명하는 정적 안내. */
import { Info } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

export function DataSourceExplainer() {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
      <Info size={16} className="mt-0.5 shrink-0 text-[var(--muted)]" strokeWidth={1.75} aria-hidden />
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--foreground)]">
          데이터 출처 안내
          <InfoTooltip label="데이터 출처 설명">
            관제 데이터는 실 클라우드 API에서만 옵니다. 시뮬레이션(가짜) 데이터는 제공하지 않습니다.
          </InfoTooltip>
        </span>
        <p className="text-[13px] text-[var(--muted)]">
          관제 데이터는 <strong className="text-[var(--foreground)]">실 클라우드 API</strong>에서만 옵니다. 고객사에 SCP
          자격증명을 연결하기 전까지는 토폴로지·메트릭·로그·비용이 <strong className="text-[var(--foreground)]">모두 비어
          있습니다</strong>(시뮬레이션 데이터 없음). SCP 자격증명을 등록하면 실 Cloud Monitoring 연동이 시작되고, 이벤트·비용
          API 커버리지는 Phase 0 실측 완료 후 단계적으로 확대됩니다. AWS는 아직 실 API 어댑터가 없습니다.
        </p>
      </div>
    </div>
  );
}
