"use client";

/**
 * 고객사(테넌트) 선택 + 자동 순환 바 — 관제 월 디스플레이용.
 * 관리자가 여러 고객사를 한 화면에 몰아 보지 않고, 하나씩 선택하거나 자동으로 순환 표시한다.
 * 선택된 tenant id를 onChange로 알린다(부모가 그 테넌트로 스코프해 렌더).
 */
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Building2 } from "lucide-react";
import type { Tenant } from "@/lib/types";

interface TenantCyclerProps {
  tenants: Tenant[];
  /** 현재 선택된 tenant id */
  value: string;
  onChange: (tenantId: string) => void;
  /** 자동 순환 주기(ms). 기본 8초 */
  intervalMs?: number;
}

export function TenantCycler({ tenants, value, onChange, intervalMs = 8000 }: TenantCyclerProps) {
  const [cycling, setCycling] = useState(false);

  // 타이머 콜백에서 최신 값/목록을 참조하기 위한 ref.
  const valueRef = useRef(value);
  const tenantsRef = useRef(tenants);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    tenantsRef.current = tenants;
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!cycling || tenants.length === 0) return;
    const id = setInterval(() => {
      const list = tenantsRef.current;
      if (list.length === 0) return;
      const idx = list.findIndex((t) => t.id === valueRef.current);
      const next = list[(idx + 1) % list.length];
      onChangeRef.current(next.id);
    }, intervalMs);
    return () => clearInterval(id);
  }, [cycling, intervalMs, tenants.length]);

  if (tenants.length === 0) return null;

  const activeName = tenants.find((t) => t.id === value)?.name;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2">
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        <Building2 size={13} aria-hidden />
        고객사
      </span>

      <div className="flex flex-wrap items-center gap-1">
        {tenants.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-pressed={active}
              className="rounded-[var(--radius-badge)] px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: active ? "var(--brand)" : "var(--bg-2)",
                color: active ? "#fff" : "var(--muted)",
              }}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {cycling && activeName && (
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--ok)" }} aria-hidden />
            순환 중 · {activeName}
          </span>
        )}
        <button
          type="button"
          onClick={() => setCycling((v) => !v)}
          title={cycling ? "자동 순환 정지" : `자동 순환 시작(${intervalMs / 1000}초마다)`}
          aria-pressed={cycling}
          className="flex items-center gap-1.5 rounded-[var(--radius-input)] border px-2.5 py-1 text-[12px] font-medium transition-colors"
          style={{
            borderColor: cycling ? "var(--brand)" : "var(--border)",
            color: cycling ? "var(--brand)" : "var(--muted)",
          }}
        >
          {cycling ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
          자동 순환
        </button>
      </div>
    </div>
  );
}
