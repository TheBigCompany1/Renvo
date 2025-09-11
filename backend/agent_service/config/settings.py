# backend/agent_service/config/settings.py
from __future__ import annotations
import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


def _first(*names: str) -> Optional[str]:
    """Return the first non-empty env var value among the given names."""
    for n in names:
        v = os.getenv(n)
        if v and v.strip():
            return v.strip()
    return None


class Settings(BaseSettings):
    # Environment
    ENV_NAME: str = Field(default=os.getenv("ENV_NAME", "staging"))

    # Redis
    REDIS_URL: Optional[str] = Field(default=_first("REDIS_URL", "REDIS_INTERNAL_URL"))

    # --- LLM: Gemini (Google) ---
    # Accept multiple env var spellings. We normalize them to GOOGLE_API_KEY.
    GOOGLE_API_KEY: Optional[str] = Field(
        default=_first("GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENAI_API_KEY", "GOOGLEAI_API_KEY")
    )
    GOOGLE_GEMINI_MODEL: str = Field(default=os.getenv("GOOGLE_GEMINI_MODEL", "gemini-1.5-flash"))

    # --- LLM: OpenAI (optional fallback) ---
    OPENAI_API_KEY: Optional[str] = Field(default=os.getenv("OPENAI_API_KEY"))
    OPENAI_MODEL: str = Field(default=os.getenv("OPENAI_MODEL", "gpt-4o-mini"))

    # Selection logic
    @property
    def LLM_PROVIDER(self) -> str:
        if self.GOOGLE_API_KEY:
            return "gemini"
        if self.OPENAI_API_KEY:
            return "openai"
        return "none"

    # For safe logging
    def _mask(self, v: Optional[str]) -> str:
        if not v:
            return "None"
        return f"{v[:4]}…{len(v)}"

    def safe_summary(self) -> str:
        return (
            f"ENV={self.ENV_NAME} | "
            f"REDIS_URL={'set' if self.REDIS_URL else 'None'} | "
            f"LLM_PROVIDER={self.LLM_PROVIDER} | "
            f"GOOGLE_API_KEY={self._mask(self.GOOGLE_API_KEY)} | "
            f"GOOGLE_GEMINI_MODEL={self.GOOGLE_GEMINI_MODEL} | "
            f"OPENAI_API_KEY={self._mask(self.OPENAI_API_KEY)} | "
            f"OPENAI_MODEL={self.OPENAI_MODEL}"
        )


settings = Settings()
