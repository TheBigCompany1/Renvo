# backend/agent_service/core/config.py
from __future__ import annotations

from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # ---- Google / Gemini ----
    GOOGLE_API_KEY: Optional[str] = Field(default=None, description="Google API key for Gemini.")
    GOOGLE_GEMINI_MODEL: str = Field(
        default="gemini-2.0-flash",
        description="Default Gemini model name used across agents."
    )

    # ---- OpenAI (if you use it anywhere) ----
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    # ---- Redis ----
    REDIS_URL: Optional[str] = Field(default=None, description="External Redis URL if provided.")
    REDIS_INTERNAL_URL: Optional[str] = Field(default=None, description="Internal Redis URL (Render).")

    # ---- Misc ----
    ENV: str = "staging"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Cached settings instance so all imports get the same object.
    Ensures GOOGLE_GEMINI_MODEL is always present with a sane default.
    """
    return Settings()
