"""
L4 LLM 게이트웨이 추상화 (스펙 §4.3)

3-모드(Anthropic / OpenAI 호환 / Template) + 라이선스 비활성(Disabled) 게이트웨이를
하나의 인터페이스로 통일한다. 실 LLM 호출은 키가 설정된 경우에만 켜지는 옵트인이며,
기본(.env에 키 없음)은 항상 규칙 기반 폴백(TemplateGateway)으로 동작한다
(Phase 0 헌법: 외부 API 유료 호출 금지 원칙 준수).
"""
import abc
from typing import Optional

import anthropic
import httpx
from loguru import logger

from backend.app.core.config import settings


class LLMGateway(abc.ABC):
    """모든 게이트웨이 구현체가 따르는 공통 인터페이스."""

    mode: str = "disabled"

    @abc.abstractmethod
    async def complete(self, system: str, prompt: str) -> Optional[str]:
        """
        LLM에 시스템/유저 프롬프트를 전달하고 응답 텍스트를 반환한다.
        실패(예외/타임아웃) 또는 미연결 시 None을 반환하여 호출측이 규칙 기반
        텍스트로 폴백하도록 유도한다. 예외를 절대 상위로 전파하지 않는다.
        """
        raise NotImplementedError


class AnthropicGateway(LLMGateway):
    """Anthropic API(claude-sonnet-5 등)를 직접 호출하는 게이트웨이. 키가 있을 때만 사용 가능."""

    def __init__(self, api_key: str, model: str, timeout: float = 30.0):
        self._model = model
        self.mode = model
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout)

    async def complete(self, system: str, prompt: str) -> Optional[str]:
        try:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=2048,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:  # anthropic.APIError, 타임아웃 등 모두 삼켜서 폴백 유도
            logger.warning(f"[LLM Gateway] Anthropic 호출 실패 - 규칙 기반 폴백으로 전환합니다: {e}")
            return None

        text_blocks = [
            block.text for block in (response.content or []) if getattr(block, "type", None) == "text"
        ]
        text = "".join(text_blocks).strip()
        return text or None


class OpenAICompatGateway(LLMGateway):
    """사내/에어갭 고객용 OpenAI 호환(/chat/completions) 게이트웨이."""

    mode = "openai-compat"

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 30.0):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout

    async def complete(self, system: str, prompt: str) -> Optional[str]:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(f"{self._base_url}/chat/completions", json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            text = data["choices"][0]["message"]["content"]
        except Exception as e:  # httpx 예외, JSON 파싱 오류, 응답 스키마 불일치 등 모두 삼켜서 폴백 유도
            logger.warning(f"[LLM Gateway] OpenAI 호환 게이트웨이 호출 실패 - 규칙 기반 폴백으로 전환합니다: {e}")
            return None

        text = (text or "").strip()
        return text or None


class TemplateGateway(LLMGateway):
    """실 LLM 호출 없이 항상 None을 반환하여 규칙 기반 텍스트로 폴백시키는 기본 게이트웨이."""

    mode = "template"

    async def complete(self, system: str, prompt: str) -> Optional[str]:
        return None


class DisabledGateway(LLMGateway):
    """라이선스로 L4가 비활성화된 경우 사용하는 게이트웨이."""

    mode = "disabled"

    async def complete(self, system: str, prompt: str) -> Optional[str]:
        return None


def get_llm_gateway() -> LLMGateway:
    """
    설정값에 따라 적절한 LLMGateway 구현체를 반환하는 팩토리.

    - settings.LLM_ENABLED가 False면 무조건 DisabledGateway.
    - settings.LLM_PROVIDER == "auto": ANTHROPIC_API_KEY가 있으면 Anthropic,
      없고 LLM_GATEWAY_BASE_URL이 있으면 OpenAI 호환, 둘 다 없으면 Template.
    - "anthropic" / "openai_compat" / "template" 명시 지정도 지원한다.
      단, 명시 지정이라도 필수 설정(키/URL)이 없으면 안전하게 Template로 폴백한다.
    """
    if not settings.LLM_ENABLED:
        return DisabledGateway()

    provider = (settings.LLM_PROVIDER or "auto").lower()

    if provider == "anthropic":
        if settings.ANTHROPIC_API_KEY:
            return AnthropicGateway(settings.ANTHROPIC_API_KEY, settings.LLM_MODEL)
        logger.warning("[LLM Gateway] LLM_PROVIDER=anthropic 이지만 ANTHROPIC_API_KEY 미설정 - template 폴백")
        return TemplateGateway()

    if provider == "openai_compat":
        if settings.LLM_GATEWAY_BASE_URL:
            return OpenAICompatGateway(settings.LLM_GATEWAY_BASE_URL, settings.LLM_API_KEY, settings.LLM_MODEL)
        logger.warning("[LLM Gateway] LLM_PROVIDER=openai_compat 이지만 LLM_GATEWAY_BASE_URL 미설정 - template 폴백")
        return TemplateGateway()

    if provider == "template":
        return TemplateGateway()

    # auto
    if settings.ANTHROPIC_API_KEY:
        return AnthropicGateway(settings.ANTHROPIC_API_KEY, settings.LLM_MODEL)
    if settings.LLM_GATEWAY_BASE_URL:
        return OpenAICompatGateway(settings.LLM_GATEWAY_BASE_URL, settings.LLM_API_KEY, settings.LLM_MODEL)
    return TemplateGateway()
