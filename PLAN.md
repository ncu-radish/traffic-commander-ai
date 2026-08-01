# 城市應變分析 AI Agent - 黑客松實作計畫書 (Implementation Plan)

## 1. 系統架構與技術選型 (Tech Stack)

為了達到黑客松要求的「自動感知」、「即時重規劃(60秒內)」與「直觀設計性」，建議採用前後端分離架構。

### 前端 (Frontend) - 動態監測儀表板
* **核心框架**：**Vite + React (TypeScript)**。輕量快速，適合黑客松快速開發。
* **樣式設計**：**Vanilla CSS (CSS Modules) + Framer Motion**。
  * 配合 `web_application_development` 準則，將採用深色模式 (Dark Mode)、玻璃擬物化 (Glassmorphism) 與平滑的微動畫 (Micro-animations) 來打造具備 Premium 質感的 Dashboard，以獲取 (+5%) 的 UI/UX 評分。
* **圖表與視覺化**：
  * **ECharts (或 Chart.js)**：繪製車流飽和度、人流成長率的時序變化圖 (Time-Series)。
  * **React-Leaflet**：實作地圖互動，將 `road_network_geometry.json` 中的路段與節點畫在地理圖台上，並使用紅黃綠顏色標示壅塞狀態 (A/B級)。

### 後端 (Backend) - 決策中樞與 AI 整合
* **核心框架**：**Python + FastAPI**。具備非同步處理能力，且與 AI/Data 生態系無縫接軌。
* **資料處理**：**Pandas / GeoPandas / NetworkX**。
  * Pandas：快速處理 `city_traffic_flow.csv` 與 `signaling_crowd_density.csv`，計算飽和度與漫遊率。
  * NetworkX：將路網資料轉為圖結構 (Graph)，用以在事件注入時進行 60 秒內的最優路徑計算 (Dijkstra / A* algorithm)。
* **AI & RAG 模組**：
  * **LangChain (支援 AWS Bedrock)**：構建 Agent 核心，透過 `boto3` 介接 AWS 提供的模型 (如 Claude 3)。
  * **Vector Database**：**ChromaDB** (或直接使用 AWS OpenSearch Serverless 視主辦方支援而定)，將 `emergency_traffic_sop.txt` 進行 Chunking 並向量化，供 AI 即時檢索 (RAG)。

---

## 2. 五大核心功能模組實作規劃

### 模組 1：動態時序監測儀表板 (Dynamic Time-Series Dashboard)
* **實作方式**：
  1. 後端啟動一個背景排程任務 (Background Task) 或是提供 WebSocket，每隔一段模擬時間 (例如對應 CSV 的 timestamp) 推送最新資料給前端。
  2. 程式邏輯監聽 `Saturation_Score` 與 `Growth_Rate`。若符合 SOP 第一條 B 級或 A 級門檻，後端自動發送「預警事件」。
  3. 前端收到事件後，彈出高質感的警告視窗 (Modal)，內含 LLM 根據異常數據自動生成的摘要。

### 模組 2：突發事件注入與處置 (Live Incident Response)
* **實作方式**：
  1. 前端實作一個「事件注入器 (Event Injector)」面板，讀取 `live_incidents.json` 並提供按鈕注入事件。
  2. 後端接收事件後，擷取受影響的 `affected_segment`。
  3. **演算法部分**：使用 NetworkX 根據 `road_network_geometry.json` 重建圖表，將受影響路段的 capacity 設為極低或斷開。
  4. 利用 SOP 第 2 條邏輯，程式過濾出替代路徑，避開飽和路段。
  5. 結合 LLM 將規劃結果轉換為自然語言的「交控中心建議書」，全過程需在 60 秒內完成。

### 模組 3：對話式策略諮詢顧問 (Interactive Strategic Advisory)
* **實作方式**：
  1. 於 Dashboard 側邊欄建立 Chatbot 介面。
  2. 使用 LangChain Agent，掛載以下 Tools：
     * `Query_SOP_Tool`：透過 RAG 查詢 SOP。
     * `Query_Live_Data_Tool`：查詢當前車流/人流數值。
  3. 當使用者問「若 BL17 人數增至 40,000 人」，LLM 分析 What-if 情境，呼叫 SOP 檢索，找出「過站不停與接駁分流」等應對措施並回覆。

### 模組 4：AI 決策推理與解釋鏈 (Reasoning & Explainability)
* **實作方式**：
  1. 當生成交控中心建議書時，要求 LLM 回傳 JSON 格式，其中包含 `reasoning_chain` 欄位。
  2. 前端以步驟式 (Step-by-step) 的 UI (例如 Timeline 元件) 展示 AI 是如何依據「數據(佐證) -> SOP條款 -> 推理 -> 結論」得出結果。
  3. 關於 ETE (預計交通恢復時間)，程式需嚴格依照 SOP 第 7 條公式計算，LLM 僅做解釋，確保數值絕對精確。

### 模組 5：多語化全通路通報模組
* **實作方式**：
  1. 後端持續掃描信令資料 `signaling_crowd_density.csv`，計算 `漫遊用戶數 ÷ 該站點總容量數`。
  2. 若漫遊率 $\ge 30\%$ (SOP 第 6 條)，觸發多語化告警流程。
  3. 呼叫 LLM 提供系統 Prompt：「請根據以下事故資訊撰寫一則簡訊，需包含中文、英文、日文與韓文...」。
  4. 前端展示這則簡訊，並提供「一鍵發布 (Broadcast)」的特效按鈕。

