from fastapi import APIRouter
from typing import List, Dict, Any
from app.data.repository import repository

router = APIRouter(prefix="/traffic", tags=["traffic"])

@router.get("/flow")
def get_traffic_flow():
    return repository.get_traffic_flow()

@router.get("/crowd")
def get_crowd_density():
    return repository.get_crowd_density()

@router.get("/network")
def get_road_network():
    return repository.get_road_network()

@router.get("/incidents")
def get_live_incidents():
    return repository.get_live_incidents()

