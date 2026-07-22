import pytest
from unittest.mock import AsyncMock

from backend.app.core.config import settings
from backend.app.services.llm_gateway import (
    get_llm_gateway,
    AnthropicGateway,
    OpenAICompatGateway,
    TemplateGateway,
    DisabledGateway,
)
from backend.app.services.llm_service import LLMService
from backend.app.models.base import Incident


@pytest.fixture
def anyio_backend():
    return "asyncio"


# ---------------------------------------------------------------------------
# 게이트웨이 팩토리 - 3모드 선택 로직 (monkeypatch로 각 테스트 후 자동 원복)
# ---------------------------------------------------------------------------

def test_get_llm_gateway_defaults_to_template_when_no_key_configured(monkeypatch):
    """
    .env에 키가 없는 기본 상태(현재 저장소 .env와 동일)에서는 항상 template 모드여야 한다.
    """
    monkeypatch.setattr(settings, "LLM_ENABLED", True)
    monkeypatch.setattr(settings, "LLM_PROVIDER", "auto")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "LLM_GATEWAY_BASE_URL", "")

    gateway = get_llm_gateway()

    assert isinstance(gateway, TemplateGateway)
    assert gateway.mode == "template"


@pytest.mark.anyio
async def test_template_gateway_complete_returns_none_and_makes_no_network_call():
    """
    template 모드의 complete()는 항상 None을 반환하며 실제 LLM API 호출이 발생하지 않는다.
    """
    gateway = TemplateGateway()
    result = await gateway.complete(system="sys", prompt="user")
    assert result is None


def test_get_llm_gateway_disabled_when_llm_disabled(monkeypatch):
    monkeypatch.setattr(settings, "LLM_ENABLED", False)
    gateway = get_llm_gateway()
    assert isinstance(gateway, DisabledGateway)
    assert gateway.mode == "disabled"


def test_get_llm_gateway_auto_prefers_anthropic_when_key_present(monkeypatch):
    monkeypatch.setattr(settings, "LLM_ENABLED", True)
    monkeypatch.setattr(settings, "LLM_PROVIDER", "auto")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-test-fake-key-never-used")
    monkeypatch.setattr(settings, "LLM_GATEWAY_BASE_URL", "")

    gateway = get_llm_gateway()

    assert isinstance(gateway, AnthropicGateway)
    assert gateway.mode == settings.LLM_MODEL


def test_get_llm_gateway_auto_falls_back_to_openai_compat_when_no_anthropic_key(monkeypatch):
    monkeypatch.setattr(settings, "LLM_ENABLED", True)
    monkeypatch.setattr(settings, "LLM_PROVIDER", "auto")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "LLM_GATEWAY_BASE_URL", "http://internal-airgap-llm.local/v1")

    gateway = get_llm_gateway()

    assert isinstance(gateway, OpenAICompatGateway)
    assert gateway.mode == "openai-compat"


def test_get_llm_gateway_explicit_anthropic_without_key_falls_back_to_template(monkeypatch):
    """
    provider를 명시적으로 anthropic으로 지정해도 키가 없으면 안전하게 template로 폴백해야 한다.
    """
    monkeypatch.setattr(settings, "LLM_ENABLED", True)
    monkeypatch.setattr(settings, "LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")

    gateway = get_llm_gateway()

    assert isinstance(gateway, TemplateGateway)


def test_get_llm_gateway_explicit_template_provider(monkeypatch):
    monkeypatch.setattr(settings, "LLM_ENABLED", True)
    monkeypatch.setattr(settings, "LLM_PROVIDER", "template")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-would-be-ignored")

    gateway = get_llm_gateway()

    assert isinstance(gateway, TemplateGateway)


# ---------------------------------------------------------------------------
# Anthropic 경로 - client를 mock하여 실제 네트워크 호출 없이 검증
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_anthropic_gateway_complete_parses_sections_without_real_network_call():
    """
    anthropic.AsyncAnthropic 클라이언트를 mock으로 대체하여, 실제 API 호출 없이
    AnthropicGateway.complete()가 응답 텍스트를 파싱해 반환하는지 검증한다.
    """
    gateway = AnthropicGateway(api_key="sk-ant-fake-never-sent", model="claude-sonnet-5")
    assert gateway.mode == "claude-sonnet-5"

    class _FakeTextBlock:
        type = "text"
        text = "[요약]\n테스트 요약입니다.\n[근본원인]\n테스트 근본원인입니다.\n[권장조치]\n1. 테스트 조치를 수행하십시오."

    class _FakeResponse:
        content = [_FakeTextBlock()]

    gateway._client.messages.create = AsyncMock(return_value=_FakeResponse())

    result = await gateway.complete(system="시스템 프롬프트", prompt="유저 프롬프트")

    gateway._client.messages.create.assert_awaited_once()
    assert result is not None
    assert "테스트 요약입니다" in result


