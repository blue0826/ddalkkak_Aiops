from typing import List, Optional
from loguru import logger
from fastapi.concurrency import run_in_threadpool

from backend.app.repositories.incident import IncidentRepository
from backend.app.repositories.alert import AlertRepository
from backend.app.repositories.credential import CredentialRepository
from backend.app.repositories.tenant_service_setting import TenantServiceSettingRepository
from backend.app.services.incident_service import IncidentService
from backend.app.services.anomaly_detector import AnomalyDetector
from backend.app.services.simulator import simulator
from backend.app.services.cloud_adapter import SCPAdapter
from backend.app.services.credential_service import CredentialService, resolve_scp_credential_fields

# 메트릭이 의미있는 자원 타입만 탐지 대상으로 삼는다 (vpc/subnet/gateway 등은 제외)
TARGET_NODE_TYPES = ("vm", "database")
DETECTION_METRICS = ("cpu", "memory")
METRIC_WINDOW_MINUTES = 30


def _violates_threshold(current_value: float, operator: str, threshold: float) -> bool:
    """
    AlertRule의 operator/threshold 기준으로 현재값(마지막 값)의 임계치 위반 여부를 판정합니다.
    """
    if operator == "gt":
        return current_value > threshold
    if operator == "lt":
        return current_value < threshold
    if operator == "eq":
        return current_value == threshold
    return False


