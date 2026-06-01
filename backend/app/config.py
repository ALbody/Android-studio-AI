import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Voice Assistant API"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:password@localhost:5432/voiceassistant")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    CHROMA_HOST: str = os.getenv("CHROMA_HOST", "localhost")
    CHROMA_PORT: int = int(os.getenv("CHROMA_PORT", "8000"))
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-key-for-jwt-do-not-use-in-prod")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "fallback-key") # For Qwen API fallback if local isn't present

settings = Settings()
