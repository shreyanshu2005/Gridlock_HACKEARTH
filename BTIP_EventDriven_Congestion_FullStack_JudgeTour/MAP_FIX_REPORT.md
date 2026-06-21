# BTIP Event Impact Map Fix

## Issue
On `#/event-map`, the right-side metrics loaded correctly, but the map area stayed as a dark empty panel.

## Cause
The Event Impact page wraps the map inside `.event-map-frame`, but the generated `#eventImpactMap` div did not have an explicit height/width. The satellite engine initialized, but it painted into a zero-height child instead of filling the large map frame.

## Fix Applied
- Added explicit positioning and `height: 100% / width: 100%` for `#eventImpactMap` inside `.event-map-frame`.
- Added safe redraw calls in `ensureMap()` after route navigation so the satellite engine remeasures the visible panel.
- Kept the existing frontend theme, backend logic, page structure, animations and satellite engine intact.

## Files Changed
- `assets/event-intelligence.css`
- `assets/event-intelligence.js`
- mirrored versions under `frontend_static/assets/`

## Verification
- JavaScript syntax checks passed for:
  - `assets/app.js`
  - `assets/satellite-map.js`
  - `assets/event-intelligence.js`
- The fix is additive and only targets the event map mounting problem.

## Note
Satellite imagery needs an internet connection. Running through the backend is preferred:

```bash
./start.sh
```

Then open:

```text
http://127.0.0.1:8000/#/event-map
```
