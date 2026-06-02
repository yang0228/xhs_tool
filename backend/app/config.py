from __future__ import annotations
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # DeepSeek API (Anthropic-compatible)
    anthropic_api_key: str = ""  # DeepSeek API key
    anthropic_base_url: str = "https://api.deepseek.com/anthropic"
    ai_model_default: str = "deepseek-chat"
    # Database
    database_url: str = "postgresql+asyncpg://xhs:xhs_dev@localhost:5432/xhs_tool"
    # Cloudflare R2
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_endpoint: str = ""
    r2_bucket: str = "xhs-images"
    r2_public_url: str = ""
    # Backend
    secret_key: str = "change-me"
    debug: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
