from backend.app.repositories.credential import CredentialRepository
from backend.app.models.base import CloudCredential
from backend.app.core.crypto import encryptor
from backend.app.repositories.alert import AlertRepository
from backend.app.models.base import AuditLog
from typing import List, Optional
from loguru import logger

class CredentialService:
    def __init__(self, credential_repo: CredentialRepository, alert_repo: AlertRepository):
        self.credential_repo = credential_repo
        self.alert_repo = alert_repo

    async def register_credential(
        self, tenant_id: str, provider: str, name: str, auth_data: str, user_email: str
    ) -> CloudCredential:
        """
        민감 자산 자격증명 데이터를 봉투 암호화하여 저장하고 감사 로그를 기록합니다.
        """
        logger.info(f"자격증명 등록 비즈니스 로직 실행 - Tenant: {tenant_id}")
        
        # 1. 민감 평문 데이터를 봉투 암호화 처리
        encrypted_data, encrypted_dek = encryptor.encrypt(auth_data)
        
        new_credential = CloudCredential(
            tenant_id=tenant_id,
            provider=provider,
            name=name,
            encrypted_auth_data=encrypted_data,
            key_id=encrypted_dek  # key_id 컬럼에 암호화된 DEK를 저장하여 활용
        )
        
        saved_cred = await self.credential_repo.create(new_credential)
        
        # 2. 감사 로그 기록 (Action: create_credential)
        await self.alert_repo.create_audit_log(AuditLog(
            tenant_id=tenant_id,
            user_email=user_email,
            action="create_credential",
            resource_type="credential",
            resource_id=str(saved_cred.id),
            details=f"클라우드 연동 자격증명 생성 완료 - 공급사: {provider}, 이름: {name}"
        ))
        
        return saved_cred

    async def get_decrypted_credential(self, credential_id: int, tenant_id: str) -> Optional[dict]:
        """
        데이터베이스의 자격증명을 불러와 암호화된 DEK를 복호화하고 평문을 안전하게 환원합니다.
        """
        logger.info(f"자격증명 복호화 조회 로직 실행 - Tenant: {tenant_id}")
        cred = await self.credential_repo.get_by_id(credential_id, tenant_id)
        if not cred:
            return None
            
        decrypted_data = encryptor.decrypt(cred.encrypted_auth_data, cred.key_id)
        return {
            "id": cred.id,
            "tenant_id": cred.tenant_id,
            "provider": cred.provider,
            "name": cred.name,
            "decrypted_auth_data": decrypted_data,
            "created_at": cred.created_at
        }

    async def list_credentials(self, tenant_id: str) -> List[CloudCredential]:
        """
        테넌트 자격증명 목록을 반환합니다. (평문 마스킹 보장)
        """
        logger.info(f"자격증명 목록 조회 로직 실행 - Tenant: {tenant_id}")
        return await self.credential_repo.get_all_by_tenant(tenant_id)

    async def remove_credential(self, credential_id: int, tenant_id: str, user_email: str) -> bool:
        """
        자격증명을 삭제하고 감사 로그를 기록합니다.
        """
        logger.info(f"자격증명 삭제 로직 실행 - Tenant: {tenant_id}, ID: {credential_id}")
        success = await self.credential_repo.delete(credential_id, tenant_id)
        if success:
            await self.alert_repo.create_audit_log(AuditLog(
                tenant_id=tenant_id,
                user_email=user_email,
                action="delete_credential",
                resource_type="credential",
                resource_id=str(credential_id),
                details=f"클라우드 연동 자격증명 제거 완료 - ID: {credential_id}"
            ))
        return success
