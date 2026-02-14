"""OpenAI-compatible provider. Covers OpenAI, Mistral, Meta Llama, Ollama, LM Studio, Custom."""

import openai

from app.models.llm_models import ModelInfo
from app.services.llm.base import BaseLLMProvider


class OpenAICompatProvider(BaseLLMProvider):
    """Provider for any OpenAI-compatible API."""

    async def test_connection(self) -> bool:
        client = openai.AsyncOpenAI(api_key=self.api_key or "unused", base_url=self.base_url)
        if self.model:
            resp = await client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=1,
            )
            return bool(resp.choices)
        else:
            models = await client.models.list()
            return True

    async def list_models(self) -> list[ModelInfo]:
        client = openai.AsyncOpenAI(api_key=self.api_key or "unused", base_url=self.base_url)
        resp = await client.models.list()
        return [
            ModelInfo(id=m.id, name=m.id)
            for m in sorted(resp.data, key=lambda m: m.id)
        ]

    async def complete(self, messages: list[dict], **kwargs) -> str:
        if not self.model:
            raise ValueError("No model selected")
        client = openai.AsyncOpenAI(api_key=self.api_key or "unused", base_url=self.base_url)
        resp = await client.chat.completions.create(
            model=self.model,
            messages=messages,
            **kwargs,
        )
        return resp.choices[0].message.content or ""
