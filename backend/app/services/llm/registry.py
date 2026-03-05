"""Provider factory and metadata registry."""

from app.models.llm_models import LLMProviderType, ModelInfo
from app.services.llm.anthropic_provider import AnthropicProvider
from app.services.llm.base import BaseLLMProvider
from app.services.llm.cohere_provider import CohereProvider
from app.services.llm.github_models_provider import GitHubModelsProvider
from app.services.llm.google_provider import GoogleProvider
from app.services.llm.openai_compat import OpenAICompatProvider
from app.services.llm.url_validator import validate_base_url

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
    LLMProviderType.GROQ: "https://api.groq.com/openai/v1",
    LLMProviderType.XAI: "https://api.x.ai/v1",
    LLMProviderType.GITHUB_MODELS: "https://models.github.ai/inference",
    LLMProviderType.LLAMAFILE: "http://127.0.0.1:8080/v1",
}

# Default model per provider (used when none selected)
DEFAULT_MODELS: dict[LLMProviderType, str] = {
    LLMProviderType.OPENAI: "gpt-5.2",
    LLMProviderType.ANTHROPIC: "claude-sonnet-4-6",
    LLMProviderType.GOOGLE: "gemini-2.5-flash",
    LLMProviderType.MISTRAL: "mistral-large-3-25-12",
    LLMProviderType.COHERE: "command-a-03-2025",
    LLMProviderType.META_LLAMA: "llama-4-scout",
    LLMProviderType.OLLAMA: "",
    LLMProviderType.LMSTUDIO: "",
    LLMProviderType.CUSTOM: "",
    LLMProviderType.GROQ: "llama-3.3-70b-versatile",
    LLMProviderType.XAI: "grok-4-0709",
    LLMProviderType.GITHUB_MODELS: "openai/gpt-5.2",
    LLMProviderType.LLAMAFILE: "",
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
    LLMProviderType.GROQ: "Groq",
    LLMProviderType.XAI: "xAI",
    LLMProviderType.GITHUB_MODELS: "GitHub Models",
    LLMProviderType.LLAMAFILE: "Llamafile",
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
    LLMProviderType.GROQ: True,
    LLMProviderType.XAI: True,
    LLMProviderType.GITHUB_MODELS: True,
    LLMProviderType.LLAMAFILE: False,
}

# Providers that use OpenAI-compatible API
_OPENAI_COMPAT_PROVIDERS = {
    LLMProviderType.OPENAI,
    LLMProviderType.MISTRAL,
    LLMProviderType.META_LLAMA,
    LLMProviderType.OLLAMA,
    LLMProviderType.LMSTUDIO,
    LLMProviderType.CUSTOM,
    LLMProviderType.GROQ,
    LLMProviderType.XAI,
    LLMProviderType.LLAMAFILE,
}


