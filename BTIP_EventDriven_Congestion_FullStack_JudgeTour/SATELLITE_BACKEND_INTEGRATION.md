# BTIP Satellite Frontend + Round2 Backend Integration

## Frontend integrity

The following files are copied byte-for-byte from `BTIP_Hackathon_FullStack_Satellite(1).zip`:

- `index.html`
- `assets/app.js`
- `assets/styles.css`
- `assets/satellite-map.js`
- `assets/favicon.svg`

No visual component, animation, transition, satellite-map effect, CSS rule, frontend route, or browser-side fallback was modified.

## Backend integration

The supplied `Round2-main(1).zip` remains the project base. Backend-only changes provide:

- Exact `/api/v1/*` response contracts expected by the unchanged frontend
- Translation between frontend IDs (`J001`–`J016`) and trained backend junction IDs (`BTP...`)
- Batched LightGBM + XGBoost + calibration + SHAP inference
- Prophet 24-hour forecasts and LSTM 7-day forecasts cached from the supplied model artefacts
- PuLP ILP patrol allocation
- Round2 digital-twin simulation and graph diffusion
- JSON login compatibility for the unchanged login screen
- WebSocket city-pulse updates
- The original Round2 routes under `/api/v1/raw/*`
- The original GraphQL API at `/graphql`

## Run

macOS/Linux:

```bash
./start.sh
```

Windows:

```bat
start.bat
```

Open `http://127.0.0.1:8000/#/overview`.

The server intentionally preloads the model stack before accepting traffic so the unchanged frontend's 1.8-second request timeout does not trigger its demo fallback.