---

## 3. 專案目錄結構規劃

預計會在 `c:\Users\pinjim\Documents\code\traffic-commander-ai` 下建立以下結構：

```text
traffic-commander-ai/
├── backend/                  # Python FastAPI 後端
│   ├── main.py               # API 進入點
│   ├── core/                 # 業務邏輯 (路網重劃、預警判定)
│   ├── ai/                   # LangChain / LlamaIndex Agent 及 RAG 處理
│   ├── data_loader/          # 讀取處理 CSV/JSON 資料
│   └── requirements.txt      # 依賴套件
├── frontend/                 # Vite + React 前端
│   ├── src/
│   │   ├── components/       # UI 元件 (Charts, Map, Chatbox)
│   │   ├── pages/            # Dashboard 主頁
│   │   ├── styles/           # Vanilla CSS 設計系統 (Dark theme, Glassmorphism)
│   │   └── api/              # 與後端溝通的 API client
│   └── package.json
├── data/                     # (已存在的資料集)
├── GUIDELINES.md             # (已存在)
└── README.md
```

## 4. 驗證與測試計畫 (Verification Plan)
1. **資料讀取測試**：確認後端能正確解析 15 個核心路段與信令資料。
2. **SOP RAG 測試**：手動輸入多個 What-if 情境，驗證 LLM (AWS Model) 是否精確引用 SOP 條款 (特別是第 2, 3, 5 條)。
3. **60秒重規劃效能測試**：注入 `live_incidents.json`，測量從 API 請求到回傳路網重規劃建議與交控建議書的時間，確保符合效能規定。
4. **UI/UX 展示驗證**：確保深色科技感主題、圖表動畫、多語系呈現皆能完美運作。

## 5. 開發流程與分工 (Development Workflow & Division of Labor)

為了在黑客松有限時間內最大化產出，專案將分為 **前端組 (Frontend)** 與 **後端/AI組 (Backend & AI)** 兩大模組進行同步開發，並明確定義 API 介面 (API Contract)。

### 第一階段：基礎建設與 API 定義 (Phase 1: Setup & API Contract)
* **共同作業**：
  * 確立雙方溝通的 API 規格 (特別是 `live_incidents.json` 注入後的回傳格式，以及時間序列資料的輪詢/WebSocket 格式)。
  * 確認 AWS 測試環境存取權限 (Bedrock 模型調用、VM/Container 部署環境確認)。
* **前端 (A 組)**：
  * 初始化 Vite + React 專案，建置 Vanilla CSS 的深色玻璃風格設計系統 (Design System)。
  * 切分 Dashboard 骨架：左側為地圖與趨勢圖表，右側為對話助理與事件面板。
* **後端 (B 組)**：
  * 初始化 FastAPI 專案結構。
  * 實作資料載入模組 (Data Loader)，將 CSV 資料轉為 API 輸出的 JSON 結構。
  * 寫一隻簡單的腳本確認 AWS Bedrock (boto3) 能成功調用 LLM 模型。

### 第二階段：核心功能實作 (Phase 2: Core Implementation)
* **前端 (A 組)**：
  * **地圖與圖表整合**：匯入 `react-leaflet` 與圖資，將路段與車流資料繪製於地圖上；整合 ECharts 繪製人流趨勢圖。
  * **Chatbot 介面**：完成對話式面板的 UI，準備對接 API。
  * *(Mock 測試)*：在後端 API 未完全就緒前，先以 Mock Data 測試畫面渲染與事件觸發的自動彈窗動畫。
* **後端 (B 組)**：
  * **RAG 與 Agent 建置**：切分 `emergency_traffic_sop.txt`，寫入 ChromaDB，並撰寫 LangChain 工具讓 Agent 能根據情境精準檢索條款。
  * **路網演算法**：利用 `NetworkX` 解析 `road_network_geometry.json`，實作「當路段 capacity 變為極低時，自動尋找替代道路與計算 ETE」的演算法。

### 第三階段：整合串接與最佳化 (Phase 3: Integration & Polish)
* **共同作業**：
  * 拔除前端 Mock Data，全面對接後端 FastAPI。
  * 測試「事件注入 -> 後端重劃與 LLM 推理 -> 前端地圖更新 & 彈窗」的端到端流程，確保處理時間低於 60 秒。
* **前端 (A 組)**：
  * 加入細節微動畫 (Framer Motion)，強化 AI 推理過程 (Reasoning Chain) 的步驟展示視覺效果，提升 Premium 質感。
  * 實作一鍵發布「多語化告警」按鈕及對應動畫。
* **後端 (B 組)**：
  * 針對模型幻覺進行 Prompt 調整，確保 LLM 生成的交控建議書格式嚴謹，且不偏離 SOP。
  * 撰寫部署腳本 (Dockerfile)。

### 第四階段：AWS 部署與 Demo 準備 (Phase 4: Deployment & Pitch)
* **共同作業**：
  * 將前後端打包並部署至主辦方提供的 AWS 服務 (例如 EC2, ECS, 或是 API Gateway + App Runner)。
* **後續收尾**：
  * 錄製 Dashboard Live Demo 影片。
  * 整理 GitHub Repository (補齊 README 指南) 並將 AWS 架構圖畫入最終提案簡報。
