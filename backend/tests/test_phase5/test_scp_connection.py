import asyncio
import json

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


def test_fetch_metrics_real_returns_none_without_credentials():
    """
    자격증명이 없으면 fetch_metrics_real은 실 API 호출을 시도하지 않고 즉시 None을
    반환해야 한다 (호출측이 시뮬레이터로 안전하게 폴백하도록).
    """
    adapter = SCPAdapter(tenant_id="tenant-scp")
    assert adapter.fetch_metrics_real("scp-vm-web-01", "cpu", 10) is None


def test_fetch_logs_real_returns_none_without_credentials():
    """
    자격증명이 없으면 fetch_logs_real도 실 API 호출을 시도하지 않고 즉시 None을 반환해야 한다.
    """
    adapter = SCPAdapter(tenant_id="tenant-scp")
    assert adapter.fetch_logs_real(limit=10) is None


def test_fetch_metrics_real_parses_response_when_api_succeeds(monkeypatch):
    """
    2026-07-20 P0 실측(라이브 200 OK 확인)으로 확정된 POST /v1/cloudmonitorings/product/v2/
    metric-data 응답 모양(perfData[].value=문자열, perfData[].ts=epoch ms)을 그대로 재현한
    샘플 응답을 monkeypatch로 주입하여, fetch_metrics_real이 5개 포인트를 정확히 파싱하는지
    검증한다 - value는 float로 변환되고, timestamp는 epoch ms에서 시뮬레이터/데모엔진과
    동일한 "%Y-%m-%dT%H:%M:%SZ" 포맷으로 변환되어야 하며, last_call_status는 "ok"가 되어야
    한다. httpx.Client를 가짜 객체로 대체하므로 실 네트워크 호출은 없다.
    """
    import backend.app.services.cloud_adapter as cloud_adapter_module

    adapter = SCPAdapter(
        tenant_id="tenant-scp",
        access_key="dummy_access",
        secret_key="dummy_secret_key_12345",
        project_id="dummy_project"
    )

    # 2026-07-20 실측 시 monos 테넌트로 실제 관찰한 응답 구조 그대로 재현 (5 포인트)
    SAMPLE_PERF_DATA = [
        {"value": "2.7122333333333337", "ts": 1784448000000},
        {"value": "3.1000000000000000", "ts": 1784448300000},
        {"value": "2.9500000000000000", "ts": 1784448600000},
        {"value": "4.2000000000000000", "ts": 1784448900000},
        {"value": "3.6600000000000000", "ts": 1784449200000},
    ]

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "totalCount": 1,
                "contents": [
                    {
                        "productResourceId": "5370f281-1d09-4dca-bc17-3e9746bd06b7",
                        "productName": "CLOUDBIZ_Portal",
                        "metricKey": "libvirt.domain.cpu.scpm.usage",
                        "metricName": "CPU Usage [Basic]",
                        "metricUnit": "%",
                        "statisticsType": "AVG",
                        "statisticsPeriod": 300,
                        "perfData": SAMPLE_PERF_DATA,
                    }
                ],
            }

    captured_calls = []

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers=None, json=None):
            captured_calls.append({"url": url, "headers": headers, "json": json})
            return FakeResponse()

    monkeypatch.setattr(cloud_adapter_module.httpx, "Client", FakeClient)

    points = adapter.fetch_metrics_real("5370f281-1d09-4dca-bc17-3e9746bd06b7", "cpu", 60)

    assert points is not None
    assert len(points) == 5
    assert all(isinstance(p["value"], float) for p in points)
    assert points[0]["value"] == 2.7122333333333337
    # epoch ms 1784448000000 = 2026-07-19T08:00:00Z (UTC)
    assert points[0]["timestamp"] == "2026-07-19T08:00:00Z"
    assert adapter.last_call_status == "ok"

    # POST 요청이 정확히 1회, 검증된 경로/헤더/바디로 나갔는지 확인
    assert len(captured_calls) == 1
    call = captured_calls[0]
    assert call["url"] == "https://openapi.samsungsdscloud.com/v1/cloudmonitorings/product/v2/metric-data"
    assert call["headers"]["Scp-Api-Version"] == "cloudmonitoring 1.0"
    assert call["headers"]["X-ResourceType"] == "VM"
    body = call["json"]
    assert body["metricDataConditions"][0]["metricKey"] == "libvirt.domain.cpu.scpm.usage"
    assert body["metricDataConditions"][0]["productResourceInfos"] == [
        {"productResourceId": "5370f281-1d09-4dca-bc17-3e9746bd06b7"}
    ]


def test_fetch_metrics_real_maps_memory_to_verified_basic_key(monkeypatch):
    """
    2026-07-20 실측으로 카탈로그에서 확인한 메모리 지표 매핑(libvirt.domain.memory.scpm.usage,
    "Memory Usage [Basic]", 단위 %)이 실제로 POST 바디의 metricKey로 사용되는지 검증한다.
    """
    import backend.app.services.cloud_adapter as cloud_adapter_module

    adapter = SCPAdapter(
        tenant_id="tenant-scp",
        access_key="dummy_access",
        secret_key="dummy_secret_key_12345",
        project_id="dummy_project"
    )

    captured_calls = []

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "totalCount": 1,
                "contents": [{
                    "metricKey": "libvirt.domain.memory.scpm.usage",
                    "perfData": [{"value": "55.5", "ts": 1784448000000}],
                }],
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers=None, json=None):
            captured_calls.append(json)
            return FakeResponse()

    monkeypatch.setattr(cloud_adapter_module.httpx, "Client", FakeClient)

    points = adapter.fetch_metrics_real("scp-vm-web-01", "memory", 60)

    assert points == [{"timestamp": "2026-07-19T08:00:00Z", "value": 55.5}]
    assert captured_calls[0]["metricDataConditions"][0]["metricKey"] == "libvirt.domain.memory.scpm.usage"


