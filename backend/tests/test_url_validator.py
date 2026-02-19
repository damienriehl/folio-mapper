"""Tests for SSRF URL validation."""

import os
from unittest.mock import patch

import pytest

from app.models.llm_models import LLMProviderType
from app.services.llm.url_validator import SSRFError, validate_base_url


def test_valid_cloud_https_url():
    """Cloud providers with https URLs should pass."""
    validate_base_url("https://api.openai.com/v1", LLMProviderType.OPENAI)


def test_cloud_http_blocked():
    """Cloud providers must use https."""
    with pytest.raises(SSRFError, match="Cloud providers require https"):
        validate_base_url("http://api.openai.com/v1", LLMProviderType.OPENAI)


def test_local_provider_http_allowed():
    """Local providers can use http."""
    validate_base_url("http://localhost:11434/v1", LLMProviderType.OLLAMA)


def test_local_provider_https_allowed():
    """Local providers can also use https."""
    validate_base_url("https://localhost:11434/v1", LLMProviderType.OLLAMA)


def test_aws_metadata_ip_blocked_for_cloud():
    """AWS metadata endpoint IP should be blocked for cloud providers."""
    with pytest.raises(SSRFError, match="private/reserved"):
        validate_base_url("https://169.254.169.254/latest/meta-data", LLMProviderType.OPENAI)


def test_localhost_blocked_for_cloud():
    """localhost should be blocked for cloud providers."""
    with pytest.raises(SSRFError, match="private/reserved"):
        validate_base_url("https://localhost/v1", LLMProviderType.OPENAI)


def test_private_ip_blocked_for_cloud():
    """Private IPs should be blocked for cloud providers."""
    with pytest.raises(SSRFError, match="private/reserved"):
        validate_base_url("https://192.168.1.1/v1", LLMProviderType.ANTHROPIC)


def test_ipv6_loopback_blocked_for_cloud():
    """IPv6 loopback should be blocked for cloud providers."""
    with pytest.raises(SSRFError, match="private/reserved"):
        validate_base_url("https://[::1]/v1", LLMProviderType.GOOGLE)


def test_localhost_allowed_for_ollama():
    """Ollama can connect to localhost."""
    validate_base_url("http://localhost:11434/v1", LLMProviderType.OLLAMA)


def test_localhost_allowed_for_lmstudio():
    """LM Studio can connect to localhost."""
    validate_base_url("http://localhost:1234/v1", LLMProviderType.LMSTUDIO)


def test_localhost_allowed_for_llamafile():
    """Llamafile can connect to localhost."""
    validate_base_url("http://127.0.0.1:8080/v1", LLMProviderType.LLAMAFILE)


def test_env_var_override_allows_private():
    """ALLOW_PRIVATE_URLS=true allows private IPs for cloud providers."""
    with patch.dict(os.environ, {"ALLOW_PRIVATE_URLS": "true"}):
        validate_base_url("https://192.168.1.1/v1", LLMProviderType.OPENAI)


def test_no_hostname_raises():
    """URL with no hostname should raise."""
    with pytest.raises(SSRFError, match="no hostname"):
        validate_base_url("https:///v1", LLMProviderType.OPENAI)


def test_invalid_scheme_raises():
    """Non-http(s) schemes should raise."""
    with pytest.raises(SSRFError):
        validate_base_url("ftp://example.com/v1", LLMProviderType.OPENAI)
