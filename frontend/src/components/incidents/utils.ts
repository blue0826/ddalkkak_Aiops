/**
 * 인시던트 화면 표시 헬퍼 — 순수 함수만 둔다(컴포넌트 아님).
 * 심각도/상태 라벨 매핑, L5 조치 권한 체크, 프로바이더 추정을 담당한다.
 */
import type { StatusTone } from "@/components/ui/StatusBadge";
import type { Incident, RemediationStatus } from "@/lib/types";

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "심각",
  WARNING: "경고",
  INFO: "정보",
  SUCCESS: "성공",
};

const SEVERITY_TONE: Record<string, StatusTone> = {
  CRITICAL: "crit",
  WARNING: "warn",
  INFO: "ok",
  SUCCESS: "ok",
};

export function severityTone(severity: string): StatusTone {
  return SEVERITY_TONE[severity] ?? "warn";
}

export function severityLabel(severity: string): string {
  return SEVERITY_LABEL[severity] ?? severity;
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: "열림",
  INVESTIGATING: "조사중",
  RESOLVED: "해결됨",
};

export function incidentStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

const REMEDIATION_LABEL: Record<RemediationStatus, string> = {
  NONE: "미착수",
  RECOMMENDED: "권장됨",
  APPROVED: "승인됨",
  EXECUTED: "실행완료",
};

export function remediationStatusLabel(status: RemediationStatus): string {
  return REMEDIATION_LABEL[status] ?? status;
}

/** 운영자(TENANT_OPERATOR) 이상만 L5 조치 승인/실행 권한을 가진다 (뷰어는 조회만, 백엔드 RoleChecker와 동일 기준). */
export function canOperate(role: string | undefined): boolean {
  return role === "SYSTEM_ADMIN" || role === "TENANT_OPERATOR";
}

/** 실시간 요약 행용 집계 — 심각도별(심각/경고)·상태별(신규/처리중/해결) 건수 + 전체/활성. */
export interface IncidentStats {
  total: number;
  /** 아직 해결되지 않은 인시던트(신규+처리중) */
  active: number;
  critical: number;
  warning: number;
  open: number;
  investigating: number;
  resolved: number;
}

export function computeIncidentStats(incidents: Incident[]): IncidentStats {
  let critical = 0;
  let warning = 0;
  let open = 0;
  let investigating = 0;
  let resolved = 0;
  for (const incident of incidents) {
    if (incident.severity === "CRITICAL") critical += 1;
    else if (incident.severity === "WARNING") warning += 1;

    if (incident.status === "OPEN") open += 1;
    else if (incident.status === "INVESTIGATING") investigating += 1;
    else if (incident.status === "RESOLVED") resolved += 1;
  }
  return {
    total: incidents.length,
    active: open + investigating,
    critical,
    warning,
    open,
    investigating,
    resolved,
  };
}

/** 분포 바용 — severityTone(ok/warn/crit) 기준으로 묶은 구성비. StatusBadge와 동일한 색 매핑을 재사용한다. */
export interface SeverityToneCounts {
  crit: number;
  warn: number;
  ok: number;
}

export function countBySeverityTone(incidents: Incident[]): SeverityToneCounts {
  const counts: SeverityToneCounts = { crit: 0, warn: 0, ok: 0 };
  for (const incident of incidents) {
    counts[severityTone(incident.severity)] += 1;
  }
  return counts;
}

/** 라이브 피드 감 — 목록은 항상 최신 생성순으로 보여준다. */
export function sortIncidentsByCreatedAtDesc(incidents: Incident[]): Incident[] {
  return [...incidents].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** 직전 폴링 대비 새로 생긴 인시던트 id만 반환한다 (첫 로드 시에는 prevIds가 null이므로 항상 빈 배열). */
export function diffNewIncidentIds(incidents: Incident[], prevIds: ReadonlySet<number> | null): number[] {
  if (prevIds === null) return [];
  return incidents.filter((incident) => !prevIds.has(incident.id)).map((incident) => incident.id);
}

/**
 * 프로바이더 배지용 추정값 — Incident 응답(backend IncidentResponse)에는 provider 필드가 없다.
 * 백엔드가 노드 식별에 쓰는 것과 동일한 규칙(제목 선두 "[node-id]", 예: "[scp-vm-app-01] ...")으로
 * 프로바이더 prefix를 추정한다 (backend/app/services/incident_service.py get_timeline_cards와 동일 정규식).
 * 매칭되지 않으면(예: "[Alert Storm] ..."처럼 실제 노드 ID가 아닌 제목) null을 반환해
 * 호출부가 "-"로 정직하게 표기하게 한다 — 값을 지어내지 않는다.
 */
export function deriveProviderIdFromTitle(title: string): string | null {
  const match = /^\[([^\]\s]+)\]/.exec(title);
  if (!match) return null;
  const prefix = match[1].split("-")[0];
  return prefix || null;
}
