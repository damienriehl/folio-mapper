"""Abstract base class for LLM providers."""

from abc import ABC, abstractmethod

from app.models.llm_models import ModelInfo


class BaseLLMProvider(ABC):
    def __init__(self, api_key: str | None, base_url: str, model: str | None = None):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model

    @abstractmethod
    async def test_connection(self) -> bool:
        """Test that the provider is reachable and credentials are valid."""
        ...

    @abstractmethod
    async def list_models(self) -> list[ModelInfo]:
        """Return available models from this provider."""
        ...

    @abstractmethod
    async def complete(self, messages: list[dict], **kwargs) -> str:
        """Send a chat completion request and return the response text."""
        ...
