"""Rate limiting configuration (avoids circular imports)."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Disable rate limiting in tests by setting enabled=False
_enabled = os.environ.get("FOLIO_MAPPER_NO_RATE_LIMIT", "").lower() != "true"

limiter = Limiter(key_func=get_remote_address, enabled=_enabled)
