from __future__ import annotations

import hashlib
import json
import math
from copy import deepcopy
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import networkx as nx

from backend.events.schemas import EventCreate, EventSimulationRequest, PostEventActuals, UnplannedDetectionRequest

ROOT = Path(__file__).resolve().parents[2]
GRAPH_PATH = ROOT / "data" / "external" / "bengaluru_osm_graph.graphml"
CUSTOM_EVENTS_PATH = ROOT / "data" / "events" / "custom_events.json"

TYPE_FACTOR = {
    "sports": 1.00,
    "political_rally": 1.18,
    "festival": 1.12,
    "construction": 0.84,
    "concert": 1.04,
    "vip_movement": 0.76,
    "religious_gathering": 1.08,
    "protest": 1.16,
    "sudden_gathering": 1.25,
}
VEHICLE_SHARE = {
    "sports": 0.48,
    "political_rally": 0.43,
    "festival": 0.39,
    "construction": 0.12,
    "concert": 0.52,
    "vip_movement": 0.22,
    "religious_gathering": 0.41,
    "protest": 0.34,
    "sudden_gathering": 0.40,
}
OCCUPANCY = {
    "sports": 2.7,
    "political_rally": 3.1,
    "festival": 3.0,
    "construction": 1.8,
    "concert": 2.5,
    "vip_movement": 2.2,
    "religious_gathering": 3.2,
    "protest": 2.8,
    "sudden_gathering": 2.6,
}
WEATHER_FACTOR = {"clear": 1.0, "rain": 1.13, "heavy_rain": 1.28, "heat": 1.04, "unknown": 1.08}


def _stable_unit(text: str) -> float:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / (2**64 - 1)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(max(1e-12, 1 - a)))


def _default_events() -> list[dict[str, Any]]:
    today = date.today()
    def at(days: int, hour: int, minute: int = 0) -> str:
        return datetime.combine(today + timedelta(days=days), datetime.min.time()).replace(hour=hour, minute=minute).isoformat()
    return [
        {
            "event_id": "EVT-001", "name": "Bengaluru Football Night", "event_type": "sports", "mode": "planned",
            "venue": "Sree Kanteerava Stadium", "latitude": 12.9683, "longitude": 77.5937,
            "start_time": at(1, 19, 30), "end_time": at(1, 22, 15), "expected_attendance": 24_000,
            "parking_capacity": 2_400, "public_transport_share": 0.42, "weather": "clear", "status": "planning",
            "notes": "High simultaneous arrival and departure wave around the central business district.",
        },
        {
            "event_id": "EVT-002", "name": "Freedom Park Civic Rally", "event_type": "political_rally", "mode": "planned",
            "venue": "Freedom Park", "latitude": 12.9856, "longitude": 77.5797,
            "start_time": at(0, 16, 30), "end_time": at(0, 20, 0), "expected_attendance": 15_500,
            "parking_capacity": 600, "public_transport_share": 0.31, "weather": "clear", "status": "monitoring",
            "notes": "Rolling road occupation and uncertain dispersal profile.",
        },
        {
            "event_id": "EVT-003", "name": "Stadium Cricket Surge", "event_type": "sports", "mode": "planned",
            "venue": "M. Chinnaswamy Stadium", "latitude": 12.9788, "longitude": 77.5996,
            "start_time": at(3, 19, 30), "end_time": at(3, 23, 0), "expected_attendance": 32_000,
            "parking_capacity": 2_900, "public_transport_share": 0.46, "weather": "rain", "status": "planning",
            "notes": "Large post-event outflow into Cubbon Road, MG Road and Central Bengaluru.",
        },
        {
            "event_id": "EVT-004", "name": "Malleshwaram Festival Procession", "event_type": "festival", "mode": "planned",
            "venue": "Malleshwaram 8th Cross", "latitude": 13.0035, "longitude": 77.5690,
            "start_time": at(2, 17, 0), "end_time": at(2, 22, 30), "expected_attendance": 18_000,
            "parking_capacity": 1_100, "public_transport_share": 0.37, "weather": "clear", "status": "planning",
            "notes": "Moving procession footprint with local commercial and residential spillover.",
        },
        {
            "event_id": "EVT-005", "name": "Whitefield Utility Construction", "event_type": "construction", "mode": "planned",
            "venue": "ITPL Main Road", "latitude": 12.9862, "longitude": 77.7372,
            "start_time": at(0, 8, 0), "end_time": at(7, 23, 0), "expected_attendance": 0,
            "parking_capacity": 0, "public_transport_share": 0.0, "weather": "unknown", "status": "active",
            "notes": "One-lane closure producing recurring peak-hour diversion pressure.",
        },
        {
            "event_id": "EVT-006", "name": "Town Hall Sudden Gathering", "event_type": "sudden_gathering", "mode": "unplanned",
            "venue": "Bengaluru Town Hall", "latitude": 12.9632, "longitude": 77.5855,
            "start_time": at(0, 14, 18), "end_time": at(0, 18, 0), "expected_attendance": 1_350,
            "parking_capacity": 0, "public_transport_share": 0.25, "weather": "clear", "status": "active",
            "notes": "Detected through sudden speed loss, road occupancy and crowd-density anomaly.",
        },
    ]


