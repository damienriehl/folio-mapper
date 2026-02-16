"""GitHub Models provider — OpenAI-compatible inference with custom model catalog."""

import httpx

from app.models.llm_models import ModelInfo
from app.services.llm.openai_compat import OpenAICompatProvider

_CATALOG_URL = "https://models.github.ai/catalog/models"


class GitHubModelsProvider(OpenAICompatProvider):
    """GitHub Models: inference via OpenAI-compat, model listing via catalog API."""

    async def list_models(self) -> list[ModelInfo]:
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(_CATALOG_URL, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        models: list[ModelInfo] = []
        for entry in data:
            model_id = entry.get("id", "")
            name = entry.get("name", model_id)
            limits = entry.get("limits", {})
            ctx = limits.get("max_input_tokens")
            models.append(ModelInfo(id=model_id, name=name, context_window=ctx))

        return sorted(models, key=lambda m: m.name)
