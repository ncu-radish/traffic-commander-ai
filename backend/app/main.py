from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import chat, traffic, advisory, alerts, weather, route

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend API for Traffic Commander AI — Hackathon Project with dynamic LLM routing"
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://d1flr6mh5dprf7.cloudfront.net",  # 生產前端 (S3 + CloudFront)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat.router, prefix=settings.API_V1_STR)
app.include_router(traffic.router, prefix=settings.API_V1_STR)
app.include_router(advisory.router, prefix=settings.API_V1_STR)
app.include_router(alerts.router, prefix=settings.API_V1_STR)
app.include_router(weather.router, prefix=settings.API_V1_STR)
app.include_router(route.router, prefix=settings.API_V1_STR)


@app.get("/")
def read_root():
    return {
        "message": f"{settings.PROJECT_NAME} API is running.",
        "llm_provider": settings.LLM_PROVIDER,
        "version": settings.VERSION,
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}
