"use client";

/**
 * 관리자가 고객사 드릴다운(?tenant=<id>) 상세 대시보드에서 전체 보기로 돌아가는 링크.
 * tenant 쿼리만 제거하고 range/provider/view 등 나머지 쿼리는 그대로 유지한다(withParam).
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { withParam } from "@/lib/url-state";

export function BackToOverviewLink() {
  const searchParams = useSearchParams();
  const href = `/console/dashboard?${withParam(searchParams, "tenant", "")}`;

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
    >
      <ArrowLeft size={14} aria-hidden />
      전체 보기
    </Link>
  );
}
