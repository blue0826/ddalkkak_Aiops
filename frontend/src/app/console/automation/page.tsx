import { Zap } from "lucide-react";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { GLOSSARY } from "@/lib/glossary";
import { RoleBanner } from "@/components/automation/RoleBanner";
import { DetectionPanel } from "@/components/automation/DetectionPanel";
import { NetworkPanel } from "@/components/automation/NetworkPanel";
import { SecOpsPanel } from "@/components/automation/SecOpsPanel";
import { DiskPredictionPanel } from "@/components/automation/DiskPredictionPanel";

/**
 * 자동화 — L2~L5 운영 액션 허브(탐지 실행 / 네트워크 이중화 / SecOps 차단 / 디스크 포화 예측).
 * 상태변경 액션은 운영자·관리자만 가능하며(RoleBanner + 각 패널의 useCanAct), 뷰어는 읽기만 한다.
 * 이 화면 데이터는 대부분 SIMULATED이므로 상단 배지로 정직하게 표기한다.
 */
export default function AutomationPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-[var(--muted)]" strokeWidth={1.75} aria-hidden />
          <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
            자동화
          </h1>
          <DataSourceBadge source="SIMULATED" />
          <InfoTooltip label="데이터 출처 설명">{GLOSSARY.data_source_simulated}</InfoTooltip>
        </div>
        <RoleBanner />
      </header>

      <p className="flex max-w-2xl items-start gap-1.5 text-[13px] text-[var(--muted)]">
        <span>
          L2~L5 운영 액션 허브입니다. AI가 추천한 조치는 사람이 승인해야 실행됩니다(L5 인시던트 화면 참고) — 아래
          액션들은 확인 후 즉시 실행되는 운영 도구이므로 신중히 사용하십시오.
        </span>
        <InfoTooltip label="L5 자동조치 흐름 설명">{GLOSSARY.l5_flow}</InfoTooltip>
      </p>

      <DetectionPanel />
      <NetworkPanel />
      <SecOpsPanel />
      <DiskPredictionPanel />
    </div>
  );
}
