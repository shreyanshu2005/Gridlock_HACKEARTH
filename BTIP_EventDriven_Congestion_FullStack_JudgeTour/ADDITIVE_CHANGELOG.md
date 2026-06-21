# Additive Change Log

## Preserved without modification

- Existing six frontend pages and navigation behavior
- `assets/app.js`
- `assets/styles.css`
- `assets/satellite-map.js`
- `assets/favicon.svg`
- Existing authentication and role aliases
- Existing `/api/v1/*` frontend adapter routes
- Existing `/api/v1/raw/*` backend routes
- Existing GraphQL endpoint
- Existing risk, forecast, recommendation and simulation model code

## Added

### Frontend

- `assets/event-intelligence.css`
- `assets/event-intelligence.js`
- Six event-operation routes injected at runtime
- Event entry points in existing navigation and overview
- Standalone fallback data for direct `index.html` use

### Backend

- `backend/events/schemas.py`
- `backend/events/service.py`
- `backend/events/routes.py`
- Event router registration in `backend/main.py`
- `backend/tests/test_events.py`

### Documentation

- `EVENT_DRIVEN_CONGESTION_REPORT.md`
- `ADDITIVE_CHANGELOG.md`
- Updated `README.md`
- `EVENT_EXTENSION_MANIFEST.json`

## Original draft recovery

- Root original: `index.previous-draft.html`
- Served original: `frontend_static/index.previous-draft.html`

## Judge Tour Guidance Extension

- Added a first-load judge introduction modal explaining that the lime **Judge Tour** button guides every major feature.
- Expanded the Judge Tour from the older general traffic flow to a 14-step complete event-driven congestion demo.
- Added tour coverage for Event Command Centre, Event Impact Map, Ops Plan, Event Digital Twin, Post-Event Learning and Historical Event Replay.
- Added automatic actual-outcome reveal on the final replay tour step.
- Added command palette entries for event pages.
- Preserved existing frontend theme, satellite map visuals and backend logic.