def test_fetch_metrics_real_returns_none_on_http_error(monkeypatch):
    """
    실 API 호출이 예외를 던지면 fetch_metrics_real은 우아하게 None을 반환해야 한다
    (호출측 시뮬레이터 폴백을 보장), last_call_status는 "error"가 된다.
    """
    import backend.app.services.cloud_adapter as cloud_adapter_module

    adapter = SCPAdapter(
        tenant_id="tenant-scp",
        access_key="dummy_access",
        secret_key="dummy_secret_key_12345",
        project_id="dummy_project"
    )

    class FailingClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers=None, json=None):
            raise ConnectionError("network unreachable (테스트 모의 실패)")

    monkeypatch.setattr(cloud_adapter_module.httpx, "Client", FailingClient)

    assert adapter.fetch_metrics_real("scp-vm-web-01", "cpu", 10) is None
    assert adapter.last_call_status == "error"


def test_fetch_metrics_real_returns_none_on_forbidden(monkeypatch):
    """
    실 API가 403 Forbidden을 반환하면 last_call_status가 "forbidden"으로 정직하게
    기록되어야 한다 (감사 로그/컨센트 게이트가 IAM 스코프 미부여를 구분할 수 있도록).
    """
    import httpx
    import backend.app.services.cloud_adapter as cloud_adapter_module

    adapter = SCPAdapter(
        tenant_id="tenant-scp",
        access_key="dummy_access",
        secret_key="dummy_secret_key_12345",
        project_id="dummy_project"
    )

    class FakeForbiddenResponse:
        status_code = 403

        def raise_for_status(self):
            raise httpx.HTTPStatusError("403 Forbidden", request=None, response=self)

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers=None, json=None):
            return FakeForbiddenResponse()

    monkeypatch.setattr(cloud_adapter_module.httpx, "Client", FakeClient)

    assert adapter.fetch_metrics_real("scp-vm-web-01", "cpu", 10) is None
    assert adapter.last_call_status == "forbidden"


def test_fetch_metrics_real_returns_none_for_empty_contents(monkeypatch):
    """
    totalCount: 0 / contents가 비어있는 응답(해당 기간에 데이터가 없는 경우)을 받으면
    fetch_metrics_real은 예외 없이 None을 반환해야 한다(SIMULATED 폴백 보장).
    """
    import backend.app.services.cloud_adapter as cloud_adapter_module

    adapter = SCPAdapter(
        tenant_id="tenant-scp",
        access_key="dummy_access",
        secret_key="dummy_secret_key_12345",
        project_id="dummy_project"
    )

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"totalCount": 0, "contents": []}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers=None, json=None):
            return FakeResponse()

    monkeypatch.setattr(cloud_adapter_module.httpx, "Client", FakeClient)

    assert adapter.fetch_metrics_real("scp-vm-web-01", "cpu", 10) is None


def test_fetch_metrics_real_returns_none_for_unmapped_metric_name():
    """
    _METRIC_KEY_MAP에 없는 지표명(cpu/memory 외)은 실 API 호출 자체를 시도하지 않고
    즉시 None을 반환해야 한다(불필요한 과금 호출 방지).
    """
    adapter = SCPAdapter(
        tenant_id="tenant-scp",
        access_key="dummy_access",
        secret_key="dummy_secret_key_12345",
        project_id="dummy_project"
    )

    assert adapter.fetch_metrics_real("scp-vm-web-01", "disk_io", 10) is None


def test_resolve_scp_credential_fields_derives_verified_monitoring_host():
    """
    2026-07-20 P0 실측으로 확정된 Cloud Monitoring 실 호스트(cloudmonitoring.{region}.{env}.
    samsungsdscloud.com)가 credential_service.resolve_scp_credential_fields()에서
    virtualserver의 endpoint_url과 동일한 scp_region/scp_env로부터 정확히 파생되는지 검증한다.
    실 네트워크 호출은 없다 - DB에 저장된 자격증명 JSON을 복호화해 필드를 조합하는 순수 로직만 검증.
    """
    from backend.app.db.session import AsyncSessionLocal
    from backend.app.models.base import CloudCredential
    from backend.app.core.crypto import encryptor
    from backend.app.repositories.credential import CredentialRepository
    from backend.app.repositories.alert import AlertRepository
    from backend.app.services.credential_service import CredentialService, resolve_scp_credential_fields

    async def _run():
        async with AsyncSessionLocal() as session:
            auth_data = json.dumps({
                "access_key": "dummy_access",
                "secret_key": "dummy_secret_key_12345",
                "project_id": "dummy_project",
                "scp_env": "e",
                "scp_region": "kr-west1",
            })
            encrypted_data, encrypted_dek = encryptor.encrypt(auth_data)
            cred = CloudCredential(
                tenant_id="tenant-scp",
                provider="scp",
                name="테스트용 SCP 자격증명 (모니터링 호스트 파생 검증)",
                encrypted_auth_data=encrypted_data,
                key_id=encrypted_dek,
            )
            session.add(cred)
            await session.commit()

            cred_repo = CredentialRepository(session)
            alert_repo = AlertRepository(session)
            cred_service = CredentialService(cred_repo, alert_repo)
            fields = await resolve_scp_credential_fields(cred_service, "tenant-scp", user_email="test")

            await session.delete(cred)
            await session.commit()
            return fields

    fields = asyncio.run(_run())

    assert fields is not None
    assert fields["endpoint_url"] == "https://virtualserver.kr-west1.e.samsungsdscloud.com"
    assert fields["monitoring_endpoint_url"] == "https://cloudmonitoring.kr-west1.e.samsungsdscloud.com"
