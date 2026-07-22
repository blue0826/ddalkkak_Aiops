/**
 * 로그 레벨 배지 — 색 + 아이콘 + 텍스트 라벨을 항상 함께 표시한다(§4.3 색맹 접근성).
 * StatusBadge(정상/경고/심각)와 의미가 달라(로그 심각도) 별도 컴포넌트로 둔다.
 */
import { AlertTriangle, Info, XCircle, type LucideIcon } from "lucide-react";

interface LevelConfig {
  label: string;
  color: string;
  icon: LucideIcon;
}

const LEVEL_CONFIG: Record<string, LevelConfig> = {
  info: { label: "정보", color: "var(--muted)", icon: Info },
  warning: { label: "경고", color: "var(--warn)", icon: AlertTriangle },
  error: { label: "에러", color: "var(--crit)", icon: XCircle },
};

interface LogLevelBadgeProps {
  level: string;
}

export function LogLevelBadge({ level }: LogLevelBadgeProps) {
  const config = LEVEL_CONFIG[level.toLowerCase()] ?? LEVEL_CONFIG.info;
  const Icon = config.icon;

  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: config.color }}>
      <Icon size={12} strokeWidth={2.25} aria-hidden />
      {config.label}
    </span>
  );
}
