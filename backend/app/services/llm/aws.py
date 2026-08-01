import json
import boto3
from botocore.exceptions import ClientError, NoCredentialsError, BotoCoreError

from app.services.llm.base import LLMService
from app.models.schemas import ChatRequest, ChatResponse
from app.core.config import settings

SYSTEM_PROMPT = """你是交通指揮官 AI 助理（Traffic Commander AI），負責台北市信義計畫區的即時交通監控與決策支援。

## 核心職責
- 即時分析信義計畫區的交通狀態，包含路口飽和度、旅行時間（ETE）、人潮密度等指標
- 根據 SOP 標準作業程序，提供符合規範的交通管制建議
- 協助指揮官快速做出決策，降低突發事件對交通的衝擊

## 回答規範
1. 你的回答必須引用具體的 SOP 條文編號（例如：SOP 第 1 條、SOP 第 3 條）
2. 回答時必須引用 SOP 條文中的具體觸發條件和處置步驟
3. 所有數據必須來自系統提供的「即時數據」或「SOP 參考文件」，不得虛構
4. 當系統提供了即時數據（如飽和度、人流數），直接引用該數據回答，不要說「無法確認」
5. 若系統確實未提供相關數據，才明確告知使用者
6. 回答時請條列重點，並標註資料來源（SOP 條號或數據時間戳）
7. 若使用者問到特定 SOP 條款，請完整引述該條款的觸發條件與處置步驟
8. 若使用者問某路段適用哪條 SOP，請根據 SOP 內的路段名稱 / Segment_ID 對照回答

## SOP 參考文件（以下為交通應變標準程序相關條文）
{sop_section}
"""


class AWSService(LLMService):
    def __init__(self):
        try:
            self.client = boto3.client(
                service_name="bedrock-runtime",
                region_name=settings.AWS_DEFAULT_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
            )
            self.model_id = settings.AWS_BEDROCK_MODEL_ID
            self._available = True
        except (NoCredentialsError, BotoCoreError) as e:
            self._available = False
            self._init_error = str(e)

    def generate_chat_response(self, request: ChatRequest, sop_context: list[str] | None = None) -> ChatResponse:
        if not self._available:
            return ChatResponse(
                reply=(
                    f"⚠️ AWS Bedrock 服務初始化失敗，請確認 AWS 憑證已正確設定。\n"
                    f"錯誤訊息：{self._init_error}"
                ),
                sop_references=[],
                reasoning_steps=[],
            )

        # Build SOP context section
        if sop_context:
            sop_section = "\n\n".join(sop_context)
        else:
            # If no specific context retrieved, inject full SOP for comprehensive answers
            try:
                from app.services.rag import sop_retriever
                full_sop = sop_retriever.get_full_content()
                if full_sop:
                    sop_section = full_sop
                else:
                    sop_section = "（SOP 文件未載入，請根據你的內建知識回答，但仍須遵守上述回答規範。）"
            except Exception:
                sop_section = "（SOP 文件未載入，請根據你的內建知識回答，但仍須遵守上述回答規範。）"

        system_content = SYSTEM_PROMPT.format(sop_section=sop_section)

        # Build Claude messages format
        claude_messages = []

        if request.history:
            for msg in request.history:
                claude_messages.append({
                    "role": "user" if msg.role == "user" else "assistant",
                    "content": msg.content,
                })

        claude_messages.append({
            "role": "user",
            "content": request.message,
        })

        # Construct Bedrock request body for Claude Messages API
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "system": system_content,
            "messages": claude_messages,
        }

        try:
            response = self.client.invoke_model(
                modelId=self.model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(request_body),
            )

            response_body = json.loads(response["body"].read())

            # Extract text from Claude response content blocks
            response_text = ""
            for block in response_body.get("content", []):
                if block.get("type") == "text":
                    response_text += block.get("text", "")

            if not response_text:
                response_text = "⚠️ AWS Bedrock 回傳了空的回應，請稍後再試。"

        except NoCredentialsError:
            response_text = (
                "⚠️ 未設定 AWS 憑證，無法呼叫 Bedrock 服務。\n"
                "請在 .env 檔案中設定 AWS_ACCESS_KEY_ID 和 AWS_SECRET_ACCESS_KEY。"
            )
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_msg = e.response["Error"]["Message"]
            response_text = (
                f"⚠️ AWS Bedrock API 呼叫失敗。\n"
                f"錯誤代碼：{error_code}\n"
                f"錯誤訊息：{error_msg}\n\n"
                f"使用模型：{self.model_id}"
            )
        except Exception as e:
            response_text = (
                f"⚠️ 呼叫 AWS Bedrock 時發生未預期錯誤。\n"
                f"模型：{self.model_id}\n"
                f"錯誤訊息：{str(e)}"
            )

        return ChatResponse(
            reply=response_text,
            sop_references=[],
            reasoning_steps=[],
        )
