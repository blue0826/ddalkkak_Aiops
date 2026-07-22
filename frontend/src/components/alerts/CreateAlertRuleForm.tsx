"use client";

/**
 * 알람 규칙 생성 폼 — POST /alerts/rules. 인라인 검증 후 성공 시 부모가 목록을 새로고침한다.
 * 운영자/관리자만 렌더링되도록 부모(AlertRulesPanel)에서 게이팅한다.
 */
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { createAlertRule } from "@/lib/api";
import type { AlertRule, AlertRuleCreate } from "@/lib/types";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

interface CreateAlertRuleFormProps {
  onCreated: (rule: AlertRule) => void;
}

interface FormState {
  name: string;
  metric_name: string;
  operator: AlertRuleCreate["operator"];
  threshold: string;
  duration_minutes: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_STATE: FormState = { name: "", metric_name: "", operator: "gt", threshold: "", duration_minutes: "5" };

const inputClass =
  "h-8 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-0)] px-2 text-[12px] text-[var(--foreground)]";

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = "규칙 이름을 입력하십시오.";
  if (!form.metric_name.trim()) errors.metric_name = "메트릭 이름을 입력하십시오.";

  const threshold = Number(form.threshold);
  if (form.threshold.trim() === "" || Number.isNaN(threshold)) errors.threshold = "숫자를 입력하십시오.";

  const duration = Number(form.duration_minutes);
  if (form.duration_minutes.trim() === "" || Number.isNaN(duration) || duration <= 0 || !Number.isInteger(duration)) {
    errors.duration_minutes = "1 이상의 정수를 입력하십시오.";
  }
  return errors;
}

export function CreateAlertRuleForm({ onCreated }: CreateAlertRuleFormProps) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      const created = await createAlertRule({
        name: form.name.trim(),
        metric_name: form.metric_name.trim(),
        operator: form.operator,
        threshold: Number(form.threshold),
        duration_minutes: Number(form.duration_minutes),
      });
      onCreated(created);
      setForm(INITIAL_STATE);
      setFieldErrors({});
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "규칙 생성에 실패했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4"
    >
      <h2 className="flex items-center gap-1.5 font-semibold" style={{ font: "var(--text-h2)" }}>
        새 알람 규칙
        <InfoTooltip label="알람 규칙 설명">
          지정한 메트릭이 연산자·임계치 조건을 설정한 시간(분) 동안 지속하면 인시던트가 자동 생성됩니다(L1 임계치
          탐지).
        </InfoTooltip>
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="flex flex-col gap-1">
          <label htmlFor="rule-name" className="text-[11px] text-[var(--muted)]">
            이름
          </label>
          <input
            id="rule-name"
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          {fieldErrors.name && <span className="text-[11px] text-[var(--crit)]">{fieldErrors.name}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="rule-metric" className="text-[11px] text-[var(--muted)]">
            메트릭
          </label>
          <input
            id="rule-metric"
            className={inputClass}
            placeholder="cpu"
            value={form.metric_name}
            onChange={(e) => setForm((prev) => ({ ...prev, metric_name: e.target.value }))}
          />
          {fieldErrors.metric_name && <span className="text-[11px] text-[var(--crit)]">{fieldErrors.metric_name}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="rule-operator" className="text-[11px] text-[var(--muted)]">
            연산자
          </label>
          <select
            id="rule-operator"
            className={inputClass}
            value={form.operator}
            onChange={(e) => setForm((prev) => ({ ...prev, operator: e.target.value as FormState["operator"] }))}
          >
            <option value="gt">초과 (&gt;)</option>
            <option value="lt">미만 (&lt;)</option>
            <option value="eq">같음 (=)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="rule-threshold" className="text-[11px] text-[var(--muted)]">
            임계치
          </label>
          <input
            id="rule-threshold"
            className={`${inputClass} num`}
            inputMode="decimal"
            value={form.threshold}
            onChange={(e) => setForm((prev) => ({ ...prev, threshold: e.target.value }))}
          />
          {fieldErrors.threshold && <span className="text-[11px] text-[var(--crit)]">{fieldErrors.threshold}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="rule-duration" className="text-[11px] text-[var(--muted)]">
            지속(분)
          </label>
          <input
            id="rule-duration"
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.duration_minutes}
            onChange={(e) => setForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
          />
          {fieldErrors.duration_minutes && (
            <span className="text-[11px] text-[var(--crit)]">{fieldErrors.duration_minutes}</span>
          )}
        </div>
      </div>

      {submitError && (
        <p role="alert" className="text-[12px] text-[var(--crit)]">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-input)] bg-[var(--brand)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={14} aria-hidden />
        {pending ? "추가 중..." : "규칙 추가"}
      </button>
    </form>
  );
}
