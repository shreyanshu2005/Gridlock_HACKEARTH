# BTIP — Event-Driven Congestion Full-Stack Edition

This package extends the existing **BTIP Round2 Satellite command centre** into an end-to-end system for planned and unplanned event congestion. The previous frontend, satellite map engine, animations, original six pages, model routes, authentication, GraphQL, trained-model adapters, and digital-twin logic remain in place.

The extension is additive. The original frontend is preserved as `index.previous-draft.html`, and integrity hashes for the frozen core assets are stored in `PREVIOUS_FRONTEND_SHA256.txt` and `FRONTEND_INTEGRITY_SHA256.json`.

## Problem solved

BTIP now supports the complete operational loop:

**Register or detect event → forecast traffic impact → identify affected corridors → recommend manpower, barricades and diversions → validate the response in a digital twin → monitor actual performance → learn from the event → replay and verify**

It covers:

- Planned events: sports, political rallies, festivals, construction, concerts, VIP movement, religious gatherings and protests.
- Unplanned events: sudden gatherings detected from speed loss, camera-density change, road occupancy, crowd estimates and alert volume.
- Event impact forecasts: additional vehicles, affected junctions, delay, queue growth, speed loss, critical corridors, inflow/outflow peaks and recovery time.
- Operational plans: traffic officers, barricade teams, tow vehicles, rapid-response units, zone allocations and emergency-corridor protection.
- Barricade planning: location, type, installation/removal window, staffing and expected conflict reduction.
- Diversions: original and recommended paths, added distance/time, expected traffic shifted and congestion relief.
- Event Digital Twin: no-action, experience-driven and AI-recommended scenarios with P10/P50/P90 confidence.
- Post-event learning: forecast-vs-actual accuracy, impact error, staffing variance and generated learning actions.
- Historical Event Replay: future data stays locked until the user selects **Reveal Actual Outcome**.

## Run on macOS or Linux

```bash
unzip BTIP_EventDriven_Congestion_FullStack.zip
cd BTIP_EventDriven_Congestion_FullStack
chmod +x start.sh
./start.sh
```

Open:

```text
http://127.0.0.1:8000/#/events
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

## Run on Windows

Extract the ZIP and run:

```text
start.bat
```

Then open `http://127.0.0.1:8000/#/events`.

## Demo credentials

| Role | Username | Password |
|---|---|---|
| Commander | `commander` | `gridlock2026` |
| Analyst | `analyst` | `analyse2026` |
| Officer | `officer` | `patrol2026` |

## Existing pages preserved

- `#/overview`
- `#/heatmap`
- `#/hotspots`
- `#/forecast`
- `#/recommendations`
- `#/simulation`

## New additive event pages

- `#/events` — Event Command Centre
- `#/event-map` — Event Impact satellite map
- `#/event-plan` — manpower, barricade and diversion plan
- `#/event-twin` — Event Digital Twin comparison
- `#/post-event` — post-event review and learning
- `#/event-replay` — historical replay and outcome verification

## Event API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/events` | List planned and unplanned events |
| POST | `/api/v1/events` | Register a new event |
| GET | `/api/v1/events/{event_id}` | Event detail plus impact summary |
| GET | `/api/v1/events/{event_id}/impact-forecast` | Quantified event traffic impact |
| GET | `/api/v1/events/{event_id}/response-plan` | Manpower, barricade, diversion and emergency plan |
| POST | `/api/v1/events/{event_id}/simulate` | Compare no action, current plan and AI plan |
| GET/POST | `/api/v1/events/{event_id}/post-event` | Review actuals and generate learning actions |
| GET | `/api/v1/events/{event_id}/replay` | Locked/revealed historical verification |
| POST | `/api/v1/events/unplanned/detect` | Detect and classify sudden gatherings |

## Architecture

The event extension uses the existing Round2 stack rather than replacing it:

- Existing risk and congestion outputs are used as the baseline network state.
- Existing OSM graph data supports corridor and diversion reasoning.
- Existing PuLP ILP allocation is reused for zone-level manpower distribution.
- Existing satellite map implementation is reused for event footprints and plans.
- Existing backend APIs remain available under their original routes.
- Browser-direct `index.html` includes deterministic fallback data so the UI still opens without Python; run through FastAPI to use the real backend integration.

## Data and model note

No event-labelled historical training dataset was included in the supplied project. Therefore, event attendance, weather, transport share and event-type pressure are fused with the existing trained BTIP risk/congestion signals through a deterministic operational scenario engine. Real post-event actuals can be submitted through the post-event endpoint and persisted by the surrounding data pipeline. Replace the demo event catalogue or submit actual events without changing the frontend.

Satellite imagery requires internet access. The application retains its styled fallback if imagery is unavailable.

## Tests

```bash
pytest backend/tests/test_events.py -q
```

The complete API can also be checked from `/docs` after startup.
