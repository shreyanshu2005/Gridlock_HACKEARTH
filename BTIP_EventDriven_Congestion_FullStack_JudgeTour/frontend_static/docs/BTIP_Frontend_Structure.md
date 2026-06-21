# BTIP Frontend Structure
## Bengaluru Traffic Intelligence Platform — AI Command Center

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | SSR for initial load performance, file-based routing maps cleanly to the 6-page structure |
| Styling | **Tailwind CSS + CSS Variables** | Token-based dark theme, no runtime overhead |
| Map | **Deck.gl + Mapbox GL JS** | HeatmapLayer, HexagonLayer, ScatterplotLayer — all needed per spec |
| Charts | **Recharts** | P10/P50/P90 bands, sparklines, heatmap grids |
| State | **Zustand** | Lightweight global store for selected zone, active filters, simulation state |
| API | **Axios + React Query (TanStack)** | Caching, background refetch, loading/error states |
| Auth | **JWT stored in httpOnly cookie** | Backend issues 24h JWT via `POST /auth/token` |
| Icons | **Lucide React** | Consistent, tree-shakeable |

---

## Design Tokens

```css
:root {
  /* Background scale */
  --bg-base:        #0B0E14;   /* page background */
  --bg-surface:     #111827;   /* cards, panels */
  --bg-elevated:    #1A2236;   /* hover, active states */
  --bg-glass:       rgba(17,24,39,0.7); /* glassmorphism panels */

  /* Brand accents */
  --cyan:           #00D4FF;   /* primary interactive / links */
  --amber:          #FFB020;   /* warning / medium risk */
  --red:            #FF4560;   /* critical / high risk */
  --green:          #00E396;   /* safe / low risk */

  /* Text */
  --text-primary:   #F0F4FF;
  --text-secondary: #8899AA;
  --text-muted:     #4A5568;

  /* Borders */
  --border:         rgba(0,212,255,0.12);
  --border-hover:   rgba(0,212,255,0.3);

  /* Risk gradient (for badges, heatmap) */
  --risk-low:       #00E396;
  --risk-med:       #FFB020;
  --risk-high:      #FF4560;
}
```

**Typography:**
- Display / headings: `JetBrains Mono` (monospace — reinforces data-dense ops center feel; big numbers look like instrument readouts)
- Body / labels: `Inter` (clean, readable at small sizes for dense tables)
- Risk scores / KPIs: `JetBrains Mono Bold`, oversized, cyan or amber depending on level

---

## Folder Structure

