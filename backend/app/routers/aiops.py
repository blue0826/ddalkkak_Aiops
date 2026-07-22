from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from backend.app.db.session import get_db
from backend.app.core.auth import User, get_current_user, RoleChecker
from backend.app.core.license import check_license_write_gate
from backend.app.services.finops_service import FinOpsService
from backend.app.services.incident_service import IncidentService, RemediationStateError
from backend.app.services.monitoring_service import MonitoringService
from backend.app.repositories.incident import IncidentRepository
from backend.app.repositories.alert import AlertRepository
from typing import List, Dict, Any

router = APIRouter(prefix="/aiops", tags=["AIOps Advanced"])

@router.post("/detection/run")
async def run_detection_cycle(
    current_user: User = Depends(RoleChecker(["SYSTEM_ADMIN", "TENANT_OPERATOR"])),
    db: AsyncSession = Depends(get_db)
):
    """
    탐지 사이클 온디맨드 실행 API.
    현재 테넌트 소속 인프라를 스캔하여 L1(임계치) + L2(이상탐지) + L3(노이즈 억제)를
    한 번에 수행하고, 신규 발행된 인시던트를 포함한 요약 결과를 반환합니다.
    """
    incident_repo = IncidentRepository(db)
    alert_repo = AlertRepository(db)
    service = MonitoringService(incident_repo, alert_repo)
    result = await service.run_detection_cycle(tenant_id=current_user.tenant_id)
    return result

@router.get("/costs/simulate-rightsizing")
async def simulate_rightsizing(
    node_id: str,
    scale_ratio: float = 2.0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    FinOps Rightsizing 시뮬레이터 API.
    실서버 또는 시뮬레이션 VM의 현재 메트릭을 바탕으로 다운사이징 시 예상 CPU 부하 곡선을 반환합니다.
    """
    from backend.app.services.simulator import simulator
    # 60분치 현재 CPU 메트릭 획득
    metrics = simulator.get_metrics(
        tenant_id=current_user.tenant_id,
        node_id=node_id,
        metric_name="cpu",
        minutes=60
    )
    if not metrics:
        # 실서버 연동 상태가 무효하여 노드 탐색 실패 시 첫 실제 VM으로 폴백 시도
        real_vms = simulator.active_real_vms.get(current_user.tenant_id, [])
        if real_vms:
            metrics = simulator.get_metrics(
                tenant_id=current_user.tenant_id,
                node_id=real_vms[0]["id"],
                metric_name="cpu",
                minutes=60
            )
            
    if not metrics:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 노드의 CPU 모니터링 메트릭을 찾을 수 없습니다."
        )
        
    simulation = FinOpsService.simulate_rightsizing(metrics, scale_ratio)
    return simulation

@router.get("/incidents/{id}/timeline-cards")
async def get_incident_timeline_cards(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    인시던트 RCA 시계열 분석 카드 스트림 API
    """
    repo = IncidentRepository(db)
    service = IncidentService(repo)
    cards = await service.get_timeline_cards(id, current_user.tenant_id)
    if not cards:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 인시던트를 찾을 수 없습니다."
        )
    return cards

class ScriptRunRequest(BaseModel):  # pydantic Request body 용
    script: str

@router.post(
    "/incidents/{id}/run-action-script",
    dependencies=[Depends(check_license_write_gate)]
)
async def run_action_script(
    id: int,
    req_body: ScriptRunRequest,
    current_user: User = Depends(RoleChecker(["SYSTEM_ADMIN", "TENANT_OPERATOR"])),
    db: AsyncSession = Depends(get_db)
):
    """
    AI Copilot 제안 런북 스크립트 실행 조치 API
    """
    repo = IncidentRepository(db)
    service = IncidentService(repo)
    try:
        result = await service.run_action_script(
            incident_id=id,
            tenant_id=current_user.tenant_id,
            script=req_body.script,
            actor=current_user.email
        )
    except RemediationStateError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    if result.get("status") == "FAILED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("message")
        )
    return result
