# Traffic Commander AI - 黑客松專案

本專案為一個「交通指揮官 AI」系統，旨在解決都市中因突發事件（如交通事故、號誌故障、大型活動散場）所引發的交通壅塞問題。本系統整合了即時交通數據流、大語言模型 (LLM)，以及預先定義的標準作業程序 (SOP)，以達成自動化的警報觸發、替代路線規劃與多語化交控建議。

## 系統架構

本專案採用前後端分離架構，具備以下主要模組：

### 前端 (Frontend)
- **技術棧**：React (Vite), TypeScript, vanilla CSS
- **主要功能**：
  - **動態儀表板**：顯示即時路網狀態、車流飽和度趨勢、人流密度趨勢。
  - **事件面板**：手動注入突發事件。
  - **策略諮詢對話框**：與 AI 交通指揮官進行對話（支援 RAG 技術查詢 SOP）。
- **目錄與檔案說明**：
  - `frontend/src/App.tsx`: 應用程式主入口，負責狀態管理與呼叫後端 API。
  - `frontend/src/components/`: 包含各個 UI 獨立元件（如地圖 `TrafficMap.tsx`、對話框 `ChatPanel.tsx`）。
  - `frontend/src/data/`: 存放備用的前端 Mock Data（目前已由後端 API 取代）。

### 後端 (Backend)
- **技術棧**：FastAPI, Python, Pandas, LangChain, ChromaDB
- **主要功能**：
  - **資料存取層 (Repository)**：解析原始 CSV/JSON 交通與號誌資料。
  - **SOP 引擎**：依照 7 條交通 SOP 進行各項指標（如車流飽和度、捷運站人流成長率）的程式化運算與閾值判定。
  - **路線規劃**：當發生事故時，透過網路圖計算最佳替代疏散路線。
  - **LLM 整合與 RAG**：串接本地端 Ollama 或雲端 AWS Bedrock，並提供對 SOP 文件的向量檢索，生成自然語言報告與多語化告警。
- **目錄與檔案說明**：
  - `backend/app/main.py`: FastAPI 主程式入口，掛載各個路由。
  - `backend/app/api/routes/`: 定義 API 端點，如 `/traffic` (取得即時數據)、`/advisory` (產生事件建議書)、`/alerts` (SOP 告警)、`/chat` (LLM 對話)。
  - `backend/app/services/`: 核心業務邏輯，包含 `sop_engine.py`、`route_planner.py`、`ete_calculator.py`。
  - `backend/app/services/llm/`: 包含 Strategy Pattern 的 LLM 實作（`ollama.py`, `aws.py`）。
  - `backend/app/services/rag/`: SOP 文件的向量檢索模組。
  - `backend/app/data/repository.py`: 讀取根目錄 `data/` 中的真實資料。

---

## 啟動與環境建置指南

要完整運行本專案，請開啟**兩個終端機**，分別啟動後端與前端。

### 1. 後端建置與啟動 (Backend)

請確保您已安裝 Python 3.9+。

**Windows 用戶**：
```bash
cd backend
# 建立虛擬環境 (若尚未建立)
python -m venv .venv
# 啟動虛擬環境
.\.venv\Scripts\activate
# 安裝依賴套件
pip install -r requirements.txt
# 啟動 FastAPI 開發伺服器
uvicorn app.main:app --reload --port 8000
```

**macOS/Linux 用戶**：
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

> **LLM 模型設定**：
> 預設會使用本地端的 `ollama` (模型名稱 `llama3`)。若您希望切換為 AWS Bedrock，請複製 `backend/.env.example` 為 `backend/.env`，將 `LLM_PROVIDER` 改為 `aws` 並填寫對應的 AWS Key。
>
> 啟動後，可於瀏覽器前往 `http://localhost:8000/docs` 測試 API 端點。

### 2. 前端建置與啟動 (Frontend)

請確保您已安裝 Node.js (v18+)。

```bash
cd frontend
# 安裝 npm 套件 (初次啟動時)
npm install
# 啟動 Vite 開發伺服器
npm run dev
```

啟動成功後，終端機會顯示本地端網址（通常為 `http://localhost:5173`）。在瀏覽器中開啟該網址即可看到完整的動態儀表板，並且各項資料已與後端 API 正式連動！

---

## 測試重點 (MVP 功能)
1. **即時資料連動**：觀察地圖與圖表，數據應隨時間軸正常更新。
2. **SOP 警報自動觸發**：當時間軸播放至特定時間（例如 21:30），應自動觸發 A/B 級車流警報。
3. **AI 對話諮詢**：於右下角發送「如果國父紀念館站人數超過三萬怎麼辦？」，系統應能結合 RAG 檢索 SOP 第 3 條給予建議。
