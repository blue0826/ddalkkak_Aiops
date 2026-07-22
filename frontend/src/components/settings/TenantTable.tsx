"use client";

/**
 * 고객사 목록 테이블 — 이름/ID/연동 프로바이더 배지/상태 + [수정]/[삭제] 액션.
 * [수정]은 아래(TenantManagementPanel)의 마스터-디테일 상세 패널(TenantDetailPanel: 이름 수정 +
 * 자격증명 관리 + 삭제)을 연다 — 자격증명 관리도 그 상세 패널 안에서 함께 처리하므로 행에는
 * 별도 "자격증명 관리" 버튼을 두지 않는다.
 * 삭제는 alert()/confirm() 대신 행 안에서 인라인 2-Step 확인으로 처리한다(InlineConfirmButton).
 * DataTable은 고정 행높이(§7.3, h-9)를 쓰므로 확인 UI에는 설명 문구를 넣지 않는다 — 대신
 * 표 위에서 "삭제 시 자격증명도 함께 삭제된다"를 한 번 고지한다.
 */
import { Building2, Pencil } from "lucide-react";
import { useProviders } from "@/hooks/useProviders";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProviderBadge } from "@/components/ui/ProviderBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { CloudCredential, Tenant } from "@/lib/types";
import { InlineConfirmButton } from "./InlineConfirmButton";

interface TenantTableProps {
  tenants: Tenant[];
  credentials: CloudCredential[];
  selectedTenantId: string | null;
  onSelect: (tenantId: string) => void;
  onDelete: (tenantId: string) => Promise<void> | void;
}

export function TenantTable({ tenants, credentials, selectedTenantId, onSelect, onDelete }: TenantTableProps) {
  const { providers } = useProviders();

  const columns: DataTableColumn<Tenant>[] = [
    { key: "name", header: "고객사", render: (row) => <span className="font-medium">{row.name}</span> },
    { key: "id", header: "ID", render: (row) => <span className="num text-[var(--muted)]">{row.id}</span> },
    {
      key: "providers",
      header: "연동 프로바이더",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {providers.length === 0 && <span className="text-[var(--muted)]">-</span>}
          {providers.map((p) => {
            const connected = credentials.some((c) => c.tenant_id === row.id && c.provider === p.id);
            return connected ? (
              <ProviderBadge key={p.id} provider={p} />
            ) : (
              <span
                key={p.id}
                title={`${p.display_name} 미연동`}
                className="inline-flex items-center rounded-[var(--radius-badge)] border border-[var(--border)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted)] opacity-60"
              >
                {p.short_name}
              </span>
            );
          })}
        </div>
      ),
    },
    {
      key: "status",
      header: "상태",
      render: (row) => {
        const connected = credentials.some((c) => c.tenant_id === row.id);
        return connected ? <StatusBadge status="ok" label="연동" /> : <StatusBadge status="warn" label="미연동" />;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onSelect(row.id)}
            aria-pressed={selectedTenantId === row.id}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-input)] border px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-[var(--bg-2)]"
            style={{
              borderColor: selectedTenantId === row.id ? "var(--brand)" : "var(--border)",
              color: selectedTenantId === row.id ? "var(--brand)" : "var(--foreground)",
            }}
          >
            <Pencil size={12} aria-hidden />
            수정
          </button>
          <InlineConfirmButton label="삭제" confirmLabel="확인" onConfirm={() => onDelete(row.id)} />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-[var(--muted)]">삭제 시 고객사와 연결된 자격증명이 모두 함께 삭제됩니다.</p>
      <DataTable
        columns={columns}
        rows={tenants}
        getRowKey={(row) => row.id}
        emptyState={
          <EmptyState
            variant="onboarding"
            title="아직 등록된 고객사가 없습니다"
            description="위 '고객사 추가'에서 신규 고객사를 등록하십시오."
            icon={Building2}
          />
        }
      />
    </div>
  );
}
