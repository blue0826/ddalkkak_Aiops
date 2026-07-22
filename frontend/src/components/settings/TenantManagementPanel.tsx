"use client";

/**
 * 설정 화면 "고객사 관리" 섹션 오케스트레이터 — 마스터(목록)-디테일(선택 고객사) 레이아웃.
 * 관리자(SYSTEM_ADMIN): 고객사 목록(TenantTable) + 온보딩 폼 토글(TenantOnboardingForm) +
 * 선택한 고객사의 상세(TenantDetailPanel: 이름 수정 + 자격증명 관리 + 삭제).
 * 비관리자(운영자/뷰어): 본인 고객사 자격증명 패널만 재사용해서 보여준다(TenantCredentialPanel).
 *
 * GET /tenants는 관리자 전용 엔드포인트라 비관리자일 때는 호출하지 않는다(useTenants.ts와 동일 방침).
 * GET /credentials는 역할 제한이 없고 서버가 이미 호출자 테넌트로 스코프하므로 항상 호출한다 —
 * 관리자(tenant_id="system")는 전체 고객사 자격증명을, 그 외는 본인 테넌트만 돌려받는다.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useApiResource } from "@/hooks/useApiResource";
import { ApiError, deleteTenant, getTenants, listCredentials } from "@/lib/api";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { TenantCredentialPanel } from "./TenantCredentialPanel";
import { TenantDetailPanel } from "./TenantDetailPanel";
import { TenantOnboardingForm } from "./TenantOnboardingForm";
import { TenantTable } from "./TenantTable";

export function TenantManagementPanel() {
  const { user, isAdmin } = useAuth();

  const {
    data: tenants,
    isLoading: tenantsLoading,
    error: tenantsError,
    refetch: refetchTenants,
  } = useApiResource(() => getTenants(), [], { intervalMs: false, enabled: isAdmin });

  const {
    data: credentials,
    isLoading: credsLoading,
    error: credsError,
    refetch: refetchCredentials,
  } = useApiResource(() => listCredentials(), [], { intervalMs: false });

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refetchAll() {
    refetchTenants();
    refetchCredentials();
  }

  async function handleDeleteTenant(id: string) {
    setDeleteError(null);
    try {
      await deleteTenant(id);
      if (selectedTenantId === id) setSelectedTenantId(null);
      refetchAll();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "고객사 삭제에 실패했습니다.");
    }
  }

  if (!isAdmin) {
    if (!user) return null;
    return (
      <TenantCredentialPanel
        tenantId={user.tenant_id}
        title="내 고객사 자격증명"
        subtitle="이 고객사에 연결된 클라우드 자격증명을 관리합니다."
        allCredentials={credentials ?? []}
        onChanged={refetchCredentials}
      />
    );
  }

  const selectedTenant = tenants?.find((t) => t.id === selectedTenantId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <button
          type="button"
          onClick={() => setShowOnboarding((cur) => !cur)}
          aria-expanded={showOnboarding}
          className="inline-flex items-center gap-2 rounded-[var(--radius-input)] bg-[var(--brand)] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus size={14} aria-hidden />
          고객사 추가
        </button>
      </div>

      {showOnboarding && (
        <TenantOnboardingForm
          onOnboarded={(newId) => {
            refetchAll();
            setSelectedTenantId(newId);
          }}
        />
      )}

      {deleteError && (
        <p role="alert" className="text-[12px] text-[var(--crit)]">
          {deleteError}
        </p>
      )}

      {tenantsLoading || credsLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : tenantsError || credsError ? (
        <ErrorState
          cause="고객사/자격증명 목록을 불러오지 못했습니다."
          remedy={(tenantsError ?? credsError)?.message ?? "다시 시도하십시오."}
          onRetry={refetchAll}
        />
      ) : (
        <TenantTable
          tenants={tenants ?? []}
          credentials={credentials ?? []}
          selectedTenantId={selectedTenantId}
          onSelect={(id) => setSelectedTenantId((cur) => (cur === id ? null : id))}
          onDelete={handleDeleteTenant}
        />
      )}

      {selectedTenant && (
        <TenantDetailPanel
          tenant={selectedTenant}
          allCredentials={credentials ?? []}
          onClose={() => setSelectedTenantId(null)}
          onRenamed={refetchTenants}
          onCredentialsChanged={refetchCredentials}
          onDelete={handleDeleteTenant}
        />
      )}
    </div>
  );
}
