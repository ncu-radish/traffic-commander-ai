"""
Chat API routes — interactive strategic advisory with RAG-enhanced LLM.
"""
from fastapi import APIRouter, Depends
from app.models.schemas import ChatRequest, ChatResponse
from app.services.llm.base import LLMService
from app.api.dependencies import get_llm_service

router = APIRouter(prefix="/chat", tags=["chat"])


def _build_realtime_context(message: str) -> str:
    """
    Build a concise summary of current traffic/crowd data relevant to the question.
    This gives the LLM real data to base answers on.
    """
    try:
        from app.data.repository import repository
        import pandas as pd

        parts = []

        # Get traffic data — summarize latest timestamp
        traffic_df = repository.get_traffic_flow_df()
        if not traffic_df.empty:
            latest_ts = traffic_df["Timestamp"].max()
            latest = traffic_df[traffic_df["Timestamp"] == latest_ts]
            high_sat = latest[latest["Saturation_Score"] >= 0.80].sort_values(
                "Saturation_Score", ascending=False
            )
            if not high_sat.empty:
                lines = [f"[即時車流數據 - {latest_ts}] 飽和度 >= 80% 路段："]
                for _, row in high_sat.iterrows():
                    lines.append(
                        f"  - {row['Road_Name']} ({row['Segment_ID']}): "
                        f"飽和度 {row['Saturation_Score']:.2f}, "
                        f"車速 {row['Avg_Speed']:.0f} km/h, "
                        f"車輛數 {row['Vehicle_Count']}"
                    )
                parts.append("\n".join(lines))
            else:
                parts.append(f"[即時車流數據 - {latest_ts}] 所有路段飽和度正常 (< 0.80)")

        # Get crowd data — summarize latest timestamp
        crowd_df = repository.get_crowd_density_df()
        if not crowd_df.empty:
            latest_ts = crowd_df["Timestamp"].max()
            latest = crowd_df[crowd_df["Timestamp"] == latest_ts]
            # Show high-growth or high-count stations
            notable = latest[
                (latest["Growth_Rate"] > 0.20) | (latest["User_Count"] > 20000)
            ]
            if not notable.empty:
                lines = [f"[即時人流數據 - {latest_ts}] 需關注站點："]
                for _, row in notable.iterrows():
                    lines.append(
                        f"  - {row['Location_Name']} ({row['BS_ID']}): "
                        f"人數 {int(row['User_Count']):,}, "
                        f"成長率 {row['Growth_Rate']:.0%}, "
                        f"漫遊率 {row['Roaming_User_Pct']:.0%}"
                    )
                parts.append("\n".join(lines))

        # Get active incidents
        incidents = repository.get_live_incidents_raw()
        if incidents:
            lines = ["[即時事件]"]
            for inc in incidents:
                lines.append(
                    f"  - [{inc.get('severity')}] {inc.get('location')}: "
                    f"{inc.get('description')} (狀態: {inc.get('status')})"
                )
            parts.append("\n".join(lines))

        return "\n\n".join(parts) if parts else ""
    except Exception:
        return ""


@router.post("/", response_model=ChatResponse)
def chat_with_agent(
    request: ChatRequest,
    llm_service: LLMService = Depends(get_llm_service),
):
    """
    Send a message to the Traffic Commander AI and get a response.
    Automatically retrieves relevant SOP clauses via RAG before answering.
    Injects real-time data so the LLM can ground its answers in facts.
    """
    # RAG: Retrieve relevant SOP context
    sop_context = []
    try:
        from app.services.rag import sop_retriever
        sop_context = sop_retriever.query(request.message, top_k=5)

        # If query returned nothing useful, provide all chunks for comprehensive coverage
        if not sop_context:
            sop_context = sop_retriever.get_all_chunks()
    except Exception:
        pass  # Gracefully degrade if RAG is not available

    # Inject real-time data context so LLM can reference actual numbers
    realtime_ctx = _build_realtime_context(request.message)
    if realtime_ctx:
        sop_context.append(realtime_ctx)

    response = llm_service.generate_chat_response(request, sop_context=sop_context)
    return response
