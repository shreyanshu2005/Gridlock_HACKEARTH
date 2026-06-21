from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.events.schemas import EventCreate, EventSimulationRequest, PostEventActuals, UnplannedDetectionRequest
from backend.events import service

router = APIRouter(prefix="/events", tags=["event-driven-congestion"])


@router.get("")
def get_events():
    return {"total": len(service.list_events()), "items": service.list_events()}


@router.post("", status_code=201)
def add_event(payload: EventCreate):
    return service.create_event(payload)


@router.get("/{event_id}")
def get_event(event_id: str):
    try:
        event = service.get_event(event_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown event: {event_id}") from exc
    return {"event": event, "impact": service.impact_forecast(event_id)}


@router.get("/{event_id}/impact-forecast")
def get_impact(event_id: str):
    try:
        return service.impact_forecast(event_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown event: {event_id}") from exc


@router.get("/{event_id}/response-plan")
def get_plan(event_id: str):
    try:
        return service.response_plan(event_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown event: {event_id}") from exc


@router.post("/{event_id}/simulate")
def simulate(event_id: str, payload: EventSimulationRequest):
    try:
        return service.simulate_event(event_id, payload)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown event: {event_id}") from exc


@router.get("/{event_id}/post-event")
def get_post_event(event_id: str):
    try:
        return service.post_event_review(event_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown event: {event_id}") from exc


@router.post("/{event_id}/post-event")
def submit_post_event(event_id: str, payload: PostEventActuals):
    try:
        return service.post_event_review(event_id, payload)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown event: {event_id}") from exc


@router.get("/{event_id}/replay")
def get_replay(event_id: str, reveal_actual: bool = Query(False)):
    try:
        return service.replay(event_id, reveal_actual)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown event: {event_id}") from exc


@router.post("/unplanned/detect")
def detect_unplanned(payload: UnplannedDetectionRequest):
    return service.detect_unplanned(payload)
