import os
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# Disable local auth for tests (all tests run without X-Local-Token header)
os.environ["FOLIO_MAPPER_NO_AUTH"] = "true"
# Disable rate limiting for tests
os.environ["FOLIO_MAPPER_NO_RATE_LIMIT"] = "true"


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES_DIR
