"""Google Gemini provider (direct HTTP, no heavy SDK)."""

import logging
import re

import httpx

from app.models.llm_models import ModelInfo
from app.services.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)

_BASE_HOST = "https://generativelanguage.googleapis.com"
_API_VERSIONS = ["v1beta", "v1alpha"]

# Preview models get graduated → strip "-preview-MM-DD" to get the GA model ID.
_PREVIEW_SUFFIX = re.compile(r"-preview-\d{2}-\d{2}$")


def _model_candidates(model: str) -> list[str]:
    """Return model IDs to try: original first, then without preview suffix."""
    candidates = [model]
    base = _PREVIEW_SUFFIX.sub("", model)
    if base != model:
        candidates.append(base)
    return candidates


class GoogleProvider(BaseLLMProvider):
    """Provider for Google Gemini models via REST API."""

    def _headers(self) -> dict[str, str]:
        """Return headers with API key (avoids exposing key in URL query params)."""
        return {
            "x-goog-api-key": self.api_key or "",
            "Content-Type": "application/json",
        }

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

        # Separate system messages from conversation turns.
        # Gemini uses a dedicated `system_instruction` field (not a role).
        system_parts: list[str] = []
        contents = []
        for msg in messages:
            if msg.get("role") == "system":
                system_parts.append(msg["content"])
                continue
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        # Build request body
        body: dict = {"contents": contents}

        # System instruction via Gemini's native field
        if system_parts:
            body["system_instruction"] = {
                "parts": [{"text": "\n\n".join(system_parts)}],
            }

        # generationConfig from kwargs
        generation_config: dict = {}
        if "temperature" in kwargs:
            generation_config["temperature"] = kwargs["temperature"]
        if "max_tokens" in kwargs:
            generation_config["maxOutputTokens"] = kwargs["max_tokens"]
        if generation_config:
            body["generationConfig"] = generation_config

        # Build list of URLs to try.  On 404 we try:
        #   1. configured base_url + original model
        #   2. each API version  + original model
        #   3. each API version  + model with preview suffix stripped
        models = _model_candidates(self.model)
        urls_to_try: list[str] = []
        for m in models:
            url = f"{self.base_url}/models/{m}:generateContent"
            if url not in urls_to_try:
                urls_to_try.append(url)
            for ver in _API_VERSIONS:
                alt = f"{_BASE_HOST}/{ver}/models/{m}:generateContent"
                if alt not in urls_to_try:
                    urls_to_try.append(alt)

        async with httpx.AsyncClient() as client:
            resp = None
            for url in urls_to_try:
                resp = await client.post(
                    url,
                    headers=self._headers(),
                    json=body,
                    timeout=60,
                )
                if resp.status_code != 404:
                    break
                logger.info("Gemini 404 on %s, trying next", url)

            assert resp is not None
            if resp.status_code != 200:
                logger.error("Gemini API error %s: %s", resp.status_code, resp.text[:500])
                resp.raise_for_status()
            data = resp.json()

        # Defensive parsing — handle blocked or empty responses
        candidates = data.get("candidates", [])
        if not candidates:
            feedback = data.get("promptFeedback", {})
            reason = feedback.get("blockReason", "unknown")
            raise ValueError(f"Gemini returned no candidates (blockReason={reason})")
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts or "text" not in parts[0]:
            finish = candidates[0].get("finishReason", "UNKNOWN")
            raise ValueError(f"Gemini returned no text (finishReason={finish})")
        return parts[0]["text"]
