# Validation Report

## Completed checks

### Frontend preservation

- Original `assets/app.js` SHA-256 matched the supplied Satellite draft.
- Original `assets/styles.css` SHA-256 matched.
- Original `assets/satellite-map.js` SHA-256 matched.
- Original `assets/favicon.svg` SHA-256 matched.
- `index.html` differs from the preserved draft by only two additive references: the event stylesheet and event script.
- The original HTML remains available as `index.previous-draft.html`.

### Frontend extension

- `node --check assets/event-intelligence.js` passed.
- Served and root copies of the extension are identical.
- HTML local references were parsed and all referenced assets existed.
- FastAPI returned HTTP 200 for the root page and all original/new JavaScript and CSS assets.

### Backend

- Python compilation passed for `backend/events/` and `backend/main.py`.
- Seven event-domain tests passed:
  - event catalogue
  - event registration
  - impact forecast
  - manpower/barricade/diversion response plan
  - AI/no-action Digital Twin comparison
  - post-event replay and learning
  - unplanned-event detection
- Existing Round2 hotspot endpoint remained available and returned HTTP 200.
- Event routes returned HTTP 200 through the actual FastAPI ASGI application.
- Digital Twin validation confirmed:
  - operational constraints satisfied
  - emergency corridor preserved
  - AI plan outperformed no action
  - P10 ≤ P50 ≤ P90

## Endpoint smoke-test results

```text
GET  /health                                             200
GET  /api/v1/events                                      200
GET  /api/v1/events/EVT-001/impact-forecast              200
GET  /api/v1/events/EVT-001/response-plan                200
POST /api/v1/events/EVT-001/simulate                     200
GET  /api/v1/events/EVT-001/post-event                   200
GET  /api/v1/events/EVT-001/replay?reveal_actual=true    200
POST /api/v1/events/unplanned/detect                     200
GET  /api/v1/hotspots?limit=3                            200
```

## Runtime warnings

The supplied serialized XGBoost model emits a compatibility warning when loaded under the installed XGBoost runtime. The supplied PuLP implementation also emits deprecation warnings for APIs planned for removal in PuLP 4.0. These warnings did not prevent inference, allocation or test completion. The original model and optimizer files were intentionally not rewritten.

## Visual-test boundary

Automated browser screenshot navigation was blocked by the execution environment's browser policy. JavaScript syntax, HTML references, static serving, API behavior and backend outputs were validated. Final visual review should be performed locally after running `./start.sh`, especially at mobile breakpoints and with live satellite-tile internet access.
