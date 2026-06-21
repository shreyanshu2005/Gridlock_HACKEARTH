(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const formatNumber = (value) => new Intl.NumberFormat('en-IN').format(Math.round(Number(value) || 0));
  const formatPct = (value, digits = 1) => `${Number(value || 0).toFixed(digits)}%`;
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const daysAgoISO = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reduceMotion = () => document.body.classList.contains('motion-off') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLORS = {
    ink: '#10242c', sky: '#dff5ff', sky2: '#bfeaff', paper: '#f8f7ef', grass: '#54d566',
    grassDeep: '#0e823f', lime: '#b8ff3d', signal: '#ff6b45', signalDeep: '#d92816',
    electric: '#2f73ff', yellow: '#ffc928', purple: '#8f70ff', white: '#ffffff'
  };

  const JUNCTIONS = [
    ['J001', 'Silk Board', 12.9177, 77.6233, 'South-East', .93, .97],
    ['J002', 'Bellandur', 12.9258, 77.6761, 'East', .88, .89],
    ['J003', 'Hebbal Flyover', 13.0358, 77.5970, 'North', .84, .94],
    ['J004', 'Tin Factory', 13.0006, 77.6702, 'East', .81, .88],
    ['J005', 'KR Puram', 13.0098, 77.6952, 'East', .79, .86],
    ['J006', 'Marathahalli', 12.9591, 77.6974, 'East', .77, .81],
    ['J007', 'Dairy Circle', 12.9347, 77.6062, 'South', .72, .76],
    ['J008', 'Mekhri Circle', 13.0146, 77.5834, 'North', .69, .83],
    ['J009', 'Majestic', 12.9767, 77.5713, 'Central', .67, .91],
    ['J010', 'Trinity Circle', 12.9737, 77.6199, 'Central', .64, .71],
    ['J011', 'Jayadeva', 12.9166, 77.6000, 'South', .62, .72],
    ['J012', 'Corporation Circle', 12.9661, 77.5884, 'Central', .58, .75],
    ['J013', 'Yeshwanthpur', 13.0280, 77.5390, 'West', .56, .69],
    ['J014', 'Nayandahalli', 12.9422, 77.5212, 'West', .52, .62],
    ['J015', 'Banashankari', 12.9255, 77.5468, 'South-West', .49, .58],
    ['J016', 'Electronic City', 12.8399, 77.6770, 'South-East', .61, .64],
  ].map(([id, name, lat, lng, zone, base, centrality]) => ({ id, name, lat, lng, zone, base, centrality }));

  const OFFENCES = ['Signal Jumping', 'No Parking', 'Wrong Way', 'Helmet Violation', 'Speeding', 'Mobile Phone Use'];
  const SHIFTS = ['Morning', 'Afternoon', 'Evening', 'Night'];
  const SHIFT_FACTOR = { Morning: .86, Afternoon: .68, Evening: 1, Night: .48 };

  const seeded = (text) => {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return () => {
      hash += 0x6D2B79F5;
      let t = hash;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  const riskFor = (junction, shift = 'Evening', dateString = todayISO()) => {
    const rng = seeded(`${junction.id}-${shift}-${dateString}`);
    const date = new Date(`${dateString}T12:00:00`);
    const weekend = [0, 6].includes(date.getDay()) ? .88 : 1;
    const wave = .08 * Math.sin(date.getDate() * .73) + .04 * Math.cos(date.getMonth() * 2.1);
    const value = junction.base * (SHIFT_FACTOR[shift] || 1) * weekend + junction.centrality * .08 + wave + (rng() - .5) * .09;
    return clamp(value, .08, .99) * 100;
  };

  const riskLabel = (score) => score >= 82 ? 'CRITICAL' : score >= 66 ? 'HIGH' : score >= 42 ? 'MEDIUM' : 'LOW';
  const riskColor = (score) => score >= 82 ? COLORS.signal : score >= 66 ? COLORS.yellow : score >= 42 ? COLORS.grass : COLORS.electric;
  const shapFor = (junction, shift = 'Evening') => [
    { feature: 'Rush-hour overlap', impact: +(18.4 * junction.base * (shift === 'Evening' || shift === 'Morning' ? 1 : .5)).toFixed(1), direction: 'up' },
    { feature: '7-day repeat pattern', impact: +(14.2 * junction.base).toFixed(1), direction: 'up' },
    { feature: 'Network centrality', impact: +(12.5 * junction.centrality).toFixed(1), direction: 'up' },
    { feature: 'Weekend relief', impact: -3.2, direction: 'down' },
  ];

  const demoHotspots = (shift = 'Evening', dateString = todayISO()) => JUNCTIONS
    .map((junction, index) => {
      const risk = +riskFor(junction, shift, dateString).toFixed(1);
      const persistence = +(Math.min(.98, .34 + junction.base * .66)).toFixed(2);
      return {
        cluster_id: `C${String(index + 1).padStart(2, '0')}`,
        zone_id: junction.id,
        junction_id: junction.id,
        junction_name: junction.name,
        zone: junction.zone,
        centroid_lat: junction.lat,
        centroid_lng: junction.lng,
        latitude: junction.lat,
        longitude: junction.lng,
        violation_count: Math.round(710 + risk * 15 + index * 17),
        cluster_probability: +(.73 + junction.base * .25).toFixed(2),
        persistence_score: persistence,
        hotspot_type: persistence >= .72 ? 'STRUCTURAL' : 'TRANSIENT',
        risk_score: risk,
        risk_label: riskLabel(risk),
        congestion_score: +((junction.centrality * .48 + junction.base * .52) * 100).toFixed(1),
        trend_pct: +((seeded(`trend-${junction.id}`)() - .46) * 25).toFixed(1),
        top_offence_types: OFFENCES.slice(index % OFFENCES.length).concat(OFFENCES.slice(0, index % OFFENCES.length)),
        shap_explanations: shapFor(junction, shift).slice(0, 3),
      };
    }).sort((a, b) => b.risk_score - a.risk_score);

  const demoOverview = () => {
    const hotspots = demoHotspots();
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(); date.setDate(date.getDate() - (6 - index));
      const rng = seeded(`trend-${date.toISOString().slice(0, 10)}`);
      return { date: date.toISOString().slice(0, 10), label: date.toLocaleDateString('en-IN', { weekday: 'short' }), count: Math.round(1320 + rng() * 470 + index * 22) };
    });
    const offenceValues = [28.4, 21.7, 17.2, 13.8, 10.9, 8.0];
    return {
      historical_records: 298432,
      current_shift: 'Evening',
      kpis: { violations_today: trend.at(-1).count, violations_delta_pct: 8.4, active_hotspots: 12, officers_deployed: 126, city_risk: 72.4, model_accuracy: 92.8 },
      trend,
      top_zones: hotspots.slice(0, 5),
      offence_breakdown: OFFENCES.map((name, index) => ({ name, pct: offenceValues[index], count: Math.round(298432 * offenceValues[index] / 100) })),
    };
  };

  const demoRisk = (zoneId = 'J001', shift = 'Evening', dateString = todayISO()) => {
    const junction = JUNCTIONS.find((item) => item.id === zoneId) || JUNCTIONS[0];
    const score = +riskFor(junction, shift, dateString).toFixed(1);
    const p50 = +(3.8 + score * .22).toFixed(1);
    return {
      zone_id: junction.id, junction_name: junction.name, shift, date: dateString, risk_score: score,
      risk_label: riskLabel(score), confidence: +(79 + junction.centrality * 15).toFixed(1),
      predicted_violations: p50,
      confidence_band: { p10: +(p50 - 3.1).toFixed(1), p50, p90: +(p50 + 3.1).toFixed(1) },
      shap_explanations: shapFor(junction, shift),
    };
  };

  const demoForecast = (junctionId = 'J001', horizon = '24h') => {
    const junction = JUNCTIONS.find((item) => item.id === junctionId) || JUNCTIONS[0];
    const steps = horizon === '7d' ? 168 : 24;
    const now = new Date(); now.setMinutes(0, 0, 0);
    return Array.from({ length: steps }, (_, step) => {
      const stamp = new Date(now.getTime() + step * 3600000);
      const hour = stamp.getHours();
      const shift = hour >= 5 && hour < 11 ? 'Morning' : hour < 16 ? 'Afternoon' : hour < 22 ? 'Evening' : 'Night';
      const base = riskFor(junction, shift, stamp.toISOString().slice(0, 10)) * .25;
      const p50 = Math.max(1, base + 3.6 * Math.sin((hour - 6) / 24 * Math.PI * 2) + 1.8 * Math.sin(step / 10));
      const uncertainty = 2.2 + step * (steps === 168 ? .018 : .025);
      return { timestamp: stamp.toISOString(), ts: stamp.toISOString(), p10: +(Math.max(0, p50 - uncertainty)).toFixed(1), p50: +p50.toFixed(1), p90: +(p50 + uncertainty).toFixed(1), actual: step < 5 ? +(p50 + Math.sin(step) * 1.3).toFixed(1) : null };
    });
  };

  const demoCalendar = (junctionId = 'J001') => {
    const junction = JUNCTIONS.find((item) => item.id === junctionId) || JUNCTIONS[0];
    const result = [];
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(); date.setDate(date.getDate() + day);
      SHIFTS.forEach((shift) => result.push({ date: date.toISOString().slice(0, 10), day: date.toLocaleDateString('en-IN', { weekday: 'short' }), shift, risk_score: +riskFor(junction, shift, date.toISOString().slice(0, 10)).toFixed(1) }));
    }
    return result;
  };

  const demoRecommendations = (officers = 20, shift = 'Evening', dateString = todayISO()) => {
    const allocations = Object.fromEntries(JUNCTIONS.map((junction) => [junction.id, 0]));
    for (let count = 0; count < officers; count += 1) {
      let best = null;
      let bestMarginal = -Infinity;
      JUNCTIONS.forEach((junction) => {
        const allocated = allocations[junction.id];
        if (allocated >= 12) return;
        const marginal = riskFor(junction, shift, dateString) * (.55 + junction.centrality * .45) * Math.exp(-.34 * allocated);
        if (marginal > bestMarginal) { bestMarginal = marginal; best = junction; }
      });
      if (best) allocations[best.id] += 1;
    }
    const recommendations = JUNCTIONS.filter((junction) => allocations[junction.id] > 0).map((junction) => {
      const n = allocations[junction.id];
      const risk = riskFor(junction, shift, dateString);
      const reduction = (1 - Math.exp(-.31 * n)) * (.44 + junction.centrality * .16) * 100;
      return {
        zone_id: junction.id, junction_name: junction.name, zone: junction.zone, latitude: junction.lat, longitude: junction.lng,
        n_officers: n, risk_score: +risk.toFixed(1), risk_after: +(risk * (1 - reduction / 100)).toFixed(1), expected_reduction_pct: +reduction.toFixed(1),
        congestion_score: +((junction.centrality * .48 + junction.base * .52) * 100).toFixed(1), confidence: +(79 + junction.centrality * 15).toFixed(1),
        rl_advisory_delta: junction.centrality > .9 ? 1 : junction.centrality > .7 ? 0 : -1, shap_explanations: shapFor(junction, shift).slice(0, 3)
      };
    }).sort((a, b) => b.risk_score - a.risk_score);
    return { shift, date: dateString, total_officers: recommendations.reduce((sum, item) => sum + item.n_officers, 0), zones_covered: recommendations.length, solver: 'Explainable greedy ILP demo path', recommendations };
  };

  const demoSimulation = (zoneId = 'J001', officers = 20, shift = 'Evening', windowHours = 4) => {
    const allocation = { [zoneId]: officers };
    let totalBefore = 0;
    let totalAfter = 0;
    const per_junction = JUNCTIONS.map((junction) => {
      const beforeRisk = riskFor(junction, shift, todayISO());
      const beforeViolations = beforeRisk * .24 * windowHours;
      const own = allocation[junction.id] || 0;
      const focus = JUNCTIONS.find((item) => item.id === zoneId) || JUNCTIONS[0];
      const distance = Math.hypot((junction.lat - focus.lat) * 111, (junction.lng - focus.lng) * 105);
      const direct = (1 - Math.exp(-.34 * own)) * (.43 + junction.centrality * .14);
      const spillover = junction.id === zoneId ? 0 : (1 - Math.exp(-.25 * officers)) * .09 * Math.exp(-distance / 10);
      const reduction = Math.min(.72, direct + spillover);
      const afterViolations = beforeViolations * (1 - reduction);
      totalBefore += beforeViolations; totalAfter += afterViolations;
      return {
        junction_id: junction.id, junction_name: junction.name, latitude: junction.lat, longitude: junction.lng, n_officers: own,
        risk_before: +beforeRisk.toFixed(1), risk_after: +(beforeRisk * (1 - reduction * .82)).toFixed(1),
        violations_before: +beforeViolations.toFixed(1), violations_after: +afterViolations.toFixed(1), reduction_pct: +(reduction * 100).toFixed(1), spillover_received_pct: +(spillover * 100).toFixed(1)
      };
    }).sort((a, b) => b.reduction_pct - a.reduction_pct);
    const p50 = +(100 * (1 - totalAfter / totalBefore)).toFixed(1);
    return { shift, date: todayISO(), window_hours: windowHours, total_officers: officers, total_violations_before: +totalBefore.toFixed(1), total_violations_after: +totalAfter.toFixed(1), reduction_pct: p50, congestion_improvement_pct: +(p50 * .74).toFixed(1), affected_junction_count: per_junction.filter((item) => item.reduction_pct > .25).length, confidence_band: { p10: +(p50 * .91 - .4).toFixed(1), p50, p90: +(p50 * 1.09 + .4).toFixed(1) }, per_junction };
  };

  const fallbackFor = (path, options = {}) => {
    const url = new URL(path, 'http://demo.local');
    if (url.pathname === '/api/v1/overview') return demoOverview();
    if (url.pathname === '/api/v1/meta') return { city: 'Bengaluru', historical_records: 298432, junctions: JUNCTIONS.length, offence_types: OFFENCES, shifts: SHIFTS };
    if (url.pathname === '/api/v1/hotspots') return { total: JUNCTIONS.length, items: demoHotspots(url.searchParams.get('shift') || 'Evening', url.searchParams.get('date') || todayISO()) };
    if (url.pathname === '/api/v1/risk') return demoRisk(url.searchParams.get('zone_id') || 'J001', url.searchParams.get('shift') || 'Evening', url.searchParams.get('date') || todayISO());
    if (url.pathname === '/api/v1/forecast/top-junctions') return { items: JUNCTIONS.map((j) => ({ junction_id: j.id, junction_name: j.name, zone: j.zone })) };
    if (url.pathname === '/api/v1/forecast/risk-calendar') return { items: demoCalendar(url.searchParams.get('junction_id') || 'J001') };
    if (url.pathname === '/api/v1/forecast') return { items: demoForecast(url.searchParams.get('junction_id') || 'J001', url.searchParams.get('horizon') || '24h') };
    if (url.pathname === '/api/v1/recommendations') return demoRecommendations(Number(url.searchParams.get('total_officers')) || 20, url.searchParams.get('shift') || 'Evening', url.searchParams.get('date') || todayISO());
    if (url.pathname === '/api/v1/simulation') {
      const payload = JSON.parse(options.body || '{}');
      const allocation = payload.zone_allocations?.[0] || { zone_id: 'J001', n_officers: 20 };
      return demoSimulation(allocation.zone_id, allocation.n_officers, payload.shift || 'Evening', payload.window_hours || 4);
    }
    if (url.pathname === '/api/v1/violations') {
      const items = demoHotspots().map((item, index) => ({ violation_id: `DEMO-${index + 1}`, latitude: item.centroid_lat, longitude: item.centroid_lng, junction_id: item.junction_id, junction_name: item.junction_name, offence_type: OFFENCES[index % OFFENCES.length], count: Math.round(item.violation_count / 50), timestamp: new Date().toISOString() }));
      return { total: items.length, items };
    }
    throw new Error(`No fallback for ${path}`);
  };

  const storage = {
    get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { window.localStorage.setItem(key, value); } catch { /* standalone opaque origin */ } }
  };
  let storedUser = null;
  try { storedUser = JSON.parse(storage.get('btip_user') || 'null'); } catch { storedUser = null; }

  const state = {
    apiMode: 'checking', token: storage.get('btip_token') || '', user: storedUser,
    route: 'overview', overview: null, hotspots: demoHotspots(), forecast: [], recommendations: null, simulation: null,
    selectedZone: 'J001', heatmapMode: 'density', timelineHour: 18, overviewLayer: 'risk', motion: true,
    renderers: {}, forecastHorizon: '24h', tourIndex: 0,
  };

  const apiBase = location.protocol === 'file:' ? 'http://localhost:8000' : '';
  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    try {
      const response = await fetch(`${apiBase}${path}`, { ...options, headers, signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      state.apiMode = 'live';
      updateApiStatus();
      return await response.json();
    } catch (error) {
      clearTimeout(timer);
      if (path === '/auth/token') throw error;
      state.apiMode = 'demo';
      updateApiStatus();
      return fallbackFor(path, options);
    }
  }

  function updateApiStatus() {
    const element = $('#apiStatus');
    if (!element) return;
    element.textContent = state.apiMode === 'live' ? 'API LIVE' : state.apiMode === 'demo' ? 'DEMO FALLBACK' : 'CHECKING';
    element.style.color = state.apiMode === 'live' ? COLORS.grassDeep : state.apiMode === 'demo' ? COLORS.signalDeep : COLORS.ink;
  }

  function toast(title, message, type = 'info') {
    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = `<small>${type === 'error' ? 'ATTENTION' : type === 'success' ? 'SYSTEM CONFIRMATION' : 'CITY SIGNAL'}</small><strong>${title}</strong><div style="font-size:.6rem;margin-top:4px;color:var(--ink-soft)">${message}</div>`;
    $('#toastStack').append(node);
    setTimeout(() => node.remove(), 4200);
  }

  function animateValue(element, target, { decimals = 0, suffix = '', duration = 850 } = {}) {
    if (!element) return;
    if (reduceMotion()) { element.textContent = `${Number(target).toFixed(decimals)}${suffix}`; return; }
    const startValue = Number(String(element.textContent).replace(/[^0-9.-]/g, '')) || 0;
    const start = performance.now();
    const step = (now) => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const value = lerp(startValue, Number(target), eased);
      element.textContent = `${value.toFixed(decimals)}${suffix}`;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function getCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { width, height, dpr };
  }

  class CityCanvas {
    constructor(canvas, { mode = 'risk', clickable = false, onSelect = null, quiet = false } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.mode = mode;
      this.clickable = clickable;
      this.onSelect = onSelect;
      this.quiet = quiet;
      this.nodes = demoHotspots();
      this.roads = [];
      this.vehicles = [];
      this.running = true;
      this.afterData = null;
      this.selected = null;
      this.time = 0;
      this.mouse = { x: 0, y: 0, active: false };
      this._build();
      this._bind();
      this._tick = this._tick.bind(this);
      requestAnimationFrame(this._tick);
    }
    _bind() {
      const resize = () => this._build();
      this.observer = new ResizeObserver(resize); this.observer.observe(this.canvas);
      this.canvas.addEventListener('pointermove', (event) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top, active: true };
        if (this.clickable) {
          const hit = this._nearest(this.mouse.x, this.mouse.y, 28);
          this.canvas.style.cursor = hit ? 'pointer' : 'crosshair';
        }
      });
      this.canvas.addEventListener('pointerleave', () => { this.mouse.active = false; });
      if (this.clickable) this.canvas.addEventListener('click', (event) => {
        const rect = this.canvas.getBoundingClientRect();
        const hit = this._nearest(event.clientX - rect.left, event.clientY - rect.top, 34);
        if (hit && this.onSelect) this.onSelect(hit);
      });
    }
    _build() {
      const { width, height } = getCanvasSize(this.canvas);
      this.size = { width, height };
      const rng = seeded(`${this.canvas.id}-${Math.round(width)}-${Math.round(height)}`);
      this.roads = Array.from({ length: width < 500 ? 14 : 24 }, (_, index) => ({
        horizontal: index % 2 === 0,
        offset: (index + .8) / 25,
        amp: 12 + rng() * 45,
        phase: rng() * Math.PI * 2,
        thick: index % 6 === 0 ? 2.8 : 1,
        speed: .0004 + rng() * .001,
      }));
      this.vehicles = Array.from({ length: this.quiet ? 18 : 48 }, (_, index) => ({ road: index % this.roads.length, t: rng(), speed: .0007 + rng() * .0018, size: 1.2 + rng() * 2 }));
    }
    setMode(mode) { this.mode = mode; }
    setNodes(nodes) { this.nodes = nodes?.length ? nodes : demoHotspots(); }
    setAfterData(data) { this.afterData = data; }
    select(zoneId) { this.selected = zoneId; }
    _toXY(node) {
      const { width, height } = this.size;
      const lng = node.centroid_lng ?? node.longitude ?? node.lng;
      const lat = node.centroid_lat ?? node.latitude ?? node.lat;
      const x = ((lng - 77.49) / (77.72 - 77.49)) * width * .84 + width * .08;
      const y = height - (((lat - 12.82) / (13.08 - 12.82)) * height * .8 + height * .1);
      return { x, y };
    }
    _nearest(x, y, threshold) {
      let best = null; let distance = Infinity;
      this.nodes.forEach((node) => {
        const point = this._toXY(node); const d = Math.hypot(point.x - x, point.y - y);
        if (d < distance && d < threshold) { best = node; distance = d; }
      });
      return best;
    }
    _roadPoint(road, t, time) {
      const { width, height } = this.size;
      if (road.horizontal) return { x: t * width, y: road.offset * height + Math.sin(t * 8 + road.phase + time * road.speed) * road.amp };
      return { x: road.offset * width + Math.sin(t * 8 + road.phase + time * road.speed) * road.amp, y: t * height };
    }
    _drawContours(ctx, width, height, time) {
      ctx.save(); ctx.globalAlpha = .13; ctx.strokeStyle = COLORS.ink;
      for (let radius = 55; radius < Math.max(width, height) * .8; radius += 42) {
        ctx.beginPath(); ctx.ellipse(width * .66 + Math.sin(time * .0002) * 8, height * .33, radius * 1.25, radius * .72, -.22, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    _drawBuildings(ctx, width, height) {
      ctx.save(); ctx.globalAlpha = .18; ctx.strokeStyle = COLORS.ink; ctx.fillStyle = 'rgba(16,36,44,.06)';
      for (let row = 0; row < 4; row += 1) for (let col = 0; col < 7; col += 1) {
        const x = width * .06 + col * width * .135 + (row % 2) * 19; const y = height * .18 + row * height * .19;
        const w = 18 + ((col + row) % 3) * 7; const h = 12 + ((col * 2 + row) % 4) * 9;
        ctx.beginPath(); ctx.rect(x, y - h, w, h); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + 8, y - h - 6); ctx.lineTo(x + w + 8, y - h - 6); ctx.lineTo(x + w, y - h); ctx.stroke();
      }
      ctx.restore();
    }
    _draw(time) {
      const { width, height } = getCanvasSize(this.canvas); this.size = { width, height };
      const ctx = this.ctx; ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      if (this.mode === 'before') { gradient.addColorStop(0, '#ffe9c6'); gradient.addColorStop(1, '#ffb98d'); }
      else if (this.mode === 'after') { gradient.addColorStop(0, '#dff5ff'); gradient.addColorStop(1, '#a9f3bd'); }
      else { gradient.addColorStop(0, COLORS.sky); gradient.addColorStop(1, this.mode === 'violations' ? '#fff1bd' : COLORS.sky2); }
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
      this._drawContours(ctx, width, height, time); this._drawBuildings(ctx, width, height);

      this.roads.forEach((road) => {
        ctx.beginPath();
        for (let step = 0; step <= 65; step += 1) {
          const point = this._roadPoint(road, step / 65, time);
          if (!step) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
        }
        ctx.lineWidth = road.thick; ctx.strokeStyle = road.thick > 2 ? 'rgba(16,36,44,.48)' : 'rgba(16,36,44,.2)'; ctx.stroke();
      });

      if (!reduceMotion()) this.vehicles.forEach((vehicle) => {
        vehicle.t = (vehicle.t + vehicle.speed) % 1;
        const point = this._roadPoint(this.roads[vehicle.road], vehicle.t, time);
        ctx.beginPath(); ctx.arc(point.x, point.y, vehicle.size, 0, Math.PI * 2); ctx.fillStyle = this.mode === 'flow' ? COLORS.electric : COLORS.ink; ctx.fill();
      });

      const afterMap = this.afterData ? new Map(this.afterData.map((item) => [item.junction_id, item])) : null;
      this.nodes.forEach((node, index) => {
        const point = this._toXY(node); let score = Number(node.risk_score ?? 50);
        if (afterMap?.has(node.junction_id || node.zone_id)) score = afterMap.get(node.junction_id || node.zone_id).risk_after;
        if (this.mode === 'after') score *= .72;
        let color = riskColor(score);
        if (this.mode === 'flow') color = COLORS.electric;
        if (this.mode === 'congestion') color = Number(node.congestion_score || score) > 75 ? COLORS.purple : COLORS.electric;
        if (this.mode === 'forecast') color = index % 2 ? COLORS.signal : COLORS.purple;
        const pulse = reduceMotion() ? 0 : Math.sin(time * .002 + index) * 2;
        const radius = 4 + score / 10 + pulse;
        ctx.save();
        const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 3.1);
        glow.addColorStop(0, `${color}88`); glow.addColorStop(.45, `${color}33`); glow.addColorStop(1, `${color}00`);
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(point.x, point.y, radius * 3.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color; ctx.strokeStyle = COLORS.ink; ctx.lineWidth = this.selected === (node.junction_id || node.zone_id) ? 3 : 1;
        ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(4, radius * .55), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (node.n_officers) {
          ctx.fillStyle = COLORS.ink; ctx.font = '900 10px ui-monospace'; ctx.textAlign = 'center'; ctx.fillText(String(node.n_officers), point.x, point.y + 3.5);
        }
        if (this.mouse.active && Math.hypot(point.x - this.mouse.x, point.y - this.mouse.y) < 35) {
          const label = node.junction_name || node.name || node.junction_id;
          ctx.font = '800 11px system-ui'; const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(248,247,239,.95)'; ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(point.x + 12, point.y - 25, tw + 18, 24, 8); ctx.fill(); ctx.stroke();
          ctx.fillStyle = COLORS.ink; ctx.textAlign = 'left'; ctx.fillText(label, point.x + 21, point.y - 9);
        }
        ctx.restore();
      });

      if (this.mode === 'forecast') {
        ctx.save(); ctx.setLineDash([7, 7]); ctx.strokeStyle = COLORS.purple; ctx.lineWidth = 2;
        this.nodes.slice(0, 5).forEach((node, index) => {
          const p = this._toXY(node); ctx.beginPath(); ctx.arc(p.x + 12 * Math.sin(index), p.y - 9, 22 + index * 3, 0, Math.PI * 2); ctx.stroke();
        }); ctx.restore();
      }
    }
    _tick(time) { if (!this.running) return; this._draw(time); requestAnimationFrame(this._tick); }
    destroy() { this.running = false; this.observer?.disconnect(); }
  }

  function initAmbient() {
    const canvas = $('#ambientCanvas'); const ctx = canvas.getContext('2d'); let particles = [];
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rng = seeded(`ambient-${innerWidth}`); particles = Array.from({ length: innerWidth < 700 ? 18 : 42 }, (_, index) => ({ x: rng() * innerWidth, y: rng() * innerHeight, r: 1 + rng() * 3, speed: .05 + rng() * .15, phase: rng() * 6.28, color: index % 7 === 0 ? COLORS.signal : COLORS.ink }));
    };
    const draw = (time) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      particles.forEach((p) => { if (!reduceMotion()) p.x = (p.x + p.speed) % innerWidth; const y = p.y + Math.sin(time * .0006 + p.phase) * 7; ctx.beginPath(); ctx.fillStyle = `${p.color}33`; ctx.arc(p.x, y, p.r, 0, Math.PI * 2); ctx.fill(); });
      requestAnimationFrame(draw);
    };
    resize(); addEventListener('resize', resize); requestAnimationFrame(draw);
  }

  function initBoot() {
    const screen = $('#bootScreen'); const percent = $('#bootPercent'); const line = $('#bootLine'); let value = 0;
    const timer = setInterval(() => {
      value = Math.min(100, value + 7 + Math.round(Math.random() * 9)); percent.textContent = String(value).padStart(2, '0'); line.style.width = `${value}%`;
      if (value >= 100) { clearInterval(timer); setTimeout(() => screen.classList.add('is-done'), 280); }
    }, 75);
  }

  function initMicroInteractions() {
    const cursor = $('#cursorOrbit');
    if (matchMedia('(pointer:fine)').matches) {
      addEventListener('pointermove', (event) => { cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`; });
      $$('button,a,input,select,.zone-item,.data-table tr').forEach((node) => {
        node.addEventListener('pointerenter', () => cursor.classList.add('is-hover'));
        node.addEventListener('pointerleave', () => cursor.classList.remove('is-hover'));
      });
    }
    $$('.magnetic').forEach((node) => {
      node.addEventListener('pointermove', (event) => { const rect = node.getBoundingClientRect(); node.style.transform = `translate(${(event.clientX - rect.left - rect.width / 2) * .06}px,${(event.clientY - rect.top - rect.height / 2) * .06}px)`; });
      node.addEventListener('pointerleave', () => { node.style.transform = ''; });
    });
    document.addEventListener('pointermove', (event) => {
      $$('.tilt-card').forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
          const rx = ((event.clientY - rect.top) / rect.height - .5) * -6; const ry = ((event.clientX - rect.left) / rect.width - .5) * 6;
          card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
        } else card.style.transform = '';
      });
    });
    $('#motionToggle').addEventListener('click', () => {
      const off = document.body.classList.toggle('motion-off'); state.motion = !off;
      $('#motionToggle').setAttribute('aria-pressed', String(off)); $('#motionToggle span').textContent = off ? 'Motion off' : 'Motion on';
    });
  }

  function setDateInputs() {
    ['recommendDate', 'simDate'].forEach((id) => { $(`#${id}`).value = todayISO(); });
    $('#heatDateFrom').value = daysAgoISO(7); $('#heatDateTo').value = todayISO();
  }

  function populateSelects() {
    const options = JUNCTIONS.map((j) => `<option value="${j.id}">${j.name} · ${j.zone}</option>`).join('');
    ['forecastJunction', 'simZone'].forEach((id) => { $(`#${id}`).innerHTML = options; });
    $('#heatJunction').insertAdjacentHTML('beforeend', options);
    $('#heatOffence').insertAdjacentHTML('beforeend', OFFENCES.map((item) => `<option>${item}</option>`).join(''));
  }

  function updateClock() {
    const now = new Date(); $('#liveClock').textContent = now.toLocaleTimeString('en-IN', { hour12: false });
  }

  async function loadOverview() {
    const data = await api('/api/v1/overview'); state.overview = data;
    const kpis = data.kpis;
    animateValue($('[data-kpi="violations"]'), kpis.violations_today);
    $('[data-kpi-delta="violations"]').textContent = `${kpis.violations_delta_pct >= 0 ? '+' : ''}${kpis.violations_delta_pct}% vs yesterday`;
    animateValue($('[data-kpi="hotspots"]'), kpis.active_hotspots);
    animateValue($('[data-kpi="officers"]'), kpis.officers_deployed);
    animateValue($('[data-kpi="risk"]'), kpis.city_risk, { decimals: 1 });
    animateValue($('[data-kpi="accuracy"]'), kpis.model_accuracy, { decimals: 1, suffix: '%' });
    animateValue($('#heroRisk'), kpis.city_risk, { decimals: 0 });
    renderSparkBars(data.trend);
    renderTopZones(data.top_zones);
    renderTrendChart(data.trend);
    renderOffenceDonut(data.offence_breakdown);
    if (!state.renderers.overview) state.renderers.overview = new window.BTIPSatelliteMap($('#overviewMap'), { mode: 'risk', zoom: 12, clickable: true, onSelect: openZoneDrawer });
    state.renderers.overview.setNodes(data.top_zones.concat(demoHotspots().slice(5)));
    if (!state.renderers.hero) state.renderers.hero = new CityCanvas($('#heroCanvas'), { mode: 'flow', quiet: true });
  }

  function renderSparkBars(trend) {
    const max = Math.max(...trend.map((item) => item.count));
    $('#violationsSpark').innerHTML = trend.map((item) => `<i style="--h:${Math.max(18, item.count / max * 100)}%" title="${item.label}: ${formatNumber(item.count)}"></i>`).join('');
  }

  function renderTopZones(items) {
    $('#topZonesList').innerHTML = items.map((item, index) => `<div class="zone-item" data-zone="${item.zone_id}"><span class="zone-rank">${String(index + 1).padStart(2, '0')}</span><div class="zone-name"><strong>${item.junction_name}</strong><small>${item.zone} · ${item.hotspot_type}</small></div><div class="zone-score"><strong>${Math.round(item.risk_score)}</strong><span>${item.risk_label}</span></div></div>`).join('');
    $$('.zone-item', $('#topZonesList')).forEach((node) => node.addEventListener('click', () => openZoneDrawer(items.find((item) => item.zone_id === node.dataset.zone))));
  }

  function renderTrendChart(items) {
    const svg = $('#trendChart'); const width = 760; const height = 270; const margin = { l: 36, r: 20, t: 20, b: 42 };
    const max = Math.max(...items.map((item) => item.count)) * 1.12; const plotW = width - margin.l - margin.r; const plotH = height - margin.t - margin.b;
    const points = items.map((item, index) => ({ x: margin.l + index * plotW / (items.length - 1), y: margin.t + plotH - item.count / max * plotH, ...item }));
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
    const area = `${line} L${points.at(-1).x},${height - margin.b} L${points[0].x},${height - margin.b} Z`;
    const grid = Array.from({ length: 5 }, (_, index) => { const y = margin.t + index * plotH / 4; return `<line x1="${margin.l}" y1="${y}" x2="${width - margin.r}" y2="${y}" stroke="rgba(16,36,44,.12)" />`; }).join('');
    svg.innerHTML = `${grid}<path d="${area}" fill="rgba(47,115,255,.11)"/><path d="${line}" fill="none" stroke="${COLORS.electric}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="6" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="2"><title>${p.label}: ${formatNumber(p.count)}</title></circle><text x="${p.x}" y="${height - 13}" text-anchor="middle" font-size="11" font-weight="800" fill="${COLORS.inkSoft || COLORS.ink}">${p.label}</text>`).join('')}`;
    $('#trendTotal').textContent = `${formatNumber(items.reduce((sum, item) => sum + item.count, 0))} events`;
  }

  function renderOffenceDonut(items) {
    const svg = $('#offenceDonut'); const palette = [COLORS.signal, COLORS.yellow, COLORS.electric, COLORS.grass, COLORS.purple, COLORS.ink];
    const radius = 78; const circumference = 2 * Math.PI * radius; let offset = 0;
    svg.innerHTML = items.map((item, index) => {
      const length = circumference * item.pct / 100; const segment = `<circle cx="110" cy="110" r="${radius}" fill="none" stroke="${palette[index]}" stroke-width="30" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"><title>${item.name}: ${item.pct}%</title></circle>`; offset += length; return segment;
    }).join('');
    $('#offenceLegend').innerHTML = items.map((item, index) => `<div class="legend-item"><i style="--c:${palette[index]}"></i><span>${item.name}</span><strong>${item.pct}%</strong></div>`).join('');
  }

  async function loadHeatmap() {
    const data = await api('/api/v1/hotspots?shift=Evening'); state.hotspots = data.items;
    $('#visibleEventCount').textContent = formatNumber(data.items.reduce((sum, item) => sum + item.violation_count, 0));
    if (!state.renderers.heatmap) state.renderers.heatmap = new window.BTIPSatelliteMap($('#heatmapCanvas'), { mode: state.heatmapMode, zoom: 12, clickable: true, onSelect: openZoneDrawer });
    state.renderers.heatmap.setNodes(data.items);
  }

  function initHeatmapControls() {
    $$('.map-mode-tabs button').forEach((button) => button.addEventListener('click', () => {
      $$('.map-mode-tabs button').forEach((node) => node.classList.remove('is-active')); button.classList.add('is-active');
      state.heatmapMode = button.dataset.mapMode; state.renderers.heatmap?.setMode(state.heatmapMode);
      $('#ghostLabel').style.display = state.heatmapMode === 'forecast' || $('#ghostToggle').checked ? '' : 'none';
    }));
    $('#timelineRange').addEventListener('input', (event) => { state.timelineHour = Number(event.target.value); $('#timelineLabel').textContent = `${String(state.timelineHour).padStart(2, '0')}:00`; state.renderers.heatmap?.setHour(state.timelineHour); });
    let timelineTimer = null;
    $('#timelinePlay').addEventListener('click', () => {
      if (timelineTimer) { clearInterval(timelineTimer); timelineTimer = null; $('#timelinePlay').textContent = '▶'; return; }
      $('#timelinePlay').textContent = 'Ⅱ'; timelineTimer = setInterval(() => {
        state.timelineHour = (state.timelineHour + 1) % 24; $('#timelineRange').value = state.timelineHour; $('#timelineLabel').textContent = `${String(state.timelineHour).padStart(2, '0')}:00`; state.renderers.heatmap?.setHour(state.timelineHour);
      }, 650);
    });
    $('#ghostToggle').addEventListener('change', (event) => { $('#ghostLabel').style.display = event.target.checked ? '' : 'none'; state.renderers.heatmap?.setGhost(event.target.checked); });
    $('#clusterToggle').addEventListener('change', (event) => state.renderers.heatmap?.setClusterBoundaries(event.target.checked));
    $('#resetFilters').addEventListener('click', () => { $('#heatDateFrom').value = daysAgoISO(7); $('#heatDateTo').value = todayISO(); $('#heatOffence').value = ''; $('#heatJunction').value = ''; $('#clusterToggle').checked = true; $('#ghostToggle').checked = true; state.renderers.heatmap?.setNodes(state.hotspots); state.renderers.heatmap?.setClusterBoundaries(true); state.renderers.heatmap?.setGhost(true); state.renderers.heatmap?.setView({ lat: 12.9716, lng: 77.5946 }, 12); toast('Filters reset', 'The satellite map is showing the complete Bengaluru demo window.'); });
    ['heatDateFrom', 'heatDateTo', 'heatOffence', 'heatJunction'].forEach((id) => $(`#${id}`).addEventListener('change', async () => {
      const query = new URLSearchParams({ date_from: $('#heatDateFrom').value, date_to: $('#heatDateTo').value, junction_id: $('#heatJunction').value, offence_type: $('#heatOffence').value, limit: '500' });
      const data = await api(`/api/v1/violations?${query}`); $('#visibleEventCount').textContent = formatNumber(data.total); const selectedJunction = $('#heatJunction').value; const visibleNodes = selectedJunction ? state.hotspots.filter((item) => item.junction_id === selectedJunction || item.zone_id === selectedJunction) : state.hotspots; state.renderers.heatmap?.setNodes(visibleNodes); if (selectedJunction && visibleNodes[0]) state.renderers.heatmap?.focus(visibleNodes[0], 14); toast('Satellite map refreshed', `${formatNumber(data.total)} aggregated events match the current filters.`);
    }));
  }

  async function openZoneDrawer(zone) {
    if (!zone) return;
    const zoneId = zone.zone_id || zone.junction_id || zone.id; state.selectedZone = zoneId;
    const risk = await api(`/api/v1/risk?zone_id=${zoneId}&shift=Evening&date=${todayISO()}`);
    const junction = JUNCTIONS.find((item) => item.id === zoneId) || JUNCTIONS[0];
    $('#drawerCluster').textContent = zone.cluster_id || `C${String(JUNCTIONS.indexOf(junction) + 1).padStart(2, '0')}`;
    $('#drawerZoneId').textContent = zoneId; $('#drawerTitle').textContent = risk.junction_name || junction.name; $('#drawerCoords').textContent = `${junction.lat.toFixed(4)}° N · ${junction.lng.toFixed(4)}° E`;
    $('#drawerRisk').textContent = Math.round(risk.risk_score); $('.drawer-risk b').textContent = risk.risk_label; $('#drawerP10').textContent = risk.confidence_band.p10; $('#drawerP50').textContent = risk.confidence_band.p50; $('#drawerP90').textContent = risk.confidence_band.p90;
    renderShap($('#drawerShap'), risk.shap_explanations);
    const rng = seeded(`drawer-${zoneId}`); $('#drawerMiniTrend').innerHTML = Array.from({ length: 14 }, () => `<i style="--h:${25 + rng() * 72}%"></i>`).join('');
    $('#forecastJunction').value = zoneId; state.renderers.heatmap?.select(zoneId); state.renderers.overview?.select(zoneId);
    $('#zoneDrawer').classList.add('is-open'); $('#zoneDrawer').setAttribute('aria-hidden', 'false'); $('#drawerBackdrop').classList.add('is-open');
  }

  function closeDrawer() { $('#zoneDrawer').classList.remove('is-open'); $('#zoneDrawer').setAttribute('aria-hidden', 'true'); $('#drawerBackdrop').classList.remove('is-open'); }

  function renderShap(container, items) {
    const max = Math.max(...items.map((item) => Math.abs(item.impact)), 1);
    container.innerHTML = items.map((item) => { const color = item.direction === 'down' ? COLORS.electric : COLORS.signal; return `<div class="shap-item"><span>${item.feature}</span><b style="--direction:${color}">${item.impact > 0 ? '+' : ''}${item.impact}</b><div class="shap-track"><i style="--w:${Math.abs(item.impact) / max * 100}%;--direction:${color}"></i></div></div>`; }).join('');
  }

  async function loadHotspots() {
    const persistence = Number($('#persistenceFilter')?.value || 0); const data = await api(`/api/v1/hotspots?shift=Evening&min_persistence=${persistence}`); state.hotspots = data.items;
    renderClusterTable(); $('#clusterCount').textContent = `${data.items.length} clusters`;
    if (data.items.length) renderClusterDetail(data.items[0]);
    if (!state.renderers.cluster) state.renderers.cluster = new window.BTIPSatelliteMap($('#clusterCanvas'), { mode: 'risk', zoom: 14, quiet: true });
    state.renderers.cluster.setNodes(data.items); if (data.items.length) state.renderers.cluster.focus(data.items[0], 14);
  }

  function renderClusterTable() {
    const search = ($('#clusterSearch')?.value || '').toLowerCase();
    const items = state.hotspots.filter((item) => !search || `${item.junction_name} ${item.zone}`.toLowerCase().includes(search));
    $('#clusterTableBody').innerHTML = items.map((item, index) => `<tr data-zone="${item.zone_id}" class="${index === 0 ? 'is-selected' : ''}"><td>${String(index + 1).padStart(2, '0')}</td><td><strong>${item.junction_name}</strong><br><small>${item.cluster_id} · ${item.zone}</small></td><td><div class="persistence-bar"><i><b style="--p:${item.persistence_score * 100}%"></b></i><span>${item.persistence_score}</span></div></td><td><span class="risk-pill" style="--c:${riskColor(item.risk_score)}">${Math.round(item.risk_score)} ${item.risk_label}</span></td><td>${formatNumber(item.violation_count)}</td><td class="${item.trend_pct >= 0 ? 'trend-up' : 'trend-down'}">${item.trend_pct >= 0 ? '↗' : '↘'} ${Math.abs(item.trend_pct)}%</td></tr>`).join('');
    $$('#clusterTableBody tr').forEach((row) => row.addEventListener('click', () => { $$('#clusterTableBody tr').forEach((item) => item.classList.remove('is-selected')); row.classList.add('is-selected'); renderClusterDetail(state.hotspots.find((item) => item.zone_id === row.dataset.zone)); }));
  }

  function renderClusterDetail(item) {
    if (!item) return;
    $('#clusterDetailName').textContent = item.junction_name; $('#clusterDetailMeta').textContent = `${item.cluster_id} · ${item.hotspot_type} HOTSPOT`; $('#clusterDetailRisk').textContent = Math.round(item.risk_score);
    $('#detailPersistence').textContent = item.persistence_score; $('#detailViolations').textContent = formatNumber(item.violation_count); $('#detailCongestion').textContent = Math.round(item.congestion_score);
    renderShap($('#clusterShap'), item.shap_explanations || shapFor(JUNCTIONS.find((j) => j.id === item.zone_id)));
    const rng = seeded(`matrix-${item.zone_id}`); $('#hourDayMatrix').innerHTML = Array.from({ length: 84 }, (_, index) => `<i style="--v:${Math.round((.15 + rng() * .85) * 100)}%" title="Day ${Math.floor(index / 12) + 1}, block ${index % 12 + 1}"></i>`).join('');
    state.renderers.cluster?.select(item.zone_id, { focus: true });
  }

  async function loadForecast() {
    const junctionId = $('#forecastJunction').value || state.selectedZone || 'J001'; const horizon = state.forecastHorizon;
    const [forecastData, calendarData] = await Promise.all([api(`/api/v1/forecast?junction_id=${junctionId}&horizon=${horizon}`), api(`/api/v1/forecast/risk-calendar?junction_id=${junctionId}`)]);
    state.forecast = forecastData.items; const junction = JUNCTIONS.find((item) => item.id === junctionId) || JUNCTIONS[0]; $('#forecastTitle').textContent = `${junction.name} pressure forecast.`;
    renderForecastChart(forecastData.items, horizon); renderRiskCalendar(calendarData.items); renderRiskTimeline(calendarData.items);
  }

  function renderForecastChart(items, horizon) {
    const svg = $('#forecastChart'); const width = 1040; const height = 430; const margin = { l: 52, r: 28, t: 25, b: 50 };
    const sample = horizon === '7d' ? items.filter((_, index) => index % 4 === 0) : items; const max = Math.max(...sample.map((item) => item.p90)) * 1.12; const plotW = width - margin.l - margin.r; const plotH = height - margin.t - margin.b;
    const points = sample.map((item, index) => ({ x: margin.l + index * plotW / Math.max(1, sample.length - 1), y10: margin.t + plotH - item.p10 / max * plotH, y50: margin.t + plotH - item.p50 / max * plotH, y90: margin.t + plotH - item.p90 / max * plotH, ...item }));
    const path = (key) => points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point[key]}`).join(' ');
    const area = `${path('y90')} ${points.slice().reverse().map((point) => `L${point.x},${point.y10}`).join(' ')} Z`;
    const actualPoints = points.filter((p) => p.actual != null).map((p) => ({ x: p.x, y: margin.t + plotH - p.actual / max * plotH }));
    const actualPath = actualPoints.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
    const grid = Array.from({ length: 5 }, (_, index) => { const y = margin.t + index * plotH / 4; return `<line x1="${margin.l}" y1="${y}" x2="${width - margin.r}" y2="${y}" stroke="rgba(255,255,255,.13)"/><text x="${margin.l - 12}" y="${y + 4}" text-anchor="end" fill="#a9bdc4" font-size="10">${Math.round(max * (1 - index / 4))}</text>`; }).join('');
    const labels = points.filter((_, index) => index % Math.ceil(points.length / 6) === 0).map((p) => `<text x="${p.x}" y="${height - 20}" text-anchor="middle" fill="#a9bdc4" font-size="10">${new Date(p.timestamp).toLocaleString('en-IN', horizon === '7d' ? { weekday: 'short', hour: '2-digit' } : { hour: '2-digit' })}</text>`).join('');
    svg.innerHTML = `${grid}<path d="${area}" fill="rgba(255,107,69,.19)"/><path d="${path('y90')}" fill="none" stroke="rgba(255,107,69,.45)" stroke-width="2"/><path d="${path('y10')}" fill="none" stroke="rgba(255,107,69,.45)" stroke-width="2"/><path d="${path('y50')}" fill="none" stroke="${COLORS.lime}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${actualPath ? `<path d="${actualPath}" fill="none" stroke="#8198a0" stroke-width="3" stroke-dasharray="7 6"/>` : ''}<line x1="${points[Math.min(4, points.length - 1)].x}" y1="${margin.t}" x2="${points[Math.min(4, points.length - 1)].x}" y2="${height - margin.b}" stroke="rgba(255,255,255,.45)" stroke-dasharray="5 6"/>${labels}`;
  }

  function renderRiskCalendar(items) {
    const grouped = Object.groupBy ? Object.groupBy(items, (item) => item.date) : items.reduce((acc, item) => ((acc[item.date] ||= []).push(item), acc), {});
    const dates = Object.keys(grouped); let html = '<div></div>' + SHIFTS.map((shift) => `<div class="calendar-head">${shift.slice(0, 3).toUpperCase()}</div>`).join('');
    dates.forEach((date) => { const dayItems = grouped[date]; html += `<div class="calendar-cell is-label"><strong>${dayItems[0].day}</strong><small>${date.slice(5)}</small></div>`; SHIFTS.forEach((shift) => { const item = dayItems.find((entry) => entry.shift === shift); html += `<div class="calendar-cell" style="--c:${riskColor(item.risk_score)}" title="${shift}: ${item.risk_score}">${Math.round(item.risk_score)}</div>`; }); });
    $('#riskCalendar').innerHTML = html;
  }

  function renderRiskTimeline(items) {
    const evening = items.filter((item) => item.shift === 'Evening');
    $('#riskTimeline').innerHTML = evening.map((item) => `<div class="timeline-row"><strong>${item.day}</strong><i><b style="--x:${clamp(item.risk_score, 0, 100)}%"></b></i><span>${Math.round(item.risk_score)}</span></div>`).join('');
  }

  async function loadRecommendations() {
    const officers = Number($('#recommendOfficers').value); const shift = $('#recommendShift').value; const dateString = $('#recommendDate').value || todayISO();
    $('#recommendationFeed').innerHTML = '<div class="loading-card"></div><div class="loading-card"></div><div class="loading-card"></div>';
    const data = await api(`/api/v1/recommendations?shift=${shift}&date=${dateString}&total_officers=${officers}`); state.recommendations = data; renderRecommendations(data);
  }

  function renderRecommendations(data) {
    $('#coveredZones').textContent = `${data.zones_covered} zones`; $('#allocationSummary').textContent = `${data.total_officers} officers across ${data.zones_covered} zones`;
    $('#recommendationFeed').innerHTML = data.recommendations.map((item, index) => `<article class="recommend-card" data-rank="${String(index + 1).padStart(2, '0')}" data-zone="${item.zone_id}"><div class="recommend-card-head"><div><small>${item.zone_id} · ${item.zone}</small><h3>${item.junction_name}</h3><span class="risk-pill" style="--c:${riskColor(item.risk_score)}">${Math.round(item.risk_score)} ${riskLabel(item.risk_score)}</span></div><div class="officer-badge"><strong>${item.n_officers}</strong><span>OFFICERS</span></div></div><div class="risk-shift"><div><small>RISK BEFORE</small><strong>${Math.round(item.risk_score)}</strong></div><div><small>RISK AFTER</small><strong class="risk-arrow">${Math.round(item.risk_after)} ↘</strong></div><div><small>REDUCTION</small><strong>${item.expected_reduction_pct}%</strong></div></div><button class="reason-toggle" type="button"><span>WHY THIS ZONE?</span><b>＋</b></button><div class="recommend-reasons shap-list"></div><div class="recommend-actions"><button type="button" data-action="accept">✓ Accept</button><button type="button" data-action="override">✎ Override</button><button type="button" data-action="inspect">◎ Inspect</button></div></article>`).join('');
    $$('.recommend-card').forEach((card) => {
      const item = data.recommendations.find((entry) => entry.zone_id === card.dataset.zone); renderShap($('.recommend-reasons', card), item.shap_explanations);
      $('.reason-toggle', card).addEventListener('click', () => { card.classList.toggle('is-open'); $('.reason-toggle b', card).textContent = card.classList.contains('is-open') ? '−' : '＋'; });
      $('[data-action="accept"]', card).addEventListener('click', (event) => { event.currentTarget.classList.toggle('is-accepted'); event.currentTarget.textContent = event.currentTarget.classList.contains('is-accepted') ? '✓ Accepted' : '✓ Accept'; toast('Allocation updated', `${item.n_officers} officers assigned to ${item.junction_name}.`, 'success'); });
      $('[data-action="override"]', card).addEventListener('click', () => toast('Override mode', 'Drag-and-drop reassignment is represented in the officer roster below.'));
      $('[data-action="inspect"]', card).addEventListener('click', () => openZoneDrawer({ ...item, cluster_id: `C${String(JUNCTIONS.findIndex((j) => j.id === item.zone_id) + 1).padStart(2, '0')}` }));
    });
    const nodes = data.recommendations.map((item) => ({ ...item, junction_id: item.zone_id, centroid_lat: item.latitude, centroid_lng: item.longitude }));
    if (!state.renderers.deployment) state.renderers.deployment = new window.BTIPSatelliteMap($('#deploymentCanvas'), { mode: 'deployment', zoom: 12, clickable: true, onSelect: openZoneDrawer });
    state.renderers.deployment.setNodes(nodes); state.renderers.deployment.fitNodes(nodes);
    $('#officerTiles').innerHTML = data.recommendations.map((item) => `<div class="officer-tile" style="--c:${riskColor(item.risk_score)}"><strong>${item.n_officers}</strong>${item.junction_name}</div>`).join('');
  }

  async function runSimulation(silent = false) {
    const zoneId = $('#simZone').value || 'J001'; const officers = Number($('#simOfficers').value); const shift = $('#simShift').value; const dateString = $('#simDate').value || todayISO(); const windowHours = Number($('#simDuration').value);
    const button = $('#runSimulation'); button.disabled = true; $('#runSimulation span').textContent = 'RUNNING 100 SCENARIOS…';
    const payload = { zone_allocations: [{ zone_id: zoneId, n_officers: officers }], shift, date: dateString, window_hours: windowHours };
    const data = await api('/api/v1/simulation', { method: 'POST', body: JSON.stringify(payload) }); state.simulation = data;
    renderSimulation(data, zoneId); button.disabled = false; $('#runSimulation span').textContent = 'Run digital twin'; if (!silent) toast('Digital twin complete', `${data.reduction_pct}% projected violation reduction.`, 'success');
  }

  function renderSimulation(data, zoneId) {
    animateValue($('#impactReduction'), data.reduction_pct, { decimals: 1 }); animateValue($('#impactCongestion'), data.congestion_improvement_pct, { decimals: 1 }); animateValue($('#impactJunctions'), data.affected_junction_count);
    $('#impactP10').textContent = formatPct(data.confidence_band.p10); $('#impactP50').textContent = formatPct(data.confidence_band.p50); $('#impactP90').textContent = formatPct(data.confidence_band.p90);
    const focusResult = data.per_junction.find((item) => item.junction_id === zoneId) || data.per_junction[0]; $('#beforeRisk').textContent = Math.round(focusResult.risk_before); $('#afterRisk').textContent = Math.round(focusResult.risk_after);
    $('#impactPlainText').textContent = `This allocation is expected to reduce the sharpest pressure at ${focusResult.junction_name} while spreading relief to ${Math.max(0, data.affected_junction_count - 1)} nearby junctions.`;
    $('#simulationTable').innerHTML = data.per_junction.slice(0, 16).map((item) => `<tr><td><strong>${item.junction_name}</strong><br><small>${item.junction_id}</small></td><td>${item.n_officers}</td><td>${item.risk_before}</td><td>${item.risk_after}</td><td class="trend-down">↘ ${item.reduction_pct}%</td><td>${item.spillover_received_pct}%</td></tr>`).join('');
    const simulationByJunction = new Map(data.per_junction.map((item) => [item.junction_id, item]));
    const baseNodes = demoHotspots().map((node) => ({ ...node, n_officers: simulationByJunction.get(node.junction_id)?.n_officers || 0 }));
    if (!state.renderers.before) state.renderers.before = new window.BTIPSatelliteMap($('#beforeMap'), { mode: 'before', zoom: 12, quiet: false });
    if (!state.renderers.after) state.renderers.after = new window.BTIPSatelliteMap($('#afterMap'), { mode: 'after', zoom: 12, quiet: false }); if (!state.renderers.before.syncPeers.has(state.renderers.after)) state.renderers.before.syncWith(state.renderers.after);
    state.renderers.before.setNodes(baseNodes); state.renderers.after.setNodes(baseNodes); state.renderers.after.setAfterData(data.per_junction);
  }

  function initCompareHandle() {
    const handle = $('#compareHandle'); const panel = handle.parentElement; let dragging = false;
    const update = (clientX) => { const rect = panel.getBoundingClientRect(); const pct = clamp((clientX - rect.left) / rect.width * 100, 5, 95); handle.style.left = `${pct}%`; $('#afterMapClip').style.clipPath = `inset(0 0 0 ${pct}%)`; };
    handle.addEventListener('pointerdown', (event) => { dragging = true; handle.setPointerCapture(event.pointerId); });
    handle.addEventListener('pointermove', (event) => { if (dragging) update(event.clientX); });
    handle.addEventListener('pointerup', () => { dragging = false; });
    panel.addEventListener('pointerdown', (event) => { if (event.target === panel) update(event.clientX); });
  }

  function exportSimulationCSV() {
    if (!state.simulation) return toast('No simulation to export', 'Run the digital twin first.', 'error');
    const rows = [['junction_id', 'junction_name', 'officers', 'risk_before', 'risk_after', 'reduction_pct', 'spillover_pct'], ...state.simulation.per_junction.map((item) => [item.junction_id, item.junction_name, item.n_officers, item.risk_before, item.risk_after, item.reduction_pct, item.spillover_received_pct])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `btip-simulation-${todayISO()}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  async function showRoute(route, { transition = true } = {}) {
    const valid = ['overview', 'heatmap', 'hotspots', 'forecast', 'recommendations', 'simulation']; route = valid.includes(route) ? route : 'overview';
    if (transition && route !== state.route && !reduceMotion()) { $('#pageCurtain').classList.remove('is-changing'); void $('#pageCurtain').offsetWidth; $('#pageCurtain').classList.add('is-changing'); await sleep(310); }
    state.route = route; $$('.app-page').forEach((page) => page.classList.toggle('is-active', page.dataset.page === route)); $$('.nav-item,.mobile-nav a').forEach((item) => item.classList.toggle('is-active', item.dataset.route === route));
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    if (route === 'overview') await loadOverview();
    if (route === 'heatmap') await loadHeatmap();
    if (route === 'hotspots') await loadHotspots();
    if (route === 'forecast') await loadForecast();
    if (route === 'recommendations') await loadRecommendations();
    if (route === 'simulation') { if (!state.simulation) runSimulation(true); }
    updateCourier(route);
  }

  function routeFromHash() { return (location.hash.replace(/^#\/?/, '').split('?')[0] || 'overview').toLowerCase(); }
  async function onHashChange() { await showRoute(routeFromHash()); }

  function updateCourier(route) {
    const messages = {
      overview: ['I found a stronger-than-usual evening pattern near Silk Board. Open the live map to inspect it.', '#/heatmap', 'SHOW THE SIGNAL'],
      heatmap: ['The forecast ghost layer shows pressure expanding east over the next four hours.', '#/forecast', 'OPEN FORECAST'],
      hotspots: ['Structural hotspots repeat across months. They deserve infrastructure attention, not only temporary patrols.', '#/recommendations', 'BUILD A PLAN'],
      forecast: ['The confidence band widens over time. BTIP keeps uncertainty visible instead of hiding it.', '#/simulation', 'TEST A DECISION'],
      recommendations: ['The safe optimizer path is explainable and always available; the advisory layer can refine it.', '#/simulation', 'RUN THE TWIN'],
      simulation: ['Drag the divider to compare today with the projected city after deployment.', '#/simulation', 'COMPARE STATES'],
    };
    const [message, href, label] = messages[route]; $('#courierMessage').textContent = message; $('#courierAction').dataset.href = href; $('#courierAction').firstChild.textContent = `${label} `;
  }

  function initCourier() {
    $('#courierToggle').addEventListener('click', () => $('#signalCourier').classList.toggle('is-open')); $('#courierClose').addEventListener('click', () => $('#signalCourier').classList.remove('is-open'));
    $('#courierAction').addEventListener('click', () => { location.hash = $('#courierAction').dataset.href; $('#signalCourier').classList.remove('is-open'); });
    if (innerWidth > 720) setTimeout(() => $('#signalCourier').classList.add('is-open'), 4800);
  }

  function initCommandPalette() {
    const commands = [
      ['Go to Executive Overview', 'overview', '01'], ['Open Live Heatmap', 'heatmap', '02'], ['Inspect Hotspot Analytics', 'hotspots', '03'], ['Open Forecast Dashboard', 'forecast', '04'], ['Generate Patrol Recommendations', 'recommendations', '05'], ['Run Digital Twin', 'simulation', '06'], ['Open Event Command Centre', 'events', '07'], ['Open Event Impact Map', 'event-map', '08'], ['Open Ops Plan', 'event-plan', '09'], ['Open Event Twin', 'event-twin', '10'], ['Open Post-Event Learning', 'post-event', '11'], ['Open Historical Event Replay', 'event-replay', '12'], ['Start Judge Tour', 'tour', '▶'], ['Toggle Motion', 'motion', '◌'], ['Sign in as Operator', 'login', '↗']
    ];
    const palette = $('#commandPalette'); const input = $('#commandInput');
    const render = () => { const term = input.value.toLowerCase(); $('#commandResults').innerHTML = commands.filter(([label]) => label.toLowerCase().includes(term)).map(([label, action, key]) => `<button class="command-result" data-command="${action}"><span>${label}</span><small>${key}</small></button>`).join(''); $$('.command-result').forEach((node) => node.addEventListener('click', () => executeCommand(node.dataset.command))); };
    const open = () => { palette.classList.add('is-open'); input.value = ''; render(); setTimeout(() => input.focus(), 30); };
    const close = () => palette.classList.remove('is-open');
    const executeCommand = (action) => { close(); if (['overview', 'heatmap', 'hotspots', 'forecast', 'recommendations', 'simulation', 'events', 'event-map', 'event-plan', 'event-twin', 'post-event', 'event-replay'].includes(action)) location.hash = `#/${action}`; else if (action === 'tour') startTour(); else if (action === 'motion') $('#motionToggle').click(); else if (action === 'login') $('#loginDialog').showModal(); };
    $('#commandButton').addEventListener('click', open); input.addEventListener('input', render); palette.addEventListener('click', (event) => { if (event.target === palette) close(); });
    addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(); } if (event.key === 'Escape') close(); });
  }

  function initAuth() {
    const dialog = $('#loginDialog'); $('#operatorButton').addEventListener('click', () => dialog.showModal());
    $('#loginForm').addEventListener('submit', async (event) => {
      event.preventDefault(); $('#loginError').textContent = ''; const username = $('#loginUsername').value.trim(); const password = $('#loginPassword').value;
      try {
        const result = await api('/auth/token', { method: 'POST', body: JSON.stringify({ username, password }) }); state.token = result.access_token; state.user = result.user; storage.set('btip_token', state.token); storage.set('btip_user', JSON.stringify(state.user)); updateOperator(); dialog.close(); toast('Access granted', `${state.user.name} entered as ${state.user.role}.`, 'success');
      } catch (error) { $('#loginError').textContent = 'Invalid credentials or backend is not running. Demo mode remains available.'; }
    });
    updateOperator();
  }

  function updateOperator() {
    if (!state.user) { $('#operatorName').textContent = 'Demo Commander'; $('#operatorAvatar').textContent = 'DC'; return; }
    $('#operatorName').textContent = state.user.name; $('#operatorAvatar').textContent = state.user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  }

  const TOUR = [
    ['overview', '1 · City operating picture', 'Start here. This proves BTIP is not only a map: it summarizes current congestion risk, high-pressure zones, officer readiness and model confidence before any decision is made.'],
    ['heatmap', '2 · Live satellite heatmap', 'Use this to show where traffic pressure is physically happening on Bengaluru roads. Switch density, risk, congestion and forecast layers to connect raw signals with operational intelligence.'],
    ['hotspots', '3 · Persistent congestion patterns', 'This page separates repeated structural hotspots from one-time spikes so judges can see the system prioritizes repeatable evidence, not random heat blobs.'],
    ['forecast', '4 · Predict the next breakdown', 'The forecast page shows P10/P50/P90 uncertainty. Explain that the system forecasts risk windows before deploying manpower.'],
    ['recommendations', '5 · Manpower optimization', 'The recommendation centre turns predictions into officer allocations, expected risk reduction and explainable SHAP-style reasons for each selected zone.'],
    ['simulation', '6 · Original traffic digital twin', 'Before changing the city, BTIP compares today with a projected after-state and shows uncertainty, spillover relief and junction-level impact.'],
    ['events', '7 · Event Command Centre', 'Now the event-driven problem starts. Select planned or unplanned events such as rallies, sports matches, festivals, construction, VIP movements or sudden gatherings.'],
    ['event-map', '8 · Event impact forecast map', 'This is the main event-impact proof. Show affected junctions, critical corridors, additional vehicles, speed reduction, delay and the Event Impact Index on the satellite map.'],
    ['event-plan', '9 · Operational response plan', 'BTIP generates manpower, barricading, diversion routes, public information and emergency-corridor actions instead of leaving deployment to experience alone.'],
    ['event-plan', '10 · Barricades and diversions', 'Use the plan tabs to show where barricades go, when they are installed, which roads are diverted and what benefit each route creates.'],
    ['event-twin', '11 · Event Digital Twin', 'Compare No Plan, Experience-Based Plan and AI Plan. This proves the AI plan reduces delay, queues, critical junctions and network recovery time before field deployment.'],
    ['post-event', '12 · Post-event learning', 'After the event, BTIP compares forecast versus observed delay, critical junctions and deployed resources, then generates lessons for the next similar event.'],
    ['event-replay', '13 · Historical replay verification', 'This is the judge-proof mode: future data is locked, BTIP forecasts and plans using only pre-event information, then the actual outcome can be revealed.', 'prepareReplay'],
    ['event-replay', '14 · Reveal actual outcome', 'Clicking reveal proves whether the forecast and plan matched reality. This completes the loop: predict, recommend, simulate, observe and re-learn.', 'revealActual'],
  ];

  function waitForTourAction(action, attempts = 0) {
    if (action === 'prepareReplay') {
      const lock = $('#actualLock');
      if (lock) lock.classList.add('tour-emphasis');
      return;
    }
    if (action === 'revealActual') {
      const button = $('#revealActual');
      if (button) { button.click(); return; }
      if (attempts < 20) setTimeout(() => waitForTourAction(action, attempts + 1), 160);
    }
  }

  async function startTour() { state.tourIndex = 0; $('#tourOverlay').classList.add('is-open'); await showTourStep(); }
  async function showTourStep() {
    const [route, title, text, action] = TOUR[state.tourIndex];
    location.hash = `#/${route}`;
    $('#tourStepLabel').textContent = `STEP ${state.tourIndex + 1} OF ${TOUR.length}`;
    $('#tourTitle').textContent = title;
    $('#tourText').textContent = text;
    $('#tourNext').innerHTML = state.tourIndex === TOUR.length - 1 ? 'Finish <b>✓</b>' : 'Next <b>→</b>';
    if (action) setTimeout(() => waitForTourAction(action), 700);
  }
  function initTour() {
    $('#demoTourButton').addEventListener('click', startTour);
    $('#tourSkip').addEventListener('click', () => $('#tourOverlay').classList.remove('is-open'));
    $('#tourNext').addEventListener('click', async () => {
      if (state.tourIndex >= TOUR.length - 1) {
        $('#tourOverlay').classList.remove('is-open');
        toast('Judge tour complete', 'BTIP proved the full event loop: forecast, plan, simulate, verify and learn.', 'success');
        return;
      }
      state.tourIndex += 1;
      await showTourStep();
    });
  }

  function initWebSocket() {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'; let socket;
    try {
      socket = new WebSocket(`${scheme}://${location.host}/ws/live`);
      socket.addEventListener('message', (event) => { const data = JSON.parse(event.data); if (data.type !== 'city_pulse') return; animateValue($('#heroRisk'), data.city_risk, { decimals: 0, duration: 500 }); $('#refreshMetric').textContent = `${(data.decision_refresh_ms / 1000).toFixed(1)}s`; });
      socket.addEventListener('close', () => setTimeout(initWebSocket, 5000));
    } catch { /* fallback polling already works */ }
  }

  function bindPageControls() {
    $$('.map-layer-pills button').forEach((button) => button.addEventListener('click', () => { $$('.map-layer-pills button').forEach((node) => node.classList.remove('is-active')); button.classList.add('is-active'); state.overviewLayer = button.dataset.overviewLayer; state.renderers.overview?.setMode(state.overviewLayer); }));
    $('#overviewCallout').addEventListener('click', () => openZoneDrawer(state.overview?.top_zones?.[0] || demoHotspots()[0]));
    $('#explainSystem').addEventListener('click', () => toast('Closed-loop intelligence', 'Detect → predict → score → recommend → simulate → act → re-learn. Each stage stays visible to the operator.'));
    $('#drawerClose').addEventListener('click', closeDrawer); $('#drawerBackdrop').addEventListener('click', closeDrawer); $('#drawerForecastLink').addEventListener('click', closeDrawer);
    $('#clusterSearch').addEventListener('input', renderClusterTable); $('#persistenceFilter').addEventListener('change', loadHotspots); $('#compareHotspots').addEventListener('click', () => toast('Compare mode ready', 'Select a second row to compare persistence, risk and offence mix side by side.'));
    $('#forecastJunction').addEventListener('change', loadForecast); $$('#horizonToggle button').forEach((button) => button.addEventListener('click', () => { $$('#horizonToggle button').forEach((node) => node.classList.remove('is-active')); button.classList.add('is-active'); state.forecastHorizon = button.dataset.horizon; loadForecast(); }));
    $('#recommendOfficers').addEventListener('input', (event) => { $('#recommendOfficerValue').textContent = event.target.value; }); $('#generateRecommendations').addEventListener('click', loadRecommendations); $('#recommendShift').addEventListener('change', loadRecommendations);
    $('#simOfficers').addEventListener('input', (event) => { $('#simOfficerValue').textContent = event.target.value; }); $('#simDuration').addEventListener('input', (event) => { $('#simDurationValue').textContent = `${event.target.value}h`; }); $('#runSimulation').addEventListener('click', runSimulation);
    $('#useRecommendedScenario').addEventListener('click', () => { const plan = state.recommendations || demoRecommendations(); const lead = plan.recommendations[0]; $('#simZone').value = lead.zone_id; $('#simOfficers').value = Math.min(60, plan.total_officers); $('#simOfficerValue').textContent = Math.min(60, plan.total_officers); location.hash = '#/simulation'; toast('Optimizer plan loaded', `${plan.total_officers} officers and ${plan.zones_covered} priority zones are represented by the lead scenario.`, 'success'); });
    $$('.scenario-list button').forEach((button) => button.addEventListener('click', () => { const surge = button.dataset.scenario === 'surge'; $('#simZone').value = surge ? 'J002' : 'J001'; $('#simOfficers').value = surge ? 42 : 20; $('#simOfficerValue').textContent = surge ? 42 : 20; $('#simDuration').value = surge ? 6 : 4; $('#simDurationValue').textContent = surge ? '6h' : '4h'; runSimulation(); }));
    $('#exportSimulation').addEventListener('click', exportSimulationCSV);
  }

  async function init() {
    initBoot(); initAmbient(); initMicroInteractions(); setDateInputs(); populateSelects(); initHeatmapControls(); initCompareHandle(); initCourier(); initCommandPalette(); initAuth(); initTour(); bindPageControls();
    updateClock(); setInterval(updateClock, 1000); addEventListener('hashchange', onHashChange); updateApiStatus();
    await api('/health').catch(() => null); await showRoute(routeFromHash(), { transition: false }); initWebSocket();
    if (innerWidth > 720) setTimeout(() => toast(state.apiMode === 'live' ? 'Backend connected' : 'Standalone demo active', state.apiMode === 'live' ? 'All pages are using the FastAPI backend.' : 'Open through start.sh to enable live API and WebSocket data.', state.apiMode === 'live' ? 'success' : 'info'), 1500);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
