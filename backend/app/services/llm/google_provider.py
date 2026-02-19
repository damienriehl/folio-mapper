"""Google Gemini provider (direct HTTP, no heavy SDK)."""

import httpx

from app.models.llm_models import ModelInfo
from app.services.llm.base import BaseLLMProvider


class GoogleProvider(BaseLLMProvider):
    """Provider for Google Gemini models via REST API."""

    def _headers(self) -> dict[str, str]:
        return {"x-goog-api-key": self.api_key or ""}

    async def test_connection(self) -> bool:
        async with httpx.AsyncClient() as client:
            url = f"{self.base_url}/models"
            resp = await client.get(url, headers=self._headers(), timeout=15)
            resp.raise_for_status()
            return True

    async def list_models(self) -> list[ModelInfo]:
        async with httpx.AsyncClient() as client:
            url = f"{self.base_url}/models"
            resp = await client.get(url, headers=self._headers(), timeout=15)
            resp.raise_for_status()
            data = resp.json()

        models = []
        for m in data.get("models", []):
            model_id = m.get("name", "").removeprefix("models/")
            if not model_id or not m.get("supportedGenerationMethods", []):
                continue
            # Only include models that support generateContent
            if "generateContent" not in m.get("supportedGenerationMethods", []):
                continue
            models.append(
                ModelInfo(
                    id=model_id,
                    name=m.get("displayName", model_id),
                    context_window=m.get("inputTokenLimit"),
                )
            )
        return sorted(models, key=lambda m: m.id)

    async def complete(self, messages: list[dict], **kwargs) -> str:
        if not self.model:
            raise ValueError("No model selected")

        # Convert OpenAI-style messages to Gemini format
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        async with httpx.AsyncClient() as client:
            url = f"{self.base_url}/models/{self.model}:generateContent"
            resp = await client.post(
                url,
                headers=self._headers(),
                json={"contents": contents},
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()

        return data["candidates"][0]["content"]["parts"][0]["text"]
