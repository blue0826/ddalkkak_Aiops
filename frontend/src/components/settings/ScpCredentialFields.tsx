"use client";

/**
 * SCP 자격증명 입력 필드 그룹(제어 컴포넌트) — 고객사 온보딩 폼과 고객사별 자격증명 연결 폼이
 * 이 컴포넌트를 함께 재사용한다(입력 UI 중복 방지).
 * 시크릿은 기본 마스킹(type="password")이며, 눈 아이콘을 눌러야만 평문 표시된다(보안 원칙).
 */
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useProviders } from "@/hooks/useProviders";
import { SCP_ENV_OPTIONS, type ScpFieldsValue } from "./scpCredential";

const inputClass =
  "h-9 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-1)] px-3 text-[13px] text-[var(--foreground)] disabled:opacity-50";

interface ScpCredentialFieldsProps {
  value: ScpFieldsValue;
  onChange: (patch: Partial<ScpFieldsValue>) => void;
  disabled?: boolean;
}

export function ScpCredentialFields({ value, onChange, disabled = false }: ScpCredentialFieldsProps) {
  const { providers } = useProviders();
  const scpProvider = providers.find((p) => p.id === "scp");
  const regionOptions = scpProvider?.regions ?? ["kr-west1", "kr-east1"];
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
        Access Key
        <input
          value={value.accessKey}
          onChange={(e) => onChange({ accessKey: e.target.value })}
          disabled={disabled}
          autoComplete="off"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
        Secret Key
        <div className="relative">
          <input
            type={showSecret ? "text" : "password"}
            value={value.secretKey}
            onChange={(e) => onChange({ secretKey: e.target.value })}
            disabled={disabled}
            autoComplete="off"
            className={`${inputClass} w-full pr-9`}
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] disabled:opacity-50"
            aria-label={showSecret ? "시크릿 키 가리기" : "시크릿 키 표시"}
          >
            {showSecret ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
          </button>
        </div>
      </label>

      <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
        프로젝트 ID
        <input
          value={value.projectId}
          onChange={(e) => onChange({ projectId: e.target.value })}
          disabled={disabled}
          autoComplete="off"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
        계정 유형(env)
        <select
          value={value.scpEnv}
          onChange={(e) => onChange({ scpEnv: e.target.value })}
          disabled={disabled}
          className={inputClass}
        >
          {SCP_ENV_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)] sm:col-span-2">
        리전
        <select
          value={value.scpRegion}
          onChange={(e) => onChange({ scpRegion: e.target.value })}
          disabled={disabled}
          className={`${inputClass} sm:w-56`}
        >
          {regionOptions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
