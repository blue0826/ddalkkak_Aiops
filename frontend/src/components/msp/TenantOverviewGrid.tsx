"use client";

/**
 * MSP 전체 보기(고객사별, admin 전용) — GET /monitor/overview 기반 고객사 카드 그리드.
 * 카드 클릭 시 ?tenant=<id>&view=byTenant로 이동해 해당 고객사 상세 대시보드로 드릴다운한다
 * (FilterBar의 tenant 쿼리와 동일한 이름을 써서 상단 필터바 선택과 항상 동기화된다).
 * useApiResource 기본 폴링 주기를 그대로 따라 전역 실시간 갱신 리듬에 맞춘다.
 */
import { Building2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApiResource } from "@/hooks/useApiResource";
import { useProviders } from "@/hooks/useProviders";
import { getTenantOverview } from "@/lib/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import { useMinutesAgo } from "@/components/dashboard/useMinutesAgo";
import { TenantOverviewCard } from "./TenantOverviewCard";

export function TenantOverviewGrid() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { providers } = useProviders();

  const { data, error, isLoading, lastUpdated, refetch } = useApiResource(() => getTenantOverview(), []);
  const minutesAgo = useMinutesAgo(lastUpdated);

  const openTenant = (tenantId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tenant", tenantId);
    params.set("view", "byTenant");
    router.push(`${pathname}?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} height={172} />
        ))}
      </div>
    );
  }

  if (!data && error) {
    return (
      <ErrorState
        cause="고객사 전체 보기 조회에 실패했습니다."
        remedy={error.message || "잠시 후 다시 시도하십시오."}
        onRetry={refetch}
      />
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        variant="onboarding"
        icon={Building2}
        title="등록된 고객사가 없습니다"
        description="설정 화면에서 첫 고객사를 온보딩하면 이 화면에 카드로 표시됩니다."
        action={{ label: "설정으로 이동", onClick: () => router.push("/console/settings") }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((tenant) => (
          <TenantOverviewCard
            key={tenant.tenant_id}
            tenant={tenant}
            providers={providers}
            onClick={() => openTenant(tenant.tenant_id)}
          />
        ))}
      </div>
      {minutesAgo !== null && <StaleIndicator minutesAgo={minutesAgo} />}
    </div>
  );
}
