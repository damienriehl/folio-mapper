"""Provider factory and metadata registry."""

import ipaddress
import re
from urllib.parse import urlparse

from app.models.llm_models import LLMProviderType, ModelInfo
from app.services.llm.anthropic_provider import AnthropicProvider
from app.services.llm.base import BaseLLMProvider
from app.services.llm.cohere_provider import CohereProvider
from app.services.llm.github_models_provider import GitHubModelsProvider
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
    LLMProviderType.GROQ: "https://api.groq.com/openai/v1",
    LLMProviderType.XAI: "https://api.x.ai/v1",
    LLMProviderType.GITHUB_MODELS: "https://models.github.ai/inference",
    LLMProviderType.LLAMAFILE: "http://127.0.0.1:8080/v1",
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
    LLMProviderType.GROQ: "llama-3.3-70b-versatile",
    LLMProviderType.XAI: "grok-3-mini",
    LLMProviderType.GITHUB_MODELS: "openai/gpt-4o",
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
        ModelInfo(id="gpt-4.1", name="GPT-4.1", context_window=1047576),
        ModelInfo(id="gpt-4.1-mini", name="GPT-4.1 Mini", context_window=1047576),
        ModelInfo(id="gpt-4.1-nano", name="GPT-4.1 Nano", context_window=1047576),
        ModelInfo(id="gpt-4o", name="GPT-4o", context_window=128000),
        ModelInfo(id="gpt-4o-mini", name="GPT-4o Mini", context_window=128000),
        ModelInfo(id="o3", name="o3", context_window=200000),
        ModelInfo(id="o3-mini", name="o3-mini", context_window=200000),
        ModelInfo(id="o4-mini", name="o4-mini", context_window=200000),
    ],
    LLMProviderType.ANTHROPIC: [
        ModelInfo(id="claude-opus-4-6", name="Claude Opus 4.6", context_window=200000),
        ModelInfo(id="claude-sonnet-4-5-20250929", name="Claude Sonnet 4.5", context_window=200000),
        ModelInfo(id="claude-haiku-4-5-20251001", name="Claude Haiku 4.5", context_window=200000),
    ],
    LLMProviderType.GOOGLE: [
        ModelInfo(id="gemini-2.5-pro-preview-05-06", name="Gemini 2.5 Pro", context_window=1048576),
        ModelInfo(id="gemini-2.5-flash-preview-04-17", name="Gemini 2.5 Flash", context_window=1048576),
        ModelInfo(id="gemini-2.0-flash", name="Gemini 2.0 Flash", context_window=1048576),
        ModelInfo(id="gemini-2.0-flash-lite", name="Gemini 2.0 Flash-Lite", context_window=1048576),
        ModelInfo(id="gemini-1.5-pro", name="Gemini 1.5 Pro", context_window=2097152),
        ModelInfo(id="gemini-1.5-flash", name="Gemini 1.5 Flash", context_window=1048576),
    ],
    LLMProviderType.MISTRAL: [
        ModelInfo(id="mistral-large-latest", name="Mistral Large", context_window=128000),
        ModelInfo(id="mistral-small-latest", name="Mistral Small", context_window=32000),
        ModelInfo(id="open-mistral-nemo", name="Mistral Nemo", context_window=128000),
        ModelInfo(id="codestral-latest", name="Codestral", context_window=32000),
    ],
    LLMProviderType.COHERE: [
        ModelInfo(id="command-r-plus", name="Command R+", context_window=128000),
        ModelInfo(id="command-r", name="Command R", context_window=128000),
        ModelInfo(id="command-a-03-2025", name="Command A", context_window=256000),
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
        ModelInfo(id="grok-3", name="Grok 3", context_window=131072),
        ModelInfo(id="grok-3-mini", name="Grok 3 Mini", context_window=131072),
        ModelInfo(id="grok-2", name="Grok 2", context_window=131072),
    ],
    LLMProviderType.GITHUB_MODELS: [
        ModelInfo(id="openai/gpt-4o", name="OpenAI GPT-4o", context_window=128000),
        ModelInfo(id="openai/gpt-4o-mini", name="OpenAI GPT-4o Mini", context_window=128000),
        ModelInfo(id="meta/llama-3.3-70b-instruct", name="Meta Llama 3.3 70B", context_window=128000),
        ModelInfo(id="mistral-ai/mistral-large-2411", name="Mistral Large", context_window=128000),
    ],
    # Local providers: no known models (user-dependent)
    LLMProviderType.OLLAMA: [],
    LLMProviderType.LMSTUDIO: [],
    LLMProviderType.CUSTOM: [],
    LLMProviderType.LLAMAFILE: [],
}