```
frontend/
├── app/
│   ├── layout.tsx                  # AppShell — TopNav + SideNav wrapper
│   ├── page.tsx                    # Redirect → /overview
│   ├── (auth)/
│   │   └── login/page.tsx          # Login screen
│   ├── overview/page.tsx           # Page 1 — Executive Overview
│   ├── heatmap/page.tsx            # Page 2 — Live Heatmap
│   ├── hotspots/page.tsx           # Page 3 — Hotspot Analytics
│   ├── forecast/page.tsx           # Page 4 — Forecast Dashboard
│   ├── recommendations/page.tsx    # Page 5 — Patrol Recommendation Center
│   └── simulation/page.tsx         # Page 6 — Simulation Lab
│
├── components/
│   ├── shell/
│   │   ├── TopNav.tsx              # City selector, live clock, alert bell, user menu
│   │   ├── SideNav.tsx             # 6-page nav, collapsible, active state
│   │   └── AlertBanner.tsx         # Real-time threshold breach toasts
│   │
│   ├── shared/
│   │   ├── KPICard.tsx             # Glass card — metric + trend sparkline
│   │   ├── RiskBadge.tsx           # Color-coded LOW / MEDIUM / HIGH / CRITICAL
│   │   ├── ShapChips.tsx           # SHAP explanation chips (feature + impact bar)
│   │   ├── ConfidenceBand.tsx      # P10/P50/P90 inline display
│   │   ├── SideDrawer.tsx          # Slide-in panel for junction/zone detail
│   │   ├── FilterBar.tsx           # Date range, offence type, junction, bbox inputs
│   │   ├── DataTable.tsx           # Sortable, paginated, exportable table base
│   │   └── LoadingShimmer.tsx      # Skeleton cards for loading states
│   │
│   ├── map/
│   │   ├── BengaluruMap.tsx        # Deck.gl map wrapper with Mapbox base
│   │   ├── HeatmapLayer.tsx        # Violation density heatmap
│   │   ├── HexagonLayer.tsx        # 3D hex aggregation layer
│   │   ├── RiskScoreLayer.tsx      # Circle markers sized by risk score
│   │   ├── ForecastGhostLayer.tsx  # Ghosted next-4h projection overlay
│   │   ├── PatrolPinLayer.tsx      # Recommended deployment pins
│   │   ├── LayerToggle.tsx         # Toggle bar: Density / Risk / Congestion / Forecast
│   │   └── TimelineScrubber.tsx    # Drag-to-replay temporal animation
│   │
│   ├── charts/
│   │   ├── ForecastBandChart.tsx   # Line + P10/P50/P90 area chart
│   │   ├── ViolationTrend.tsx      # 7-day bar + sparkline
│   │   ├── OffenceDonut.tsx        # Offence type breakdown
│   │   ├── HourDayMatrix.tsx       # GitHub-contributions-style hour×day grid
│   │   ├── RiskCalendarGrid.tsx    # 7d × 4-shift risk calendar
│   │   └── BacktestAccuracy.tsx    # MAPE/RMSE tracker chart
│   │
│   ├── pages/
│   │   ├── overview/
│   │   │   ├── KPIStrip.tsx        # 5-card top strip
│   │   │   ├── CityMiniMap.tsx     # Non-interactive heatmap preview
│   │   │   └── TopZonesList.tsx    # Live-ranked top-5 zones
│   │   ├── heatmap/
│   │   │   ├── HeatmapFilterPanel.tsx
│   │   │   └── JunctionDrawer.tsx  # Junction detail side drawer
│   │   ├── hotspots/
│   │   │   ├── ClusterTable.tsx
│   │   │   ├── ClusterDetailPanel.tsx
│   │   │   └── CompareMode.tsx     # 2-cluster side-by-side
│   │   ├── forecast/
│   │   │   ├── JunctionSelector.tsx
│   │   │   ├── ModelToggle.tsx     # Prophet vs LSTM overlay
│   │   │   └── UpcomingRiskTimeline.tsx
│   │   ├── recommendations/
│   │   │   ├── RecommendationCard.tsx
│   │   │   ├── OfficerRoster.tsx   # Drag-and-drop assignment
│   │   │   └── AcceptOverrideBar.tsx
│   │   └── simulation/
│   │       ├── ControlPanel.tsx    # Zone selector, officer slider, duration
│   │       ├── ImpactMetrics.tsx   # Before/after metrics panel
│   │       ├── ScenarioManager.tsx # Save / compare scenarios
│   │       └── BeforeAfterMap.tsx  # Split-map or toggle slider
│
├── lib/
│   ├── api/
│   │   ├── client.ts               # Axios instance with JWT interceptor
│   │   ├── violations.ts           # GET /api/v1/violations
│   │   ├── hotspots.ts             # GET /api/v1/hotspots
│   │   ├── risk.ts                 # GET /api/v1/risk
│   │   ├── forecast.ts             # GET /api/v1/forecast + /risk-calendar + /top-junctions
│   │   ├── recommendations.ts      # GET /api/v1/recommendations
│   │   ├── simulation.ts           # POST /api/v1/simulation
│   │   └── auth.ts                 # POST /auth/token, GET /auth/me
│   │
│   ├── store/
│   │   ├── useFilterStore.ts       # Global filters (date, offence, bbox, junction)
│   │   ├── useMapStore.ts          # Active layer, selected zone, map viewport
│   │   ├── useSimStore.ts          # Simulation inputs + saved scenarios
│   │   └── useAuthStore.ts         # User, role, token
│   │
│   ├── hooks/
│   │   ├── useViolations.ts        # React Query wrapper
│   │   ├── useHotspots.ts
│   │   ├── useRisk.ts
│   │   ├── useForecast.ts
│   │   ├── useRecommendations.ts
│   │   └── useSimulation.ts
│   │
│   └── utils/
│       ├── riskColor.ts            # risk_score → CSS color
│       ├── formatters.ts           # number/date/duration formatters
│       └── shapLabel.ts            # SHAP feature name → readable label
│
├── types/
│   ├── violations.ts
│   ├── hotspots.ts
│   ├── risk.ts
│   ├── forecast.ts
│   ├── recommendations.ts
│   └── simulation.ts
│
└── public/
    └── bengaluru-boundary.geojson  # City boundary for map clip
```

