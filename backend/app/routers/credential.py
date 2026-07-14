from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from backend.app.db.session import get_db
from backend.app.core.auth import User, get_current_user, RoleChecker
from backend.app.schemas.credential import CredentialCreate, CredentialResponse
from backend.app.repositories.credential import CredentialRepository
from backend.app.repositories.alert import AlertRepository
from backend.app.services.credential_service import CredentialService
from loguru import logger

router = APIRouter(prefix="/credentials", tags=["credentials"])

def get_credential_service(db: AsyncSession = Depends(get_db)) -> CredentialService:
    cred_repo = CredentialRepository(db)
    alert_repo = AlertRepository(db)
    return CredentialService(cred_repo, alert_repo)

@router.post("", response_model=CredentialResponse, status_code=status.HTTP_201_CREATED)
async def create_credential(
    payload: CredentialCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN", "TENANT_OPERATOR"])),
    service: CredentialService = Depends(get_credential_service)
):
    logger.info(f"자격증명 생성 API 요청 수신 - Name: {payload.name}")
    return await service.register_credential(
        tenant_id=current_user.tenant_id,
        provider=payload.provider,
        name=payload.name,
        auth_data=payload.auth_data,
        user_email=current_user.email
    )

@router.get("", response_model=List[CredentialResponse])
async def list_credentials(
    current_user: User = Depends(get_current_user),
    service: CredentialService = Depends(get_credential_service)
):
    logger.info("자격증명 목록 API 조회 요청 수신")
    return await service.list_credentials(tenant_id=current_user.tenant_id)

@router.delete("/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    credential_id: int,
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN", "TENANT_OPERATOR"])),
    service: CredentialService = Depends(get_credential_service)
):
    logger.info(f"자격증명 삭제 API 요청 수신 - ID: {credential_id}")
    success = await service.remove_credential(
        credential_id=credential_id,
        tenant_id=current_user.tenant_id,
        user_email=current_user.email
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="요청한 자격증명을 찾을 수 없거나 삭제 권한이 없습니다."
        )

@router.get("/{credential_id}/decrypted")
async def get_decrypted_credential(
    credential_id: int,
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN", "TENANT_OPERATOR"])),
    service: CredentialService = Depends(get_credential_service)
):
    logger.info(f"자격증명 복호화 조회 API 요청 수신 - ID: {credential_id}")
    decrypted = await service.get_decrypted_credential(
        credential_id=credential_id,
        tenant_id=current_user.tenant_id
    )
    if not decrypted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="요청한 자격증명을 찾을 수 없거나 복호화 조회 권한이 없습니다."
        )
    return decrypted

@router.post("/test-scp")
async def test_scp_connection(
    access_key: str,
    secret_key: str,
    project_id: str,
    scp_env: str = "e",
    scp_region: str = "kr-west1",
    current_user: User = Depends(RoleChecker(allowed_roles=["SYSTEM_ADMIN", "TENANT_OPERATOR"])),
    db: AsyncSession = Depends(get_db)
):
    """
    삼성클라우드플랫폼(SCP) V2 OpenAPI 계정 연동성 검증 및 자동 등록/갱신 API
    scp_env: s(Samsung내부), g(Sovereign), e(Enterprise)
    scp_region: kr-west1, kr-east1, kr-south1, kr-south2, kr-south3
    """
    # 공식 문서 URL 패턴: https://virtualserver.{region}.{env}.samsungsdscloud.com
    endpoint_url = f"https://virtualserver.{scp_region}.{scp_env}.samsungsdscloud.com"
    logger.info(f"SCP 연동성 검증 API 요청 - env={scp_env}, region={scp_region}, endpoint={endpoint_url}")

    from backend.app.services.cloud_adapter import SCPAdapter
    adapter = SCPAdapter(
        tenant_id=current_user.tenant_id,
        access_key=access_key,
        secret_key=secret_key,
        project_id=project_id,
        endpoint_url=endpoint_url
    )

    test_res = adapter.test_connection()

    # 연동성 테스트가 성공한 경우, 해당 계정을 테넌트 자격증명으로 DB에 암호화 저장/업데이트
    if test_res.get("status") == "SUCCESS":
        import json
        from backend.app.core.crypto import encryptor
        from backend.app.models.base import CloudCredential

        auth_data_json = json.dumps({
            "access_key": access_key,
            "secret_key": secret_key,
            "project_id": project_id,
            "scp_env": scp_env,
            "scp_region": scp_region,
            "endpoint_url": endpoint_url
        })

        encrypted_data, encrypted_dek = encryptor.encrypt(auth_data_json)

        creds = await service_list_helper_by_tenant(db, current_user.tenant_id)
        scp_cred = next((c for c in creds if c.provider == "scp"), None)

        if scp_cred:
            scp_cred.name = f"Samsung SCP ({scp_env}/{scp_region})"
            scp_cred.encrypted_auth_data = encrypted_data
            scp_cred.key_id = encrypted_dek
            await db.commit()
            logger.info(f"기존 SCP 실서버 자격증명 업데이트 완료 - Tenant: {current_user.tenant_id}")
        else:
            new_cred = CloudCredential(
                tenant_id=current_user.tenant_id,
                provider="scp",
                name=f"Samsung SCP ({scp_env}/{scp_region})",
                encrypted_auth_data=encrypted_data,
                key_id=encrypted_dek
            )
            db.add(new_cred)
            await db.commit()
            logger.info(f"신규 SCP 실서버 자격증명 DB 영구 저장 완료 - Tenant: {current_user.tenant_id}")

    return test_res

async def service_list_helper_by_tenant(db: AsyncSession, tenant_id: str):
    from backend.app.repositories.credential import CredentialRepository
    repo = CredentialRepository(db)
    return await repo.get_all_by_tenant(tenant_id)
