"use client";

/**
 * 등록된 고객사가 없을 때(admin 전용) 공용 빈 상태.
 * CEO 지시: 지어낸 고객사 제거, 실데이터만 — 고객사가 0곳이면 "system" 스코프로 폴백해
 * 데모 데이터를 보여주는 대신, 설정 화면 온보딩으로만 유도한다.
 */
import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";

interface NoTenantsEmptyStateProps {
  /** 화면별 문구를 덮어쓸 때 사용(기본 문구는 대시보드/토폴로지/메트릭 공통으로 무난하다). */
  description?: string;
  className?: string;
}

export function NoTenantsEmptyState({ description, className }: NoTenantsEmptyStateProps) {
  const router = useRouter();

  return (
    <EmptyState
      variant="onboarding"
      icon={Building2}
      title="등록된 고객사가 없습니다"
      description={
        description ?? "관제할 고객사가 아직 등록되지 않았습니다. 설정 화면에서 첫 고객사를 온보딩하십시오."
      }
      action={{ label: "설정 → 고객사 온보딩", onClick: () => router.push("/console/settings") }}
      className={className}
    />
  );
}
