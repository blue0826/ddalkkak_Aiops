import json

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from fastapi.testclient import TestClient
from backend.app.models.base import Base
from backend.app.repositories.tenant import TenantRepository
from backend.app.repositories.incident import IncidentRepository
from backend.app.repositories.alert import AlertRepository
from backend.app.repositories.credential import CredentialRepository
from backend.app.repositories.tenant_service_setting import TenantServiceSettingRepository
from backend.app.services.alert_service import AlertService
from backend.app.services.credential_service import CredentialService
from backend.app.services.monitoring_service import MonitoringService
import backend.app.services.monitoring_service as monitoring_service_module
import backend.app.services.cloud_adapter as cloud_adapter_module
from backend.app.services.anomaly_detector import AnomalyDetector
from backend.app.services.noise_suppressor import noise_suppressor
from backend.app.main import app

DATABASE_URL = "sqlite+aiosqlite:///:memory:"

client = TestClient(app)


def get_token(username, password):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password}
    )
    return response.json()["access_token"]


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def _reset_noise_suppressor():
    """
    L3 노이즈 억제(noise_suppressor)는 프로세스 전역 싱글톤 상태를 갖는다.
    탐지 사이클 재실행(dedup) 테스트가 다른 테스트의 잔여 상태에 영향받지 않도록
    각 테스트 시작/종료 시점에 초기화한다.
    """
    noise_suppressor._last_alert_time.clear()
    noise_suppressor._tenant_alert_history.clear()
    yield
    noise_suppressor._last_alert_time.clear()
    noise_suppressor._tenant_alert_history.clear()


@pytest.fixture
async def db_session():
    # SQLite 인메모리 비동기 엔진 - 탐지 사이클 서비스 계층 단위 테스트를 위한 격리 DB
    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with AsyncSessionLocal() as session:
        tenant_repo = TenantRepository(session)
        await tenant_repo.create("tenant-scp", "삼성 SCP 고객")

        # L1이 즉시 동작하도록 cpu>90(5분) 활성 룰을 시딩한다
        alert_repo = AlertRepository(session)
        alert_service = AlertService(alert_repo)
        await alert_service.register_rule(
            tenant_id="tenant-scp",
            name="CPU 90% 초과 경보 (5분)",
            metric_name="cpu",
            operator="gt",
            threshold=90.0,
            duration_minutes=5,
            user_email="system@test.local"
        )

        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.mark.anyio
async def test_detection_cycle_catches_sustained_high_via_l1(db_session):
    """
    지속적 고부하 노드(scp-vm-app-01, CPU 시뮬레이션값이 항상 90%를 초과)는
    표준편차가 매우 작아 L2 이상탐지로는 잡히지 않고 L1 임계치로만 잡혀야 한다.
    """
    incident_repo = IncidentRepository(db_session)
    alert_repo = AlertRepository(db_session)
    service = MonitoringService(incident_repo, alert_repo)

    result = await service.run_detection_cycle("tenant-scp")

    assert result["tenant_id"] == "tenant-scp"
    assert result["scanned_nodes"] > 0

    cpu_hits = [
        d for d in result["details"]
        if d["node_id"] == "scp-vm-app-01" and d["metric_name"] == "cpu"
    ]
    assert len(cpu_hits) == 1
    assert cpu_hits[0]["source"] == "threshold"
    assert cpu_hits[0]["incident_id"] is not None
    assert cpu_hits[0]["incident_id"] in result["incidents_created"]


@pytest.mark.anyio
async def test_detection_cycle_dedup_suppresses_immediate_rerun(db_session):
    """
    동일 탐지 사이클을 즉시 재실행하면 L3 노이즈 억제(dedup 윈도우 300초)에 의해
    같은 노드/메트릭에 대한 신규 인시던트가 늘어나지 않아야 한다.
    """
    incident_repo = IncidentRepository(db_session)
    alert_repo = AlertRepository(db_session)
    service = MonitoringService(incident_repo, alert_repo)

    first = await service.run_detection_cycle("tenant-scp")
    first_hit = next(
        d for d in first["details"]
        if d["node_id"] == "scp-vm-app-01" and d["metric_name"] == "cpu"
    )
    assert first_hit["incident_id"] is not None

    second = await service.run_detection_cycle("tenant-scp")
    second_hit = next(
        d for d in second["details"]
        if d["node_id"] == "scp-vm-app-01" and d["metric_name"] == "cpu"
    )
    # 같은 사이클을 곧바로 재실행했으므로 동일 노드/메트릭 후보는 억제되어 신규 인시던트가 없어야 한다
    assert second_hit["incident_id"] is None
    assert second["suppressed"] >= 1


