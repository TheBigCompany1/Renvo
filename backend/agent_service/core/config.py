from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from .env file
BASE_DIR = Path(__file__).resolve().parent
dotenv_path = BASE_DIR / '.env'

load_dotenv(dotenv_path=dotenv_path)

class Settings(BaseSettings):
    """Application settings."""
    app_name: str = "Renvo API"
    # --- FIX: Removed the unused 'openai_api_key' setting ---
    gemini_api_key: str = os.getenv("GEMINI_API_KEY")
    redis_url: str = os.getenv("REDIS_URL") 
    
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
