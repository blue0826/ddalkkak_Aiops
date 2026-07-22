import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/layout/AuthGate";
import { RefreshProvider } from "@/hooks/useRefreshInterval";

/**
 * 인증된 콘솔 영역 루트 레이아웃. AppShell 내부에서 useSearchParams를 사용하므로
 * 프로덕션 정적 프리렌더 빌드 오류를 막기 위해 Suspense로 감싼다.
 * RefreshProvider가 전역 실시간 갱신 주기를 모든 화면에 공급한다(관제 월).
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <RefreshProvider>
        <Suspense fallback={<div className="min-h-screen bg-[var(--bg-0)]" />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </RefreshProvider>
    </AuthGate>
  );
}
