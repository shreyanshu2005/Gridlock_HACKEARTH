"""Event-driven congestion extension tests.

These tests exercise the additive event module without changing the original
Round2 API contracts or frontend assets.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.events.schemas import EventCreate, EventSimulationRequest, UnplannedDetectionRequest
from backend.events import service


DEMO_EVENT = "EVT-001"


@lru_cache(maxsize=1)
def _impact():
    return service.impact_forecast(DEMO_EVENT)


@lru_cache(maxsize=1)
def _plan():
    return service.response_plan(DEMO_EVENT)



def test_new_planned_event_can_be_registered(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "CUSTOM_EVENTS_PATH", tmp_path / "custom_events.json")
    item = service.create_event(
        EventCreate(
            name="Test Event",
            event_type="concert",
            mode="planned",
            venue="Test Venue",
            latitude=12.9716,
            longitude=77.5946,
            start_time="2026-06-22T18:00:00",
            end_time="2026-06-22T22:00:00",
            expected_attendance=5000,
            parking_capacity=500,
            public_transport_share=0.45,
            weather="clear",
        )
    )
    assert item["event_id"] == "EVT-C001"
    assert item["status"] == "planning"
    assert service.CUSTOM_EVENTS_PATH.exists()

def test_event_catalog_contains_planned_and_unplanned_events():
    events = service.list_events()
    assert len(events) >= 6
    assert any(item["mode"] == "planned" for item in events)
    assert any(item["mode"] == "unplanned" for item in events)


def test_impact_forecast_quantifies_network_effect():
    result = _impact()
    assert result["affected_junction_count"] > 0
    assert result["expected_additional_vehicles"] >= 0
    assert result["projected_average_delay_min"] >= 0
    assert 0 <= result["impact_confidence_pct"] <= 100
    assert result["affected_junctions"]
    assert all("event_impact_score" in item for item in result["affected_junctions"])


def test_response_plan_covers_manpower_barricades_and_diversions():
    result = _plan()
    assert result["summary"]["traffic_officers"] > 0
    assert result["barricades"]
    assert result["diversions"]
    assert result["emergency_corridor"]["availability_target_pct"] >= 90
    assert result["zone_allocations"]


def test_digital_twin_ai_plan_beats_no_action():
    result = service.simulate_event(
        DEMO_EVENT,
        EventSimulationRequest(
            officers=48,
            barricade_teams=6,
            tow_vehicles=4,
            diversion_intensity=0.82,
            response_lead_minutes=105,
        ),
    )
    assert result["ai_recommended_plan"]["average_delay_min"] < result["no_plan"]["average_delay_min"]
    assert result["ai_recommended_plan"]["maximum_queue_m"] < result["no_plan"]["maximum_queue_m"]
    assert result["validation"]["constraints_satisfied"] is True
    assert result["validation"]["emergency_corridor_preserved"] is True
    band = result["impact"]["confidence_band"]
    assert band["p10"] <= band["p50"] <= band["p90"]


def test_post_event_replay_and_learning_are_verifiable():
    locked = service.replay(DEMO_EVENT, reveal_actual=False)
    revealed = service.replay(DEMO_EVENT, reveal_actual=True)
    review = service.post_event_review(DEMO_EVENT)
    assert locked["actual_revealed"] is False
    assert "actual_outcome" not in locked
    assert revealed["actual_revealed"] is True
    assert revealed["verification"]["delay_forecast_accuracy_pct"] >= 0
    assert review["learning_actions"]
    assert review["model_update"]["event_profile_updated"] is True


def test_unplanned_event_detection_generates_immediate_response():
    result = service.detect_unplanned(
        UnplannedDetectionRequest(
            latitude=12.9632,
            longitude=77.5855,
            location_name="Town Hall",
            observed_speed_drop_pct=61,
            crowd_estimate=1450,
            camera_density_change_pct=78,
            social_alerts=42,
            road_occupancy_pct=84,
        )
    )
    assert result["detected"] is True
    assert result["anomaly_score"] >= 45
    assert result["immediate_response"]["traffic_officers"] > 0
    assert result["immediate_response"]["preserve_emergency_corridor"] is True
