from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from backend.app.models.base import Incident, IncidentTimeline
from typing import List, Optional
from datetime import datetime
from loguru import logger

class IncidentRepository:
    """
    인시던트(장애) 및 인시던트 타임라인 조회/등록 처리용 DB 레포지토리 계층
    """
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self, 
        tenant_id: str, 
        title: str, 
        description: Optional[str], 
        severity: str, 
        status: str = "OPEN"
    ) -> Incident:
        """
        새로운 장애 인시던트를 DB에 생성합니다.
        """
        incident = Incident(
            tenant_id=tenant_id,
            title=title,
            description=description,
            severity=severity,
            status=status,
            created_at=datetime.utcnow()
        )
        self.session.add(incident)
        await self.session.commit()
        await self.session.refresh(incident)
        logger.info(f"[인시던트 생성 완료] ID: {incident.id}, 테넌트: {tenant_id}, 제목: {title}")
        return incident

    async def get_by_id(self, incident_id: int, tenant_id: str) -> Optional[Incident]:
        """
        단일 인시던트를 조회합니다 (tenant_id 필터링 필수 적용).
        """
        stmt = select(Incident).where(Incident.id == incident_id)
        if tenant_id != "system":
            stmt = stmt.where(Incident.tenant_id == tenant_id)
            
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_all_by_tenant(self, tenant_id: str) -> List[Incident]:
        """
        테넌트 소속 모든 인시던트를 최신순으로 조회합니다.
        """
        stmt = select(Incident).order_by(Incident.created_at.desc())
        if tenant_id != "system":
            stmt = stmt.where(Incident.tenant_id == tenant_id)
            
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_status(
        self, 
        incident_id: int, 
        tenant_id: str, 
        status: str, 
        assigned_to: Optional[str] = None
    ) -> Optional[Incident]:
        """
        인시던트의 조치 상태 또는 담당자를 업데이트합니다. ( tenant_id 격리 )
        """
        incident = await self.get_by_id(incident_id, tenant_id)
        if not incident:
            logger.warning(f"상태 변경 시도 실패: 인시던트를 찾을 수 없음 (ID: {incident_id}, 테넌트: {tenant_id})")
            return None
            
        incident.status = status
        if status == "RESOLVED":
            incident.resolved_at = datetime.utcnow()
        if assigned_to:
            incident.assigned_to = assigned_to
            
        await self.session.commit()
        await self.session.refresh(incident)
        logger.info(f"[인시던트 업데이트] ID: {incident.id}, 상태: {status}, 담당: {assigned_to}")
        return incident

    async def add_timeline(
        self, 
        incident_id: int, 
        event_type: str, 
        actor: str, 
        message: str
    ) -> IncidentTimeline:
        """
        인시던트 장애 대응 경과 및 상태 전이를 기록하는 타임라인을 데이터베이스에 추가합니다.
        """
        timeline = IncidentTimeline(
            incident_id=incident_id,
            event_type=event_type,
            actor=actor,
            message=message,
            created_at=datetime.utcnow()
        )
        self.session.add(timeline)
        await self.session.commit()
        await self.session.refresh(timeline)
        logger.debug(f"[타임라인 추가] 인시던트: {incident_id}, 액터: {actor}, 메시지: {message}")
        return timeline

    async def get_timeline_by_incident(self, incident_id: int, tenant_id: str) -> List[IncidentTimeline]:
        """
        인시던트의 전체 타임라인 내역을 오름차순으로 조회합니다. ( tenant_id 소속 검증 포함 )
        """
        incident = await self.get_by_id(incident_id, tenant_id)
        if not incident:
            return []
            
        stmt = select(IncidentTimeline).where(IncidentTimeline.incident_id == incident_id).order_by(IncidentTimeline.created_at.asc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
