/**
 * API 基礎設定
 *
 * 本機開發：Vite 讀取 .env.development，使用 localhost:8000
 * 生產環境：Vite 讀取 .env.production，使用 CloudFront URL
 *
 * 注意：VITE_ 前綴的環境變數才會被 Vite 打包進前端 bundle。
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';
