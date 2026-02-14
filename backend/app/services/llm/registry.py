"""Provider factory and metadata registry."""

from app.models.llm_models import LLMProviderType
from app.services.llm.anthropic_provider import AnthropicProvider
from app.services.llm.base import BaseLLMProvider
from app.services.llm.cohere_provider import CohereProvider
from app.services.llm.google_provider import GoogleProvider
from app.services.llm.openai_compat import OpenAICompatProvider

# Default base URLs per provider
DEFAULT_BASE_URLS: dict[LLMProviderType, str] = {
    LLMProviderType.OPENAI: "https://api.openai.com/v1",
    LLMProviderType.ANTHROPIC: "https://api.anthropic.com",
    LLMProviderType.GOOGLE: "https://generativelanguage.googleapis.com/v1beta",
    LLMProviderType.MISTRAL: "https://api.mistral.ai/v1",
    LLMProviderType.COHERE: "https://api.cohere.com/v2",
    LLMProviderType.META_LLAMA: "https://api.llama.com/v1",
    LLMProviderType.OLLAMA: "http://localhost:11434/v1",
    LLMProviderType.LMSTUDIO: "http://localhost:1234/v1",
    LLMProviderType.CUSTOM: "http://localhost:8080/v1",
}

# Default model per provider (used when none selected)
DEFAULT_MODELS: dict[LLMProviderType, str] = {
    LLMProviderType.OPENAI: "gpt-4o",
    LLMProviderType.ANTHROPIC: "claude-sonnet-4-5-20250929",
    LLMProviderType.GOOGLE: "gemini-2.0-flash",
    LLMProviderType.MISTRAL: "mistral-large-latest",
    LLMProviderType.COHERE: "command-r-plus",
    LLMProviderType.META_LLAMA: "llama-4-scout",
    LLMProviderType.OLLAMA: "",
    LLMProviderType.LMSTUDIO: "",
    LLMProviderType.CUSTOM: "",
}

# Display names for the UI
PROVIDER_DISPLAY_NAMES: dict[LLMProviderType, str] = {
    LLMProviderType.OPENAI: "OpenAI",
    LLMProviderType.ANTHROPIC: "Anthropic",
    LLMProviderType.GOOGLE: "Google Gemini",
    LLMProviderType.MISTRAL: "Mistral",
    LLMProviderType.COHERE: "Cohere",
    LLMProviderType.META_LLAMA: "Meta Llama",
    LLMProviderType.OLLAMA: "Ollama",
    LLMProviderType.LMSTUDIO: "LM Studio",
    LLMProviderType.CUSTOM: "Custom",
}

# Whether the provider requires an API key
REQUIRES_API_KEY: dict[LLMProviderType, bool] = {
    LLMProviderType.OPENAI: True,
    LLMProviderType.ANTHROPIC: True,
    LLMProviderType.GOOGLE: True,
    LLMProviderType.MISTRAL: True,
    LLMProviderType.COHERE: True,
    LLMProviderType.META_LLAMA: True,
    LLMProviderType.OLLAMA: False,
    LLMProviderType.LMSTUDIO: False,
    LLMProviderType.CUSTOM: False,
}

# Providers that use OpenAI-compatible API
_OPENAI_COMPAT_PROVIDERS = {
    LLMProviderType.OPENAI,
    LLMProviderType.MISTRAL,
    LLMProviderType.META_LLAMA,
    LLMProviderType.OLLAMA,
    LLMProviderType.LMSTUDIO,
    LLMProviderType.CUSTOM,
}


def get_provider(
    provider_type: LLMProviderType,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> BaseLLMProvider:
    """Create a provider instance from the given configuration."""
    resolved_url = base_url or DEFAULT_BASE_URLS[provider_type]

    if provider_type in _OPENAI_COMPAT_PROVIDERS:
        return OpenAICompatProvider(api_key=api_key, base_url=resolved_url, model=model)
    elif provider_type == LLMProviderType.ANTHROPIC:
        return AnthropicProvider(api_key=api_key, base_url=resolved_url, model=model)
    elif provider_type == LLMProviderType.GOOGLE:
        return GoogleProvider(api_key=api_key, base_url=resolved_url, model=model)
    elif provider_type == LLMProviderType.COHERE:
        return CohereProvider(api_key=api_key, base_url=resolved_url, model=model)
    else:
        raise ValueError(f"Unknown provider type: {provider_type}")
