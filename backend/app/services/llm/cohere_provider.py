"""Cohere provider (direct HTTP, no heavy SDK)."""

import httpx

from app.models.llm_models import ModelInfo
from app.services.llm.base import BaseLLMProvider


class CohereProvider(BaseLLMProvider):
    """Provider for Cohere models via REST API."""

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def test_connection(self) -> bool:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/models",
                headers=self._headers(),
                timeout=15,
            )
            resp.raise_for_status()
            return True

    async def list_models(self) -> list[ModelInfo]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/models",
                headers=self._headers(),
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

        models = []
        for m in data.get("models", []):
            model_id = m.get("name", "")
            if not model_id:
                continue
            context = m.get("context_length")
            models.append(
                ModelInfo(
                    id=model_id,
                    name=model_id,
                    context_window=context,
                )
            )
        return sorted(models, key=lambda m: m.id)

    async def complete(self, messages: list[dict], **kwargs) -> str:
        if not self.model:
            raise ValueError("No model selected")

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/chat",
                headers=self._headers(),
                json={
                    "model": self.model,
                    "messages": [
                        {"role": msg["role"], "content": msg["content"]}
                        for msg in messages
                    ],
                },
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()

        return data["message"]["content"][0]["text"]
