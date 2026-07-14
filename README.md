# 交通指揮官 AI (Traffic Commander AI) - Hackathon Project

這是一個用於黑客松競賽的交通指揮官 AI 系統。此系統利用大語言模型 (LLM) 結合即時交通數據、基地台人流數據，提供即時的交通監控、預警及決策輔助。

## 目錄結構
- `frontend/` - 前端 MVP (Vite + React + TypeScript)
- `backend/` - 後端 API (FastAPI) (開發中)
- `data/` - 原始數據文件與相關規格

## 前端環境建置 (Frontend Setup)

前端採用 Vite + React (TypeScript) 建構，並使用 CSS 模組與 Glassmorphism 風格設計。

### 依賴環境
- Node.js (建議 v18+ )
- npm 或 yarn

### 安裝步驟

1. 進入前端目錄：
   ```bash
   cd frontend
   ```

2. 安裝相依套件：
   ```bash
   npm install
   ```

3. 啟動開發伺服器：
   ```bash
   npm run dev
   ```

4. 打包生產環境版本：
   ```bash
   npm run build
   ```

### 前端使用技術
- 框架: React 19 + TypeScript + Vite
- 地圖: react-leaflet + Leaflet (OpenStreetMap)
- 圖表: ECharts + echarts-for-react
- 動畫: framer-motion
- 樣式: 純 CSS (Vanilla CSS) + Glassmorphism 設計系統

---

## 後端環境建置 (Backend Setup)

後端採用 Python FastAPI 框架，並準備串接 AWS 提供的大語言模型。

### 依賴環境
- Python 3.10+
- pip

### 安裝步驟

1. 進入後端目錄：
   ```bash
   cd backend
   ```

2. (選擇性) 建立虛擬環境：
   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows 系統請使用 venv\Scripts\activate
   ```

3. 安裝相依套件：
   ```bash
   pip install -r requirements.txt
   ```

4. 啟動開發伺服器：
   ```bash
   uvicorn main:app --reload
   ```

## AWS 模型環境 (比賽提供)
- 主辦單位提供 AWS 環境。
- 模型使用 AWS 提供的模型服務（預計透過 Boto3 或 LangChain 進行呼叫）。

## 開發分工規劃

為了在接下來的兩個禮拜內順利完成開發，我們採用先建立 MVP 再同步開發的策略：
1. **MVP 階段 (已完成)**: 建立具有互動性的前端 Mockup，視覺化呈現交通與人流數據，並實作事件注入與 SOP 預警的 UI 雛形。
2. **平行開發階段**:
   - **前端 (Frontend)**: 串接後端 API、完善動畫效果、加入多國語言切換。
   - **後端 (Backend)**: 建立 FastAPI 路由、實作資料讀取邏輯、串接 AWS LLM 模型、實作 Agent 推理鏈 (Reasoning Chain)。
