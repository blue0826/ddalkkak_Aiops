/**
 * 관제 콘솔 용어 사전 — InfoTooltip에 넣을 한국어 설명.
 * "이게 뭔지 모르겠다"는 사용자 피드백 대응. 화면 전반에서 이 상수를 참조해
 * 설명 문구를 일관되게 유지한다.
 */
export const GLOSSARY = {
  // 데이터 출처
  data_source_real: "REAL — 실제 클라우드 API(예: SCP Cloud Monitoring)에서 받은 값입니다.",
  data_source_simulated:
    "시뮬레이션 — 실 자격증명 연동 전이라 내부 시뮬레이터가 생성한 예시 값입니다. 설정에서 SCP 자격증명을 등록하면 실데이터로 전환됩니다.",

  // 대시보드 KPI
  managed_resources: "이 테넌트/프로바이더 범위에서 관제 중인 자원(가상 서버·DB 등)의 개수입니다.",
  active_incidents: "아직 해결되지 않은(열림·처리중) 장애 인시던트 수입니다.",
  active_alerts: "현재 활성 상태인 경보(임계치 초과·이상 징후) 수입니다.",
  today_cost: "오늘 예상 비용 — 최근 일별 비용 추이의 평균 기준 추정치입니다(₩).",
  health_summary:
    "지금 시스템이 건강한지 5초 안에 판단하기 위한 종합 상태입니다. 활성 인시던트·경보를 근거로 계산됩니다.",

  // 골든 시그널
  golden_signals:
    "구글 SRE의 핵심 지표. 여기서는 가장 부하가 높은 자원의 CPU·메모리 추이를 실시간으로 보여줍니다.",

  // AIOps 성숙도
  aiops_levels:
    "L1 룰 기반 알림 · L2 통계적 이상탐지 · L3 알람 노이즈 억제 · L4 LLM 근본원인 분석 · L5 자동조치(사람 승인 필수).",
  detection_l1: "L1 임계치 초과 — 룰(예: CPU>90%)을 실제 위반해 발생한 인시던트입니다.",
  detection_l2: "L2 이상탐지 — 평소 패턴(베이스라인) 대비 통계적으로 벗어난 급변을 감지한 것입니다.",
  detection_run:
    "탐지 사이클을 지금 1회 실행합니다. 모든 자원의 메트릭을 L1(임계치)·L2(이상)로 검사해 인시던트를 생성합니다.",

  // L5 자동조치
  l5_flow:
    "AI가 조치를 추천(RECOMMEND)하고, 사람이 승인(APPROVE)한 뒤에만 실행(EXECUTE)됩니다. 회사 원칙 'AI 추천, 사람 결정'.",

  // 비용
  rightsizing: "자원 사양을 실사용량에 맞게 조정(축소/증설)해 비용을 최적화하는 추천입니다.",
  cost_anomaly: "평소 대비 비정상적으로 튀는 비용 변화를 자동 탐지한 항목입니다.",

  // 실시간
  live_indicator:
    "LIVE는 화면이 자동 갱신 중임을 뜻합니다. 옆의 주기(5/10/30초)로 조절하거나 일시정지할 수 있습니다.",
  stale_indicator: "이 패널의 데이터가 마지막으로 갱신된 시점입니다.",

  // 프로바이더
  provider_scp: "삼성 클라우드 플랫폼(SCP) — Access Key + HMAC 서명 방식. 자격증명 등록 시 실연동 가능.",
  provider_aws: "Amazon Web Services — 현재는 시뮬레이션. 실연동(STS AssumeRole·CloudWatch)은 추후 지원.",

  // 토폴로지
  topology:
    "자원 간 연결 관계 지도입니다. Region → VPC → 서브넷 → 서버(web/app/db) 계층으로 배치되며, 경고 자원은 강조 표시됩니다.",

  // MSP 전 고객사 통합 현황(NOC 벽)
  fleet_summary:
    "관제 중인 전체 고객사를 합산한 SLA 롤업입니다. 고객사별 헬스(정상/주의/심각)와 총 자원·인시던트·경보·비용을 한눈에 보여줍니다.",
  resource_distribution:
    "전 고객사 자원을 프로바이더·리전·유형별로 집계한 분포입니다. GET /monitor/topology(system 스코프)의 전체 노드를 기준으로 계산됩니다.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
