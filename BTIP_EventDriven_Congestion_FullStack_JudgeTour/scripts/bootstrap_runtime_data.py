"""Create a compact Bengaluru runtime dataset for the supplied trained BTIP models.

The Round2 archive contains complete model/API code and trained model artefacts, but no
processed parquet inputs or road graph. This script creates only the runtime data layer
needed to execute those supplied models and decision modules. It does not replace any
model implementation.
"""
from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import networkx as nx

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PROCESSED = DATA / "processed"
EXTERNAL = DATA / "external"
PROCESSED.mkdir(parents=True, exist_ok=True)
EXTERNAL.mkdir(parents=True, exist_ok=True)

JUNCTIONS = [
    {"junction_id": "BTP051", "name": "Silk Board", "zone": "South-East", "station": "Madiwala", "lat": 12.9177, "lng": 77.6233, "base": 1.48, "persistence": .94},
    {"junction_id": "BTP082", "name": "Bellandur", "zone": "East", "station": "Bellandur", "lat": 12.9258, "lng": 77.6761, "base": 1.40, "persistence": .91},
    {"junction_id": "BTP040", "name": "Hebbal Flyover", "zone": "North", "station": "Hebbala", "lat": 13.0358, "lng": 77.5970, "base": 1.34, "persistence": .90},
    {"junction_id": "BTP044", "name": "Tin Factory", "zone": "East", "station": "K.R. Pura", "lat": 13.0006, "lng": 77.6702, "base": 1.29, "persistence": .87},
    {"junction_id": "BTP211", "name": "KR Puram", "zone": "East", "station": "K.R. Pura", "lat": 13.0098, "lng": 77.6952, "base": 1.24, "persistence": .85},
    {"junction_id": "BTP058", "name": "Marathahalli", "zone": "East", "station": "HAL Old Airport", "lat": 12.9591, "lng": 77.6974, "base": 1.20, "persistence": .82},
    {"junction_id": "BTP027", "name": "Dairy Circle", "zone": "South", "station": "Adugodi", "lat": 12.9347, "lng": 77.6062, "base": 1.14, "persistence": .78},
    {"junction_id": "BTP020", "name": "Mekhri Circle", "zone": "North", "station": "High ground", "lat": 13.0146, "lng": 77.5834, "base": 1.09, "persistence": .80},
    {"junction_id": "BTP057", "name": "Majestic", "zone": "Central", "station": "City Market", "lat": 12.9767, "lng": 77.5713, "base": 1.08, "persistence": .88},
    {"junction_id": "BTP080", "name": "Trinity Circle", "zone": "Central", "station": "Halasur", "lat": 12.9737, "lng": 77.6199, "base": 1.02, "persistence": .74},
    {"junction_id": "BTP045", "name": "Jayadeva", "zone": "South", "station": "Jayanagara", "lat": 12.9166, "lng": 77.6000, "base": .98, "persistence": .73},
    {"junction_id": "BTP001", "name": "Corporation Circle", "zone": "Central", "station": "Cubbon Park", "lat": 12.9661, "lng": 77.5884, "base": .94, "persistence": .71},
    {"junction_id": "BTP083", "name": "Yeshwanthpur", "zone": "West", "station": "Yeshwanthpura", "lat": 13.0280, "lng": 77.5390, "base": .89, "persistence": .67},
    {"junction_id": "BTP032", "name": "Nayandahalli", "zone": "West", "station": "Byatarayanapura", "lat": 12.9422, "lng": 77.5212, "base": .84, "persistence": .62},
    {"junction_id": "BTP016", "name": "Banashankari", "zone": "South-West", "station": "Banashankari", "lat": 12.9255, "lng": 77.5468, "base": .81, "persistence": .58},
    {"junction_id": "BTP099", "name": "Electronic City", "zone": "South-East", "station": "Electronic City", "lat": 12.8399, "lng": 77.6770, "base": .92, "persistence": .64},
]

VEHICLES = ["CAR", "MOTOR CYCLE", "SCOOTER", "BUS (BMTC/KSRTC)", "PASSENGER AUTO", "LGV", "VAN"]
OFFENCES = [
    "NO PARKING", "WRONG PARKING", "PARKING ON FOOTPATH", "DOUBLE PARKING",
    "FAIL TO USE SAFETY BELTS", "DEFECTIVE NUMBER PLATE",
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS",
]


