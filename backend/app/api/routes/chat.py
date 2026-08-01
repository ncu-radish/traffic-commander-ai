"""
Chat API routes — interactive strategic advisory with RAG-enhanced LLM.
"""
from fastapi import APIRouter, Depends
from app.models.schemas import ChatRequest, ChatResponse
from app.services.llm.base import LLMService
from app.api.dependencies import get_llm_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
def chat_with_agent(
    request: ChatRequest,
    llm_service: LLMService = Depends(get_llm_service),
):
    """
    Send a message to the Traffic Commander AI and get a response.
    Automatically retrieves relevant SOP clauses via RAG before answering.
    """
    # RAG: Retrieve relevant SOP context
    sop_context = []
    try:
        from app.services.rag import sop_retriever
        sop_context = sop_retriever.query(request.message, top_k=5)

        # If query returned nothing useful, provide all chunks for comprehensive coverage
        if not sop_context:
            sop_context = sop_retriever.get_all_chunks()
    except Exception:
        pass  # Gracefully degrade if RAG is not available

    response = llm_service.generate_chat_response(request, sop_context=sop_context)
    return response
