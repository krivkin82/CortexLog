from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "AIC Backend"
    api_prefix: str = ""
    host: str = "127.0.0.1"
    port: int = 8000
    log_level: str = "info"
    ollama_model: str = "gpt-oss:20b"  # Override with AIC_OLLAMA_MODEL env var
    ollama_base_url: str = "http://localhost:11434"

    model_config = {"env_prefix": "AIC_"}


settings = Settings()

# NOTE (debugging): If you’re investigating a bug, start with `.cursor/debug-reference.md`
# and check `.cursor/debug-journal.md` for prior incidents/fixes.
