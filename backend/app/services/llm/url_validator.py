"""SSRF protection: validate base_url before creating LLM provider instances."""

from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlparse

from app.models.llm_models import LLMProviderType

# Providers that legitimately connect to localhost / private networks
_LOCAL_PROVIDERS = {
    LLMProviderType.OLLAMA,
    LLMProviderType.LMSTUDIO,
    LLMProviderType.CUSTOM,
    LLMProviderType.LLAMAFILE,
}


class SSRFError(ValueError):
    """Raised when a URL fails SSRF validation."""


def validate_base_url(url: str, provider_type: LLMProviderType) -> None:
    """Validate a base URL for SSRF safety.

    Rules:
    - Cloud providers require https scheme.
    - Local providers (Ollama, LM Studio, Custom, Llamafile) allow http.
    - Private/reserved IPs are blocked unless provider is local or
      ALLOW_PRIVATE_URLS env var is set.
    """
    parsed = urlparse(url)

    # Scheme check
    is_local = provider_type in _LOCAL_PROVIDERS
    allowed_schemes = {"https", "http"} if is_local else {"https"}
    if parsed.scheme not in allowed_schemes:
        if is_local:
            raise SSRFError(f"URL scheme must be http or https, got '{parsed.scheme}'")
        raise SSRFError(f"Cloud providers require https, got '{parsed.scheme}'")

    hostname = parsed.hostname
    if not hostname:
        raise SSRFError("URL has no hostname")

    # Resolve hostname and check all addresses
    allow_private = is_local or os.environ.get("ALLOW_PRIVATE_URLS", "").lower() == "true"

    try:
        addr_infos = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        raise SSRFError(f"Cannot resolve hostname: {hostname}")

    for family, _, _, _, sockaddr in addr_infos:
        ip_str = sockaddr[0]
        try:
            addr = ipaddress.ip_address(ip_str)
        except ValueError:
            continue

        if not allow_private and (
            addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved
        ):
            raise SSRFError(
                f"URL resolves to private/reserved address ({ip_str}); "
                "blocked for cloud providers"
            )
