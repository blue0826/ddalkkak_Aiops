"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  LayoutDashboard,
  LineChart,
  ScrollText,
  Settings,
  Share2,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Provider } from "@/lib/types";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
}

/** 프로바이더별 실제 서비스 명칭(모니터링/로깅/빌링)을 반영해 내비 라벨을 구성한다. 하드코딩 금지. */
function buildNavItems(provider?: Provider): NavItem[] {
  const monitoring = provider?.monitoring_service ?? "모니터링";
  const logging = provider?.logging_service ?? "로그";
  const billing = provider?.billing_service ?? "비용";

  return [
    { id: "dashboard", label: "대시보드", icon: LayoutDashboard, desc: "전체 상태 한눈에 — 지금 건강한지 5초 안에 판단" },
    { id: "incidents", label: "인시던트", icon: AlertTriangle, desc: "발생한 장애 목록과 근본원인·자동조치(L5)" },
    { id: "topology", label: "토폴로지 맵", icon: Share2, desc: "자원 간 연결 관계 지도(Region→VPC→서브넷→서버)" },
    { id: "metrics", label: `메트릭 (${monitoring})`, icon: LineChart, desc: `자원별 CPU·메모리 등 성능 지표 (${monitoring})` },
    { id: "logs", label: `로그 (${logging})`, icon: ScrollText, desc: `자원 로그 스트림 (${logging})` },
    { id: "costs", label: `비용 (${billing})`, icon: Wallet, desc: `비용 추이·이상 탐지·절감 추천 (${billing})` },
    { id: "alerts", label: "알림", icon: Bell, desc: "경보 임계치 규칙과 감사 로그" },
    { id: "automation", label: "자동화", icon: Zap, desc: "탐지 실행·네트워크 이중화·보안 차단·용량 예측" },
    { id: "settings", label: "설정", icon: Settings, desc: "프로바이더 연동·SCP 자격증명·라이선스" },
  ];
}

interface SidebarNavProps {
  activeMenuId: string;
  activeProvider?: Provider;
  accentColor: string;
  /** 접힘 모드 — 아이콘만 표시(라벨은 title 툴팁으로) */
  collapsed?: boolean;
}

/**
 * URL 세그먼트(/console/<id>)로 내비게이션 상태를 반영한다(§7.4 — 공유 가능한 URL).
 * 현재 쿼리스트링(시간범위·테넌트·프로바이더·검색)은 화면 전환 시에도 그대로 유지한다.
 */
export function SidebarNav({ activeMenuId, activeProvider, accentColor, collapsed = false }: SidebarNavProps) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const items = buildNavItems(activeProvider);

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.id === activeMenuId;
        const Icon = item.icon;
        const href = query ? `/console/${item.id}?${query}` : `/console/${item.id}`;
        return (
          <Link
            key={item.id}
            href={href}
            title={collapsed ? `${item.label} — ${item.desc}` : item.desc}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? item.label : undefined}
            className={`flex items-center gap-3 rounded py-2.5 text-left text-xs font-semibold transition-colors ${
              collapsed ? "justify-center px-2" : "px-3"
            }`}
            style={{
              backgroundColor: active ? "var(--bg-2)" : "transparent",
              color: active ? accentColor : "var(--muted)",
              borderLeft: active ? `3px solid ${accentColor}` : "3px solid transparent",
            }}
          >
            <Icon size={collapsed ? 18 : 16} strokeWidth={2} aria-hidden />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
