/**
 * 데이터 화면 자리표시자. 실제 화면(대시보드/인시던트 등)은 다음 단계에서 이 자리를 채운다.
 * 상호작용이 없는 순수 표시 컴포넌트라 서버 컴포넌트로 유지한다("use client" 불필요).
 */
import type { LucideIcon } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function ComingSoon({ title, description, icon: Icon }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <Icon size={28} className="text-[var(--muted)]" strokeWidth={1.5} aria-hidden />
      <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
        {title}
      </h1>
      <p className="max-w-sm text-[13px] text-[var(--muted)]">{description}</p>
    </div>
  );
}
