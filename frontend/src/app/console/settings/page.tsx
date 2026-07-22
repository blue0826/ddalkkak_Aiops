"use client";

/**
 * 설정 — 좌측 카테고리 내비 + 우측 상세 패널의 마스터-디테일 레이아웃.
 *
 * 관리자(SYSTEM_ADMIN): 4개 카테고리(고객사 관리(기본)/프로바이더 연동/라이선스/시스템·데이터
 * 출처)를 좌측 내비에서 전환한다. 활성 카테고리는 URL 쿼리(?section=)에 반영해 새로고침·
 * 링크 공유 시에도 동일 화면을 보게 한다(design-guide §7.4, url-state.ts와 동일 패턴).
 * 비관리자(운영자/뷰어)는 좌측 내비 없이 본인 고객사 자격증명 패널만 본다 — 기존 동작 유지
 * (TenantManagementPanel 내부가 이미 역할별로 분기하므로 그대로 재사용한다).
 */
import { Building2, Database, Plug, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getParam, withParam } from "@/lib/url-state";
import { DataSourceExplainer } from "@/components/settings/DataSourceExplainer";
import { LicensePanel } from "@/components/settings/LicensePanel";
import { ProviderStatusPanel } from "@/components/settings/ProviderStatusPanel";
import { SectionHeading } from "@/components/settings/SectionHeading";
import { SettingsNav, type SettingsSection } from "@/components/settings/SettingsNav";
import { TenantManagementPanel } from "@/components/settings/TenantManagementPanel";

const SECTIONS: SettingsSection[] = [
  { key: "tenants", label: "고객사 관리", icon: Building2 },
  { key: "providers", label: "프로바이더 연동", icon: Plug },
  { key: "license", label: "라이선스", icon: ShieldCheck },
  { key: "data-source", label: "시스템 · 데이터 출처", icon: Database },
];

const SECTION_META: Record<string, { title: string; description: string; icon: LucideIcon }> = {
  tenants: {
    title: "고객사 관리",
    description: "고객사 온보딩, 정보 수정, 자격증명 연결, 삭제를 처리합니다.",
    icon: Building2,
  },
  providers: {
    title: "프로바이더 연동",
    description: "SCP/AWS 프로바이더의 실연동 여부를 확인합니다.",
    icon: Plug,
  },
  license: {
    title: "라이선스",
    description: "설치된 Ed25519 서명 라이선스 상태를 확인합니다.",
    icon: ShieldCheck,
  },
  "data-source": {
    title: "시스템 · 데이터 출처",
    description: "관제 데이터가 어디서 오는지 정직하게 안내합니다.",
    icon: Database,
  },
};

const DEFAULT_SECTION = "tenants";

function PageHeader() {
  return (
    <header className="flex items-center gap-2">
      <Settings size={18} className="text-[var(--muted)]" strokeWidth={1.75} aria-hidden />
      <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
        설정
      </h1>
    </header>
  );
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedSection = getParam(searchParams, "section", DEFAULT_SECTION);
  const activeKey = SECTIONS.some((s) => s.key === requestedSection) ? requestedSection : DEFAULT_SECTION;

  function setSection(key: string) {
    router.replace(`${pathname}?${withParam(searchParams, "section", key)}`, { scroll: false });
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-8 p-6">
        <PageHeader />
        <TenantManagementPanel />
      </div>
    );
  }

  const meta = SECTION_META[activeKey];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader />

      <div className="flex flex-col gap-6 sm:flex-row">
        <SettingsNav sections={SECTIONS} activeKey={activeKey} onSelect={setSection} />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <SectionHeading icon={meta.icon} title={meta.title} description={meta.description} />

          {activeKey === "tenants" && <TenantManagementPanel />}
          {activeKey === "providers" && <ProviderStatusPanel />}
          {activeKey === "license" && <LicensePanel />}
          {activeKey === "data-source" && <DataSourceExplainer />}
        </div>
      </div>
    </div>
  );
}
