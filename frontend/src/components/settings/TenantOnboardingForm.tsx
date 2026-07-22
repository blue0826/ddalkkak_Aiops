"use client";

/**
 * 고객사(테넌트) 온보딩 — 이름/ID + SCP 자격증명(선택)을 한 흐름으로 등록한다.
 * POST /tenants(관리자 전용) 성공 후, SCP 필드가 채워져 있으면 이어서 POST /credentials를 시도한다.
 * 자격증명 단계가 실패해도 고객사는 이미 생성된 상태로 남는다 — 인라인 경고로 안내하고,
 * 아래 고객사 목록의 [자격증명 관리](TenantCredentialPanel)에서 다시 시도할 수 있게 한다
 * (부분 실패를 롤백하지 않는다: 헌법과 무관하게 고객사 자체는 유효한 자원이다).
 * 409(중복 ID)는 alert() 대신 인라인 에러로 안내한다.
 * 상위(TenantManagementPanel)가 관리자에게만 이 컴포넌트를 마운트한다.
 */
import { useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { ApiError, createCredential, createTenant } from "@/lib/api";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  buildScpAuthData,
  emptyScpFields,
  isScpFieldsEmpty,
  isScpFieldsFilled,
  scpCredentialName,
  type ScpFieldsValue,
} from "./scpCredential";
import { ScpCredentialFields } from "./ScpCredentialFields";

const inputClass =
  "h-9 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-3 text-[13px] text-[var(--foreground)] disabled:opacity-50";

interface TenantOnboardingFormProps {
  /** 고객사(가능하면 자격증명까지) 등록이 끝난 뒤 신규 고객사 ID를 상위에 알린다. */
  onOnboarded: (tenantId: string) => void;
}

export function TenantOnboardingForm({ onOnboarded }: TenantOnboardingFormProps) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [scp, setScp] = useState<ScpFieldsValue>(emptyScpFields("kr-west1"));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const scpPartial = !isScpFieldsEmpty(scp) && !isScpFieldsFilled(scp);
  const canSubmit = !!id.trim() && !!name.trim() && !isSubmitting && !scpPartial;

  function patchScp(patch: Partial<ScpFieldsValue>) {
    setScp((cur) => ({ ...cur, ...patch }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setFormError(null);
    setWarning(null);
    setSuccess(null);

    const scpFilled = isScpFieldsFilled(scp);

    try {
      const created = await createTenant({ id: id.trim(), name: name.trim() });

      if (!scpFilled) {
        setSuccess(`${created.name}(${created.id}) 고객사가 등록되었습니다.`);
      } else {
        try {
          const cred = await createCredential({
            provider: "scp",
            name: scpCredentialName(scp),
            auth_data: buildScpAuthData(scp),
            tenant_id: created.id,
          });
          if (cred.tenant_id !== created.id) {
            setWarning(
              `${created.name}(${created.id}) 고객사는 등록되었지만, 자격증명이 예상과 다른 고객사(${cred.tenant_id})에 연결되었습니다. 아래 고객사 목록의 [자격증명 관리]에서 상태를 확인하십시오.`
            );
          } else {
            setSuccess(`${created.name}(${created.id}) 고객사와 SCP 자격증명이 함께 등록되었습니다.`);
          }
        } catch (credErr) {
          const message =
            credErr instanceof ApiError ? credErr.message : "자격증명 등록 중 알 수 없는 오류가 발생했습니다.";
          setWarning(
            `${created.name}(${created.id}) 고객사는 등록되었지만 자격증명 등록에 실패했습니다: ${message} 아래 고객사 목록의 [자격증명 관리]에서 다시 시도하십시오.`
          );
        }
      }

      setId("");
      setName("");
      setScp(emptyScpFields(scp.scpRegion));
      onOnboarded(created.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError("이미 존재하는 고객사 ID입니다.");
      } else {
        setFormError(err instanceof ApiError ? err.message : "고객사 온보딩 중 알 수 없는 오류가 발생했습니다.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ChartContainer
      title="고객사 추가"
      subtitle="고객사 정보와 SCP 자격증명(선택)을 한 번에 등록합니다. 자격증명은 지금 등록하지 않고 나중에 연결해도 됩니다."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
            고객사 ID
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={isSubmitting}
              placeholder="예: tenant-woori"
              autoComplete="off"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
            고객사 이름
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              placeholder="예: 우리카드"
              autoComplete="off"
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
            SCP 자격증명(선택) — AWS는 추후 지원
          </span>
          <ScpCredentialFields value={scp} onChange={patchScp} disabled={isSubmitting} />
          {scpPartial && (
            <p className="text-[12px] text-[var(--warn)]">
              Access Key/Secret Key/프로젝트 ID를 모두 입력하거나, 모두 비워두고 나중에 등록하십시오.
            </p>
          )}
        </div>

        <div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-[var(--radius-input)] bg-[var(--brand)] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
            고객사 등록
          </button>
        </div>
      </form>

      {formError && <ErrorState cause="고객사 온보딩에 실패했습니다." remedy={formError} className="mt-3" />}

      {warning && (
        <p className="mt-3 rounded-[var(--radius-card)] border border-[var(--warn)]/30 bg-[var(--warn)]/5 px-3 py-2 text-[12px] text-[var(--warn)]">
          {warning}
        </p>
      )}

      {success && (
        <p className="mt-3 rounded-[var(--radius-card)] border border-[var(--ok)]/30 bg-[var(--ok)]/5 px-3 py-2 text-[12px] text-[var(--ok)]">
          {success}
        </p>
      )}
    </ChartContainer>
  );
}