# Well-known models per provider (shown without API key; refresh fetches live).
KNOWN_MODELS: dict[LLMProviderType, list["ModelInfo"]] = {
    LLMProviderType.OPENAI: [
        ModelInfo(id="gpt-5.2", name="GPT-5.2", context_window=1047576),
        ModelInfo(id="gpt-5.2-pro", name="GPT-5.2 Pro", context_window=1047576),
        ModelInfo(id="gpt-5", name="GPT-5", context_window=1047576),
        ModelInfo(id="gpt-5-mini", name="GPT-5 Mini", context_window=1047576),
        ModelInfo(id="gpt-4.1", name="GPT-4.1", context_window=1047576),
        ModelInfo(id="o3", name="o3", context_window=200000),
        ModelInfo(id="o4-mini", name="o4-mini", context_window=200000),
    ],
    LLMProviderType.ANTHROPIC: [
        ModelInfo(id="claude-opus-4-6", name="Claude Opus 4.6", context_window=200000),
        ModelInfo(id="claude-sonnet-4-6", name="Claude Sonnet 4.6", context_window=200000),
        ModelInfo(id="claude-haiku-4-5-20251001", name="Claude Haiku 4.5", context_window=200000),
    ],
    LLMProviderType.GOOGLE: [
        ModelInfo(id="gemini-3.1-pro-preview", name="Gemini 3.1 Pro Preview", context_window=1048576),
        ModelInfo(id="gemini-3-flash-preview", name="Gemini 3 Flash Preview", context_window=1048576),
        ModelInfo(id="gemini-2.5-pro", name="Gemini 2.5 Pro", context_window=1048576),
        ModelInfo(id="gemini-2.5-flash", name="Gemini 2.5 Flash", context_window=1048576),
        ModelInfo(id="gemini-2.5-flash-lite", name="Gemini 2.5 Flash-Lite", context_window=1048576),
    ],
    LLMProviderType.MISTRAL: [
        ModelInfo(id="mistral-large-3-25-12", name="Mistral Large 3", context_window=128000),
        ModelInfo(id="mistral-medium-3-1-25-08", name="Mistral Medium 3.1", context_window=128000),
        ModelInfo(id="mistral-small-3-2-25-06", name="Mistral Small 3.2", context_window=128000),
        ModelInfo(id="codestral-25-08", name="Codestral", context_window=32000),
    ],
    LLMProviderType.COHERE: [
        ModelInfo(id="command-a-03-2025", name="Command A", context_window=256000),
        ModelInfo(id="command-r-plus", name="Command R+", context_window=128000),
        ModelInfo(id="command-r", name="Command R", context_window=128000),
    ],
    LLMProviderType.META_LLAMA: [
        ModelInfo(id="llama-4-scout", name="Llama 4 Scout", context_window=512000),
        ModelInfo(id="llama-4-maverick", name="Llama 4 Maverick", context_window=256000),
        ModelInfo(id="llama-3.3-70b-instruct", name="Llama 3.3 70B", context_window=128000),
    ],
    LLMProviderType.GROQ: [
        ModelInfo(id="llama-3.3-70b-versatile", name="Llama 3.3 70B Versatile", context_window=128000),
        ModelInfo(id="llama-3.1-8b-instant", name="Llama 3.1 8B Instant", context_window=128000),
        ModelInfo(id="llama-guard-3-8b", name="Llama Guard 3 8B", context_window=8192),
        ModelInfo(id="mixtral-8x7b-32768", name="Mixtral 8x7B", context_window=32768),
        ModelInfo(id="gemma2-9b-it", name="Gemma 2 9B", context_window=8192),
    ],
    LLMProviderType.XAI: [
        ModelInfo(id="grok-4-1-fast-reasoning", name="Grok 4.1 Fast", context_window=2000000),
        ModelInfo(id="grok-4-0709", name="Grok 4", context_window=256000),
        ModelInfo(id="grok-3", name="Grok 3", context_window=131072),
    ],
    LLMProviderType.GITHUB_MODELS: [
        ModelInfo(id="openai/gpt-5.2", name="OpenAI GPT-5.2", context_window=1047576),
        ModelInfo(id="openai/gpt-4.1", name="OpenAI GPT-4.1", context_window=1047576),
        ModelInfo(id="meta/llama-4-scout", name="Meta Llama 4 Scout", context_window=512000),
        ModelInfo(id="mistral-ai/mistral-large-latest", name="Mistral Large", context_window=128000),
    ],
    # Local providers: no known models (user-dependent)
    LLMProviderType.OLLAMA: [],
    LLMProviderType.LMSTUDIO: [],
    LLMProviderType.CUSTOM: [],
    LLMProviderType.LLAMAFILE: [],
}


def get_provider(
    provider_type: LLMProviderType,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> BaseLLMProvider:
    """Create a provider instance from the given configuration."""
    resolved_url = base_url or DEFAULT_BASE_URLS[provider_type]

    # SSRF protection: validate URL before creating provider
    validate_base_url(resolved_url, provider_type)

    if provider_type == LLMProviderType.GITHUB_MODELS:
        return GitHubModelsProvider(api_key=api_key, base_url=resolved_url, model=model)
    elif provider_type in _OPENAI_COMPAT_PROVIDERS:
        return OpenAICompatProvider(api_key=api_key, base_url=resolved_url, model=model)
    elif provider_type == LLMProviderType.ANTHROPIC:
        return AnthropicProvider(api_key=api_key, base_url=resolved_url, model=model)
    elif provider_type == LLMProviderType.GOOGLE:
        return GoogleProvider(api_key=api_key, base_url=resolved_url, model=model)
    elif provider_type == LLMProviderType.COHERE:
        return CohereProvider(api_key=api_key, base_url=resolved_url, model=model)
    else:
        raise ValueError(f"Unknown provider type: {provider_type}")


def sort_and_enrich_models(
    live_models: list[ModelInfo],
    provider_type: LLMProviderType,
) -> list[ModelInfo]:
    """Sort live models (known first by curated order, unknowns alphabetically) and enrich metadata."""
    known = KNOWN_MODELS.get(provider_type, [])
    known_by_id: dict[str, tuple[int, ModelInfo]] = {
        m.id: (i, m) for i, m in enumerate(known)
    }

    # Deduplicate by model id (keep first occurrence)
    seen: set[str] = set()
    unique: list[ModelInfo] = []
    for m in live_models:
        if m.id not in seen:
            seen.add(m.id)
            unique.append(m)

    def sort_key(m: ModelInfo) -> tuple[int, str]:
        if m.id in known_by_id:
            return (known_by_id[m.id][0], "")
        return (len(known) + 1, m.id.lower())

    unique.sort(key=sort_key)

    # Enrich: backfill display name and context_window from known models
    enriched: list[ModelInfo] = []
    for m in unique:
        if m.id in known_by_id:
            _, known_m = known_by_id[m.id]
            name = m.name if m.name != m.id else known_m.name
            ctx = m.context_window if m.context_window is not None else known_m.context_window
            enriched.append(ModelInfo(id=m.id, name=name, context_window=ctx))
        else:
            enriched.append(m)

    return enriched