class MonitoringService:
    """
    L1(임계치 초과) + L2(통계적 이상탐지) + L3(노이즈 억제)를 하나의 탐지 사이클로 묶는
    오케스트레이션 서비스.

    L1과 L2는 서로 다른 탐지 방식이다: 지속적 고부하(sustained-high)는 표준편차가 작아
    Z-Score 기반 L2로는 잡히지 않고 L1 임계치로만 잡힌다. 급격한 스파이크는 반대로 L2가
    주로 포착한다. 이 서비스는 노드 × 메트릭 조합마다 L1/L2를 독립적으로 평가하여 후보를
    만들고, 후보를 L3 노이즈 억제(및 인시던트 생성/알람 폭풍 병합) 경로로 넘긴다.
    """

    def __init__(self, incident_repo: IncidentRepository, alert_repo: AlertRepository):
        self.incident_repo = incident_repo
        self.alert_repo = alert_repo
        self.incident_service = IncidentService(incident_repo)

    async def _resolve_scp_adapter(
        self, tenant_id: str, service_repo: TenantServiceSettingRepository
    ) -> Optional[SCPAdapter]:
        """
        탐지 사이클용 SCP 실연동 어댑터를 준비합니다. 해당 테넌트에 SCP 자격증명이 없거나
        조회 중 오류가 발생하면 None을 반환하며, 호출측은 시뮬레이터로 안전하게 폴백합니다.

        과금 서비스 게이트(CEO 결정 2026-07-20): monitor.py get_metrics와 동일하게, 운영자가
        해당 테넌트에 대해 ("scp","monitoring")을 명시적으로 동의(enabled=true)하지 않았으면
        자격증명 조회조차 시도하지 않고(불필요한 DECRYPT_CREDENTIAL 감사로그 방지) 어댑터
        구성 자체를 건너뛴다 - 부재/OFF 모두 안전하게 None(시뮬레이터 폴백)으로 처리한다.
        """
        try:
            service_consent = await service_repo.get(tenant_id, "scp", "monitoring")
            if not (service_consent and service_consent.enabled):
                logger.info(
                    f"[탐지 사이클][유료 서비스 미동의] SCP Cloud Monitoring 비활성화 상태 - "
                    f"테넌트: {tenant_id} - 실 API 호출을 건너뛰고 시뮬레이터로 폴백합니다."
                )
                return None

            cred_repo = CredentialRepository(self.alert_repo.session)
            cred_service = CredentialService(cred_repo, self.alert_repo)
            scp_fields = await resolve_scp_credential_fields(
                cred_service, tenant_id, user_email="system(monitoring_service)"
            )
            if not scp_fields:
                return None
            return SCPAdapter(
                tenant_id,
                access_key=scp_fields["access_key"],
                secret_key=scp_fields["secret_key"],
                project_id=scp_fields["project_id"],
                endpoint_url=scp_fields["endpoint_url"],
            )
        except Exception as ex:
            logger.error(f"[탐지 사이클] SCP 자격증명 조회 실패 - 사유: {str(ex)}")
            return None

    async def run_detection_cycle(self, tenant_id: str, provider: Optional[str] = None) -> dict:
        """
        테넌트 소속 vm/database 노드를 스캔하여 L1 임계치 위반 및 L2 통계적 이상을 탐지하고,
        L3 노이즈 억제를 통과한 후보만 인시던트로 발행합니다.

        메트릭 취득은 monitor 라우터(/monitor/metrics)와 동일한 경로를 따른다: SCP 자격증명이
        있으면 SCPAdapter.fetch_metrics_real 실연동을 먼저 시도(REAL)하고, 값이 없거나
        실패하면 시뮬레이터로 폴백(SIMULATED)한다. 발행되는 인시던트 description에는 이
        데이터 출처가 정직하게 명시된다.
        """
        topo = simulator.get_topology(tenant_id, provider)
        target_nodes = [n for n in topo.get("nodes", []) if n.get("type") in TARGET_NODE_TYPES]

        rules = await self.alert_repo.get_all_rules_by_tenant(tenant_id)
        active_rules = [r for r in rules if r.is_active]

        # AWS 등 SCP가 아님이 명확한 provider 요청에는 불필요한 자격증명 조회를 생략한다
        scp_adapter = None
        service_repo: Optional[TenantServiceSettingRepository] = None
        if provider == "scp" or (provider is None and tenant_id in ("tenant-scp", "system")):
            service_repo = TenantServiceSettingRepository(self.alert_repo.session)
            scp_adapter = await self._resolve_scp_adapter(tenant_id, service_repo)

        candidates_count = 0
        suppressed_count = 0
        incidents_created: List[int] = []
        details: List[dict] = []

        for node in target_nodes:
            node_id = node["id"]
            for metric_name in DETECTION_METRICS:
                points = None
                data_source = "SIMULATED"

                if scp_adapter:
                    real_points = await run_in_threadpool(
                        scp_adapter.fetch_metrics_real, node_id, metric_name, METRIC_WINDOW_MINUTES
                    )
                    if real_points:
                        points = real_points
                        data_source = "REAL"
                    # 호출 결과(ok/forbidden/error)를 정직하게 기록 - get_metrics와 동일 패턴
                    if service_repo is not None:
                        await service_repo.record_call_result(
                            tenant_id, "scp", "monitoring", scp_adapter.last_call_status
                        )

                if points is None:
                    points = simulator.get_metrics(tenant_id, node_id, metric_name, minutes=METRIC_WINDOW_MINUTES)
                    data_source = "SIMULATED"

                values = [p["value"] for p in points]
                if not values:
                    continue
                current_value = values[-1]

                node_candidates = []

                # L1 임계 평가 - 활성 룰의 operator/threshold로 현재값(마지막 값) 위반 여부 판정
                matched_rule = next(
                    (
                        r for r in active_rules
                        if r.metric_name == metric_name and _violates_threshold(current_value, r.operator, r.threshold)
                    ),
                    None
                )
                if matched_rule:
                    node_candidates.append({
                        "source": "threshold",
                        "node_id": node_id,
                        "metric_name": metric_name,
                        "current_value": current_value,
                        "rule_id": matched_rule.id,
                        "threshold": matched_rule.threshold,
                        "operator": matched_rule.operator,
                        "data_source": data_source
                    })

                # L2 이상 평가 - 통계적 이상(Z-Score) 판정. L1과 독립적으로 평가한다
                # (동일 후보가 둘 다 잡혀도 L3 dedup이 자연스럽게 중복 인시던트를 막는다).
                analysis = AnomalyDetector.analyze(values)
                if analysis["is_anomaly"]:
                    node_candidates.append({
                        "source": "anomaly",
                        "node_id": node_id,
                        "metric_name": metric_name,
                        "current_value": current_value,
                        "z_score": analysis["z_score"],
                        "data_source": data_source
                    })

                for candidate in node_candidates:
                    candidates_count += 1
                    incident = await self.incident_service.register_alert_event(
                        tenant_id=tenant_id,
                        node_id=node_id,
                        metric_name=metric_name,
                        metric_values=values,
                        threshold=candidate.get("threshold", 0.0),
                        operator=candidate.get("operator", "gt"),
                        detection_source=candidate["source"],
                        z_score=candidate.get("z_score"),
                        data_source=candidate.get("data_source", "SIMULATED")
                    )
                    if incident is None:
                        suppressed_count += 1
                        logger.debug(
                            f"[탐지 사이클] 후보 억제됨 - 노드: {node_id}, 메트릭: {metric_name}, 소스: {candidate['source']}"
                        )
                    else:
                        incidents_created.append(incident.id)
                        logger.info(
                            f"[탐지 사이클] 인시던트 발행 - ID: {incident.id}, 노드: {node_id}, "
                            f"메트릭: {metric_name}, 소스: {candidate['source']}"
                        )
                    details.append({**candidate, "incident_id": incident.id if incident else None})

        result = {
            "tenant_id": tenant_id,
            "scanned_nodes": len(target_nodes),
            "candidates": candidates_count,
            "suppressed": suppressed_count,
            "incidents_created": incidents_created,
            "details": details
        }
        logger.info(
            f"[탐지 사이클 완료] 테넌트: {tenant_id}, 스캔노드: {result['scanned_nodes']}, "
            f"후보: {candidates_count}, 억제: {suppressed_count}, 신규인시던트: {len(incidents_created)}"
        )
        return result
