from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.db.session import get_db
from backend.app.core.auth import get_current_user
from backend.app.models.base import User as UserModel
from backend.app.schemas.incident import IncidentResponse, IncidentDetailResponse, IncidentUpdatePayload, MonthlyReportResponse
from backend.app.repositories.incident import IncidentRepository
from backend.app.services.incident_service import IncidentService
from backend.app.services.llm_service import LLMService
from backend.app.services.simulator import simulator
from typing import List, Dict
from loguru import logger

from backend.app.core.license import check_license_write_gate

router = APIRouter(prefix="/incidents", tags=["incidents"])

def get_incident_service(db: AsyncSession = Depends(get_db)) -> IncidentService:
    repo = IncidentRepository(db)
    return IncidentService(repo)

@router.get("", response_model=List[IncidentResponse])
async def list_incidents(
    service: IncidentService = Depends(get_incident_service),
    current_user: UserModel = Depends(get_current_user)
):
    logger.info(f"인시던트 목록 조회 요청 - 테넌트: {current_user.tenant_id}")
    return await service.list_incidents(tenant_id=current_user.tenant_id)

@router.get("/{incident_id}", response_model=IncidentDetailResponse)
async def get_incident(
    incident_id: int,
    service: IncidentService = Depends(get_incident_service),
    current_user: UserModel = Depends(get_current_user)
):
    logger.info(f"인시던트 상세 조회 요청 - ID: {incident_id}, 테넌트: {current_user.tenant_id}")
    details = await service.get_incident_details(incident_id, current_user.tenant_id)
    if not details:
        raise HTTPException(status_code=404, detail="인시던트를 찾을 수 없습니다.")
    return details

@router.put("/{incident_id}", response_model=IncidentResponse, dependencies=[Depends(check_license_write_gate)])
async def update_incident(
    incident_id: int,
    payload: IncidentUpdatePayload,
    service: IncidentService = Depends(get_incident_service),
    current_user: UserModel = Depends(get_current_user)
):
    logger.info(f"인시던트 상태 변경 요청 - ID: {incident_id}, 상태: {payload.status}")
    if current_user.role not in ["SYSTEM_ADMIN", "TENANT_OPERATOR"]:
        raise HTTPException(status_code=403, detail="인시던트 상태 변경 권한이 없습니다.")
        
    updated = await service.update_incident_status(
        incident_id=incident_id,
        tenant_id=current_user.tenant_id,
        status=payload.status,
        actor=current_user.email,
        assigned_to=payload.assigned_to
    )
    if not updated:
        raise HTTPException(status_code=404, detail="인시던트를 조회 및 수정할 수 없습니다.")
    return updated

@router.post("/{incident_id}/analyze", response_model=Dict[str, str])
async def analyze_incident(
    incident_id: int,
    service: IncidentService = Depends(get_incident_service),
    current_user: UserModel = Depends(get_current_user)
):
    logger.info(f"AI 장애 RCA 분석 요청 - ID: {incident_id}")
    details = await service.get_incident_details(incident_id, current_user.tenant_id)
    if not details:
        raise HTTPException(status_code=404, detail="분석 대상 인시던트가 존재하지 않습니다.")
        
    return await LLMService.generate_incident_rca(details["incident"], details["timeline"])

@router.post("/{incident_id}/remediate", response_model=IncidentResponse, dependencies=[Depends(check_license_write_gate)])
async def remediate_incident(
    incident_id: int,
    service: IncidentService = Depends(get_incident_service),
    current_user: UserModel = Depends(get_current_user)
):
    logger.info(f"AI 자동조치 런북 실행 승인 요청 - ID: {incident_id}")
    if current_user.role not in ["SYSTEM_ADMIN", "TENANT_OPERATOR"]:
        raise HTTPException(status_code=403, detail="자동조치 실행 승인 권한이 없습니다.")
        
    resolved = await service.remediate_incident(
        incident_id=incident_id,
        tenant_id=current_user.tenant_id,
        actor=current_user.email
    )
    if not resolved:
        raise HTTPException(status_code=404, detail="자동조치를 수행할 수 없거나 인시던트가 존재하지 않습니다.")
    return resolved

@router.get("/report/monthly", response_model=MonthlyReportResponse)
async def get_monthly_report(
    service: IncidentService = Depends(get_incident_service),
    current_user: UserModel = Depends(get_current_user)
):
    logger.info(f"월간 운영 보고서 AI 초안 요청 - 테넌트: {current_user.tenant_id}")
    
    # 실시간 모니터링 데이터로부터 현황 수집
    topo = simulator.get_topology(current_user.tenant_id)
    costs = simulator.get_costs(current_user.tenant_id)
    
    active_vms = len([n for n in topo["nodes"] if n["type"] in ["vm", "database"]])
    incidents = await service.list_incidents(current_user.tenant_id)
    
    monthly_costs = float(costs["monthly_total"])
    savings = sum(float(r["savings"]) for r in costs["recommendations"])
    
    report_md = await LLMService.generate_monthly_report(
        tenant_id=current_user.tenant_id,
        active_vms=active_vms,
        alarms_count=len(incidents),
        total_costs=monthly_costs,
        savings=savings
    )
    return {"report_markdown": report_md}