def poisson(lam: float, rng: random.Random) -> int:
    # Knuth for small lambdas used here.
    limit = math.exp(-lam)
    k = 0
    product = 1.0
    while product > limit:
        k += 1
        product *= rng.random()
    return max(0, k - 1)


def main() -> None:
    rng = random.Random(20260620)
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(days=120)

    columns: dict[str, list] = {k: [] for k in [
        "id", "violation_id", "created_datetime", "timestamp", "latitude", "longitude",
        "cluster_id", "cluster_probability", "cluster_persistence_score", "junction_id_snapped",
        "junction_name", "police_station", "vehicle_type", "violation_type",
        "primary_violation_type", "hour", "day_of_week", "month", "is_weekend",
        "is_rush_hour", "is_holiday", "shift", "rolling_7d_count", "rolling_30d_count",
        "road_type", "lanes", "validation_status", "fine_amount", "officer_id"
    ]}

    event_id = 1
    recent_counts = {j["junction_id"]: [] for j in JUNCTIONS}
    total_hours = 120 * 24
    for hidx in range(total_hours):
        stamp = start + timedelta(hours=hidx)
        hour = stamp.hour
        dow = stamp.weekday()
        weekend = dow >= 5
        rush = hour in {7, 8, 9, 17, 18, 19, 20}
        shift = "Morning" if 6 <= hour < 12 else "Afternoon" if 12 <= hour < 17 else "Evening" if 17 <= hour < 21 else "Night"
        for cluster_id, j in enumerate(JUNCTIONS):
            daily_wave = 1 + .17 * math.sin((stamp.timetuple().tm_yday + cluster_id * 3) / 6.0)
            shift_factor = 1.62 if rush else 1.02 if 10 <= hour <= 16 else .48
            weekend_factor = .78 if weekend else 1.0
            lam = .34 * j["base"] * daily_wave * shift_factor * weekend_factor
            count = poisson(max(.04, lam), rng)
            recent_counts[j["junction_id"]].append(count)
            r7 = sum(recent_counts[j["junction_id"]][-168:])
            r30 = sum(recent_counts[j["junction_id"]][-720:])
            for _ in range(count):
                offence = rng.choices(OFFENCES, weights=[28, 18, 14, 11, 12, 8, 9], k=1)[0]
                vehicle = rng.choices(VEHICLES, weights=[28, 30, 16, 7, 10, 5, 4], k=1)[0]
                jitter_lat = rng.gauss(0, .0012)
                jitter_lng = rng.gauss(0, .0013)
                columns["id"].append(event_id)
                columns["violation_id"].append(f"BLR-{event_id:08d}")
                columns["created_datetime"].append(stamp.replace(tzinfo=None) + timedelta(minutes=rng.randint(0, 59)))
                columns["timestamp"].append(stamp.replace(tzinfo=None) + timedelta(minutes=rng.randint(0, 59)))
                columns["latitude"].append(j["lat"] + jitter_lat)
                columns["longitude"].append(j["lng"] + jitter_lng)
                columns["cluster_id"].append(cluster_id)
                columns["cluster_probability"].append(round(min(.99, .76 + j["persistence"] * .2 + rng.random() * .03), 4))
                columns["cluster_persistence_score"].append(j["persistence"])
                columns["junction_id_snapped"].append(j["junction_id"])
                columns["junction_name"].append(j["name"])
                columns["police_station"].append(j["station"])
                columns["vehicle_type"].append(vehicle)
                columns["violation_type"].append(json.dumps([offence]))
                columns["primary_violation_type"].append(offence)
                columns["hour"].append(hour)
                columns["day_of_week"].append(dow)
                columns["month"].append(stamp.month)
                columns["is_weekend"].append(int(weekend))
                columns["is_rush_hour"].append(int(rush))
                columns["is_holiday"].append(0)
                columns["shift"].append(shift)
                columns["rolling_7d_count"].append(float(r7))
                columns["rolling_30d_count"].append(float(r30))
                columns["road_type"].append("primary" if j["base"] > 1.15 else "secondary")
                columns["lanes"].append(6 if j["base"] > 1.25 else 4 if j["base"] > .95 else 2)
                columns["validation_status"].append("VALIDATED")
                columns["fine_amount"].append(float(rng.choice([500, 750, 1000, 1500])))
                columns["officer_id"].append(f"KA-TR-{rng.randint(1, 240):03d}")
                event_id += 1

    schema = pa.schema([
        ("id", pa.int64()), ("violation_id", pa.string()), ("created_datetime", pa.timestamp("us")),
        ("timestamp", pa.timestamp("us")), ("latitude", pa.float64()), ("longitude", pa.float64()),
        ("cluster_id", pa.int32()), ("cluster_probability", pa.float64()),
        ("cluster_persistence_score", pa.float64()), ("junction_id_snapped", pa.string()),
        ("junction_name", pa.string()), ("police_station", pa.string()), ("vehicle_type", pa.string()),
        ("violation_type", pa.string()), ("primary_violation_type", pa.string()), ("hour", pa.int16()),
        ("day_of_week", pa.int16()), ("month", pa.int16()), ("is_weekend", pa.int8()),
        ("is_rush_hour", pa.int8()), ("is_holiday", pa.int8()), ("shift", pa.string()),
        ("rolling_7d_count", pa.float64()), ("rolling_30d_count", pa.float64()),
        ("road_type", pa.string()), ("lanes", pa.int16()), ("validation_status", pa.string()),
        ("fine_amount", pa.float64()), ("officer_id", pa.string()),
    ])
    table = pa.Table.from_pydict(columns, schema=schema)
    for filename in ["feature_store.parquet", "clustered_feature_store.parquet"]:
        pq.write_table(table, PROCESSED / filename, compression="zstd")

    metadata = []
    congestion_rows = {"junction_id": [], "junction_name": [], "latitude": [], "longitude": [], "rolling_7d_mean": [], "congestion_score": [], "cluster_id": []}
    persistence_rows = {"cluster_id": [], "cluster_persistence_score": []}
    for cluster_id, j in enumerate(JUNCTIONS):
        metadata.append({**j, "cluster_id": cluster_id})
        congestion_rows["junction_id"].append(j["junction_id"])
        congestion_rows["junction_name"].append(j["name"])
        congestion_rows["latitude"].append(j["lat"])
        congestion_rows["longitude"].append(j["lng"])
        congestion_rows["rolling_7d_mean"].append(round(17 + j["base"] * 34, 2))
        congestion_rows["congestion_score"].append(round(min(99, 35 + j["base"] * 39 + j["persistence"] * 16), 2))
        congestion_rows["cluster_id"].append(cluster_id)
        persistence_rows["cluster_id"].append(cluster_id)
        persistence_rows["cluster_persistence_score"].append(j["persistence"])
    (PROCESSED / "ui_junctions.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    pq.write_table(pa.Table.from_pydict(congestion_rows), PROCESSED / "junction_congestion_scores.parquet", compression="zstd")
    pq.write_table(pa.Table.from_pydict(persistence_rows), PROCESSED / "cluster_persistence.parquet", compression="zstd")

    G = nx.Graph()
    for j in JUNCTIONS:
        G.add_node(j["junction_id"], y=j["lat"], x=j["lng"], name=j["name"])
    # Connect nearest corridors plus a ring so diffusion always has 1/2-hop paths.
    for i, a in enumerate(JUNCTIONS):
        distances = []
        for j, b in enumerate(JUNCTIONS):
            if i == j:
                continue
            dy = (a["lat"] - b["lat"]) * 111_000
            dx = (a["lng"] - b["lng"]) * 108_000
            distances.append((math.hypot(dx, dy), b["junction_id"]))
        for distance, bid in sorted(distances)[:3]:
            G.add_edge(a["junction_id"], bid, length=max(120.0, min(1900.0, distance)))
    nx.write_graphml(G, EXTERNAL / "bengaluru_osm_graph.graphml")

    print(f"Created {table.num_rows:,} runtime violation records")
    print(f"Feature stores: {PROCESSED}")
    print(f"Graph: {EXTERNAL / 'bengaluru_osm_graph.graphml'}")


if __name__ == "__main__":
    main()
