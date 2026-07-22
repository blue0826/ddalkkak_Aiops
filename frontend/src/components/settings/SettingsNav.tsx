"use client";

/**
 * 설정 화면 좌측 카테고리 내비게이션 — 마스터-디테일 레이아웃의 마스터(좌측) 영역.
 * 관리자(SYSTEM_ADMIN)에게만 렌더링된다(비관리자는 상위 page.tsx가 이 컴포넌트를
 * 아예 마운트하지 않고 TenantCredentialPanel만 단독으로 보여준다).
 */
import type { LucideIcon } from "lucide-react";

export interface SettingsSection {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface SettingsNavProps {
  sections: SettingsSection[];
  activeKey: string;
  onSelect: (key: string) => void;
}

export function SettingsNav({ sections, activeKey, onSelect }: SettingsNavProps) {
  return (
    <nav
      aria-label="설정 카테고리"
      className="flex w-full shrink-0 flex-row gap-1 overflow-x-auto sm:w-52 sm:flex-col sm:overflow-visible"
    >
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.key === activeKey;
        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onSelect(section.key)}
            aria-current={active ? "page" : undefined}
            className="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[var(--radius-input)] px-3 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-[var(--bg-2)]"
            style={{
              backgroundColor: active ? "var(--bg-2)" : "transparent",
              color: active ? "var(--brand)" : "var(--foreground)",
              borderLeft: active ? "3px solid var(--brand)" : "3px solid transparent",
            }}
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden />
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}
