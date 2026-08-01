"""
天氣資訊 API — 提供即時天氣與 5 天預報端點
"""

import httpx
from fastapi import APIRouter, HTTPException
from app.services.weather import weather_service

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("/current")
async def get_current_weather(lat: float = 25.0408, lon: float = 121.5654):
    """取得指定座標的即時天氣（預設台北信義區）"""
    try:
        data = await weather_service.get_current_weather(lat, lon)
        return {
            "weather": data,
            "is_severe": weather_service.is_severe_weather(data),
        }
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"OpenWeather API 回傳錯誤: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"無法連線 OpenWeather API: {str(e)}")


@router.get("/forecast")
async def get_forecast(lat: float = 25.0408, lon: float = 121.5654):
    """取得 5 天 / 3 小時預報"""
    try:
        data = await weather_service.get_forecast(lat, lon)
        return data
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"OpenWeather API 回傳錯誤: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"無法連線 OpenWeather API: {str(e)}")
