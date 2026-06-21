"""Build fast frontend forecast cache from the supplied Round2 model artefacts."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.api.routes.forecast import get_forecast_data
from backend.models.forecasting import prophet_forecast

META = ROOT / "data" / "processed" / "ui_junctions.json"
OUTPUT = ROOT / "data" / "processed" / "frontend_forecast_cache.json"


def normalize(response):
    data = response.model_dump(mode="json") if hasattr(response, "model_dump") else dict(response)
    return {
        "model_used": data.get("model_used"),
        "points": [
            {
                "p10": float(point["p10"]),
                "p50": float(point["p50"]),
                "p90": float(point["p90"]),
                "source": point.get("source", data.get("model_used")),
            }
            for point in data.get("points", [])
        ],
    }


def main() -> None:
    metadata = json.loads(META.read_text(encoding="utf-8"))
    cache = {}
    for item in metadata:
        junction_id = str(item["junction_id"])
        cache[junction_id] = {}
        for horizon, hours in (("24h", 24), ("7d", 168)):
            try:
                payload = normalize(get_forecast_data(junction_id, horizon))
                if len(payload["points"]) != hours:
                    raise ValueError("unexpected horizon length")
            except Exception:
                points = prophet_forecast.forecast(junction_id, horizon_hours=hours)
                payload = {
                    "model_used": points[0].get("source", "prophet") if points else "prophet",
                    "points": [
                        {"p10": p["p10"], "p50": p["p50"], "p90": p["p90"], "source": p.get("source", "prophet")}
                        for p in points
                    ],
                }
            cache[junction_id][horizon] = payload
            print(junction_id, horizon, payload["model_used"], len(payload["points"]))
    OUTPUT.write_text(json.dumps(cache, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
