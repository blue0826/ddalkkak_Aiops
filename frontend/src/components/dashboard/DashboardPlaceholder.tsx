"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { getLicense } from "@/lib/api";
import type { License } from "@/lib/types";

type LicenseState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; license: License };

/**
 * Phase 4.0 파운데이션 대시보드 placeholder.
 * 실제 KPI/차트 구현은 다음 단계(화면별 이관)에서 이 자리를 채운다.
 * 지금은 디자인 토큰과 loading/error/empty 상태 규약(§8), api.ts 연결을 검증하는 용도.
 */
export function DashboardPlaceholder() {
  const [licenseState, setLicenseState] = useState<LicenseState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getLicense()
      .then((license) => {
        if (!cancelled) setLicenseState({ status: "ready", license });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLicenseState({
            status: "error",
            message: err instanceof Error ? err.message : "라이선스 상태 조회에 실패했습니다.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
          대시보드
        </h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Phase 4.0 파운데이션 — 실제 화면 구현은 다음 단계에서 이관됩니다.
        </p>
      </header>

      <LicenseStatusCard state={licenseState} />

      <section>
        <h2 className="mb-3 font-semibold" style={{ font: "var(--text-h2)" }}>
          골든 시그널
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiEmptyCard label="지연시간 (P95)" />
          <KpiEmptyCard label="트래픽" />
          <KpiEmptyCard label="에러율" />
          <KpiEmptyCard label="포화도" />
        </div>
      </section>
    </div>
  );
}

function LicenseStatusCard({ state }: { state: LicenseState }) {
  if (state.status === "loading") {
    return (
      <div className="flex h-16 items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] px-4">
        <Loader2 size={16} className="animate-spin text-[var(--muted)]" aria-hidden />
        <span className="text-[13px] text-[var(--muted)]">라이선스 상태 확인 중...</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-16 items-center gap-3 rounded-[var(--radius-card)] border border-[var(--crit)] bg-[var(--bg-1)] px-4">
        <ShieldAlert size={16} className="text-[var(--crit)]" aria-hidden />
        <span className="text-[13px]">
          라이선스 상태 확인 실패: {state.message} 백엔드 서버(GET /license) 연결 상태를 확인하십시오.
        </span>
      </div>
    );
  }

  const { license } = state;
  const healthy = license.is_valid && !license.is_expired;
  const tone = healthy ? "var(--ok)" : "var(--crit)";

  return (
    <div className="flex h-16 items-center justify-between rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] px-4">
      <div className="flex items-center gap-3">
        {healthy ? (
          <ShieldCheck size={16} style={{ color: tone }} aria-hidden />
        ) : (
          <ShieldAlert size={16} style={{ color: tone }} aria-hidden />
        )}
        <div>
          <div className="text-[12px] font-medium text-[var(--muted)]">라이선스 에디션</div>
          <div className="text-[14px] font-semibold">{license.edition}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[12px] text-[var(--muted)]">만료일</div>
        <div className="num text-[13px]">{license.expire_date}</div>
      </div>
    </div>
  );
}

function KpiEmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-3 text-[13px] text-[var(--muted)]">
        데이터 연결 대기 중 — 다음 단계에서 실데이터가 연결됩니다.
      </div>
    </div>
  );
}
