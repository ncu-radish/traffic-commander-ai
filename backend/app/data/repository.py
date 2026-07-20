import pandas as pd
import json
from pathlib import Path
from typing import List, Dict, Any

# Resolve the path to the root data directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = BASE_DIR / "data"

class DataRepository:
    def __init__(self):
        self.traffic_flow_path = DATA_DIR / "city_traffic_flow.csv"
        self.crowd_density_path = DATA_DIR / "signaling_crowd_density.csv"
        self.road_network_path = DATA_DIR / "road_network_geometry.json"
        self.live_incidents_path = DATA_DIR / "live_incidents.json"
        
        # Cache data in memory for MVP
        self._traffic_data = None
        self._crowd_data = None
        self._road_network = None
        self._live_incidents = None

    def get_traffic_flow(self) -> List[Dict[str, Any]]:
        if self._traffic_data is None:
            if not self.traffic_flow_path.exists():
                return []
            df = pd.read_csv(self.traffic_flow_path)
            # Rename columns to match camelCase for frontend
            df = df.rename(columns={
                "Timestamp": "timestamp",
                "Segment_ID": "segmentId",
                "Road_Name": "roadName",
                "Avg_Speed": "avgSpeed",
                "Vehicle_Count": "vehicleCount",
                "Saturation_Score": "saturationScore",
                "Lane_Status": "laneStatus"
            })
            self._traffic_data = df.to_dict(orient="records")
        return self._traffic_data

    def get_crowd_density(self) -> List[Dict[str, Any]]:
        if self._crowd_data is None:
            if not self.crowd_density_path.exists():
                return []
            df = pd.read_csv(self.crowd_density_path)
            
            # Convert percentage strings to floats (e.g. '5%' -> 0.05)
            if 'Roaming_User_Pct' in df.columns:
                df['Roaming_User_Pct'] = df['Roaming_User_Pct'].astype(str).str.rstrip('%').astype('float') / 100.0

            df = df.rename(columns={
                "Timestamp": "timestamp",
                "BS_ID": "bsId",
                "Location_Name": "locationName",
                "User_Count": "userCount",
                "Stay_Time_Avg": "stayTimeAvg",
                "Growth_Rate": "growthRate",
                "Roaming_User_Pct": "roamingUserPct"
            })
            self._crowd_data = df.to_dict(orient="records")
        return self._crowd_data

    def get_road_network(self) -> List[Dict[str, Any]]:
        if self._road_network is None:
            if not self.road_network_path.exists():
                return []
            with open(self.road_network_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # Map JSON (snake_case) to frontend camelCase
            mapped = []
            for item in data:
                mapped.append({
                    "segmentId": item.get("segment_id"),
                    "name": item.get("name"),
                    "flowDirection": item.get("flow_direction"),
                    "intersections": item.get("intersections", []),
                    "capacityVph": item.get("capacity_vph"),
                    "alternatives": item.get("alternatives", []),
                    "nearbyStations": item.get("nearby_stations", [])
                })
            self._road_network = mapped
        return self._road_network

    def get_live_incidents(self) -> List[Dict[str, Any]]:
        if self._live_incidents is None:
            if not self.live_incidents_path.exists():
                return []
            with open(self.live_incidents_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            mapped = []
            for item in data:
                mapped.append({
                    "eventId": item.get("event_id"),
                    "type": item.get("type"),
                    "location": item.get("location"),
                    "affectedSegment": item.get("affected_segment"),
                    "affectedRoad": item.get("affected_road"),
                    "status": item.get("status"),
                    "severity": item.get("severity"),
                    "description": item.get("description"),
                    "timestamp": item.get("timestamp")
                })
            self._live_incidents = mapped
        return self._live_incidents

    # --- Raw data accessors (snake_case, for SOP engine internal use) ---

    def get_road_network_raw(self) -> List[Dict[str, Any]]:
        """Return road network data in original snake_case format."""
        if not self.road_network_path.exists():
            return []
        with open(self.road_network_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def get_live_incidents_raw(self) -> List[Dict[str, Any]]:
        """Return live incidents in original snake_case format."""
        if not self.live_incidents_path.exists():
            return []
        with open(self.live_incidents_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def get_traffic_flow_df(self) -> pd.DataFrame:
        """Return traffic flow as a DataFrame for SOP engine processing."""
        if not self.traffic_flow_path.exists():
            return pd.DataFrame()
        return pd.read_csv(self.traffic_flow_path)

    def get_crowd_density_df(self) -> pd.DataFrame:
        """Return crowd density as a DataFrame for SOP engine processing."""
        if not self.crowd_density_path.exists():
            return pd.DataFrame()
        df = pd.read_csv(self.crowd_density_path)
        if 'Roaming_User_Pct' in df.columns:
            df['Roaming_User_Pct'] = df['Roaming_User_Pct'].astype(str).str.rstrip('%').astype('float') / 100.0
        return df

# Singleton instance
repository = DataRepository()
