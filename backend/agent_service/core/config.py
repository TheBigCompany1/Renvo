# app/core/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings(BaseSettings):
    """Application settings."""
    app_name: str = "Renvo API"
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo-0125")
    
    # Database settings (for future use)
    database_url: str = os.getenv("DATABASE_URL", "")
    
    # API settings
    api_prefix: str = "/api/extension/v1"
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings."""
    return Settings()