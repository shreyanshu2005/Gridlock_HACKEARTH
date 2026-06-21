# Event-Driven Congestion — Solution and Verification Report

## Problem statement

Political rallies, festivals, sports events, construction activities and sudden gatherings create localized traffic breakdowns. Their impact is difficult to quantify in advance, deployment is often experience-driven, and lessons are not systematically carried into the next event.

## End-to-end solution

| Missing operational domain | Added capability | Verification surface |
|---|---|---|
| Event intake | Planned/unplanned event catalogue and event registration | Event Command Centre |
| Advance impact quantification | Attendance, traffic, weather and network-aware impact forecast | Event Command Centre and Event Map |
| Crowd arrival/departure waves | Inflow peak, event start/end, outflow peak and recovery forecast | Event timeline |
| Affected network footprint | Ranked junction impact, speed loss, delay and queue estimates | Satellite Event Impact Map |
| Manpower planning | Existing ILP optimizer reused for zone allocation | Response Plan |
| Barricading | Recommended locations, type, schedule, staffing and conflict reduction | Barricade Plan |
| Diversions | Graph-informed original/recommended paths and expected relief | Diversion Plan and map |
| Emergency access | Explicit continuously preserved emergency corridor | Response Plan and Digital Twin validation |
| Tow/rapid response | Tow vehicles, rapid-response units and reserve staffing | Response Plan summary |
| No-action comparison | No action vs experience-driven vs AI plan | Event Digital Twin |
| Confidence | P10/P50/P90 impact range | Event Digital Twin |
| Unplanned gatherings | Multi-signal anomaly detector and immediate response | Event Command Centre |
| Outcome verification | Forecast-vs-actual comparison | Post-Event Review |
| Post-event learning | Generated corrective actions and queued profile update | Post-Event Review |
| Judge proof | Future-locked historical replay with reveal step | Event Replay |

## How to verify on the website

1. Open `#/events` and choose a planned or unplanned event.
2. Inspect forecast attendance, additional vehicles, peak delay, critical corridors and recovery time.
3. Open `#/event-map` to see the event footprint and affected Bengaluru junctions over the existing satellite map.
4. Open `#/event-plan` and verify that the system produces all three response domains: manpower, barricades and diversion routes. Confirm that the officer total and emergency corridor are visible.
5. Open `#/event-twin`, change attendance, manpower, barricade teams, tow vehicles, response lead time and diversion intensity, then run the simulation.
6. Compare **No Plan**, **Experience-Based Plan** and **AI Plan**. The validation panel confirms constraints, emergency-corridor preservation and whether the AI plan improves delay.
7. Open `#/post-event` to compare predicted and actual attendance, delay, critical junctions and congestion reduction. Review the generated learning actions.
8. Open `#/event-replay`. The actual result starts locked. Select **Reveal Actual Outcome** to verify forecast accuracy and see the learning generated from the historical outcome.

## Evidence labels

The extension separates:

- **Forecast** — model/scenario output before an event.
- **Recommended plan** — optimized operational action.
- **Simulated result** — Digital Twin projection, not an observed outcome.
- **Actual result** — submitted or deterministic replay actual used for verification.
- **Learning action** — change generated after forecast-vs-actual comparison.

## Preservation guarantee

The original Satellite frontend core remains unchanged. New behavior is loaded only through:

- `assets/event-intelligence.css`
- `assets/event-intelligence.js`
- `backend/events/`

Only additive stylesheet/script tags and the event router registration were inserted. The preserved original HTML is available as `index.previous-draft.html`, and hashes are provided for comparison.

## Known production boundary

This build is executable and demonstrates the complete operational workflow. Because the supplied data did not include event-labelled ground truth, it does not claim a separately trained event-impact ML model. The event engine combines existing real Round2 risk/congestion/graph/ILP outputs with explicit event factors. Production deployment should ingest ticketing/attendance, live speed, camera density, road closure, weather and actual post-event records and retrain against those labels.
