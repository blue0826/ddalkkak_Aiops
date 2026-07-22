from backend.app.repositories.credential import CredentialRepository
from backend.app.models.base import CloudCredential
from backend.app.core.crypto import encryptor
from backend.app.repositories.alert import AlertRepository
from backend.app.models.base import AuditLog
from typing import List, Optional
from loguru import logger
import json

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

    async def get_decrypted_credential(self, credential_id: int, tenant_id: str, user_email: str = "system") -> Optional[dict]:
        """
        데이터베이스의 자격증명을 불러와 암호화된 DEK를 복호화하고 평문을 안전하게 환원합니다.
        """
        logger.info(f"자격증명 복호화 조회 로직 실행 - Tenant: {tenant_id}")
        cred = await self.credential_repo.get_by_id(credential_id, tenant_id)
        if not cred:
            return None

        decrypted_data = encryptor.decrypt(cred.encrypted_auth_data, cred.key_id)

        # 최고 민감 자산 복호화 이벤트 감사 로그 기록 (Action: DECRYPT_CREDENTIAL)
        await self.alert_repo.create_audit_log(AuditLog(
            tenant_id=tenant_id,
            user_email=user_email,
            action="DECRYPT_CREDENTIAL",
            resource_type="credential",
            resource_id=str(cred.id),
            details=f"클라우드 연동 자격증명 복호화 조회 수행 - 공급사: {cred.provider}, 이름: {cred.name}"
        ))

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

        tenant_id="system"(관리자)으로 호출되면 실제 소유 테넌트와 무관하게 삭제할 수
        있다(CredentialRepository의 "system" 테넌트 격리 우회 규칙). 이 경우에도 감사
        로그는 관리자의 소속("system")이 아니라 자격증명이 실제로 속했던 테넌트를
        정확히 기록한다.
        """
        logger.info(f"자격증명 삭제 로직 실행 - Tenant: {tenant_id}, ID: {credential_id}")
        cred = await self.credential_repo.get_by_id(credential_id, tenant_id)
        if not cred:
            return False

        actual_tenant_id = cred.tenant_id
        provider = cred.provider
        name = cred.name

        success = await self.credential_repo.delete(credential_id, tenant_id)
        if success:
            await self.alert_repo.create_audit_log(AuditLog(
                tenant_id=actual_tenant_id,
                user_email=user_email,
                action="delete_credential",
                resource_type="credential",
                resource_id=str(credential_id),
                details=f"클라우드 연동 자격증명 제거 완료 - ID: {credential_id}, 공급사: {provider}, 이름: {name}"
            ))
        return success


async def resolve_scp_credential_fields(
    credential_service: "CredentialService", tenant_id: str, user_email: str = "system"
) -> Optional[dict]:
    """
    테넌트에 등록된 SCP 자격증명을 복호화하여 access_key/secret_key/project_id/endpoint_url을
    표준 dict로 반환합니다. 자격증명이 없거나 필수 필드가 불완전하면 None을 반환합니다
    (호출측은 시뮬레이터로 안전하게 폴백해야 함).

    monitor 라우터의 토폴로지/메트릭 엔드포인트, MonitoringService 탐지 사이클이 공유하는
    헬퍼로, 자격증명 조회/복호화/엔드포인트 유도 로직의 중복을 방지한다.
    """
    creds = await credential_service.list_credentials(tenant_id)
    scp_cred = next((c for c in creds if c.provider == "scp"), None)
    if not scp_cred:
        return None

    decrypted = await credential_service.get_decrypted_credential(scp_cred.id, tenant_id, user_email=user_email)
    if not decrypted or not decrypted.get("decrypted_auth_data"):
        return None

    auth_info = json.loads(decrypted["decrypted_auth_data"])
    access_key = auth_info.get("access_key")
    secret_key = auth_info.get("secret_key")
    project_id = auth_info.get("project_id")
    if not (access_key and secret_key and project_id):
        return None

    # DB에 저장된 정확한 엔드포인트 URL 우선 사용 (scp_env + scp_region 기반 자동 조합된 값)
    scp_env = auth_info.get("scp_env", "e")
    scp_region = auth_info.get("scp_region", "kr-west1")
    endpoint_url = auth_info.get("endpoint_url")
    if not endpoint_url:
        endpoint_url = f"https://virtualserver.{scp_region}.{scp_env}.samsungsdscloud.com"

    # Cloud Monitoring 실 엔드포인트 (2026-07-20 P0 실측 확정) - virtualserver와 동일하게
    # scp_region/scp_env로 파생되는 호스트다(고정 상수 아님). 실측 근거: 동일 host가
    # virtualserver와 같은 API 게이트웨이 IP로 응답하고, GET /v1/cloudmonitorings/product/
    # v1/product-types, .../v2/accounts/products(X-ResourceType: VM), .../v2/metrics가 모두
    # HTTP 200 실데이터를 반환했으며 accounts/products의 productResourceId가 virtualserver
    # VM id와 1:1 일치함을 확인했다(SCPAdapter.fetch_metrics_real 상세 주석 참조). 단, 실제
    # 시계열 지표값 조회 자체는 POST 전용 API라 이 값(GET 어댑터가 사용하는 호스트)만으로는
    # 아직 실데이터를 못 가져온다 - 그 부분은 fetch_metrics_real() 주석에 별도 기록.
    monitoring_endpoint_url = auth_info.get("monitoring_endpoint_url") or f"https://cloudmonitoring.{scp_region}.{scp_env}.samsungsdscloud.com"

    return {
        "access_key": access_key,
        "secret_key": secret_key,
        "project_id": project_id,
        "endpoint_url": endpoint_url,
        "monitoring_endpoint_url": monitoring_endpoint_url,
    }
