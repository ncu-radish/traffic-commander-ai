import json
import re
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

## 推理步驟（每次回答前請內部執行）
當使用者提問時，你必須依照下列步驟推理：
1. 判斷問題類型：是詢問「即時狀態」、「SOP 條款內容」、還是「假設情境 (What-if)」？
2. 查看即時數據：從系統提供的即時數據中找出相關路段/站點的當前數值
3. 比對 SOP 門檻：將數據與 SOP 各條的觸發條件逐一比對
4. 判定觸發條款：列出所有已觸發或將觸發的 SOP 條文（一個情境可能觸發多條）
5. 產出處置建議：列出對應的處置步驟，並標明依據哪一條 SOP
6. 檢查連鎖觸發：第1條A級→第2條、第4條散場→第3條、任何事件+漫遊≥30%→第6條

## SOP 條文與觸發路段快速對照
- 第 1 條（交通壅塞分級）：適用全 15 路段，觸發路段為忠孝東路 (RD_TPE_001)、光復南路 (RD_TPE_002)
- 第 2 條（車禍與路障）：status=Closed/Blocked/Restricted + severity=High/Critical + affected_segment 以 RD_ 開頭
- 第 3 條（捷運分流）：BS_MRT_BL17 Growth_Rate > 0.30 或 User_Count > 25,000
- 第 4 條（大巨蛋散場）：BS_TPE_DOME 歷史峰值 ≥ 30,000 且 Growth_Rate ≤ -0.20
- 第 5 條（號誌故障）：type=Power_Failure 或描述含「號誌」
- 第 6 條（多語化通報）：任一基地台 Roaming_User_Pct ≥ 30%
- 第 7 條（ETE 計算）：ETE = base_clearance + congestion_penalty

## SOP 參考文件（以下為交通應變標準程序完整條文）
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
            sop_references=self._extract_sop_references(response_text),
            reasoning_steps=[],
        )

    @staticmethod
    def _extract_sop_references(text: str) -> list[str]:
        """
        Parse LLM response text to extract SOP article references.
        Matches patterns like: SOP 第 1 條, 第1條, 第 2 條, SOP第3條, etc.
        Returns deduplicated, sorted list like ["SOP 第 1 條", "SOP 第 2 條"].
        """
        # Match various formats of SOP references
        patterns = [
            r"SOP\s*第\s*(\d+)\s*條",    # SOP 第 1 條, SOP第1條
            r"第\s*(\d+)\s*條",           # 第 1 條, 第1條
        ]

        found_articles: set[int] = set()
        for pattern in patterns:
            matches = re.findall(pattern, text)
            for m in matches:
                num = int(m)
                if 1 <= num <= 7:  # Only valid SOP articles 1-7
                    found_articles.add(num)

        return [f"SOP 第 {n} 條" for n in sorted(found_articles)]