---

## API Mapping — Backend Endpoints to Pages

### Auth
| Endpoint | Method | Used by |
|---|---|---|
| `/auth/token` | POST | `login/page.tsx` |
| `/auth/me` | GET | `TopNav.tsx` (user display) |

### Violations
| Endpoint | Method | Params | Used by |
|---|---|---|---|
| `/api/v1/violations` | GET | `date_from, date_to, junction_id, offence_type, bbox, limit, offset` | Heatmap page, Overview trend chart |

### Hotspots
| Endpoint | Method | Params | Used by |
|---|---|---|---|
| `/api/v1/hotspots` | GET | `bbox, date_from, date_to, min_persistence, limit` | Hotspot Analytics page, Overview top-zones list, Heatmap layer |

### Risk
| Endpoint | Method | Params | Used by |
|---|---|---|---|
| `/api/v1/risk` | GET | `zone_id, shift, date` | Overview KPIs, Recommendations page (risk per zone), Heatmap risk layer |

### Forecast
| Endpoint | Method | Params | Used by |
|---|---|---|---|
| `/api/v1/forecast` | GET | `junction_id, horizon (24h\|7d)` | Forecast Dashboard — band chart |
| `/api/v1/forecast/risk-calendar` | GET | `junction_id` | Forecast Dashboard — 7d×4 shift calendar grid |
| `/api/v1/forecast/top-junctions` | GET | — | Forecast Dashboard — junction selector dropdown |

### Recommendations
| Endpoint | Method | Params | Used by |
|---|---|---|---|
| `/api/v1/recommendations` | GET | `shift, date, total_officers` | Patrol Recommendation Center page |

### Simulation
| Endpoint | Method | Body | Used by |
|---|---|---|---|
| `/api/v1/simulation` | POST | `{zone_allocations, shift, date, window_hours}` | Simulation Lab page |

---

## Page-by-Page Spec

### Page 1 — Executive Overview (`/overview`)

**Layout:** 3-column grid on wide screens.

```
┌─────────────────────────────────────────────────────────────┐
│  [KPI] Violations  [KPI] Hotspots  [KPI] Officers  [KPI] Risk  [KPI] Accuracy │
├────────────────────────────┬────────────────────────────────┤
│   CityMiniMap (heatmap)    │   Top 5 Zones Needing Attention│
│   + 24h trend sparkline    │   (ranked by risk_score)       │
├──────────────────┬─────────┴───────────────────────────────┤
│ 7-day Violation  │   Offence Type Breakdown (donut chart)  │
│ Trend (bar chart)│                                         │
└──────────────────┴─────────────────────────────────────────┘
```

