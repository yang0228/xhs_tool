from __future__ import annotations
from pydantic_settings import BaseSettings
from pathlib import Path
from pydantic import Field


class Settings(BaseSettings):
    # DeepSeek API (Anthropic-compatible)
    anthropic_api_key: str = ""  # DeepSeek API key
    anthropic_base_url: str = "https://api.deepseek.com/anthropic"
    ai_model_default: str = "deepseek-chat"
    # Optional RAGFlow service. Dataset bindings are managed on the server.
    ragflow_url: str = ""
    ragflow_api_key: str = ""
    ragflow_datasets: dict[str, str] = Field(default_factory=dict)
    ragflow_index_revision: str = Field(default="v1.0.0-rc2-v1", min_length=1, max_length=128)
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

    model_config = {"env_file": Path(__file__).resolve().parents[2] / ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
