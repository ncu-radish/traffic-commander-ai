"""
OpenWeatherMap API 服務封裝
提供即時天氣與預報查詢，並判斷是否為極端天氣。
"""

import httpx
from app.core.config import settings


class WeatherService:
    """封裝 OpenWeatherMap API 呼叫"""

    def __init__(self):
        self.base_url = settings.OPENWEATHER_BASE_URL
        self.api_key = settings.OPENWEATHER_API_KEY

    async def get_current_weather(
        self, lat: float = 25.0408, lon: float = 121.5654
    ) -> dict:
        """
        取得指定座標的即時天氣。
        預設座標為台北信義區（大巨蛋附近）。
        """
        params = {
            "lat": lat,
            "lon": lon,
            "appid": self.api_key,
            "units": "metric",
            "lang": "zh_tw",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.base_url}/weather", params=params)
            resp.raise_for_status()
            return resp.json()

    async def get_forecast(
        self, lat: float = 25.0408, lon: float = 121.5654
    ) -> dict:
        """取得 5 天 / 3 小時預報"""
        params = {
            "lat": lat,
            "lon": lon,
            "appid": self.api_key,
            "units": "metric",
            "lang": "zh_tw",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.base_url}/forecast", params=params)
            resp.raise_for_status()
            return resp.json()

    def is_severe_weather(self, weather_data: dict) -> bool:
        """
        判斷是否為極端天氣，可配合 SOP 擴充門檻。
        觸發條件（任一即成立）：
        - 主天氣類型為 Thunderstorm
        - 1 小時降雨量 > 50mm
        - 風速 > 17.2 m/s（8 級風）
        """
        main = weather_data.get("weather", [{}])[0].get("main", "")
        wind_speed = weather_data.get("wind", {}).get("speed", 0)
        rain_1h = weather_data.get("rain", {}).get("1h", 0)

        return main == "Thunderstorm" or rain_1h > 50 or wind_speed > 17.2


weather_service = WeatherService()
