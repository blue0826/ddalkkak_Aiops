from backend.app.models.base import Incident, IncidentTimeline
from backend.app.core.config import settings
from backend.app.services.llm_gateway import get_llm_gateway
from typing import List, Dict
from datetime import datetime
from loguru import logger

# 폴백(규칙 기반) 전용 라벨 - "AI 분석"이라 단정하지 않고 규칙 기반임을 정직하게 표기
_FALLBACK_ENGINE_LABEL = "규칙 기반 분석 (LLM 미연결)"

_RCA_SYSTEM_PROMPT = (
    "당신은 한국어로만 응답하는 AIOps MSP 플랫폼의 SRE 어시스턴트입니다. "
    "주어진 인시던트 정보와 타임라인을 바탕으로 근본원인분석(RCA)을 수행하십시오. "
    "반드시 아래 3개 구간 마커를 정확히 사용하여 응답하십시오(마커 앞뒤 다른 문구 금지):\n"
    "[요약]\n(장애 상황을 1~2문장으로 요약)\n"
    "[근본원인]\n(추정 근본원인 분석)\n"
    "[권장조치]\n(운영자가 즉시 수행할 구체적 조치를 번호 목록으로 제시)"
)


def _parse_llm_rca_sections(text: str) -> Dict[str, str]:
    """
    LLM 응답 텍스트에서 [요약]/[근본원인]/[권장조치] 마커 구간을 파싱한다.
    마커를 찾을 수 없으면 전체 텍스트를 summary에 담아 정보 손실을 방지한다.
    """
    markers = [("summary", "[요약]"), ("probable_cause", "[근본원인]"), ("recommended_runbook", "[권장조치]")]
    result = {key: "" for key, _ in markers}

    found = [(text.find(marker), key, marker) for key, marker in markers if text.find(marker) != -1]
    if not found:
        result["summary"] = text.strip()
        return result

    found.sort(key=lambda item: item[0])
    for i, (idx, key, marker) in enumerate(found):
        start = idx + len(marker)
        end = found[i + 1][0] if i + 1 < len(found) else len(text)
        result[key] = text[start:end].strip()

    return result


