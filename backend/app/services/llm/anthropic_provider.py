"""Anthropic Claude provider."""

import anthropic

from app.models.llm_models import ModelInfo
from app.services.llm.base import BaseLLMProvider

# Anthropic has no public model-listing endpoint; maintain a static list.
ANTHROPIC_MODELS = [
    ModelInfo(id="claude-opus-4-6", name="Claude Opus 4.6", context_window=200000),
    ModelInfo(id="claude-sonnet-4-5-20250929", name="Claude Sonnet 4.5", context_window=200000),
    ModelInfo(id="claude-haiku-4-5-20251001", name="Claude Haiku 4.5", context_window=200000),
]


class AnthropicProvider(BaseLLMProvider):
    """Provider for Anthropic Claude models."""

    async def test_connection(self) -> bool:
        client = anthropic.AsyncAnthropic(api_key=self.api_key)
        resp = await client.messages.create(
            model=self.model or "claude-haiku-4-5-20251001",
            max_tokens=1,
            messages=[{"role": "user", "content": "Hi"}],
        )
        return resp.id is not None

    async def list_models(self) -> list[ModelInfo]:
        return list(ANTHROPIC_MODELS)

    async def complete(self, messages: list[dict], **kwargs) -> str:
        if not self.model:
            raise ValueError("No model selected")
        client = anthropic.AsyncAnthropic(api_key=self.api_key)
        resp = await client.messages.create(
            model=self.model,
            messages=messages,
            max_tokens=kwargs.pop("max_tokens", 4096),
            **kwargs,
        )
        return resp.content[0].text
