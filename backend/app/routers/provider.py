from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from loguru import logger
from backend.app.core.auth import User, get_current_user
from backend.app.core.providers import get_provider, list_providers

router = APIRouter()


@router.get("/providers", response_model=List[dict])
def get_providers(current_user: User = Depends(get_current_user)):
    """
    플랫폼이 지원하는 전체 클라우드 프로바이더(SCP/AWS)의 명칭·용어·리전 메타데이터를 반환합니다.
    """
    logger.info(f"프로바이더 레지스트리 목록 조회 요청 - 사용자: {current_user.email}")
    return list_providers()


@router.get("/providers/{pid}", response_model=dict)
def get_provider_detail(pid: str, current_user: User = Depends(get_current_user)):
    """
    특정 프로바이더 ID(scp/aws)의 명칭·용어·리전 메타데이터를 반환합니다.
    """
    logger.info(f"프로바이더 상세 조회 요청 - pid: {pid}, 사용자: {current_user.email}")
    provider = get_provider(pid)
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"요청하신 프로바이더 '{pid}'는 지원되지 않습니다."
        )
    return provider