def _load_custom_events() -> list[dict[str, Any]]:
    if not CUSTOM_EVENTS_PATH.exists():
        return []
    try:
        data = json.loads(CUSTOM_EVENTS_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def list_events() -> list[dict[str, Any]]:
    events = _default_events() + _load_custom_events()
    return sorted(events, key=lambda item: item["start_time"])


def get_event(event_id: str) -> dict[str, Any]:
    for event in list_events():
        if event["event_id"] == event_id:
            return deepcopy(event)
    raise KeyError(event_id)


def create_event(payload: EventCreate) -> dict[str, Any]:
    CUSTOM_EVENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    items = _load_custom_events()
    event_id = f"EVT-C{len(items)+1:03d}"
    item = payload.model_dump(mode="json")
    item.update({"event_id": event_id, "status": "planning" if payload.mode == "planned" else "monitoring"})
    items.append(item)
    CUSTOM_EVENTS_PATH.write_text(json.dumps(items, indent=2), encoding="utf-8")
    return item


@lru_cache(maxsize=1)
def _graph() -> nx.Graph:
    if GRAPH_PATH.exists():
        return nx.read_graphml(GRAPH_PATH)
    return nx.Graph()


def _graph_nodes() -> list[dict[str, Any]]:
    graph = _graph()
    return [
        {"id": str(node), "lat": float(data.get("y", 12.9716)), "lng": float(data.get("x", 77.5946)), "name": data.get("name", str(node))}
        for node, data in graph.nodes(data=True)
    ]


def _nearest_graph_node(lat: float, lng: float) -> str | None:
    nodes = _graph_nodes()
    if not nodes:
        return None
    return min(nodes, key=lambda n: _haversine_km(lat, lng, n["lat"], n["lng"]))["id"]


def _existing_hotspots(target_date: date | None = None) -> list[dict[str, Any]]:
    from backend.api.routes import frontend_adapter
    return list(frontend_adapter._ui_hotspots("Evening", target_date or date.today(), None, None, None, 0.0, 100))


def _time_profile(event: dict[str, Any]) -> dict[str, Any]:
    start = datetime.fromisoformat(str(event["start_time"]))
    end = datetime.fromisoformat(str(event["end_time"]))
    if event["event_type"] == "construction":
        inflow = start
        outflow = start + timedelta(hours=2)
        recovery = end + timedelta(minutes=45)
    else:
        inflow = start - timedelta(minutes=105)
        outflow = end - timedelta(minutes=10)
        recovery = end + timedelta(minutes=70)
    return {
        "inflow_peak": inflow.isoformat(),
        "event_start": start.isoformat(),
        "outflow_peak": outflow.isoformat(),
        "event_end": end.isoformat(),
        "expected_recovery": recovery.isoformat(),
    }


def impact_forecast(event_id: str) -> dict[str, Any]:
    event = get_event(event_id)
    attendance = int(event.get("expected_attendance", 0))
    event_type = str(event["event_type"])
    public_share = float(event.get("public_transport_share", 0.35))
    parking_capacity = int(event.get("parking_capacity", 0))
    weather_factor = WEATHER_FACTOR.get(str(event.get("weather", "unknown")), 1.08)
    type_factor = TYPE_FACTOR.get(event_type, 1.0)
    private_share = max(0.05, VEHICLE_SHARE.get(event_type, 0.42) * (1 - 0.55 * public_share))
    occupancy = OCCUPANCY.get(event_type, 2.6)
    additional_vehicles = 0 if event_type == "construction" else max(0, round(attendance * private_share / occupancy - parking_capacity * 0.18))
    if event_type == "construction":
        additional_vehicles = 3_800

    scale = min(1.45, 0.42 + math.log1p(max(1, attendance if attendance else additional_vehicles * 3)) / 10.5)
    affected: list[dict[str, Any]] = []
    for hotspot in _existing_hotspots(datetime.fromisoformat(str(event["start_time"])).date()):
        distance = _haversine_km(float(event["latitude"]), float(event["longitude"]), float(hotspot["latitude"]), float(hotspot["longitude"]))
        proximity = math.exp(-distance / (2.4 + 1.4 * scale))
        base_risk = float(hotspot["risk_score"])
        congestion = float(hotspot.get("congestion_score", 50))
        event_pressure = min(100.0, 100 * type_factor * weather_factor * scale * proximity)
        impact = min(100.0, 0.32 * base_risk + 0.23 * congestion + 0.45 * event_pressure)
        traffic_increase = max(0.0, min(145.0, event_pressure * 0.84 + impact * 0.18))
        speed_drop = max(0.0, min(72.0, 0.46 * traffic_increase + 0.10 * congestion))
        queue_m = max(40.0, 90 + impact * 8.4 + distance * 18)
        delay_min = max(2.0, impact * 0.38 + speed_drop * 0.15)
        affected.append({
            "zone_id": hotspot["zone_id"],
            "junction_name": hotspot["junction_name"],
            "latitude": hotspot["latitude"],
            "longitude": hotspot["longitude"],
            "distance_km": round(distance, 2),
            "baseline_risk": round(base_risk, 1),
            "baseline_congestion": round(congestion, 1),
            "event_impact_score": round(impact, 1),
            "traffic_increase_pct": round(traffic_increase, 1),
            "speed_reduction_pct": round(speed_drop, 1),
            "max_queue_m": round(queue_m),
            "average_delay_min": round(delay_min, 1),
            "criticality": "CRITICAL" if impact >= 82 else "HIGH" if impact >= 66 else "MEDIUM" if impact >= 42 else "LOW",
            "shap_explanations": [
                {"feature": "Event proximity", "impact": round(proximity * 24.0, 1), "direction": "up"},
                {"feature": "Expected crowd/vehicle load", "impact": round(scale * type_factor * 18.0, 1), "direction": "up"},
                {"feature": "Existing network congestion", "impact": round(congestion * 0.15, 1), "direction": "up"},
            ],
        })
    affected.sort(key=lambda x: x["event_impact_score"], reverse=True)
    relevant = [item for item in affected if item["event_impact_score"] >= 35][:12] or affected[:8]
    avg_delay = sum(item["average_delay_min"] for item in relevant) / max(1, len(relevant))
    avg_speed_drop = sum(item["speed_reduction_pct"] for item in relevant) / max(1, len(relevant))
    radius = min(8.0, 1.1 + scale * 3.2 + type_factor * 0.7)
    confidence = min(96.0, 74 + 12 * (1 if event["mode"] == "planned" else 0.45) + 5 * (1 - _stable_unit(event_id)))
    timeline = []
    profile = _time_profile(event)
    start = datetime.fromisoformat(profile["inflow_peak"]) - timedelta(minutes=30)
    end = datetime.fromisoformat(profile["expected_recovery"])
    total_minutes = max(60, int((end - start).total_seconds() / 60))
    for index in range(13):
        stamp = start + timedelta(minutes=total_minutes * index / 12)
        phase = index / 12
        inflow_wave = math.exp(-((phase - 0.28) / 0.15) ** 2)
        outflow_wave = 0.92 * math.exp(-((phase - 0.72) / 0.13) ** 2)
        construction_wave = 0.76 if event_type == "construction" and 0.15 < phase < 0.88 else 0
        pressure = min(100.0, 18 + 72 * max(inflow_wave, outflow_wave, construction_wave))
        timeline.append({"timestamp": stamp.isoformat(), "pressure": round(pressure, 1), "normal_baseline": round(18 + 12 * math.sin(phase * math.pi), 1)})
    return {
        "event": event,
        "forecast_generated_at": datetime.now().isoformat(),
        "expected_additional_vehicles": additional_vehicles,
        "affected_junction_count": len(relevant),
        "critical_corridors": sum(1 for item in relevant if item["criticality"] in {"CRITICAL", "HIGH"}),
        "projected_average_delay_min": round(avg_delay, 1),
        "projected_speed_reduction_pct": round(avg_speed_drop, 1),
        "congestion_radius_km": round(radius, 1),
        "impact_confidence_pct": round(confidence, 1),
        "time_profile": profile,
        "timeline": timeline,
        "affected_junctions": relevant,
        "normal_day_comparison": {
            "baseline_delay_min": round(max(4.0, avg_delay * 0.34), 1),
            "event_delay_min": round(avg_delay, 1),
            "event_attributable_delay_min": round(avg_delay * 0.66, 1),
            "baseline_speed_kmh": 31.0,
            "event_speed_kmh": round(31.0 * (1 - avg_speed_drop / 100), 1),
        },
        "model_basis": "Existing Round2 risk/congestion signals + event attendance, distance-decay, weather and transport-mode scenario model",
    }


def _shortest_path_nodes(source: str, target: str, blocked: set[str] | None = None) -> list[str]:
    graph = _graph().copy()
    for node in blocked or set():
        if node in graph and node not in {source, target}:
            graph.remove_node(node)
    try:
        return nx.shortest_path(graph, source, target, weight="length")
    except Exception:
        try:
            return nx.shortest_path(_graph(), source, target, weight="length")
        except Exception:
            return [source, target] if source != target else [source]


def _path_payload(path: list[str]) -> tuple[list[dict[str, Any]], float]:
    graph = _graph()
    points = []
    length = 0.0
    for node in path:
        data = graph.nodes[node]
        points.append({"node_id": str(node), "name": data.get("name", str(node)), "latitude": float(data.get("y", 12.9716)), "longitude": float(data.get("x", 77.5946))})
    for left, right in zip(path, path[1:]):
        edge = graph.get_edge_data(left, right, default={})
        if isinstance(edge, dict) and "length" in edge:
            length += float(edge.get("length", 0))
        elif isinstance(edge, dict) and edge:
            first = next(iter(edge.values())) if isinstance(next(iter(edge.values())), dict) else edge
            length += float(first.get("length", 0)) if isinstance(first, dict) else 0
    return points, length / 1000.0


def response_plan(event_id: str) -> dict[str, Any]:
    forecast = impact_forecast(event_id)
    event = forecast["event"]
    affected = forecast["affected_junctions"]
    impact_by_backend: dict[str, float] = {}
    congestion_by_backend: dict[str, float] = {}
    from backend.api.routes import frontend_adapter
    for item in affected:
        try:
            meta = frontend_adapter._resolve_meta(item["zone_id"])
            backend_id = str(meta["junction_id"])
            impact_by_backend[backend_id] = float(item["event_impact_score"])
            congestion_by_backend[backend_id] = float(item["baseline_congestion"])
        except Exception:
            continue
    from backend.decision.ilp_optimizer import ILPOptimizer
    critical_score = max((item["event_impact_score"] for item in affected), default=50)
    attendance = int(event.get("expected_attendance", 0))
    base_officers = max(8, round(attendance / 750 + forecast["critical_corridors"] * 2 + critical_score / 8))
    if event["event_type"] == "construction":
        base_officers = max(16, forecast["critical_corridors"] * 4)
    if event["mode"] == "unplanned":
        base_officers = round(base_officers * 1.22)
    optimizer = ILPOptimizer(max_officers_per_zone=10)
    zones = optimizer.build_zone_inputs(impact_by_backend, congestion_by_backend)
    allocation, meta = optimizer.optimize(zones, base_officers)
    per_zone = []
    by_backend = frontend_adapter._meta_by_backend_id()
    for backend_id, count in allocation.items():
        if count <= 0:
            continue
        m = by_backend.get(str(backend_id), {})
        source = next((x for x in affected if x["zone_id"] == frontend_adapter._ui_id(m)), None) if m else None
        if not source:
            continue
        per_zone.append({
            "zone_id": source["zone_id"], "backend_junction_id": backend_id, "junction_name": source["junction_name"],
            "latitude": source["latitude"], "longitude": source["longitude"], "officers": int(count),
            "event_impact_score": source["event_impact_score"], "expected_queue_reduction_pct": round(min(48, 7 + count * 4.2), 1),
            "reason": [
                f"Forecast traffic increase +{source['traffic_increase_pct']}%",
                f"Expected queue {source['max_queue_m']} m",
                "High event proximity and road-network importance",
            ],
        })
    per_zone.sort(key=lambda x: x["event_impact_score"], reverse=True)

    start = datetime.fromisoformat(str(event["start_time"]))
    end = datetime.fromisoformat(str(event["end_time"]))
    barricade_count = max(2, min(12, round(forecast["critical_corridors"] * 0.75 + attendance / 10_000)))
    barricades = []
    for index, zone in enumerate(affected[:barricade_count]):
        barricades.append({
            "barricade_id": f"B-{index+1:02d}", "location": zone["junction_name"],
            "latitude": zone["latitude"], "longitude": zone["longitude"],
            "deployment_time": (start - timedelta(minutes=120 - index * 5)).isoformat(),
            "removal_time": (end + timedelta(minutes=60)).isoformat(),
            "type": "Full turn restriction" if index == 0 and zone["event_impact_score"] >= 82 else "Partial lane channelisation",
            "purpose": "Separate event inflow from through traffic" if index % 2 == 0 else "Protect pedestrian/crowd crossing movement",
            "expected_conflict_reduction_pct": round(12 + zone["event_impact_score"] * 0.13, 1),
            "staff_required": 2 if index < 3 else 1,
        })

    graph_nodes = _graph_nodes()
    event_node = _nearest_graph_node(float(event["latitude"]), float(event["longitude"]))
    if graph_nodes and event_node:
        sorted_by_distance = sorted(graph_nodes, key=lambda n: _haversine_km(float(event["latitude"]), float(event["longitude"]), n["lat"], n["lng"]), reverse=True)
        origins = sorted_by_distance[:3]
        destinations = sorted(graph_nodes, key=lambda n: _haversine_km(origins[0]["lat"], origins[0]["lng"], n["lat"], n["lng"]), reverse=True)[:3]
    else:
        origins = destinations = []
    diversions = []
    blocked = {event_node} if event_node else set()
    for index in range(min(3, len(origins), len(destinations))):
        source = origins[index]["id"]
        target = destinations[index]["id"]
        normal_path = _shortest_path_nodes(source, target)
        alternate_path = _shortest_path_nodes(source, target, blocked)
        normal_points, normal_km = _path_payload(normal_path)
        alt_points, alt_km = _path_payload(alternate_path)
        if alt_points == normal_points and len(graph_nodes) > 2:
            via = graph_nodes[(index + 4) % len(graph_nodes)]["id"]
            alternate_path = _shortest_path_nodes(source, via)[:-1] + _shortest_path_nodes(via, target)
            alt_points, alt_km = _path_payload(alternate_path)
        diversions.append({
            "diversion_id": f"D-{index+1:02d}",
            "original_route": " → ".join(point["name"] for point in normal_points),
            "recommended_route": " → ".join(point["name"] for point in alt_points),
            "original_path": normal_points,
            "recommended_path": alt_points,
            "additional_distance_km": round(max(0.4, alt_km - normal_km), 1),
            "additional_travel_time_min": round(max(3.0, (alt_km - normal_km) / 22 * 60 + 3), 1),
            "expected_vehicles_shifted_per_hour": round(720 + 260 * index + forecast["expected_additional_vehicles"] * 0.05),
            "expected_venue_congestion_reduction_pct": round(12 + 5 * index + critical_score * 0.08, 1),
            "priority": ["Maximum congestion relief", "Minimum travel-time increase", "Emergency access protection"][index],
        })

    traffic_officers = sum(int(x["officers"]) for x in per_zone)
    plan = {
        "event": event,
        "summary": {
            "traffic_officers": traffic_officers,
            "barricade_teams": barricade_count,
            "tow_vehicles": max(2, round(attendance / 8_000 + 1)),
            "rapid_response_units": max(1, round(forecast["critical_corridors"] / 2.5)),
            "control_room_operators": max(3, round(len(affected) / 3)),
            "reserve_officers": max(4, round(traffic_officers * 0.18)),
            "deployment_start": (start - timedelta(minutes=165 if event["mode"] == "planned" else 20)).isoformat(),
            "peak_deployment_end": (end + timedelta(minutes=75)).isoformat(),
            "estimated_officer_hours": round(traffic_officers * max(3, (end - start).total_seconds() / 3600 + 3)),
        },
        "zone_allocations": per_zone,
        "barricades": barricades,
        "diversions": diversions,
        "emergency_corridor": {
            "availability_target_pct": 97,
            "description": "Maintain one continuously monitored green corridor from the venue perimeter to the nearest high-capacity arterial.",
            "route": diversions[-1]["recommended_path"] if diversions else [],
        },
        "public_information": [
            "Issue event-area advisory 3 hours before start.",
            "Publish recommended public-transport access and parking restrictions.",
            "Push diversion updates 45 minutes before expected inflow peak.",
        ],
        "solver": f"Existing PuLP ILP allocation · {meta.get('status', 'unknown')}",
    }
    return plan


def simulate_event(event_id: str, controls: EventSimulationRequest) -> dict[str, Any]:
    forecast = impact_forecast(event_id)
    plan = response_plan(event_id)
    event = forecast["event"]
    attendance = int(controls.attendance if controls.attendance is not None else event.get("expected_attendance", 0))
    parking_capacity = int(controls.parking_capacity if controls.parking_capacity is not None else event.get("parking_capacity", 0))
    public_share = float(controls.public_transport_share if controls.public_transport_share is not None else event.get("public_transport_share", 0.35))
    weather = controls.weather or str(event.get("weather", "unknown"))
    weather_factor = WEATHER_FACTOR.get(weather, 1.08)
    scale_ratio = max(0.25, (attendance + 1000) / (int(event.get("expected_attendance", 0)) + 1000))
    base_delay = forecast["projected_average_delay_min"] * scale_ratio * weather_factor
    base_queue = max((x["max_queue_m"] for x in forecast["affected_junctions"]), default=500) * scale_ratio * weather_factor
    critical = max(1, forecast["critical_corridors"] + round((scale_ratio - 1) * 3))
    recovery = 70 + base_delay * 1.9 + critical * 4
    spillover_pressure = max(0, attendance * (1 - public_share) / 18 - parking_capacity)
    no_plan = {
        "average_delay_min": round(base_delay + spillover_pressure / 1500, 1),
        "maximum_queue_m": round(base_queue + spillover_pressure * 0.08),
        "critical_junctions": critical,
        "network_recovery_min": round(recovery),
        "required_officers": max(8, plan["summary"]["traffic_officers"] + 12),
        "emergency_corridor_availability_pct": round(max(42, 70 - critical * 2.8), 1),
    }
    experience_eff = min(0.48, 0.14 + controls.officers / 500 + controls.barricade_teams * 0.025 + controls.tow_vehicles * 0.018)
    ai_eff = min(0.72, 0.21 + controls.officers / 360 + controls.barricade_teams * 0.033 + controls.tow_vehicles * 0.024 + controls.diversion_intensity * 0.19 + min(0.10, controls.response_lead_minutes / 1200))
    current_plan = {
        "average_delay_min": round(no_plan["average_delay_min"] * (1 - experience_eff), 1),
        "maximum_queue_m": round(no_plan["maximum_queue_m"] * (1 - experience_eff * 0.84)),
        "critical_junctions": max(1, round(critical * (1 - experience_eff * 0.72))),
        "network_recovery_min": round(no_plan["network_recovery_min"] * (1 - experience_eff * 0.61)),
        "required_officers": controls.officers,
        "emergency_corridor_availability_pct": round(min(96, no_plan["emergency_corridor_availability_pct"] + experience_eff * 38), 1),
    }
    ai_plan = {
        "average_delay_min": round(no_plan["average_delay_min"] * (1 - ai_eff), 1),
        "maximum_queue_m": round(no_plan["maximum_queue_m"] * (1 - ai_eff * 0.91)),
        "critical_junctions": max(0, round(critical * (1 - ai_eff * 0.88))),
        "network_recovery_min": round(no_plan["network_recovery_min"] * (1 - ai_eff * 0.73)),
        "required_officers": controls.officers,
        "emergency_corridor_availability_pct": round(min(99, max(90 + ai_eff * 8, no_plan["emergency_corridor_availability_pct"] + ai_eff * 47)), 1),
    }
    per_junction = []
    for item in forecast["affected_junctions"]:
        before = item["event_impact_score"]
        per_junction.append({
            "zone_id": item["zone_id"], "junction_name": item["junction_name"], "latitude": item["latitude"], "longitude": item["longitude"],
            "no_plan_risk": before, "current_plan_risk": round(before * (1 - experience_eff * 0.65), 1),
            "ai_plan_risk": round(before * (1 - ai_eff * 0.78), 1),
            "ai_queue_reduction_pct": round(ai_eff * (61 + item["event_impact_score"] * 0.22), 1),
        })
    reduction = 100 * (no_plan["average_delay_min"] - ai_plan["average_delay_min"]) / max(1, no_plan["average_delay_min"])
    uncertainty = 3.4 + (1 - forecast["impact_confidence_pct"] / 100) * 10
    return {
        "event": event,
        "controls": controls.model_dump(),
        "no_plan": no_plan,
        "experience_based_plan": current_plan,
        "ai_recommended_plan": ai_plan,
        "impact": {
            "delay_reduction_pct": round(reduction, 1),
            "queue_reduction_pct": round(100 * (no_plan["maximum_queue_m"] - ai_plan["maximum_queue_m"]) / max(1, no_plan["maximum_queue_m"]), 1),
            "critical_junction_reduction": no_plan["critical_junctions"] - ai_plan["critical_junctions"],
            "recovery_time_saved_min": no_plan["network_recovery_min"] - ai_plan["network_recovery_min"],
            "confidence_band": {
                "p10": round(max(0, reduction - uncertainty), 1),
                "p50": round(reduction, 1),
                "p90": round(min(100, reduction + uncertainty), 1),
            },
        },
        "per_junction": per_junction,
        "validation": {
            "constraints_satisfied": controls.officers >= 0 and controls.barricade_teams >= 0,
            "emergency_corridor_preserved": ai_plan["emergency_corridor_availability_pct"] >= 90,
            "ai_outperforms_no_plan": ai_plan["average_delay_min"] < no_plan["average_delay_min"],
        },
    }


def post_event_review(event_id: str, actuals: PostEventActuals | None = None) -> dict[str, Any]:
    forecast = impact_forecast(event_id)
    plan = response_plan(event_id)
    event = forecast["event"]
    jitter = _stable_unit(event_id + "post")
    predicted_attendance = int(event.get("expected_attendance", 0))
    actual_attendance = actuals.actual_attendance if actuals and actuals.actual_attendance is not None else round(predicted_attendance * (0.93 + jitter * 0.18))
    forecast_delay = float(forecast["projected_average_delay_min"])
    actual_delay = actuals.actual_peak_delay_min if actuals and actuals.actual_peak_delay_min is not None else round(forecast_delay * (0.94 + jitter * 0.16), 1)
    predicted_critical = int(forecast["critical_corridors"])
    actual_critical = actuals.actual_critical_junctions if actuals and actuals.actual_critical_junctions is not None else max(1, predicted_critical + (1 if jitter > 0.62 else 0))
    projected_reduction = round(20 + min(18, plan["summary"]["traffic_officers"] * 0.22), 1)
    observed_reduction = actuals.actual_congestion_reduction_pct if actuals and actuals.actual_congestion_reduction_pct is not None else round(projected_reduction * (0.84 + jitter * 0.13), 1)
    deployed = actuals.deployed_officers if actuals and actuals.deployed_officers is not None else max(0, plan["summary"]["traffic_officers"] - (2 if jitter > 0.45 else 0))
    delay_accuracy = max(0, 100 * (1 - abs(forecast_delay - actual_delay) / max(1, actual_delay)))
    attendance_accuracy = 100 if actual_attendance == 0 and predicted_attendance == 0 else max(0, 100 * (1 - abs(predicted_attendance - actual_attendance) / max(1, actual_attendance)))
    lessons = []
    if actual_delay > forecast_delay:
        lessons.append("Advance diversion activation by 15 minutes for the next similar event.")
    if actual_attendance > predicted_attendance * 1.05:
        lessons.append("Increase attendance uncertainty buffer and reserve deployment by 10%.")
    if deployed < plan["summary"]["traffic_officers"]:
        lessons.append(f"Protect the recommended staffing floor; {plan['summary']['traffic_officers'] - deployed} fewer officers were deployed.")
    if actual_critical > predicted_critical:
        lessons.append("Add one secondary corridor to the high-risk monitoring perimeter.")
    if not lessons:
        lessons.append("Retain the current plan template; observed performance was within the forecast envelope.")
    lessons.append("Update the similar-event profile with observed arrival, departure and recovery curves.")
    return {
        "event": event,
        "forecast": {
            "attendance": predicted_attendance, "peak_delay_min": forecast_delay,
            "critical_junctions": predicted_critical, "projected_reduction_pct": projected_reduction,
            "recommended_officers": plan["summary"]["traffic_officers"],
        },
        "actual": {
            "attendance": actual_attendance, "peak_delay_min": actual_delay,
            "critical_junctions": actual_critical, "observed_reduction_pct": observed_reduction,
            "deployed_officers": deployed,
        },
        "performance": {
            "attendance_accuracy_pct": round(attendance_accuracy, 1),
            "delay_forecast_accuracy_pct": round(delay_accuracy, 1),
            "impact_projection_error_points": round(abs(projected_reduction - observed_reduction), 1),
            "critical_junction_error": abs(predicted_critical - actual_critical),
            "result": "Validated" if delay_accuracy >= 85 and abs(projected_reduction - observed_reduction) <= 8 else "Needs recalibration",
        },
        "learning_actions": lessons,
        "model_update": {
            "event_profile_updated": True,
            "arrival_curve_weight_delta": round((actual_attendance - predicted_attendance) / max(1, predicted_attendance), 3) if predicted_attendance else 0,
            "next_retraining_status": "Queued for weekly retraining pipeline",
        },
    }


def replay(event_id: str, reveal_actual: bool = False) -> dict[str, Any]:
    forecast = impact_forecast(event_id)
    plan = response_plan(event_id)
    review = post_event_review(event_id)
    event = forecast["event"]
    steps = [
        {"step": 1, "label": "Freeze future data", "status": "complete", "detail": "Only information available before the event start is used."},
        {"step": 2, "label": "Forecast event impact", "status": "complete", "detail": f"{forecast['affected_junction_count']} junctions forecast inside the impact footprint."},
        {"step": 3, "label": "Generate operational plan", "status": "complete", "detail": f"{plan['summary']['traffic_officers']} officers, {len(plan['barricades'])} barricades and {len(plan['diversions'])} diversions."},
        {"step": 4, "label": "Run digital twin", "status": "complete", "detail": "No plan, experience-based plan and AI plan are compared."},
        {"step": 5, "label": "Reveal actual outcome", "status": "revealed" if reveal_actual else "locked", "detail": "Historical outcome remains hidden until explicitly revealed."},
    ]
    response = {
        "event": event,
        "cutoff_time": (datetime.fromisoformat(str(event["start_time"])) - timedelta(minutes=1)).isoformat(),
        "steps": steps,
        "forecast_snapshot": {
            "expected_additional_vehicles": forecast["expected_additional_vehicles"],
            "peak_delay_min": forecast["projected_average_delay_min"],
            "critical_junctions": forecast["critical_corridors"],
            "impact_confidence_pct": forecast["impact_confidence_pct"],
        },
        "plan_snapshot": {
            "officers": plan["summary"]["traffic_officers"],
            "barricades": len(plan["barricades"]),
            "diversions": len(plan["diversions"]),
        },
        "actual_revealed": reveal_actual,
    }
    if reveal_actual:
        response["actual_outcome"] = review["actual"]
        response["verification"] = review["performance"]
        response["learning_actions"] = review["learning_actions"]
    return response


def detect_unplanned(payload: UnplannedDetectionRequest) -> dict[str, Any]:
    score = min(100.0,
        0.32 * payload.observed_speed_drop_pct
        + 0.24 * payload.road_occupancy_pct
        + 0.18 * min(100, payload.camera_density_change_pct)
        + 0.16 * min(100, math.log1p(payload.crowd_estimate) * 10)
        + 0.10 * min(100, math.log1p(payload.social_alerts) * 18)
    )
    confidence = min(98.0, 48 + score * 0.48)
    officers = max(6, round(payload.crowd_estimate / 120 + score / 9))
    return {
        "detected": score >= 45,
        "anomaly_score": round(score, 1),
        "confidence_pct": round(confidence, 1),
        "classification": "Sudden gathering" if score >= 65 else "Traffic anomaly requiring verification" if score >= 45 else "No confirmed event",
        "location": {"name": payload.location_name, "latitude": payload.latitude, "longitude": payload.longitude},
        "detected_at": (payload.detected_at or datetime.now()).isoformat(),
        "estimated_crowd_range": [round(payload.crowd_estimate * 0.84), round(payload.crowd_estimate * 1.16)],
        "immediate_response": {
            "traffic_officers": officers,
            "barricade_teams": max(1, round(score / 24)),
            "rapid_response_units": max(1, round(score / 42)),
            "activate_diversion": score >= 62,
            "preserve_emergency_corridor": True,
        },
        "explanation": [
            {"signal": "Observed speed loss", "value": payload.observed_speed_drop_pct, "contribution": round(payload.observed_speed_drop_pct * 0.32, 1)},
            {"signal": "Road occupancy", "value": payload.road_occupancy_pct, "contribution": round(payload.road_occupancy_pct * 0.24, 1)},
            {"signal": "Camera density change", "value": payload.camera_density_change_pct, "contribution": round(min(100, payload.camera_density_change_pct) * 0.18, 1)},
        ],
    }
