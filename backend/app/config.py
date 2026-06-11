from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    mongo_uri: str = "mongodb://localhost:27017"
    redis_uri: str = "redis://localhost:6379"
    app_port: int = 8000
    max_document_size_bytes: int = 1_048_576  # 1 MB

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8"
    }

settings = Settings()