@pytest.mark.anyio
async def test_anthropic_gateway_complete_returns_none_on_exception():
    """
    Anthropic 호출이 예외(타임아웃 등)를 발생시켜도 예외를 삼키고 None을 반환해야 한다
    (호출측 규칙 기반 폴백 유도).
    """
    gateway = AnthropicGateway(api_key="sk-ant-fake", model="claude-sonnet-5")
    gateway._client.messages.create = AsyncMock(side_effect=TimeoutError("simulated timeout"))

    result = await gateway.complete(system="sys", prompt="user")

    assert result is None


# ---------------------------------------------------------------------------
# LLMService 연동 - RCA 폴백 engine 필드 / 월간보고서 통화(₩)
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_generate_incident_rca_falls_back_to_rule_based_engine_label(monkeypatch):
    """
    키 미설정(template 모드) 상태에서는 실 LLM 호출 없이 규칙 기반 텍스트로 폴백하고,
    engine 필드가 "규칙 기반 분석 (LLM 미연결)"이어야 한다.
    """
    monkeypatch.setattr(settings, "LLM_ENABLED", True)
    monkeypatch.setattr(settings, "LLM_PROVIDER", "auto")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "LLM_GATEWAY_BASE_URL", "")

    incident = Incident(
        id=1,
        tenant_id="tenant-scp",
        title="[scp-vm-app-01] CPU 임계치 초과 장애 발생",
        description="CPU 사용률이 92%에 도달했습니다.",
        severity="WARNING",
    )

    rca = await LLMService.generate_incident_rca(incident, [])

    assert rca["engine"] == "규칙 기반 분석 (LLM 미연결)"
    assert "CPU" in rca["summary"]
    assert rca["probable_cause"]
    assert rca["recommended_runbook"]


@pytest.mark.anyio
async def test_generate_incident_rca_uses_gateway_engine_when_llm_available(monkeypatch):
    """
    실 LLM(모의) 응답이 있을 경우 engine 필드가 게이트웨이 mode를 그대로 반영해야 한다.
    LLMService.get_llm_gateway를 모의 게이트웨이로 대체하여 실제 API 호출 없이 검증한다.
    """
    incident = Incident(
        id=2,
        tenant_id="tenant-scp",
        title="[scp-vm-app-01] CPU 임계치 초과 장애 발생",
        description="CPU 사용률이 92%에 도달했습니다.",
        severity="WARNING",
    )

    class _FakeGateway:
        mode = "claude-sonnet-5"

        async def complete(self, system, prompt):
            return "[요약]\n실 LLM 요약\n[근본원인]\n실 LLM 근본원인\n[권장조치]\n실 LLM 권장조치"

    import backend.app.services.llm_service as llm_service_module
    monkeypatch.setattr(llm_service_module, "get_llm_gateway", lambda: _FakeGateway())

    rca = await llm_service_module.LLMService.generate_incident_rca(incident, [])

    assert rca["engine"] == "claude-sonnet-5"
    assert rca["summary"] == "실 LLM 요약"
    assert rca["probable_cause"] == "실 LLM 근본원인"
    assert rca["recommended_runbook"] == "실 LLM 권장조치"


@pytest.mark.anyio
async def test_generate_monthly_report_uses_krw_not_usd(monkeypatch):
    """
    월간 보고서는 헌법 원칙(순수 원화)에 따라 '$' 없이 '₩'만 사용해야 한다.
    """
    monkeypatch.setattr(settings, "LLM_ENABLED", True)
    monkeypatch.setattr(settings, "LLM_PROVIDER", "auto")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "LLM_GATEWAY_BASE_URL", "")

    report_md = await LLMService.generate_monthly_report(
        tenant_id="tenant-scp",
        active_vms=5,
        alarms_count=2,
        total_costs=1234567.0,
        savings=100000.0,
    )

    assert "$" not in report_md
    assert "₩" in report_md
    assert "Envelope" in report_md
