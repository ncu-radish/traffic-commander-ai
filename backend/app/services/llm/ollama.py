from app.services.llm.base import LLMService
from app.models.schemas import ChatRequest, ChatResponse
from app.core.config import settings
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

SYSTEM_PROMPT = """你是「牽牽」AI 助理，負責台北市信義計畫區的即時交通監控與決策支援。

## 核心職責
- 即時分析信義計畫區的交通狀態，包含路口飽和度、旅行時間（ETE）、人潮密度等指標
- 根據 SOP 標準作業程序，提供符合規範的交通管制建議
- 協助指揮官快速做出決策，降低突發事件對交通的衝擊

## 回答規範
1. 你的回答必須引用具體的 SOP 條文編號（例如：SOP 第 3 條、SOP 第 5 條第 2 項）
2. 禁止虛構數據，所有數據必須來自系統提供的資料
3. 若無法取得即時數據，請明確告知使用者，而非猜測
4. 回答時請條列重點，並標註資料來源

## SOP 參考上下文
{sop_section}
"""


class OllamaService(LLMService):
    def __init__(self):
        self.llm = ChatOllama(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
        )

    def generate_chat_response(self, request: ChatRequest, sop_context: list[str] | None = None) -> ChatResponse:
        # Build SOP context section
        if sop_context:
            sop_section = "\n".join(f"- {chunk}" for chunk in sop_context)
        else:
            sop_section = "（目前無額外 SOP 上下文，請根據你的內建知識回答，但仍須遵守上述回答規範。）"

        system_content = SYSTEM_PROMPT.format(sop_section=sop_section)

        messages = [SystemMessage(content=system_content)]

        # Add conversation history
        if request.history:
            for msg in request.history:
                if msg.role == "user":
                    messages.append(HumanMessage(content=msg.content))
                else:
                    messages.append(AIMessage(content=msg.content))

        # Add current user message
        messages.append(HumanMessage(content=request.message))

        try:
            response = self.llm.invoke(messages)
            response_text = response.content
        except Exception as e:
            response_text = (
                f"⚠️ 無法連線至 Ollama 服務（模型：{settings.OLLAMA_MODEL}，"
                f"位址：{settings.OLLAMA_BASE_URL}）。\n"
                f"錯誤訊息：{str(e)}\n\n"
                f"請確認 Ollama 服務已啟動並可正常存取。"
            )

        return ChatResponse(
            reply=response_text,
            sop_references=[],
            reasoning_steps=[],
        )
