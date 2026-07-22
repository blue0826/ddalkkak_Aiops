"use client";

/**
 * 고객사별(또는 본인 고객사) 자격증명 관리 — 목록 + SCP 자격증명 연결/해제.
 * 관리자는 임의 고객사에, 운영자는 본인 고객사에만 연결한다 — 둘 다 이 컴포넌트를 재사용한다
 * (TenantManagementPanel이 tenantId/allCredentials로 스코프를 결정한다).
 *
 * tenant_id는 항상 명시적으로 함께 보내지만(POST /credentials body.tenant_id), 백엔드가 이를
 * 아직 지원하지 않아 호출자 자신의 테넌트로 저장될 수 있다 — 응답의 tenant_id를 의도한 대상과
 * 대조해 불일치 시 정직하게 경고한다(하드코딩된 성공 문구로 실패를 감추지 않는다는 원칙,
 * DataSourceBadge와 동일한 정직성 기조).
 */
import { useState } from "react";
import { KeyRound, Link2, Loader2, X } from "lucide-react";
import { useProviders } from "@/hooks/useProviders";
import { ApiError, createCredential, deleteCredential } from "@/lib/api";
import { GLOSSARY } from "@/lib/glossary";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { CloudCredential } from "@/lib/types";
import { InlineConfirmButton } from "./InlineConfirmButton";
import { useCanAct } from "./permissions";
import {
  buildScpAuthData,
  emptyScpFields,
  isScpFieldsFilled,
  scpCredentialName,
  type ScpFieldsValue,
} from "./scpCredential";
import { ScpCredentialFields } from "./ScpCredentialFields";

interface TenantCredentialPanelProps {
  tenantId: string;
  title: string;
  subtitle: string;
  /** 관리자 화면에서 패널을 닫을 때만 지정한다(self-service 모드는 항상 열려 있다). */
  onClose?: () => void;
  /** 상위(TenantManagementPanel)가 이미 조회해둔 전체 자격증명 — 이 패널은 tenantId로 필터링만 한다. */
  allCredentials: CloudCredential[];
  /** 연결/해제 성공 시 상위 목록을 다시 조회하도록 알린다. */
  onChanged: () => void;
}

export function TenantCredentialPanel({
  tenantId,
  title,
  subtitle,
  onClose,
  allCredentials,
  onChanged,
}: TenantCredentialPanelProps) {
  const { canAct, roleLabel } = useCanAct();
  const { providers } = useProviders();
  const scpProvider = providers.find((p) => p.id === "scp");

  const credentials = allCredentials.filter((c) => c.tenant_id === tenantId);

  const [connecting, setConnecting] = useState(false);
  const [scp, setScp] = useState<ScpFieldsValue>(emptyScpFields(scpProvider?.default_region ?? "kr-west1"));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [detachError, setDetachError] = useState<string | null>(null);

  function patchScp(patch: Partial<ScpFieldsValue>) {
    setScp((cur) => ({ ...cur, ...patch }));
  }

  const canSubmit = canAct && isScpFieldsFilled(scp) && !isSubmitting;

  async function handleConnect() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setFormError(null);
    setWarning(null);
    setSuccess(null);
    try {
      const result = await createCredential({
        provider: "scp",
        name: scpCredentialName(scp),
        auth_data: buildScpAuthData(scp),
        tenant_id: tenantId,
      });
      if (result.tenant_id !== tenantId) {
        setWarning(
          `등록은 성공했지만 예상과 다른 고객사(${result.tenant_id})에 연결되었습니다 — 백엔드 자격증명 API가 아직 관리자 지정 tenant_id를 지원하지 않습니다. 백엔드 담당자에게 보고하십시오.`
        );
      } else {
        setSuccess(`${result.name} 연결 완료 — 다음 토폴로지/메트릭 조회부터 실 SCP API 연동을 시도합니다.`);
      }
      setConnecting(false);
      setScp(emptyScpFields(scp.scpRegion));
      onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "자격증명 연결 중 알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDetach(id: number) {
    setDetachError(null);
    try {
      await deleteCredential(id);
      onChanged();
    } catch (err) {
      setDetachError(err instanceof ApiError ? err.message : "자격증명 해제에 실패했습니다.");
    }
  }

  return (
    <ChartContainer
      title={title}
      subtitle={subtitle}
      action={
        onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="자격증명 관리 닫기"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)] text-[var(--muted)] transition-colors hover:bg-[var(--bg-2)]"
          >
            <X size={14} aria-hidden />
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
        {!canAct && (
          <p className="text-[12px] text-[var(--muted)]">
            현재 역할({roleLabel})은 읽기 전용입니다. 자격증명 연결/해제는 운영자 또는 관리자만 가능합니다.
          </p>
        )}

        {credentials.length === 0 ? (
          <EmptyState
            variant="onboarding"
            title="연결된 자격증명이 없습니다"
            description="SCP 자격증명을 연결하면 실 API 연동을 시도합니다."
            icon={KeyRound}
            className="py-8"
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {credentials.map((cred) => (
              <li
                key={cred.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-input)] border border-[var(--border)] px-3 py-2 text-[12px]"
              >
                <span className="flex items-center gap-2">
                  <KeyRound size={13} className="text-[var(--muted)]" aria-hidden />
                  <span className="font-medium">{cred.name}</span>
                  <span className="uppercase text-[var(--muted)]">{cred.provider}</span>
                  <span className="num text-[var(--muted)]">
                    {new Date(cred.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </span>
                {canAct && (
                  <InlineConfirmButton
                    label="해제"
                    confirmLabel="해제"
                    description={`${cred.name} 연결을 해제합니다.`}
                    onConfirm={() => handleDetach(cred.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {detachError && (
          <p role="alert" className="text-[12px] text-[var(--crit)]">
            {detachError}
          </p>
        )}

        {canAct && (
          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
            {!connecting ? (
              <div>
                <button
                  type="button"
                  onClick={() => setConnecting(true)}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-input)] border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-[var(--bg-2)]"
                >
                  <Link2 size={13} aria-hidden />
                  SCP 자격증명 연결
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  SCP 자격증명
                  <InfoTooltip label="SCP 설명">{GLOSSARY.provider_scp}</InfoTooltip>
                </span>
                <ScpCredentialFields value={scp} onChange={patchScp} disabled={isSubmitting} />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={handleConnect}
                    className="inline-flex items-center gap-2 rounded-[var(--radius-input)] bg-[var(--brand)] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Link2 size={14} aria-hidden />
                    )}
                    연결
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setConnecting(false);
                      setFormError(null);
                    }}
                    className="rounded-[var(--radius-input)] border border-[var(--border)] px-3 py-2 text-[12px] hover:bg-[var(--bg-2)]"
                  >
                    취소
                  </button>
                </div>
                {formError && <ErrorState cause="자격증명 연결에 실패했습니다." remedy={formError} />}
              </div>
            )}

            <p className="text-[11px] text-[var(--muted)]">AWS는 추후 지원됩니다 — 아직 자격증명 연결 UI가 없습니다.</p>

            {warning && (
              <p className="rounded-[var(--radius-card)] border border-[var(--warn)]/30 bg-[var(--warn)]/5 px-3 py-2 text-[12px] text-[var(--warn)]">
                {warning}
              </p>
            )}
            {success && (
              <p className="rounded-[var(--radius-card)] border border-[var(--ok)]/30 bg-[var(--ok)]/5 px-3 py-2 text-[12px] text-[var(--ok)]">
                {success}
              </p>
            )}
          </div>
        )}
      </div>
    </ChartContainer>
  );
}
