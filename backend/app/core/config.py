"""Configuración central leída desde variables de entorno / .env"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "GabAn POS"
    DATABASE_URL: str = "postgresql+psycopg2://pos:pos@db:5432/gabanpos"

    JWT_SECRET: str = "cambia-esto-en-produccion"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8

    # Orígenes permitidos para CORS (frontend)
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost"


settings = Settings()
