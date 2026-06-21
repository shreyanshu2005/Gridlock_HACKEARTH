"""End-to-end smoke test for the unchanged satellite frontend integration."""
from __future__ import annotations

import hashlib
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient
from backend.main import app


def require(response):
    assert response.status_code == 200, f"{response.request.url}: {response.status_code} {response.text[:500]}"
    return response.json() if "application/json" in response.headers.get("content-type", "") else response.text


def run() -> None:
    started = time.perf_counter()
    with TestClient(app) as client:
        require(client.get("/health"))
        index = require(client.get("/"))
        assert "Bengaluru Traffic Intelligence Platform" in index
        require(client.get("/assets/app.js"))
        require(client.get("/assets/satellite-map.js"))

        token = require(client.post("/auth/token", json={"username": "commander", "password": "gridlock2026"}))
        require(client.get("/auth/me", headers={"Authorization": f"Bearer {token['access_token']}"}))

        overview = require(client.get("/api/v1/overview"))
        assert overview["top_zones"] and 0 <= overview["kpis"]["city_risk"] <= 100

        hotspots = require(client.get("/api/v1/hotspots", params={"shift": "Evening"}))
        assert len(hotspots["items"]) == 16
        assert all(item["zone_id"].startswith("J") for item in hotspots["items"])
        assert all(item["model_source"] == "lightgbm-xgboost-calibrated-shap" for item in hotspots["items"])

        risk = require(client.get("/api/v1/risk", params={"zone_id": "J001", "shift": "Evening", "date": "2026-06-21"}))
        assert risk["model_source"] == "lightgbm-xgboost-calibrated-shap"
        assert len(risk["shap_explanations"]) == 5

        for horizon, expected in (("24h", 24), ("7d", 168)):
            forecast = require(client.get("/api/v1/forecast", params={"junction_id": "J001", "horizon": horizon}))
            assert len(forecast["items"]) == expected
            assert all(point["p10"] <= point["p50"] <= point["p90"] for point in forecast["items"])

        calendar = require(client.get("/api/v1/forecast/risk-calendar", params={"junction_id": "J001"}))
        assert len(calendar["items"]) >= 28

        recommendations = require(client.get("/api/v1/recommendations", params={"shift": "Evening", "date": "2026-06-21", "total_officers": 20}))
        assert recommendations["officers_allocated"] == 20
        assert recommendations["recommendations"]

        violations = require(client.get("/api/v1/violations", params={"junction_id": "J001", "limit": 5}))
        assert violations["items"] and all(item["junction_id"] == "J001" for item in violations["items"])

        simulation = require(client.post("/api/v1/simulation", json={
            "zone_allocations": [{"zone_id": "J001", "n_officers": 4}, {"zone_id": "J002", "n_officers": 3}],
            "shift": "Evening",
            "date": "2026-06-21",
            "window_hours": 4,
        }))
        band = simulation["confidence_band"]
        assert band["p10"] <= band["p50"] <= band["p90"]
        assert simulation["per_junction"]

    print(f"BTIP satellite/real-backend smoke test passed in {time.perf_counter() - started:.1f}s")


if __name__ == "__main__":
    run()
