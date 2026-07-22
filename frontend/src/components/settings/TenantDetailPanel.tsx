"use client";

/**
 * 고객사 상세 패널 — 목록에서 [수정]을 누르면 여는 마스터-디테일의 디테일(하단) 영역.
 * 이름 인라인 수정(PATCH /tenants/{id}) + 자격증명 관리(TenantCredentialPanel 재사용) +
 * 삭제(기존 InlineConfirmButton + 연쇄 삭제 경고 패턴 그대로 재사용)를 한 곳에서 처리한다.
 * id는 불변이므로 표시만 하고 수정 UI를 제공하지 않는다.
 */
import { useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { ApiError, updateTenant } from "@/lib/api";
import { ErrorState } from "@/components/ui/ErrorState";
import type { CloudCredential, Tenant } from "@/lib/types";
import { InlineConfirmButton } from "./InlineConfirmButton";
import { TenantCredentialPanel } from "./TenantCredentialPanel";
import { TenantServiceTogglePanel } from "./TenantServiceTogglePanel";

const nameInputClass =
  "h-9 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-0)] px-3 text-[13px] text-[var(--foreground)] disabled:opacity-50";

interface TenantDetailPanelProps {
  tenant: Tenant;
  /** 상위(TenantManagementPanel)가 이미 조회해둔 전체 자격증명 — TenantCredentialPanel이 필터링한다. */
  allCredentials: CloudCredential[];
  onClose: () => void;
  /** 이름 수정 성공 시 상위 고객사 목록을 다시 조회하도록 알린다. */
  onRenamed: () => void;
  /** 자격증명 연결/해제 성공 시 상위 자격증명 목록을 다시 조회하도록 알린다. */
  onCredentialsChanged: () => void;
  /** 삭제 확인 시 상위(TenantManagementPanel)의 공용 삭제 핸들러를 그대로 호출한다. */
  onDelete: (tenantId: string) => Promise<void> | void;
}

export function TenantDetailPanel({
  tenant,
  allCredentials,
  onClose,
  onRenamed,
  onCredentialsChanged,
  onDelete,
}: TenantDetailPanelProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(tenant.name);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEditing() {
    setNameDraft(tenant.name);
    setSaveError(null);
    setEditingName(true);
  }

  function cancelEditing() {
    setEditingName(false);
    setSaveError(null);
    setNameDraft(tenant.name);
  }

  async function handleSaveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setSaveError("고객사 이름을 입력하십시오.");
      return;
    }
    if (trimmed === tenant.name) {
      setEditingName(false);
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateTenant(tenant.id, { name: trimmed });
      setEditingName(false);
      onRenamed();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "고객사 이름 수정 중 알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">고객사 이름</span>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={isSaving}
                autoFocus
                autoComplete="off"
                className={nameInputClass}
              />
              <button
                type="button"
                onClick={handleSaveName}
                disabled={isSaving}
                aria-label="이름 저장"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-input)] bg-[var(--brand)] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check size={14} aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={isSaving}
                aria-label="이름 수정 취소"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-input)] border border-[var(--border)] hover:bg-[var(--bg-2)]"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-semibold" style={{ font: "var(--text-h2)" }}>
                {tenant.name}
              </span>
              <button
                type="button"
                onClick={startEditing}
                aria-label="고객사 이름 수정"
                className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)] text-[var(--muted)] transition-colors hover:bg-[var(--bg-2)]"
              >
                <Pencil size={13} aria-hidden />
              </button>
            </div>
          )}
          <span className="num text-[12px] text-[var(--muted)]">고객사 ID: {tenant.id}</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="고객사 상세 닫기"
          className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)] text-[var(--muted)] transition-colors hover:bg-[var(--bg-2)]"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {saveError && <ErrorState cause="고객사 이름 수정에 실패했습니다." remedy={saveError} />}

      <TenantCredentialPanel
        tenantId={tenant.id}
        title="자격증명 관리"
        subtitle={`${tenant.name}에 연결된 클라우드 자격증명을 관리합니다.`}
        allCredentials={allCredentials}
        onChanged={onCredentialsChanged}
      />

      <TenantServiceTogglePanel tenantId={tenant.id} tenantName={tenant.name} />

      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">위험 구역</span>
        <p className="text-[11px] text-[var(--muted)]">삭제 시 고객사와 연결된 자격증명이 모두 함께 삭제됩니다.</p>
        <div>
          <InlineConfirmButton
            label="고객사 삭제"
            confirmLabel="삭제"
            description={`${tenant.name} 고객사와 연결된 모든 데이터를 삭제합니다.`}
            onConfirm={() => onDelete(tenant.id)}
          />
        </div>
      </div>
    </div>
  );
}
