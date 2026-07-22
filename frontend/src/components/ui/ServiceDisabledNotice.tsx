"use client";

/**
 * 과금 서비스(SCP Cloud Monitoring/Cloud Logging 등)가 미활성화 또는 권한없음 상태일 때
 * 데이터 영역에 표시하는 안내 — 빈 차트/빈 테이블로 오해받지 않게 한다
 * (§CEO 피드백: "빈 패널은 미구현처럼 보인다"). 메뉴/패널 자체는 호출부가 그대로 유지하고,
 * 이 컴포넌트는 데이터 영역만 대체한다.
 *
 * enabled:false → "미활성화(과금 서비스)" 안내. enabled:true && last_status:"forbidden" →
 * 별도의 "권한 없음" 안내(재시도로 해결되지 않는 계정 권한 문제이므로 문구를 분리한다).
 */
import { Lock, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ServiceStatus } from "@/lib/types";

interface ServiceDisabledNoticeProps {
  service: ServiceStatus;
  className?: string;
}

export function ServiceDisabledNotice({ service, className }: ServiceDisabledNoticeProps) {
  const router = useRouter();
  const isForbidden = service.enabled && service.last_status === "forbidden";

  if (isForbidden) {
    return (
      <EmptyState
        variant="onboarding"
        icon={ShieldAlert}
        title={`${service.display_name} 권한 없음`}
        description={`이 고객사 계정에 ${service.display_name} API 권한이 없습니다. 자격증명의 API 권한을 확인하거나 설정에서 연동 상태를 확인하십시오.`}
        action={{ label: "설정에서 확인", onClick: () => router.push("/console/settings") }}
        className={className}
      />
    );
  }

  return (
    <EmptyState
      variant="onboarding"
      icon={Lock}
      title={`${service.display_name} 미활성화(과금 서비스)`}
      description={`${service.display_name}은(는) 과금 서비스로 현재 비활성화되어 있습니다. 설정에서 활성화하면 이 고객사 계정에 요금이 발생할 수 있습니다.`}
      action={{ label: "설정에서 활성화", onClick: () => router.push("/console/settings") }}
      className={className}
    />
  );
}
