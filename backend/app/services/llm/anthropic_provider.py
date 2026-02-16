"""Anthropic Claude provider."""

import logging

import anthropic

from app.models.llm_models import ModelInfo
from app.services.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)

# Fallback list used when the models API is unreachable.
_FALLBACK_MODELS = [
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
        try:
            client = anthropic.AsyncAnthropic(api_key=self.api_key)
            resp = await client.models.list(limit=100)
            models = [
                ModelInfo(
                    id=m.id,
                    name=getattr(m, "display_name", m.id),
                    context_window=None,
                )
                for m in resp.data
            ]
            if models:
                return sorted(models, key=lambda m: m.name)
        except Exception:
            logger.warning("Anthropic models.list() failed, using fallback list")
        return list(_FALLBACK_MODELS)

    async def complete(self, messages: list[dict], **kwargs) -> str:
        if not self.model:
            raise ValueError("No model selected")
        client = anthropic.AsyncAnthropic(api_key=self.api_key)

        # Anthropic API requires system messages as a separate parameter
        system_text = None
        non_system = []
        for msg in messages:
            if msg.get("role") == "system":
                system_text = msg["content"]
            else:
                non_system.append(msg)

        create_kwargs = {
            "model": self.model,
            "messages": non_system,
            "max_tokens": kwargs.pop("max_tokens", 4096),
            **kwargs,
        }
        if system_text:
            create_kwargs["system"] = system_text

        resp = await client.messages.create(**create_kwargs)
        return resp.content[0].text
