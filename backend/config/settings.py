"""
Configuration module for ProCheck API
Handles environment variables and settings
"""

import os
from typing import List
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings:
    """Application settings and configuration"""
    
    # Elasticsearch Configuration
    ELASTICSEARCH_URL: str = os.getenv("ELASTICSEARCH_URL", "https://localhost:9200")
    ELASTICSEARCH_USERNAME: str = os.getenv("ELASTICSEARCH_USERNAME", "")
    ELASTICSEARCH_PASSWORD: str = os.getenv("ELASTICSEARCH_PASSWORD", "")
    ELASTICSEARCH_API_KEY: str = os.getenv("ELASTICSEARCH_API_KEY", "")  # Supports base64("id:api_key")
    ELASTICSEARCH_INDEX_NAME: str = os.getenv("ELASTICSEARCH_INDEX_NAME", "medical_protocols")
    
    # Gemini API Configuration
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    # Google Cloud / Firestore Configuration
    GOOGLE_CLOUD_CREDENTIALS_PATH: str = os.getenv("GOOGLE_CLOUD_CREDENTIALS_PATH", "")
    
    # FastAPI Configuration
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "True").lower() == "true"
    
    # CORS Configuration
    ALLOWED_ORIGINS: List[str] = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    
    # Application Info
    APP_NAME: str = "ProCheck API"
    APP_VERSION: str = "1.0.1"
    APP_DESCRIPTION: str = "Medical Protocol Search and Generation Service"
    
    @property
    def elasticsearch_configured(self) -> bool:
        """Check if Elasticsearch is properly configured"""
        return bool(self.ELASTICSEARCH_URL and (self.ELASTICSEARCH_API_KEY or self.ELASTICSEARCH_USERNAME))
    
    @property
    def gemini_configured(self) -> bool:
        """Check if Gemini API is properly configured"""
        return bool(self.GEMINI_API_KEY)
    
    @property
    def environment(self) -> str:
        """Get current environment"""
        return "development" if self.DEBUG else "production"

# Global settings instance
settings = Settings()

