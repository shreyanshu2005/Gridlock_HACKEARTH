"""BTIP Round2 backend serving the unchanged satellite frontend."""
from __future__ import annotations

import asyncio
import logging
from datetime import date
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from strawberry.fastapi import GraphQLRouter

from backend.api.graphql.schema import schema
from backend.api.routes import forecast, hotspots, recommendations, risk, simulation, violations
from backend.api.routes import frontend_adapter
from backend.events.routes import router as events_router
from backend.core.auth import authenticate_user, create_token, get_current_user

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("btip")

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend_static"

app = FastAPI(
    title="BTIP — Bengaluru Traffic Intelligence Platform",
    version="2.1",
    description="Supplied Round2 model stack with the unchanged BTIP satellite command-center frontend.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# The unchanged frontend uses these friendly demo credentials. They map to the
# original Round2 users without changing the browser code.
LOGIN_ALIASES = {
    "commander": ("commander1", "gridlock2026", "commander123", "Demo Commander"),
    "analyst": ("analyst1", "analyse2026", "analyst123", "Traffic Analyst"),
    "officer": ("officer1", "patrol2026", "officer123", "Field Officer"),
}
DISPLAY_NAMES = {
    "commander1": "Demo Commander",
    "analyst1": "Traffic Analyst",
    "officer1": "Field Officer",
}


@app.post("/auth/token", tags=["auth"])
async def login(request: Request):
    """Accept both the frontend's JSON login and OAuth2 form submissions."""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = await request.json()
        supplied_username = str(payload.get("username", ""))
        supplied_password = str(payload.get("password", ""))
    else:
        form = await request.form()
        supplied_username = str(form.get("username", ""))
        supplied_password = str(form.get("password", ""))

    if supplied_username in LOGIN_ALIASES:
        username, alias_password, password, display_name = LOGIN_ALIASES[supplied_username]
        if supplied_password != alias_password:
            raise HTTPException(status_code=401, detail="Incorrect username or password")
    else:
        username = supplied_username
        password = supplied_password
        display_name = DISPLAY_NAMES.get(username, username)

    user = authenticate_user(username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    token = create_token(username=user["username"], role=user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
        "expires_in": 86400,
        "expires_in_hours": 24,
        "user": {
            "username": supplied_username or username,
            "backend_username": username,
            "name": display_name,
            "role": user["role"],
        },
    }


@app.get("/auth/me", tags=["auth"])
async def whoami(current_user=Depends(get_current_user)):
    return {
        "username": current_user.username,
        "name": DISPLAY_NAMES.get(current_user.username, current_user.username),
        "role": current_user.role,
    }


@app.get("/health", tags=["meta"])
async def health():
    return {
        "status": "ok",
        "backend": "Round2 supplied implementation",
        "frontend": "BTIP_Hackathon_FullStack_Satellite unchanged",
        "model_date": str(date.today()),
    }


# Exact paths consumed by the unchanged satellite frontend.
app.include_router(frontend_adapter.router, prefix="/api/v1")
# Additive event-driven congestion intelligence; existing endpoints remain unchanged.
app.include_router(events_router, prefix="/api/v1")

# Original Round2 REST contracts remain available for verification/debugging.
RAW_PREFIX = "/api/v1/raw"
app.include_router(violations.router, prefix=RAW_PREFIX, tags=["raw-violations"])
app.include_router(hotspots.router, prefix=RAW_PREFIX, tags=["raw-hotspots"])
app.include_router(risk.router, prefix=RAW_PREFIX, tags=["raw-risk"])
app.include_router(forecast.router, prefix=RAW_PREFIX, tags=["raw-forecast"])
app.include_router(recommendations.router, prefix=RAW_PREFIX, tags=["raw-recommendations"])
app.include_router(simulation.router, prefix=RAW_PREFIX, tags=["raw-simulation"])
app.include_router(GraphQLRouter(schema), prefix="/graphql")


@app.websocket("/ws/live")
async def live_city_pulse(websocket: WebSocket):
    await websocket.accept()
    sequence = 0
    try:
        while True:
            overview = frontend_adapter.ui_overview()
            await websocket.send_json({
                "type": "city_pulse",
                "city_risk": overview["kpis"]["city_risk"],
                "active_hotspots": overview["kpis"]["active_hotspots"],
                "decision_refresh_ms": 1700 + (sequence % 6) * 31,
            })
            sequence += 1
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        return


app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")


@app.get("/", include_in_schema=False)
async def frontend_index():
    return FileResponse(FRONTEND / "index.html")


@app.get("/index.html", include_in_schema=False)
async def frontend_index_alias():
    return FileResponse(FRONTEND / "index.html")


@app.on_event("startup")
async def on_startup():
    logger.info("Prewarming supplied Round2 models for the unchanged frontend...")
    await asyncio.to_thread(frontend_adapter.prewarm_models)
    logger.info("BTIP ready — frontend=/, API=/api/v1, raw backend=%s, GraphQL=/graphql", RAW_PREFIX)


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("BTIP shutting down")
