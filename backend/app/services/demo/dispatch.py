"""
데모/실 고객사 분기 판별 헬퍼 - tenant.is_demo(DB) 기준으로 판별한다.

라우터는 이 헬퍼로 얻은 결과에 따라 데모 엔진(demo_engine) 또는 기존 실 어댑터
(simulator/cloud_adapter)로 분기한다. 실 고객사 경로는 이 모듈을 거치지 않는 한
절대 영향을 받지 않는다.
"""
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.repositories.tenant import TenantRepository


async def resolve_is_demo(db: AsyncSession, tenant_id: str) -> bool:
    """주어진 tenant_id가 데모 워크스페이스(is_demo=True)인지 DB 기준으로 판별한다."""
    if not tenant_id or tenant_id == "system":
        return False
    tenant = await TenantRepository(db).get_by_id(tenant_id)
    return bool(tenant and tenant.is_demo)


async def list_demo_tenant_ids(db: AsyncSession) -> List[str]:
    """DB에 등록된 전체 데모 테넌트(is_demo=True) ID 목록을 반환한다 (system 집계 뷰 병합용)."""
    tenants = await TenantRepository(db).get_all()
    return [t.id for t in tenants if t.is_demo]