**API calls:**
- `GET /api/v1/violations` (last 7 days, for trend + count KPI)
- `GET /api/v1/hotspots` (for active hotspots count + top-5 list)
- `GET /api/v1/risk` (city-wide avg, current shift + today's date, iterate top zones)

---

### Page 2 — Live Heatmap (`/heatmap`)

**Layout:** Full-bleed map, filter panel left overlay, drawer on click.

```
┌──────────────────────────────────────────────────────────────┐
│ [LayerToggle: Density | Risk | Congestion | Forecast]        │
│ ┌──────────────┐  ┌───────────────────────────────────────┐  │
│ │ FilterPanel  │  │                                       │  │
│ │ - Date range │  │        BENGALURU MAPBOX MAP           │  │
│ │ - Offence    │  │      (Deck.gl HeatmapLayer)           │  │
│ │ - Station    │  │                                       │  │
│ │ - Cluster    │  │                                       │  │
│ └──────────────┘  └───────────────────────────────────────┘  │
│ ══════════════ TimelineScrubber (0h ────────────── 24h) ════ │
└──────────────────────────────────────────────────────────────┘
         ↓ click junction ↓
┌──────────────────────────────┐
│  JunctionDrawer (side panel) │
│  - Junction name + coords    │
│  - Violation count + trend   │
│  - Top offence types         │
│  - SHAP explanation chips    │
│  - [View Forecast] button    │
└──────────────────────────────┘
```

**API calls:**
- `GET /api/v1/violations` with active filters + bbox (from map viewport)
- `GET /api/v1/hotspots` for cluster overlay
- `GET /api/v1/risk` for selected junction (on click)

---

### Page 3 — Hotspot Analytics (`/hotspots`)

**Layout:** Split — table left, detail panel right.

```
┌──────────────────────┬───────────────────────────────────────┐
│  Cluster Table       │  Selected Cluster Detail              │
│  [sortable]          │  ┌─────────────────────────────────┐  │
│  - cluster_id        │  │ Mini-map: cluster shape overlay  │  │
│  - persistence score │  └─────────────────────────────────┘  │
│  - risk score        │  Hour×Day Heatmap Grid               │
│  - violation count   │  Violation Composition (donut)       │
│  - trend ↑↓          │  SHAP top drivers                   │
│  - hotspot_type badge│  [Compare with another cluster]     │
└──────────────────────┴───────────────────────────────────────┘
```

When compare mode is active, the right panel splits into two equal columns.

**API calls:**
- `GET /api/v1/hotspots` (full list, paginated)
- `GET /api/v1/violations?junction_id=...` (for selected cluster's hour×day matrix)

---

### Page 4 — Forecast Dashboard (`/forecast`)

**Layout:** Top controls, main chart, bottom calendar + accuracy.

```
┌─────────────────────────────────────────────────────────────┐
│  Junction: [dropdown from /top-junctions]   Horizon: [24h|7d] │
│  Model: [Prophet ☑  LSTM ☑]                               │
├─────────────────────────────────────────────────────────────┤
│              ForecastBandChart                              │
│    (P10 shaded area / P50 line / P90 shaded area)          │
├──────────────────────────────┬──────────────────────────────┤
│  RiskCalendarGrid            │  BacktestAccuracy            │
│  7d × 4-shift (P50 cells,    │  MAPE / RMSE tracker         │
│  colored by risk level)      │  "Predicted vs Actual"       │
└──────────────────────────────┴──────────────────────────────┘
│  Upcoming Risk Windows — 7-day horizontal timeline, color bands │
└─────────────────────────────────────────────────────────────┘
```

**API calls:**
- `GET /api/v1/forecast/top-junctions`
- `GET /api/v1/forecast?junction_id=...&horizon=...`
- `GET /api/v1/forecast/risk-calendar?junction_id=...`

---

### Page 5 — Patrol Recommendation Center (`/recommendations`)

**Layout:** Controls top, split table + map.

```
┌────────────────────────────────────────────────────────────┐
│  Shift: [Morning|Afternoon|Evening|Night]  Date: [picker]  │
│  Total Officers: [number input, 1-200]  [Generate →]       │
├───────────────────────────────┬────────────────────────────┤
│  Recommendation Cards         │  Map: PatrolPinLayer       │
│  (sorted by risk_score desc)  │  (pin size = n_officers,   │
│                               │   pin color = risk level)  │
│  Per card:                    │                            │
│  - zone_id + risk badge       │                            │
│  - n_officers recommended     │                            │
│  - expected_reduction_pct     │                            │
│  - congestion_score           │                            │
│  - SHAP chips (top 3)         │                            │
│  - RL advisory delta (+1/-1)  │                            │
│  - [✓ Accept] [✎ Override]   │                            │
│    [↔ Reassign]               │                            │
├───────────────────────────────┴────────────────────────────┤
│  Officer Roster — drag officer tiles to zone assignments   │
└────────────────────────────────────────────────────────────┘
```

**API calls:**
- `GET /api/v1/recommendations?shift=...&date=...&total_officers=...`

---

### Page 6 — Simulation Lab (`/simulation`)

**Layout:** 3-column: controls | map | metrics.

```
┌──────────────────┬─────────────────────────┬───────────────┐
│  Control Panel   │  BeforeAfterMap          │ Impact Panel  │
│                  │  (split view or toggle)  │               │
│  Zone: [select]  │                          │ Violations ▼  │
│  Officers: [0-10]│  LEFT: current state     │ 29.8%         │
│  Duration: [1-24]│  RIGHT: projected state  │               │
│  Shift: [select] │                          │ Congestion ▼  │
│  Date: [picker]  │                          │ 27.9%         │
│                  │                          │               │
│  [+ Add Zone]    │                          │ Confidence:   │
│                  │                          │ P10: 28.4%    │
│  Saved Scenarios │                          │ P50: 29.7%    │
│  [Scenario A]    │                          │ P90: 31.0%    │
│  [Scenario B]    │                          │               │
│  [Compare ▶]     │                          │ [Run ▶]       │
└──────────────────┴─────────────────────────┴───────────────┘
│  Per-junction results table (junction × before/after metrics)  │
└────────────────────────────────────────────────────────────────┘
```

**API calls:**
- `POST /api/v1/simulation` with `{zone_allocations, shift, date, window_hours}`

---

## Auth Flow

```
1. User hits any page → middleware checks JWT cookie
2. No valid JWT → redirect to /login
3. POST /auth/token (username + password form-data)
4. Backend returns { access_token, token_type }
5. Store in httpOnly cookie, redirect to /overview
6. All API calls include Authorization: Bearer <token>
7. Role-based UI: Commander (all), Officer (heatmap + recommendations read-only), Analyst (all read, no override)
```

---

## Shared State (Zustand Stores)

### `useFilterStore`
```ts
{
  dateFrom: Date | null
  dateTo: Date | null
  offenceType: string | null
  junctionId: string | null
  bbox: [number,number,number,number] | null
  shift: 'Morning' | 'Afternoon' | 'Evening' | 'Night'
  date: string  // YYYY-MM-DD
}
```

### `useMapStore`
```ts
{
  activeLayer: 'density' | 'risk' | 'congestion' | 'forecast'
  selectedZoneId: string | null
  viewport: { latitude, longitude, zoom }
  timelineHour: number  // 0-23 for scrubber
}
```

### `useSimStore`
```ts
{
  zoneAllocations: { zone_id: string; n_officers: number }[]
  windowHours: number
  scenarios: SimulationResponse[]
  compareMode: boolean
}
```

---

## Component Interaction Patterns

**Zone selection is global.** Clicking a zone on any map, table, or card sets `selectedZoneId` in `useMapStore`. The SideDrawer, detail panels, and all cross-page navigations read from this. Zone color coding uses `riskColor(risk_score)` consistently everywhere.

**Filters propagate to map bbox.** When the user pans/zooms the Heatmap map, the viewport bbox updates `useFilterStore.bbox`, which re-queries `GET /api/v1/violations` — effectively making the map a spatial filter for the table.

**SHAP chips are reusable.** Every page that shows a zone or junction renders `<ShapChips explanations={...} />` with the same visual treatment — cyan bars for positive drivers, red for negative.

**P10/P50/P90 is always shown.** `<ConfidenceBand p10={} p50={} p90={} />` appears on risk cards, forecast charts, and simulation results. Never show a point estimate alone.

---

## Environment Variables

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
```

---

## Getting Started

```bash
npx create-next-app@latest btip-frontend --typescript --tailwind --app
cd btip-frontend
npm install deck.gl @deck.gl/react @deck.gl/layers react-map-gl mapbox-gl
npm install recharts zustand @tanstack/react-query axios
npm install lucide-react
```

Then copy the folder structure above, add the design tokens to `globals.css`, and start with `AppShell → Overview page → shared KPICard component` before building outward to the data-heavy pages.