# Allowed domains for cloud providers (user-supplied base_url must match)
_ALLOWED_DOMAINS: dict[LLMProviderType, list[str]] = {
    LLMProviderType.OPENAI: ["api.openai.com"],
    LLMProviderType.ANTHROPIC: ["api.anthropic.com"],
    LLMProviderType.GOOGLE: ["generativelanguage.googleapis.com"],
    LLMProviderType.MISTRAL: ["api.mistral.ai"],
    LLMProviderType.COHERE: ["api.cohere.com"],
    LLMProviderType.META_LLAMA: ["api.llama.com"],
    LLMProviderType.GROQ: ["api.groq.com"],
    LLMProviderType.XAI: ["api.x.ai"],
    LLMProviderType.GITHUB_MODELS: ["models.github.ai"],
}

# Providers that intentionally target localhost (skip SSRF checks)
_LOCAL_PROVIDERS = {
    LLMProviderType.OLLAMA,
    LLMProviderType.LMSTUDIO,
    LLMProviderType.CUSTOM,
    LLMProviderType.LLAMAFILE,
}

# Private/reserved IP patterns
_PRIVATE_IP_PATTERNS = [
    re.compile(r"^127\."),                         # Loopback
    re.compile(r"^10\."),                          # Private class A
    re.compile(r"^172\.(1[6-9]|2[0-9]|3[01])\."), # Private class B
    re.compile(r"^192\.168\."),                    # Private class C
    re.compile(r"^169\.254\."),                    # Link-local / cloud metadata
    re.compile(r"^0\."),                           # Current network
]

_BLOCKED_HOSTNAMES = {
    "metadata.google.internal",
    "metadata",
}


def _validate_base_url(url: str, provider_type: LLMProviderType) -> None:
    """Validate a base URL to prevent SSRF attacks.

    For cloud providers: restricts to known domains.
    For local providers: allows localhost only.
    Blocks private/reserved IPs and cloud metadata endpoints for cloud providers.
    """
    # Local providers are allowed to target localhost by design
    if provider_type in _LOCAL_PROVIDERS:
        return

    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()

    if not hostname:
        raise ValueError(f"Invalid base URL: {url}")

    # Block cloud metadata hostnames
    if hostname in _BLOCKED_HOSTNAMES:
        raise ValueError("Base URL must not target cloud metadata endpoints")

    # Check if hostname is an IP address
    try:
        addr = ipaddress.ip_address(hostname)
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            raise ValueError("Base URL must not target private or internal network addresses")
    except ValueError as e:
        if "must not target" in str(e):
            raise
        # Not an IP address, continue with hostname checks

    # Validate against allowed domains for the provider
    allowed = _ALLOWED_DOMAINS.get(provider_type)
    if allowed:
        if not any(hostname == d or hostname.endswith(f".{d}") for d in allowed):
            raise ValueError(
                f'Base URL hostname "{hostname}" is not allowed for provider '
                f'"{provider_type.value}". Allowed domains: {", ".join(allowed)}'
            )


def get_provider(
    provider_type: LLMProviderType,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> BaseLLMProvider:
    """Create a provider instance from the given configuration."""
    resolved_url = base_url or DEFAULT_BASE_URLS[provider_type]

    # Validate user-supplied base_url against SSRF (skip for default URLs)
    if base_url is not None:
        _validate_base_url(base_url, provider_type)

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
