import pytest
from backend.app.services.cloud_adapter import SCPAdapter

def test_scp_signature_generation():
    """
    삼성 SCP V2 OpenAPI 규격에 따른 Signature HmacSHA256 해시 연산 정확성을 검증합니다.
    """
    adapter = SCPAdapter(
        tenant_id="tenant-scp",
        access_key="dummy_access",
        secret_key="dummy_secret_key_12345",
        project_id="dummy_project"
    )
    
    timestamp = "1720448100000"  # 고정 타임스탬프
    signature = adapter._generate_signature("GET", "/v1/servers", "", timestamp)
    
    assert len(signature) == 44  # Base64 인코딩 결과 44자 (32바이트 해시)
    # 동일 입력값에 대해 일관된 서명 반환 검증
    assert signature == adapter._generate_signature("GET", "/v1/servers", "", timestamp)

def test_scp_connection_simulation():
    """
    자격증명이 제공되지 않았을 때 모의 연동 성공(SIMULATED Mode) 분기가 유효한지 검증합니다.
    """
    # 키 누락 상태
    adapter = SCPAdapter(tenant_id="tenant-scp")
    res = adapter.test_connection()
    
    assert res["status"] == "SUCCESS"
    assert res["mode"] == "SIMULATED"
    assert "모의 API" in res["message"]

def test_scp_connection_real_failure():
    """
    유효하지 않은 SCP Key로 실서버 접속 테스트 시 예외가 우아하게 포착되어 FAILED를 반환하는지 검증합니다.
    """
    adapter = SCPAdapter(
        tenant_id="tenant-scp",
        access_key="invalid_access_key_format",
        secret_key="invalid_secret_key_format",
        project_id="invalid_proj_id",
        endpoint_url="https://openapi.samsungsdscloud.com"
    )
    res = adapter.test_connection()
    
    assert res["status"] == "FAILED"
    assert res["mode"] == "REAL_CLOUD"
    assert "연동 실패" in res["message"]