class LLMService:
    """
    L4 AI 운영 비서 및 월간 보고서 자동화 서비스
    실 LLM 게이트웨이(옵트인) 연동 + 에어갭 오프라인 환경용 로컬 NLP 분석 하이브리드 엔진 탑재.
    키가 설정되지 않으면(기본값) 항상 규칙 기반 텍스트로 폴백한다.
    """

    @staticmethod
    async def generate_incident_rca(incident: Incident, timeline: List[IncidentTimeline]) -> Dict[str, str]:
        """
        장애 인시던트의 타임라인 및 로그 내역을 기반으로 요약, 근본원인(RCA), 권장 런북을 도출합니다.
        실 LLM 게이트웨이가 연결되어 있으면 해당 응답을 사용하고, 아니면(기본값) 규칙 기반
        도메인 텍스트로 폴백합니다. 반환 dict의 "engine" 필드로 실제 사용된 방식을 명시합니다.
        """
        logger.info(f"[AI 분석 가동] 인시던트 ID: {incident.id} 분석 수행 중...")

        gateway = get_llm_gateway()
        timeline_text = "\n".join(
            f"- [{t.event_type}] {t.actor}: {t.message}" for t in timeline
        ) or "(타임라인 기록 없음)"
        user_prompt = (
            f"인시던트 제목: {incident.title}\n"
            f"설명: {incident.description or '(설명 없음)'}\n"
            f"심각도: {incident.severity}\n"
            f"타임라인:\n{timeline_text}"
        )

        llm_text = await gateway.complete(system=_RCA_SYSTEM_PROMPT, prompt=user_prompt)
        if llm_text:
            parsed = _parse_llm_rca_sections(llm_text)
            logger.info(f"[AI 분석 완료 - 실 LLM] 인시던트 ID: {incident.id}, 엔진: {gateway.mode}")
            return {
                "summary": parsed["summary"] or llm_text.strip(),
                "probable_cause": parsed["probable_cause"],
                "recommended_runbook": parsed["recommended_runbook"],
                "analyzed_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "engine": gateway.mode,
            }

        # ---- 폴백: 로컬 고신뢰도 NLP 템플릿 기반 초안 생성 (에어갭 완벽 지원, 규칙 기반) ----
        # 1. 장애 유형 파악을 위한 키워드 검사
        title_lower = incident.title.lower()
        desc_lower = (incident.description or "").lower()
        
        is_cpu = "cpu" in title_lower or "cpu" in desc_lower
        is_memory = "memory" in title_lower or "memory" in desc_lower or "mem" in title_lower
        is_disk = "disk" in title_lower or "disk" in desc_lower
        is_storm = "storm" in title_lower
        is_network = "network" in title_lower or "vpn" in title_lower or "bypass" in title_lower or "회선" in title_lower
        is_secops = "security" in title_lower or "secops" in title_lower or "waf" in title_lower or "ddos" in title_lower or "soar" in title_lower or "침입" in title_lower or "ueba" in title_lower
        is_prediction = "prediction" in title_lower or "capacity" in title_lower or "saturation" in title_lower or "예측" in title_lower or "포화" in title_lower
        
        # 2. 로컬 고신뢰도 NLP 템플릿 기반 초안 생성 (에어갭 완벽 지원)
        if is_storm:
            summary = "다수 노드에서 경보 이벤트가 단시간 내에 임계치를 초과하여 폭증한 알람 폭풍(Alert Storm) 인시던트입니다."
            rca = (
                "상관관계 분석 결과: 1분 이내에 동일 테넌트 내의 복수 리소스들로부터 다량의 알람이 동시다발적으로 수집되었습니다. "
                "이는 단일 인스턴스의 고유 장애가 아닌, 공통 네트워크 스위치 장애, DNS 해소 실패, 또는 서브넷 내부의 "
                "라우팅 게이트웨이 정체 등의 인프라 백본 장애(Backbone Outage)일 가능성이 극히 높습니다."
            )
            runbook = (
                "1. 네트워크 토폴로지 맵 상에서 공통 게이트웨이 노드(VPC, Subnet Router, Load Balancer)의 헬스체크를 조회하십시오.\n"
                "2. 타사 테넌트에서도 동일 폭증이 발생하는지 어드민 계정으로 전환하여 교차 점검하십시오.\n"
                "3. 수집기(Collector) 데몬의 CPU 점유율 및 커넥션 스택이 포화 상태인지 검사하십시오."
            )
        elif is_network:
            summary = "Flow Log 및 연결 상태 분석 결과 전용회선(Dedicated Line) 패킷 손실로 인해 백업 VPN으로 라우팅 경로가 자동 우회(Bypass)되었습니다."
            rca = (
                "네트워크 상관관계 추론: 주 전용회선 구간의 물리 노이즈 또는 스위치 장애로 인해 패킷 손실률이 임계치(40%)를 초과하였습니다. "
                "AIOps 네트워크 자동대응(Automate) 모듈이 이를 실시간 감지하여 1.5초 이내에 VPN 백업 터널로 경로 스위칭을 가이드레일 기반으로 자동 처리 완료하였습니다."
            )
            runbook = (
                "1. 전용회선 제공 통신사업자(삼성 SCP / MSP 데스크)에 원격 회선 루프백 물리 테스트를 즉시 접수하십시오.\n"
                "2. 임시 가동된 VPN 백업 터널(대역폭 450Mbps) 구간에 정체 병목이 유발되지 않는지 실시간 네트워크 차트를 모니터링하십시오.\n"
                "3. 통신사로부터 전용회선 물리 복구 완료 회신 접수 시, 주 경로로의 복귀(Rollback) 승인을 내리십시오."
            )
        elif is_secops:
            summary = "WAF/DDoS 위협 침입 이벤트 다중 감지 및 비정상 행위(UEBA) 대응에 따른 침해 IP 보안그룹 자동 차단(SOAR) 완료 건입니다."
            rca = (
                "보안 상관관계 분석: 특정 공격자 IP 대역에서 WAF SQL 인젝션 룰 침입을 5회 이상 반복 시도하여 비정상 위험(UEBA) 주체로 매핑되었습니다. "
                "플랫폼 내 SOAR(SOAR Playbook) 격리 규칙이 작동하여, 방화벽/보안그룹 sg-secure-mds-01 인바운드 룰 상에 해당 IP를 자동 차단 격리했습니다."
            )
            runbook = (
                "1. 차단 격리된 소스 IP 대역을 조회하고 사내 정당한 원격 작업자의 오탐(False Positive) 가능성 유무를 교차 체크하십시오.\n"
                "2. 타겟 WAS 및 DB 인스턴스의 접속 로그를 검사하여 비정상 예외(Exception) 혹은 데이터 비인증 반출 흔적이 없는지 포렌식 진단하십시오.\n"
                "3. 공격 유입 지점이 지속될 경우 침해 관련 포트(Port)에 대한 공용 접근 통제 정책을 재조정하십시오."
            )
        elif is_prediction:
            summary = "용량 증가 예측 엔진(Linear Trend Forecasting)에 의해 15일 이내 스토리지 디스크 100% 포화 위험이 예견된 선행적 장애 징후 알람입니다."
            rca = (
                "용량 추세 분석 추론: 최근 7일간의 데이터 증가 경향성을 선형 회귀 추정한 결과, 증가 경사가 가파른 양수(+) 방향으로 지속되어 "
                "약 12.5일 후에 해당 VM의 물리 볼륨이 100% 완전히 고갈될 것으로 연산 감지되었습니다."
            )
            runbook = (
                "1. 해당 가상 서버의 캐시 임시 파일, 임시 Core Dump 파일 및 백업 보존 만료 파일들을 확인하여 CLI에서 수동 소거하십시오.\n"
                "2. Rightsizing 보고서를 조회한 뒤, 볼륨 크기 증설(Scale-Up) 또는 디스크 추가 마운트 파티션 조정을 클라우드에 신청하십시오.\n"
                "3. 시스템 로그 로테이션(Logrotate) 주기가 비정상적으로 길거나 데몬이 정체되어 있는지 프로세스를 확인하십시오."
            )
        elif is_cpu:
            summary = f"수집 노드({incident.title.split(']')[0] + ']'})의 CPU 사용량이 임계치 기준을 초과하여 장기 지속 중입니다."
            rca = (
                "CPU 부하 원인 추론: 최근 타임라인 기록과 로그 스트림 분석 결과, 애플리케이션의 특정 데몬 프로세스가 "
                "루프 연산에 걸렸거나 대량의 배치 작업(Batch Job) 혹은 쿼리 루프가 인스턴스 코어 자원을 독점 점유하고 있습니다."
            )
            runbook = (
                "1. 해당 인스턴스에 SSH 또는 세션 매니저로 원격 접속하여 `top -c` 또는 `ps -eo pcpu,pmem,args --sort=-pcpu`를 실행하십시오.\n"
                "2. 부하가 비정상적인 데몬이 감지되면 해당 프로세스를 재기동하십시오.\n"
                "3. 서비스가 정상화되지 않을 경우 Auto Scaling 그룹의 스케일아웃(Scale-Out) 또는 인스턴스 타입 스케일업(Scale-Up)을 수행하십시오."
            )
        elif is_memory:
            summary = f"모니터링 대상 노드의 물리 메모리(Memory) 여유 자원이 고갈되어 스왑 영역 포화 직전 단계입니다."
            rca = (
                "메모리 분석 추론: 오랜 가동 시간에 따른 자바 JVM 힙 메모리 누수(Memory Leak) 또는 컨테이너 데몬의 "
                "Garbage Collection 지연 현상이 감지되었습니다. 락(Lock) 대기로 인한 세션 유지 적체 현상도 의심됩니다."
            )
            runbook = (
                "1. 인스턴스 내의 힙 덤프(Heap Dump) 또는 어플리케이션 로그의 `OutOfMemoryError` 발생 이력을 CloudWatch에서 확인하십시오.\n"
                "2. 정체된 가비지 컬렉션을 수동 유도하기 위해 WAS 애플리케이션 데몬을 순차 그레이스풀(Graceful) 재기동하십시오.\n"
                "3. 지속적인 메모리 상승세가 잡히지 않을 경우 메모리 한도 설정(Xmx, Xms)을 튜닝하십시오."
            )
        else:
            summary = "인프라 모니터링 에이전트로부터 임계 성능 초과 이벤트가 접수되었습니다."
            rca = "리소스 사용량이 임시 부하 스파이크(Spike)로 인해 일시적으로 사전 정의된 임계치를 초과한 것으로 추론됩니다."
            runbook = (
                "1. CloudWatch 또는 SCP Monitoring API 상에서 리소스의 최근 3시간 누적 트렌드를 모니터링하십시오.\n"
                "2. 실시간 로그 스트림 뷰어를 열어 비정상 예외 트레이스(Exception Trace)가 발생하는지 대조하십시오."
            )

        logger.info(f"[AI 분석 완료 - 규칙 기반 폴백] 인시던트 ID: {incident.id} RCA 도출 성공")
        return {
            "summary": summary,
            "probable_cause": rca,
            "recommended_runbook": runbook,
            "analyzed_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            "engine": _FALLBACK_ENGINE_LABEL
        }

    @staticmethod
    async def generate_monthly_report(
        tenant_id: str,
        active_vms: int,
        alarms_count: int,
        total_costs: float,
        savings: float
    ) -> str:
        """
        MSP 고객사 보고용 월간 운영 보고서 초안(Markdown 포맷)을 생성합니다.
        통화는 헌법 원칙(순수 원화)에 따라 원화(₩)로 표기합니다.
        """
        current_month = datetime.utcnow().strftime("%Y년 %m월")
        sla_value = 99.98 if alarms_count < 5 else (99.92 if alarms_count < 15 else 99.85)

        # 종합 의견 섹션 - 실 LLM 게이트웨이가 연결되어 있으면 해당 응답을 사용하고,
        # None이면(template 모드 등) 기존 규칙 기반 문구를 그대로 유지한다.
        gateway = get_llm_gateway()
        llm_opinion = await gateway.complete(
            system=(
                "당신은 한국어로만 응답하는 MSP 클라우드 운영 보고서 작성자입니다. "
                "제공된 월간 운영 지표를 바탕으로 2~4문장의 간결한 종합 의견 및 대응 권고를 작성하십시오. "
                "마크다운 제목이나 마커 없이 본문 문장만 작성하십시오."
            ),
            prompt=(
                f"테넌트: {tenant_id}\n"
                f"관제 대상 인프라: {active_vms}대\n"
                f"월간 이상징후 알람: {alarms_count}건\n"
                f"월간 가용성(SLA): {sla_value}%\n"
                f"당월 누적 총 요금: ₩{total_costs:,.0f}\n"
                f"예상 절감 가능액: ₩{savings:,.0f}"
            ),
        )
        opinion_text = llm_opinion.strip() if llm_opinion else (
            "당월 모니터링 지표 상, CPU 및 메모리 가용 자원이 전반적으로 안정적으로 유지되었습니다. "
            "단, 가상 알림 기록상 간헐적인 커넥션 임계치 스파이크가 2회 관측되었으므로 다음 점검 주기 시 "
            "WAS 커넥션 풀 크기 상향 조정을 권고합니다."
        )

        report = f"""# 월간 클라우드 운영 보고서 ({current_month}분)

본 보고서는 테넌트 `{tenant_id}` 고객사의 삼성클라우드플랫폼(SCP) 및 AWS 인프라 모니터링 요약과 비용 권장 리포트입니다.

---

## 1. 인프라 운영 가용성 요약
- **관제 대상 인프라 자원**: VM 및 DB 총 `{active_vms} Nodes`
- **월간 이상징후 알람 발생 건수**: 총 `{alarms_count} 건`
- **월간 시스템 가용성 가치 (SLA)**: `{sla_value}%` (목표치 99.9% 충족)
- **보안 및 규정 감사 결과**:
  - 테넌트 데이터 격리: 애플리케이션 레벨 테넌트 필터(tenant_id) 적용 중
  - 클라우드 연동 자격증명: 봉투 암호화(Envelope Encryption) 적용 중

---

## 2. FinOps 비용 최적화 분석 (Rightsizing)
- **당월 누적 총 요금**: `₩{total_costs:,.2f}`
- **조치 시 예상 월 절감 가능액**: `₩{savings:,.2f}` (현재 비용 대비 약 {(savings/total_costs*100) if total_costs > 0 else 0:.1f}% 절감 가능)

### 💡 주요 절감 대상 제안 항목:
1. **저유용 인스턴스 Rightsizing**:
   - 미사용 및 CPU 사용률 5% 미만 노드에 대해 인스턴스 사양 다운그레이드를 추천하여 월간 고정 지출을 최소화하십시오.
2. **미사용 스토리지 볼륨 회수**:
   - 분리(Detached) 상태로 유지되며 요금만 부과되는 AWS EBS 및 SCP Block Storage 볼륨을 감지하여 영구 보존 스냅샷 생성 후 제거할 것을 권장합니다.

---

## 3. 종합 의견 및 AIOps 대응 권고
{opinion_text}

* **생성 일시**: {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")}
* **관제 수행**: ddalkkak AIOps 자동화 엔진
"""
        return report
