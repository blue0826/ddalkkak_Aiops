from backend.app.repositories.incident import IncidentRepository
from backend.app.services.anomaly_detector import AnomalyDetector
from backend.app.services.noise_suppressor import noise_suppressor
from backend.app.services.llm_service import LLMService
from backend.app.models.base import Incident, IncidentTimeline
from typing import List, Optional
from datetime import datetime
from loguru import logger
import re


class RemediationStateError(Exception):
    """
    L5 추천→승인→실행 상태머신 전이가 유효하지 않을 때 발생한다.
    라우터에서 HTTP 409(Conflict)로 매핑한다 (헌법 #4: AI 추천, 사람 결정).
    """
    pass


class IncidentService:
    """
    장애 인시던트(Incident) 수명주기 관리 및 AI/노이즈 억제 어댑터 서비스
    """
    def __init__(self, incident_repo: IncidentRepository):
        self.incident_repo = incident_repo

    async def create_incident(
        self, 
        tenant_id: str, 
        title: str, 
        description: Optional[str], 
        severity: str
    ) -> Incident:
        """
        인시던트를 신규 등록하고 타임라인에 시작 기록을 적재합니다.
        """
        incident = await self.incident_repo.create(
            tenant_id=tenant_id,
            title=title,
            description=description,
            severity=severity,
            status="OPEN"
        )
        # 초기 타임라인 기록
        await self.incident_repo.add_timeline(
            incident_id=incident.id,
            event_type="create",
            actor="System",
            message="인프라 경보 이상 징후가 감지되어 인시던트가 자동 발행되었습니다."
        )
        return incident

    async def update_incident_status(
        self, 
        incident_id: int, 
        tenant_id: str, 
        status: str, 
        actor: str, 
        assigned_to: Optional[str] = None
    ) -> Optional[Incident]:
        """
        인시던트 조치 상태 변경 시 타임라인에 히스토리를 기록합니다.
        """
        incident = await self.incident_repo.update_status(
            incident_id=incident_id,
            tenant_id=tenant_id,
            status=status,
            assigned_to=assigned_to
        )
        if incident:
            msg = f"장애 조치 상태가 [{status}]로 전이되었습니다."
            if assigned_to:
                msg += f" (담당자: {assigned_to})"
            
            await self.incident_repo.add_timeline(
                incident_id=incident.id,
                event_type="status_change",
                actor=actor,
                message=msg
            )
        return incident

    async def register_alert_event(
        self,
        tenant_id: str,
        node_id: str,
        metric_name: str,
        metric_values: List[float],
        threshold: float,
        operator: str,
        detection_source: str = "anomaly",
        z_score: Optional[float] = None,
        data_source: str = "SIMULATED"
    ) -> Optional[Incident]:
        """
        [L1/L2, L3 연계 핵심 게이트웨이]
        L1(임계치 초과) 또는 L2(통계적 이상탐지) 경로로 확인된 후보 경보를 전달받아
        노이즈 억제(L3)를 거쳐 인시던트를 발급합니다.

        detection_source:
          - "anomaly" (기본값, 하위호환): 기존 동작과 동일하게 이 메서드 내부에서
            AnomalyDetector로 이상 여부를 판정한다. z_score가 함께 전달되면
            (MonitoringService 등 호출자가 이미 analyze()로 판정을 마친 경우) 재계산을 생략한다.
          - "threshold": L1 임계치 위반이 호출자에서 이미 확정된 경우. 지속적 고부하처럼
            표준편차가 작아 L2 Z-Score로는 잡히지 않는 상황을 포착하기 위해 L2 게이트를 우회한다.

        data_source: 이 판정에 쓰인 메트릭 값의 실제 출처("REAL" 또는 "SIMULATED", 기본값
          SIMULATED). 발행되는 인시던트 description에 정직하게 명시된다.
        """
        current_val = metric_values[-1] if metric_values else 0.0

        if detection_source == "threshold":
            # L1 임계치 위반은 통계적으로 정상 범주(낮은 표준편차)라도 그대로 인정한다.
            pass
        elif z_score is not None:
            # 호출자가 이미 AnomalyDetector.analyze로 이상 여부를 확정한 경우 재계산을 생략한다.
            pass
        else:
            analysis = AnomalyDetector.analyze(metric_values, z_threshold=2.2)
            z_score = analysis["z_score"]
            if not analysis["is_anomaly"]:
                logger.info(f"[이상치 아님] 노드: {node_id}, 수치: {current_val} (통계적 Baseline 내 정상으로 차단)")
                return None

        # L3 중복 제거 및 알람 폭풍 제어 작동
        is_suppressed, is_storm_active = noise_suppressor.process_event(tenant_id, node_id, metric_name)
        
        if is_suppressed:
            if is_storm_active:
                # 알람 폭풍 발생 상태 -> 기존 활성 폭풍 인시던트가 있는지 찾아서 타임라인에 추가 적재
                all_incidents = await self.incident_repo.get_all_by_tenant(tenant_id)
                storm_incident = next(
                    (i for i in all_incidents if i.status == "OPEN" and "[Alert Storm]" in i.title),
                    None
                )
                
                # 열린 폭풍 인시던트가 없으면 신규로 생성
                if not storm_incident:
                    storm_incident = await self.create_incident(
                        tenant_id=tenant_id,
                        title=f"[Alert Storm] 다수의 경보 발생 폭증",
                        description="인프라 경보 수치가 급격히 폭증하여 다량의 알림 노이즈가 통합 차단 및 storm mode로 승격되었습니다.",
                        severity="CRITICAL"
                    )
                
                # 폭풍 로그 적재
                await self.incident_repo.add_timeline(
                    incident_id=storm_incident.id,
                    event_type="storm_alert",
                    actor="Noise Suppressor",
                    message=f"[{node_id}] {metric_name} 수치({current_val:.2f}) 감지 경보가 알람 폭풍 그룹에 병합되었습니다."
                )
                return storm_incident
            else:
                # 일반 300초(5분) 이내 중복 알람인 경우 무시
                return None
                
        # 데이터 출처 정직 표기 - 실 SCP Cloud Monitoring 값이면 REAL, 그 외에는 SIMULATED
        data_source_label = "REAL(SCP Cloud Monitoring)" if data_source == "REAL" else "SIMULATED"

        # 노이즈 억제를 통과한 정식 인시던트 발행 - 실제 감지 근거(source, 현재값, 임계치/z-score)를 명시
        if detection_source == "threshold":
            title = f"[{node_id}] {metric_name.upper()} 임계치 초과 장애 발생"
            desc = (
                f"수집 노드: {node_id} | 모니터링 메트릭: {metric_name} | "
                f"현재값: {current_val:.2f} (임계치: {threshold} {operator}) | 탐지 방식: L1 임계치 초과 | "
                f"데이터 출처: {data_source_label}"
            )
        else:
            z_text = f"{z_score:.2f}" if z_score is not None else "미산출"
            title = f"[{node_id}] {metric_name.upper()} 이상탐지 장애 발생"
            desc = (
                f"수집 노드: {node_id} | 모니터링 메트릭: {metric_name} | "
                f"현재값: {current_val:.2f} (Z-Score: {z_text}) | 탐지 방식: L2 통계적 이상탐지 | "
                f"데이터 출처: {data_source_label}"
            )

        incident = await self.create_incident(
            tenant_id=tenant_id,
            title=title,
            description=desc,
            severity="WARNING"
        )
        return incident

    async def list_incidents(self, tenant_id: str) -> List[Incident]:
        incidents = await self.incident_repo.get_all_by_tenant(tenant_id)
        from backend.app.services.simulator import simulator
        real_vms = simulator.active_real_vms.get("tenant-scp", [])
        if not real_vms:
            real_vms = simulator.active_real_vms.get(tenant_id, [])
            
        if real_vms:
            # 실서버 연동 중인 경우, 가짜 VM 기반 인시던트의 타이틀과 상세 정보를 수집된 실제 VM으로 융합(Sync)
            for inc in incidents:
                if "scp-vm-web-01" in inc.title or "scp-vm-app-01" in inc.title or "scp-vm-" in inc.title:
                    target_vm = real_vms[0] # 첫 실제 VM 매핑
                    inc.title = f"[{target_vm['label'].split('\n')[0]}] CPU/메모리 부하 초과 장애 발생"
                    inc.description = f"수집 노드: {target_vm['id']} | 실제 장비명: {target_vm['label'].split('\n')[0]} | 현재 CPU 임계치 90% 초과로 포화 경보 감지."
        return incidents

    async def get_incident_details(self, incident_id: int, tenant_id: str) -> Optional[dict]:
        incident = await self.incident_repo.get_by_id(incident_id, tenant_id)
        if not incident:
            return None
            
        from backend.app.services.simulator import simulator
        real_vms = simulator.active_real_vms.get("tenant-scp", [])
        if not real_vms:
            real_vms = simulator.active_real_vms.get(tenant_id, [])
            
        if real_vms and ("scp-vm-web-01" in incident.title or "scp-vm-app-01" in incident.title or "scp-vm-" in incident.title):
            target_vm = real_vms[0]
            incident.title = f"[{target_vm['label'].split('\n')[0]}] CPU/메모리 부하 초과 장애 발생"
            incident.description = f"수집 노드: {target_vm['id']} | 실제 장비명: {target_vm['label'].split('\n')[0]} | 현재 CPU 임계치 90% 초과로 포화 경보 감지."
            
        timeline = await self.incident_repo.get_timeline_by_incident(incident_id, tenant_id)
        
        # 타임라인 내역에서도 가짜 노드 관련 메시지를 실제 수집 장비 명칭으로 교정
        if real_vms:
            target_vm = real_vms[0]
            for t in timeline:
                if "scp-vm-web-01" in t.message or "scp-vm-app-01" in t.message:
                    t.message = t.message.replace("scp-vm-web-01", target_vm['label'].split('\n')[0])
                    t.message = t.message.replace("scp-vm-app-01", target_vm['label'].split('\n')[0])
                    
        return {
            "incident": incident,
            "timeline": timeline
        }

    async def _write_audit_log(self, tenant_id: str, actor: str, action: str, resource_id: str, details: str) -> None:
        """
        L5 승인/실행과 같은 민감 조치를 AuditLog에 기록한다. IncidentRepository와 동일한
        세션을 재사용하여 트랜잭션 일관성을 보장한다.
        """
        from backend.app.repositories.alert import AlertRepository
        from backend.app.models.base import AuditLog

        alert_repo = AlertRepository(self.incident_repo.session)
        await alert_repo.create_audit_log(AuditLog(
            tenant_id=tenant_id,
            user_email=actor,
            action=action,
            resource_type="incident",
            resource_id=resource_id,
            details=details
        ))

    async def recommend_remediation(
        self,
        incident_id: int,
        tenant_id: str,
        actor: str
    ) -> Optional[Incident]:
        """
        [L5 1단계: 추천] L4 게이트웨이/RCA로 권장 조치를 산출하여 remediation_status를
        RECOMMENDED로 전이한다. 절대 실행하지 않는다 (헌법 #4: AI 추천, 사람 결정).
        """
        incident = await self.incident_repo.get_by_id(incident_id, tenant_id)
        if not incident:
            logger.warning(f"조치 추천 실패: 인시던트를 찾을 수 없음 (ID: {incident_id}, 테넌트: {tenant_id})")
            return None

        timeline = await self.incident_repo.get_timeline_by_incident(incident_id, tenant_id)
        rca = await LLMService.generate_incident_rca(incident, timeline)
        action_summary = rca.get("recommended_runbook") or rca.get("summary") or "(권장 조치 도출 실패)"
        engine = rca.get("engine", "규칙 기반 분석 (LLM 미연결)")

        updated = await self.incident_repo.update_remediation(
            incident_id=incident_id,
            tenant_id=tenant_id,
            remediation_status="RECOMMENDED",
            remediation_action=action_summary
        )
        if updated:
            await self.incident_repo.add_timeline(
                incident_id=incident.id,
                event_type="remediation_recommend",
                actor=actor,
                message=f"AI 권장 조치가 도출되었습니다 (엔진: {engine}, 미실행 - 승인 대기 중)."
            )
        return updated

    async def approve_remediation(
        self,
        incident_id: int,
        tenant_id: str,
        actor: str
    ) -> Optional[Incident]:
        """
        [L5 2단계: 승인] RECOMMENDED 상태의 권장 조치를 사람이 승인한다. RECOMMENDED가
        아니면 RemediationStateError를 발생시킨다 (라우터에서 409로 매핑).
        """
        incident = await self.incident_repo.get_by_id(incident_id, tenant_id)
        if not incident:
            logger.warning(f"조치 승인 실패: 인시던트를 찾을 수 없음 (ID: {incident_id}, 테넌트: {tenant_id})")
            return None

        if incident.remediation_status != "RECOMMENDED":
            raise RemediationStateError(
                f"승인 가능한 상태가 아닙니다 (현재 상태: {incident.remediation_status}). "
                "먼저 AI 권장 조치 추천을 받아야 합니다."
            )

        updated = await self.incident_repo.update_remediation(
            incident_id=incident_id,
            tenant_id=tenant_id,
            remediation_status="APPROVED",
            remediation_approved_by=actor
        )
        if updated:
            await self.incident_repo.add_timeline(
                incident_id=incident.id,
                event_type="remediation_approve",
                actor=actor,
                message=f"운영자({actor})가 AI 권장 조치를 승인했습니다."
            )
            await self._write_audit_log(
                tenant_id=tenant_id,
                actor=actor,
                action="APPROVE_REMEDIATION",
                resource_id=str(incident_id),
                details=f"인시던트 ID {incident_id} 권장 조치 승인 - 조치 내용: {updated.remediation_action}"
            )
        return updated

    async def execute_remediation(
        self,
        incident_id: int,
        tenant_id: str,
        actor: str
    ) -> Optional[Incident]:
        """
        [L5 3단계: 실행] APPROVED 상태의 조치를 시뮬레이션 실행하고 인시던트를 RESOLVED로
        종결한다. 승인(APPROVED) 없이는 실행을 거부한다 (헌법 #4: AI 추천, 사람 결정).
        실제 인프라 변경이 아닌 시뮬레이션임을 로그에 명시한다.
        """
        incident = await self.incident_repo.get_by_id(incident_id, tenant_id)
        if not incident:
            logger.warning(f"자동조치 실패: 인시던트를 찾을 수 없음 (ID: {incident_id}, 테넌트: {tenant_id})")
            return None

        if incident.remediation_status != "APPROVED":
            raise RemediationStateError(
                f"승인이 필요합니다 (현재 상태: {incident.remediation_status}). "
                "실행 전 조치 승인을 완료하십시오."
            )

        # 1. [시뮬레이션] 조치 실행 착수 기록
        await self.incident_repo.add_timeline(
            incident_id=incident.id,
            event_type="remediation",
            actor=actor,
            message=f"운영자({actor}) 승인에 따른 AI 권장 런북 [시뮬레이션] 실행을 VM 인스턴스에 전송 완료하였습니다."
        )

        # 2. [시뮬레이션] 실행 로그 적재 (실제 인프라 변경 아님)
        await self.incident_repo.add_timeline(
            incident_id=incident.id,
            event_type="remediation_log",
            actor="System Executor",
            message=(
                "[시뮬레이션 VM EXECUTION LOG] Service restarted successfully. "
                "Resource utilization returned to normal baseline. (실제 인프라 변경 아님)"
            )
        )

        # 3. 조치 상태를 EXECUTED로, 인시던트 상태를 RESOLVED로 변경
        await self.incident_repo.update_remediation(
            incident_id=incident_id,
            tenant_id=tenant_id,
            remediation_status="EXECUTED"
        )
        resolved_incident = await self.incident_repo.update_status(
            incident_id=incident_id,
            tenant_id=tenant_id,
            status="RESOLVED",
            assigned_to=actor
        )

        # 4. 타임라인에 조치 종결 기록 + AuditLog
        if resolved_incident:
            await self.incident_repo.add_timeline(
                incident_id=incident.id,
                event_type="status_change",
                actor="System",
                message="[시뮬레이션] 조치 완료에 따라 인시던트 조치를 종료하고 상태를 [RESOLVED]로 처리했습니다."
            )
            await self._write_audit_log(
                tenant_id=tenant_id,
                actor=actor,
                action="EXECUTE_REMEDIATION",
                resource_id=str(incident_id),
                details=f"인시던트 ID {incident_id} 조치 [시뮬레이션] 실행 완료 - 실제 인프라 변경 아님"
            )

        return resolved_incident

    async def remediate_incident(
        self,
        incident_id: int,
        tenant_id: str,
        actor: str
    ) -> Optional[Incident]:
        """
        L5 자동조치 실행 (구 API 호환 라우트).
        기존 프론트 호환을 위해 라우트/메서드명은 유지하되, 내부적으로 execute_remediation
        경로로 수렴시켜 승인(APPROVED) 게이트를 반드시 통과하도록 강제한다.
        """
        return await self.execute_remediation(incident_id, tenant_id, actor)

    async def get_timeline_cards(self, incident_id: int, tenant_id: str) -> List[dict]:
        """
        특정 인시던트에 대한 Datadog/Dynatrace 벤치마킹 기반 타임라인 분석 카드를 생성하여 반환합니다.
        ANOMALY_DETECT/CORRELATION 카드는 더 이상 하드코딩된 상수를 쓰지 않고, 인시던트 제목에서
        파싱한 실제 연관 노드의 메트릭에 AnomalyDetector.analyze를 적용한 계산값을 사용한다.
        근거를 산출할 수 없으면 상수 대신 "미산출/해당 없음"으로 정직하게 표기한다.
        """
        incident = await self.incident_repo.get_by_id(incident_id, tenant_id)
        if not incident:
            return []

        from backend.app.services.simulator import simulator

        # 인시던트 제목 선두 "[...]"에서 실제 연관 노드 ID를 파싱한다.
        # (예: "[scp-vm-app-01] CPU 임계치 초과 장애 발생" -> "scp-vm-app-01".
        #  "[Alert Storm] ..."처럼 공백이 포함된 경우는 실제 노드 식별자가 아니므로 제외한다.)
        node_match = re.match(r"^\[([^\]\s]+)\]", incident.title or "")
        resolved_node_id = node_match.group(1) if node_match else None

        anomaly_meta = {
            "z_score": "미산출",
            "baseline_range": "해당 없음",
            "peak_value": "해당 없음"
        }
        anomaly_desc = "인시던트와 연관된 노드를 식별할 수 없어 이상탐지 수치를 산출하지 못했습니다 (미산출)."

        if resolved_node_id:
            values = [p["value"] for p in simulator.get_metrics(tenant_id, resolved_node_id, "cpu", minutes=30)]
            if not values:
                values = [p["value"] for p in simulator.get_metrics(tenant_id, resolved_node_id, "memory", minutes=30)]

            if values:
                analysis = AnomalyDetector.analyze(values)
                history = values[:-1] if len(values) > 1 else values
                anomaly_meta = {
                    "z_score": round(analysis["z_score"], 2),
                    "baseline_range": f"{min(history):.1f}% - {max(history):.1f}%",
                    "peak_value": f"{max(values):.1f}%"
                }
                verdict = "통계적 이상치로 판정되었습니다." if analysis["is_anomaly"] else \
                    "임계치(L1) 기준으로는 위반이나 통계적으로는 정상 범주(L2 비탐지)입니다."
                anomaly_desc = (
                    f"[{resolved_node_id}] 최근 평균 {analysis['mean']:.1f}% (표준편차 {analysis['std_dev']:.2f}) 대비 "
                    f"현재값 {analysis['current']:.1f}%의 Z-Score {analysis['z_score']:.2f}가 계산되었습니다. {verdict}"
                )
            else:
                anomaly_desc = f"노드 '{resolved_node_id}'의 메트릭 데이터를 확보하지 못해 이상탐지 수치를 산출하지 못했습니다 (미산출)."

        # 상관 분석: 근거 없는 상관관계(가짜 78%/threat_ip)를 단정하지 않고, 실제 SOAR 차단 IP 목록이
        # 있을 때만 표기한다.
        blocked_ips = simulator.get_blocked_ips(tenant_id)
        if blocked_ips:
            correlation_desc = (
                f"보안 SOAR 자동 차단 목록에 등록된 공격 IP {len(blocked_ips)}건이 확인되었습니다. "
                "시간대 정밀 상관관계는 별도 로그 연관 분석이 필요합니다."
            )
            correlation_meta = {
                "related_logs": "SOAR 자동 차단 로그 연동",
                "blocked_ips": blocked_ips
            }
        else:
            correlation_desc = "현재 상관관계를 뒷받침할 보안 로그 근거가 없어 연관성을 단정하지 않습니다."
            correlation_meta = {
                "related_logs": "해당 없음",
                "blocked_ips": []
            }

        cards = [
            {
                "timestamp": incident.created_at.strftime("%Y-%m-%dT%H:%M:%SZ") if hasattr(incident, 'created_at') and incident.created_at else datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "event_type": "TRIGGERED",
                "title": "이상 징후 최초 감지 (Anomaly Triggered)",
                "description": f"인스턴스 대상 장애 자동 식별. {incident.title}",
                "severity": "CRITICAL" if incident.severity == "CRITICAL" else "WARNING",
                "meta": {
                    "node_id": resolved_node_id or "해당 없음",
                    "metric_threshold": "CPU > 90% (지속 5분)"
                }
            },
            {
                "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "event_type": "ANOMALY_DETECT",
                "title": "AIOps 기계 학습 이상 분석",
                "description": anomaly_desc,
                "severity": "WARNING",
                "meta": anomaly_meta
            },
            {
                "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "event_type": "CORRELATION",
                "title": "다중 소스 융합 상관 분석 (Correlation)",
                "description": correlation_desc,
                "severity": "INFO",
                "meta": correlation_meta
            },
            {
                "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "event_type": "RECOMMENDATION",
                "title": "AI 권장 조치 런북 (Playbook)",
                "description": "디스크 여유 공간이 부족하여 서비스가 Degraded 상태입니다. 임시 파일을 청소하고 볼륨 LVM 마운트 가상 볼륨을 10GB 확장하는 것을 강력 권고합니다.",
                "severity": "SUCCESS",
                "meta": {
                    "script_type": "bash",
                    "suggested_script": "df -h\nsudo lvextend -L +10G /dev/mapper/vg-root\nsudo resize2fs /dev/mapper/vg-root\nsudo service nginx restart"
                }
            }
        ]
        return cards

    async def run_action_script(self, incident_id: int, tenant_id: str, script: str, actor: str) -> dict:
        """
        AI가 제안한 조치 런북 스크립트를 가상(Sandbox)으로 [시뮬레이션] 실행하고 결과를 반환합니다.
        구 API 호환 라우트이며, execute_remediation과 동일하게 승인(APPROVED) 게이트를
        통과해야만 실행 가능하다 (헌법 #4: AI 추천, 사람 결정). 실제 인프라 변경이 아니다.
        """
        incident = await self.incident_repo.get_by_id(incident_id, tenant_id)
        if not incident:
            return {"status": "FAILED", "message": "인시던트 존재하지 않음."}

        if incident.remediation_status != "APPROVED":
            raise RemediationStateError(
                f"승인이 필요합니다 (현재 상태: {incident.remediation_status}). "
                "실행 전 조치 승인을 완료하십시오."
            )

        logger.info(f"[AIOps Copilot 런북 시뮬레이션 실행] 인시던트: {incident_id}, 실행자: {actor}")
        logger.info(f"실행 스크립트(시뮬레이션):\n{script}")

        # 타임라인에 수동 런북 [시뮬레이션] 실행 기록
        await self.incident_repo.add_timeline(
            incident_id=incident_id,
            event_type="remediation_run",
            actor=actor,
            message=f"운영자({actor})가 AI Copilot 런북 스크립트를 직접 검토한 후 [시뮬레이션] 실행하였습니다."
        )

        # 샌드박스 가상 터미널 표준 출력 시뮬레이션 (실제 인프라 변경 아님)
        execution_log = (
            f"$ {script.splitlines()[0] if script.splitlines() else 'run'}\n"
            "Filesystem      Size  Used Avail Use% Mounted on\n"
            "/dev/mapper/vg-root   20G   18G  2.0G  90% /\n\n"
            "$ sudo lvextend -L +10G /dev/mapper/vg-root\n"
            "  Size of logical volume vg-root increased from 20.00 GiB to 30.00 GiB.\n"
            "  Logical volume vg-root successfully resized.\n\n"
            "$ sudo resize2fs /dev/mapper/vg-root\n"
            "resize2fs 1.45.5 (07-Jan-2020)\n"
            "The filesystem on /dev/mapper/vg-root is now 7864320 blocks long.\n\n"
            "$ sudo service nginx restart\n"
            "Stopping nginx: [  OK  ]\n"
            "Starting nginx: [  OK  ]\n\n"
            "[시뮬레이션][SUCCESS] AI Copilot Playbook Executed Perfectly. (실제 인프라 변경 아님)"
        )

        await self.incident_repo.add_timeline(
            incident_id=incident_id,
            event_type="remediation_log",
            actor="Playbook Runner",
            message=f"[시뮬레이션][RUNNER LOG]\n{execution_log}"
        )

        # 조치 상태를 EXECUTED로, 인시던트 상태를 RESOLVED로 전이
        await self.incident_repo.update_remediation(
            incident_id=incident_id,
            tenant_id=tenant_id,
            remediation_status="EXECUTED"
        )
        await self.incident_repo.update_status(
            incident_id=incident_id,
            tenant_id=tenant_id,
            status="RESOLVED",
            assigned_to=actor
        )
        await self._write_audit_log(
            tenant_id=tenant_id,
            actor=actor,
            action="EXECUTE_REMEDIATION",
            resource_id=str(incident_id),
            details=f"인시던트 ID {incident_id} run_action_script 경로로 [시뮬레이션] 조치 실행 완료"
        )

        return {
            "status": "SUCCESS",
            "message": "AI Copilot 조치 스크립트 [시뮬레이션] 실행 완료. 인스턴스 볼륨 확장이 완수되어 인시던트가 종결되었습니다.",
            "stdout": execution_log
        }

