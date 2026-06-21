from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


EventType = Literal[
    "sports", "political_rally", "festival", "construction", "concert",
    "vip_movement", "religious_gathering", "protest", "sudden_gathering",
]
EventStatus = Literal["planning", "monitoring", "active", "completed"]
EventMode = Literal["planned", "unplanned"]


class EventCreate(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    event_type: EventType
    mode: EventMode = "planned"
    venue: str = Field(min_length=2, max_length=120)
    latitude: float = Field(ge=12.7, le=13.2)
    longitude: float = Field(ge=77.3, le=77.9)
    start_time: datetime
    end_time: datetime
    expected_attendance: int = Field(ge=0, le=500_000)
    parking_capacity: int = Field(default=0, ge=0, le=100_000)
    public_transport_share: float = Field(default=0.35, ge=0.0, le=1.0)
    weather: Literal["clear", "rain", "heavy_rain", "heat", "unknown"] = "clear"
    notes: str = ""


class EventSimulationRequest(BaseModel):
    attendance: int | None = Field(default=None, ge=0, le=500_000)
    officers: int = Field(default=40, ge=0, le=500)
    barricade_teams: int = Field(default=5, ge=0, le=50)
    tow_vehicles: int = Field(default=3, ge=0, le=50)
    diversion_intensity: float = Field(default=0.75, ge=0.0, le=1.0)
    parking_capacity: int | None = Field(default=None, ge=0, le=100_000)
    public_transport_share: float | None = Field(default=None, ge=0.0, le=1.0)
    response_lead_minutes: int = Field(default=90, ge=0, le=720)
    weather: Literal["clear", "rain", "heavy_rain", "heat", "unknown"] | None = None


class PostEventActuals(BaseModel):
    actual_attendance: int | None = Field(default=None, ge=0, le=500_000)
    actual_peak_delay_min: float | None = Field(default=None, ge=0)
    actual_critical_junctions: int | None = Field(default=None, ge=0)
    actual_congestion_reduction_pct: float | None = Field(default=None, ge=-100, le=100)
    deployed_officers: int | None = Field(default=None, ge=0, le=500)


class UnplannedDetectionRequest(BaseModel):
    latitude: float = Field(ge=12.7, le=13.2)
    longitude: float = Field(ge=77.3, le=77.9)
    location_name: str = "Unidentified gathering"
    observed_speed_drop_pct: float = Field(ge=0, le=100)
    crowd_estimate: int = Field(ge=0, le=500_000)
    camera_density_change_pct: float = Field(default=0, ge=0, le=500)
    social_alerts: int = Field(default=0, ge=0, le=100_000)
    road_occupancy_pct: float = Field(default=0, ge=0, le=100)
    detected_at: datetime | None = None


class ReplayRequest(BaseModel):
    replay_date: date | None = None
    reveal_actual: bool = False