async def _register_fake_scp_credential(db_session, tenant_id: str) -> None:
    """탐지 사이클 게이트 테스트용 - DB에 SCP 자격증명이 "존재"하는 상황을 재현한다."""
    cred_repo = CredentialRepository(db_session)
    alert_repo = AlertRepository(db_session)
    cred_service = CredentialService(cred_repo, alert_repo)
    await cred_service.register_credential(
        tenant_id=tenant_id,
        provider="scp",
        name="게이트 테스트용 SCP 자격증명",
        auth_data=json.dumps({
            "access_key": "ak-test",
            "secret_key": "sk-test",
            "project_id": "pj-test",
        }),
        user_email="system@test.local"
    )


@pytest.mark.anyio
async def test_detection_cycle_skips_real_scp_call_when_consent_off(db_session, monkeypatch):
    """
    hole 검증(2026-07-20 CEO 결정): tenant-scp에 SCP 자격증명이 등록돼 있어도, 과금 서비스
    동의(scp/monitoring)가 꺼져 있으면(기본값 = 행 없음 = OFF) MonitoringService는
    SCPAdapter를 구성하지도, fetch_metrics_real을 호출하지도 않아야 한다
    (monitor.py get_metrics와 동일한 게이트가 탐지 사이클에도 적용되는지 검증).
    """
    await _register_fake_scp_credential(db_session, "tenant-scp")
    # 동의 행을 아예 만들지 않음 -> "행 없음 = 비활성" 기본값 그대로 유지

    resolve_call_count = {"n": 0}

    async def spy_resolve_scp_credential_fields(credential_service, tenant_id, user_email="system"):
        resolve_call_count["n"] += 1
        return {
            "access_key": "ak-test", "secret_key": "sk-test",
            "project_id": "pj-test", "endpoint_url": "https://openapi.samsungsdscloud.com"
        }

    fetch_call_count = {"n": 0}

    def spy_fetch_metrics_real(self, node_id, metric_name, minutes):
        fetch_call_count["n"] += 1
        return [{"timestamp": "2026-07-20T00:00:00Z", "value": 99.9}]

    monkeypatch.setattr(monitoring_service_module, "resolve_scp_credential_fields", spy_resolve_scp_credential_fields)
    monkeypatch.setattr(cloud_adapter_module.SCPAdapter, "fetch_metrics_real", spy_fetch_metrics_real)

    incident_repo = IncidentRepository(db_session)
    alert_repo = AlertRepository(db_session)
    service = MonitoringService(incident_repo, alert_repo)

    result = await service.run_detection_cycle("tenant-scp")

    # 핵심 단언 - 유료 SCP API 호출(fetch_metrics_real)도, 자격증명 복호화 시도
    # (resolve_scp_credential_fields, 즉 어댑터 구성 자체)도 전혀 없었어야 한다
    assert fetch_call_count["n"] == 0
    assert resolve_call_count["n"] == 0

    # 게이트가 걸려도 사이클 자체는 정상적으로 완료되고 기존과 동일하게 시뮬레이터로 폴백해야 한다
    assert result["tenant_id"] == "tenant-scp"
    assert result["scanned_nodes"] > 0
    cpu_hits = [d for d in result["details"] if d["node_id"] == "scp-vm-app-01" and d["metric_name"] == "cpu"]
    assert len(cpu_hits) == 1
    assert cpu_hits[0]["data_source"] == "SIMULATED"
    assert cpu_hits[0]["incident_id"] is not None


@pytest.mark.anyio
async def test_detection_cycle_allows_real_scp_call_when_consent_on(db_session, monkeypatch):
    """
    동의(scp/monitoring)를 켜면 탐지 사이클의 게이트가 실 호출 경로를 허용해야 한다.
    실 네트워크 없이 SCPAdapter.fetch_metrics_real을 목(mock)하여 REAL로 라벨링되는지,
    그리고 호출 결과가 tenant_service_setting.last_status에 정직하게 기록되는지 검증한다.
    """
    await _register_fake_scp_credential(db_session, "tenant-scp")
    service_repo = TenantServiceSettingRepository(db_session)
    await service_repo.set_enabled("tenant-scp", "scp", "monitoring", True)

    async def spy_resolve_scp_credential_fields(credential_service, tenant_id, user_email="system"):
        return {
            "access_key": "ak-test", "secret_key": "sk-test",
            "project_id": "pj-test", "endpoint_url": "https://openapi.samsungsdscloud.com"
        }

    fetch_call_count = {"n": 0}

    def spy_fetch_metrics_real(self, node_id, metric_name, minutes):
        fetch_call_count["n"] += 1
        self.last_call_status = "ok"
        # 95.0 -> 시딩된 cpu>90 룰을 위반시켜 L1 후보(threshold)가 details에 기록되게 한다
        # (단일 데이터포인트라 L2 Z-Score는 데이터 부족으로 스킵되지만 이는 이 테스트의
        # 관심사가 아니다 - REAL 라벨링/게이트 허용 여부만 검증한다).
        return [{"timestamp": "2026-07-20T00:00:00Z", "value": 95.0}]

    monkeypatch.setattr(monitoring_service_module, "resolve_scp_credential_fields", spy_resolve_scp_credential_fields)
    monkeypatch.setattr(cloud_adapter_module.SCPAdapter, "fetch_metrics_real", spy_fetch_metrics_real)

    incident_repo = IncidentRepository(db_session)
    alert_repo = AlertRepository(db_session)
    service = MonitoringService(incident_repo, alert_repo)

    result = await service.run_detection_cycle("tenant-scp")

    assert fetch_call_count["n"] > 0
    cpu_hits = [d for d in result["details"] if d["node_id"] == "scp-vm-app-01" and d["metric_name"] == "cpu"]
    assert len(cpu_hits) == 1
    assert cpu_hits[0]["data_source"] == "REAL"

    updated_setting = await service_repo.get("tenant-scp", "scp", "monitoring")
    assert updated_setting.last_status == "ok"
    assert updated_setting.last_checked_at is not None


