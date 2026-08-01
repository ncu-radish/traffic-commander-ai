from app.core.config import settings
from app.services.llm.base import LLMService

# Lazy loaded singleton
_llm_service_instance = None


def get_llm_service() -> LLMService:
    """
    FastAPI dependency that returns the configured LLM service.
    Reads LLM_PROVIDER from .env to decide which implementation to use.
    """
    global _llm_service_instance
    if _llm_service_instance is None:
        provider = settings.LLM_PROVIDER.lower()
        if provider == "ollama":
            from app.services.llm.ollama import OllamaService
            _llm_service_instance = OllamaService()
        elif provider == "aws":
            from app.services.llm.aws import AWSService
            _llm_service_instance = AWSService()
        else:
            raise ValueError(f"Unknown LLM_PROVIDER: {settings.LLM_PROVIDER}. Use 'ollama' or 'aws'.")

    return _llm_service_instance
