from abc import ABC, abstractmethod
from app.models.schemas import ChatRequest, ChatResponse
from typing import Optional, List

class LLMService(ABC):
    @abstractmethod
    def generate_chat_response(self, request: ChatRequest, sop_context: Optional[List[str]] = None) -> ChatResponse:
        """
        Generate a chat response based on the user request and conversation history.
        Optionally accepts SOP context retrieved from RAG for grounding.
        """
        pass
