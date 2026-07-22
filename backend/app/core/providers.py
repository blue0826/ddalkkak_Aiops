"""
Provider Registry — SCP(삼성클라우드플랫폼)와 AWS의 명칭·용어·리전·데이터를
명확히 분리하기 위한 단일 진실원(Single Source of Truth).

시뮬레이터, 어댑터, 라우터 등 프로바이더별 표기가 필요한 모든 계층은
반드시 이 레지스트리를 통해서만 명칭/용어를 참조한다. 하드코딩 금지.
"""
from typing import List, Optional

PROVIDER_REGISTRY: dict = {
    "scp": {
        "id": "scp",
        "display_name": "삼성 클라우드 플랫폼",
        "short_name": "SCP",
        "full_name_en": "Samsung Cloud Platform v2",
        "compute_term_ko": "가상 서버",
        "compute_term_en": "Virtual Server",
        "compute_kind": "vs",
        "network_term": "VPC",
        "subnet_term": "서브넷",
        "storage_term_ko": "블록 스토리지",
        "storage_term_en": "Block Storage",
        "object_storage": "Object Storage(OBS)",
        "database_term": "Cloud DB",
        "monitoring_service": "Cloud Monitoring",
        "logging_service": "Cloud Logging",
        "billing_service": "Billing",
        "event_service": "Cloud Monitoring 이벤트",
        "region_label": "리전",
        "default_region": "kr-west1",
        "regions": ["kr-west1", "kr-east1"],
        "auth_method": "Access Key + HMAC-SHA256 서명 + 프로젝트 ID",
        "endpoint": "openapi.samsungsdscloud.com",
        "instance_type_family": "Standard",
        "instance_types": ["Standard-2", "Standard-4", "Standard-8", "Standard-16"],
        "currency": "KRW",
        "source_currency": "KRW",
        "accent_color": "#1E4FD8",
        "integration_mode": "REAL_CAPABLE",
    },
    "aws": {
        "id": "aws",
        "display_name": "Amazon Web Services",
        "short_name": "AWS",
        "full_name_en": "Amazon Web Services",
        "compute_term_ko": "EC2 인스턴스",
        "compute_term_en": "EC2 Instance",
        "compute_kind": "ec2",
        "network_term": "VPC",
        "subnet_term": "서브넷",
        "storage_term_ko": "EBS 볼륨",
        "storage_term_en": "EBS Volume",
        "object_storage": "S3",
        "database_term": "RDS",
        "monitoring_service": "CloudWatch",
        "logging_service": "CloudWatch Logs",
        "billing_service": "Cost Explorer",
        "event_service": "EventBridge / CloudTrail",
        "region_label": "리전",
        "default_region": "ap-northeast-2",
        "regions": ["ap-northeast-2", "ap-northeast-2a", "ap-northeast-2c"],
        "auth_method": "STS AssumeRole (교차계정 IAM 역할)",
        "endpoint": "(리전별 AWS API 엔드포인트)",
        "instance_type_family": "t3",
        "instance_types": ["t3.micro", "t3.small", "t3.medium", "t3.large"],
        "currency": "KRW",
        "source_currency": "USD",
        "accent_color": "#FF9900",
        "integration_mode": "SIMULATED",
    },
}


def get_provider(pid: str) -> Optional[dict]:
    """
    프로바이더 ID(scp/aws)에 해당하는 레지스트리 메타데이터를 반환합니다.
    존재하지 않는 프로바이더 요청 시 KeyError 대신 None을 반환합니다.
    """
    if not pid:
        return None
    return PROVIDER_REGISTRY.get(pid.lower())


def list_providers() -> List[dict]:
    """
    등록된 모든 프로바이더의 레지스트리 메타데이터 목록을 반환합니다.
    """
    return list(PROVIDER_REGISTRY.values())


# 유료(과금) 서비스 카탈로그 - 테넌트별 옵트인 게이트(tenant_service_setting 테이블)가
# 적용되는 프로바이더별 서비스 키 목록. CEO 결정(2026-07-20): SCP Cloud Monitoring/
# Cloud Logging은 과금 서비스라 운영자가 명시적으로 켜지 않으면 절대 호출하지 않는다.
# 새 유료 서비스가 추가되면 여기 등록만 하면 GET /monitor/service-status 응답에도
# 자동 반영된다 (하드코딩 분산 방지).
BILLABLE_SERVICE_CATALOG: dict = {
    "scp": ["monitoring", "logging"],
}

# 서비스 키 -> PROVIDER_REGISTRY 표시명 필드 매핑 (하드코딩 대신 레지스트리 재사용)
_SERVICE_DISPLAY_NAME_FIELD: dict = {
    "monitoring": "monitoring_service",
    "logging": "logging_service",
}


def list_billable_service_keys(provider_id: str) -> List[str]:
    """
    프로바이더의 과금 서비스 키 목록을 반환합니다 (등록되지 않은 프로바이더는 빈 리스트).
    """
    return BILLABLE_SERVICE_CATALOG.get(provider_id, [])


def list_billable_provider_ids() -> List[str]:
    """
    과금 서비스가 하나 이상 등록된 프로바이더 ID 목록을 반환합니다
    (GET /monitor/service-status가 순회할 대상).
    """
    return list(BILLABLE_SERVICE_CATALOG.keys())


def get_service_display_name(provider_id: str, service_key: str) -> Optional[str]:
    """
    프로바이더+서비스 키에 대응하는 한국어 표시명을 PROVIDER_REGISTRY에서 조회합니다.
    매핑되지 않는 조합은 None을 반환합니다.
    """
    provider = get_provider(provider_id)
    field = _SERVICE_DISPLAY_NAME_FIELD.get(service_key)
    if not provider or not field:
        return None
    return provider.get(field)