@pytest.mark.anyio
async def test_detection_cycle_demo_style_tenant_never_touches_scp_gate(db_session, monkeypatch):
    """
    데모/타 프로바이더 테넌트는 tenant_id가 "tenant-scp"/"system"이 아니고 provider도
    "scp"로 지정하지 않으므로, SCP 게이트(자격증명 조회/어댑터 구성) 경로 자체가 아예
    호출되지 않아야 한다 - 데모 테넌트는 기존과 동일하게 실 SCP를 절대 쓰지 않는다.
    """
    def fail_if_called(*args, **kwargs):
        raise AssertionError("데모/비-SCP 테넌트에서는 _resolve_scp_adapter가 호출되면 안 된다")

    incident_repo = IncidentRepository(db_session)
    alert_repo = AlertRepository(db_session)
    service = MonitoringService(incident_repo, alert_repo)
    monkeypatch.setattr(service, "_resolve_scp_adapter", fail_if_called)

    result = await service.run_detection_cycle("demo-commerce-fake")

    # 예외 없이 정상 완료되어야 한다(이 격리 DB에는 해당 테넌트 노드가 없어 0건 스캔이 정상)
    assert result["tenant_id"] == "demo-commerce-fake"
    assert result["scanned_nodes"] == 0
    assert result["incidents_created"] == []


def test_anomaly_detector_analyze_spike_returns_calculated_zscore():
    """
    AnomalyDetector.analyze()는 급격한 스파이크 시계열에 대해 is_anomaly=True와
    임계값을 초과하는 z_score를 계산값으로 반환해야 한다.
    """
    spike_data = [50.0, 51.0, 49.0, 50.0, 52.0, 50.0, 98.0]
    result = AnomalyDetector.analyze(spike_data, z_threshold=2.5)

    assert set(result.keys()) == {"is_anomaly", "z_score", "mean", "std_dev", "current"}
    assert result["is_anomaly"] is True
    assert result["z_score"] > 2.5
    assert result["current"] == 98.0

    normal_data = [50.0, 52.0, 48.0, 51.0, 50.0, 49.0, 53.0]
    normal_result = AnomalyDetector.analyze(normal_data, z_threshold=2.5)
    assert normal_result["is_anomaly"] is False


def test_detection_run_endpoint_operator_allowed():
    """
    POST /aiops/detection/run 은 SYSTEM_ADMIN/TENANT_OPERATOR 권한이면 200을 반환해야 한다.
    """
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/api/v1/aiops/detection/run", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == "tenant-scp"
    assert "incidents_created" in data
    assert "scanned_nodes" in data


def test_detection_run_endpoint_forbidden_for_viewer():
    """
    POST /aiops/detection/run 은 TENANT_VIEWER 권한에서는 403이어야 한다.
    """
    token = get_token("view_scp@client.com", "view123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/api/v1/aiops/detection/run", headers=headers)
    assert response.status_code == 403


def test_timeline_cards_zscore_is_calculated_not_hardcoded_constant():
    """
    타임라인 카드 ANOMALY_DETECT의 z_score는 더 이상 하드코딩된 상수(2.82)가 아니라
    실제 계산값(또는 산출 불가 시 정직한 미산출 표기)이어야 한다.
    """
    token = get_token("op_scp@client.com", "op123!")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/aiops/incidents/1/timeline-cards", headers=headers)
    assert response.status_code == 200
    data = response.json()

    anomaly_card = next(c for c in data if c["event_type"] == "ANOMALY_DETECT")
    z_score = anomaly_card["meta"]["z_score"]

    assert z_score != 2.82
    assert isinstance(z_score, (int, float)) or z_score in ("미산출", "해당 없음")

    triggered_card = next(c for c in data if c["event_type"] == "TRIGGERED")
    assert triggered_card["meta"]["node_id"] != "real-vm-target"

    correlation_card = next(c for c in data if c["event_type"] == "CORRELATION")
    assert "threat_ip" not in correlation_card["meta"]
