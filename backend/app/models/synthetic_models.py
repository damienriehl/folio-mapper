"""Pydantic models for synthetic data generation."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.llm_models import LLMConfig


class SyntheticRequest(BaseModel):
    count: int = Field(default=10, ge=5, le=50)
    llm_config: LLMConfig


class SyntheticResponse(BaseModel):
    text: str
    item_count: int
