"use client";

/**
 * 콘솔 라우트 인증 가드. 토큰이 없으면 /login으로 보낸다.
 * localStorage 판독 전(hydration 이전)에는 오판을 막기 위해 전체화면 스켈레톤만 보여준다.
 */
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/Skeleton";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isHydrated, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isHydrated, isAuthenticated, router]);

  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-0)]">
        <Skeleton width={220} height={14} />
      </div>
    );
  }

  return <>{children}</>;
}
