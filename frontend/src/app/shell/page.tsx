import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPlaceholder } from "@/components/dashboard/DashboardPlaceholder";

/**
 * Phase 4.1 앱 셸 프리뷰 라우트 (인증 게이트 없음).
 * 실제 서비스 루트("/")는 아직 레거시 page.tsx(3027줄)를 그대로 사용 중이며,
 * 인증된 실제 진입점은 /console/*(AuthGate 적용)이다. 이 라우트는 AppShell 자체의
 * 렌더링만 빠르게 확인하기 위한 용도로 유지한다.
 */
export default function ShellPreviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg-0)]" />}>
      <AppShell>
        <DashboardPlaceholder />
      </AppShell>
    </Suspense>
  );
}
