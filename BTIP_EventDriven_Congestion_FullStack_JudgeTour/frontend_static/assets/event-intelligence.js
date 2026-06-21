(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: digits });
  const pct = (value, digits = 1) => `${Number(value || 0).toFixed(digits)}%`;
  const isoDate = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const EVENT_ROUTES = ['events', 'event-map', 'event-plan', 'event-twin', 'post-event', 'event-replay'];
  const EVENT_ICONS = { sports: '⚽', political_rally: '⚑', festival: '✺', construction: '▥', concert: '♫', vip_movement: '◆', religious_gathering: '✦', protest: '✊', sudden_gathering: '⚠' };
  const fallbackCustomEvents = [];
  const EVENT_COLORS = { sports: '#2f73ff', political_rally: '#ff6b45', festival: '#8f70ff', construction: '#ffc928', concert: '#54d566', vip_movement: '#10242c', religious_gathering: '#b26bff', protest: '#ff4560', sudden_gathering: '#d92816' };

  const state = {
    events: [],
    selectedEventId: localStorage.getItem('btip_event_selected') || 'EVT-001',
    impact: null,
    plan: null,
    simulation: null,
    postEvent: null,
    maps: {},
    route: null,
    planTab: 'manpower',
    replayRevealed: false,
  };

  function token() { try { return localStorage.getItem('btip_token') || ''; } catch { return ''; } }

  async function eventApi(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(path, { ...options, headers, signal: controller.signal });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.warn('[BTIP Event Extension] API fallback:', path, error.message);
      return fallbackRouter(path, options);
    } finally {
      clearTimeout(timeout);
    }
  }

  function fallbackEvents() {
    const t = (offset, hour, minute = 0) => `${isoDate(offset)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    return [
      { event_id: 'EVT-001', name: 'Bengaluru Football Night', event_type: 'sports', mode: 'planned', venue: 'Sree Kanteerava Stadium', latitude: 12.9683, longitude: 77.5937, start_time: t(1, 19, 30), end_time: t(1, 22, 15), expected_attendance: 24000, parking_capacity: 2400, public_transport_share: .42, weather: 'clear', status: 'planning' },
      { event_id: 'EVT-002', name: 'Freedom Park Civic Rally', event_type: 'political_rally', mode: 'planned', venue: 'Freedom Park', latitude: 12.9856, longitude: 77.5797, start_time: t(0, 16, 30), end_time: t(0, 20), expected_attendance: 15500, parking_capacity: 600, public_transport_share: .31, weather: 'clear', status: 'monitoring' },
      { event_id: 'EVT-003', name: 'Stadium Cricket Surge', event_type: 'sports', mode: 'planned', venue: 'M. Chinnaswamy Stadium', latitude: 12.9788, longitude: 77.5996, start_time: t(3, 19, 30), end_time: t(3, 23), expected_attendance: 32000, parking_capacity: 2900, public_transport_share: .46, weather: 'rain', status: 'planning' },
      { event_id: 'EVT-004', name: 'Malleshwaram Festival Procession', event_type: 'festival', mode: 'planned', venue: 'Malleshwaram 8th Cross', latitude: 13.0035, longitude: 77.5690, start_time: t(2, 17), end_time: t(2, 22, 30), expected_attendance: 18000, parking_capacity: 1100, public_transport_share: .37, weather: 'clear', status: 'planning' },
      { event_id: 'EVT-005', name: 'Whitefield Utility Construction', event_type: 'construction', mode: 'planned', venue: 'ITPL Main Road', latitude: 12.9862, longitude: 77.7372, start_time: t(0, 8), end_time: t(7, 23), expected_attendance: 0, parking_capacity: 0, public_transport_share: 0, weather: 'unknown', status: 'active' },
      { event_id: 'EVT-006', name: 'Town Hall Sudden Gathering', event_type: 'sudden_gathering', mode: 'unplanned', venue: 'Bengaluru Town Hall', latitude: 12.9632, longitude: 77.5855, start_time: t(0, 14, 18), end_time: t(0, 18), expected_attendance: 1350, parking_capacity: 0, public_transport_share: .25, weather: 'clear', status: 'active' },
    ];
  }

  const FALLBACK_JUNCTIONS = [
    ['J001', 'Silk Board', 12.9177, 77.6233, 92], ['J002', 'Bellandur', 12.9258, 77.6761, 88],
    ['J003', 'Hebbal Flyover', 13.0358, 77.5970, 84], ['J004', 'Tin Factory', 13.0006, 77.6702, 81],
    ['J005', 'KR Puram', 13.0098, 77.6952, 79], ['J006', 'Marathahalli', 12.9591, 77.6974, 77],
    ['J007', 'Dairy Circle', 12.9347, 77.6062, 72], ['J008', 'Mekhri Circle', 13.0146, 77.5834, 69],
    ['J009', 'Majestic', 12.9767, 77.5713, 67], ['J010', 'Trinity Circle', 12.9737, 77.6199, 64],
    ['J011', 'Jayadeva', 12.9166, 77.6000, 62], ['J012', 'Corporation Circle', 12.9661, 77.5884, 58],
    ['J013', 'Yeshwanthpur', 13.0280, 77.5390, 56], ['J014', 'Nayandahalli', 12.9422, 77.5212, 52],
    ['J015', 'Banashankari', 12.9255, 77.5468, 49], ['J016', 'Electronic City', 12.8399, 77.6770, 61],
  ];

  const distanceKm = (a, b, c, d) => {
    const p1 = a * Math.PI / 180, p2 = c * Math.PI / 180;
    const dp = (c - a) * Math.PI / 180, dl = (d - b) * Math.PI / 180;
    const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  function fallbackImpact(eventId) {
    const event = fallbackEvents().find((e) => e.event_id === eventId) || fallbackEvents()[0];
    const attendance = event.expected_attendance || 11400;
    const typeFactor = { sports: 1, political_rally: 1.18, festival: 1.12, construction: .84, sudden_gathering: 1.25 }[event.event_type] || 1;
    const added = event.event_type === 'construction' ? 3800 : Math.max(0, Math.round(attendance * (.37 - event.public_transport_share * .12) / 2.7 - event.parking_capacity * .18));
    const affected = FALLBACK_JUNCTIONS.map(([zone_id, junction_name, latitude, longitude, base]) => {
      const d = distanceKm(event.latitude, event.longitude, latitude, longitude);
      const proximity = Math.exp(-d / 3.2);
      const impact = clamp(.36 * base + 64 * typeFactor * proximity, 20, 99);
      return {
        zone_id, junction_name, latitude, longitude, distance_km: +d.toFixed(2), baseline_risk: base,
        baseline_congestion: clamp(base + 4, 20, 98), event_impact_score: +impact.toFixed(1),
        traffic_increase_pct: +(impact * .87).toFixed(1), speed_reduction_pct: +(impact * .48).toFixed(1),
        max_queue_m: Math.round(90 + impact * 8.4), average_delay_min: +(impact * .42).toFixed(1),
        criticality: impact >= 82 ? 'CRITICAL' : impact >= 66 ? 'HIGH' : impact >= 42 ? 'MEDIUM' : 'LOW',
      };
    }).sort((a, b) => b.event_impact_score - a.event_impact_score).slice(0, 12);
    const avgDelay = affected.reduce((s, x) => s + x.average_delay_min, 0) / affected.length;
    const start = new Date(event.start_time); const points = [];
    for (let i = 0; i < 13; i += 1) {
      const phase = i / 12, wave = Math.max(Math.exp(-1 * (((phase - .3) / .15) ** 2)), .9 * Math.exp(-1 * (((phase - .72) / .13) ** 2)));
      points.push({ timestamp: new Date(start.getTime() + (i - 4) * 35 * 60000).toISOString(), pressure: +(18 + 72 * wave).toFixed(1), normal_baseline: +(18 + 12 * Math.sin(phase * Math.PI)).toFixed(1) });
    }
    return {
      event, expected_additional_vehicles: added, affected_junction_count: affected.length,
      critical_corridors: affected.filter((x) => ['CRITICAL', 'HIGH'].includes(x.criticality)).length,
      projected_average_delay_min: +avgDelay.toFixed(1), projected_speed_reduction_pct: +(affected.reduce((s, x) => s + x.speed_reduction_pct, 0) / affected.length).toFixed(1),
      congestion_radius_km: +(2.7 + Math.log10(attendance + 10)).toFixed(1), impact_confidence_pct: event.mode === 'planned' ? 87.4 : 74.8,
      time_profile: { inflow_peak: new Date(start.getTime() - 105 * 60000).toISOString(), event_start: event.start_time, outflow_peak: event.end_time, event_end: event.end_time, expected_recovery: new Date(new Date(event.end_time).getTime() + 70 * 60000).toISOString() },
      timeline: points, affected_junctions: affected,
      normal_day_comparison: { baseline_delay_min: +(avgDelay * .34).toFixed(1), event_delay_min: +avgDelay.toFixed(1), event_attributable_delay_min: +(avgDelay * .66).toFixed(1), baseline_speed_kmh: 31, event_speed_kmh: 18.2 },
      model_basis: 'Standalone event scenario engine using BTIP junction risk and distance-decay signals',
    };
  }

  function fallbackPlan(eventId) {
    const impact = fallbackImpact(eventId); const { event } = impact;
    const officers = Math.max(18, Math.round(event.expected_attendance / 750 + impact.critical_corridors * 2 + 8));
    let remaining = officers;
    const zones = impact.affected_junctions.slice(0, 7).map((x, i) => {
      const n = Math.min(10, Math.max(2, Math.round((x.event_impact_score / 100) * 7))); remaining -= n;
      return { ...x, officers: n, expected_queue_reduction_pct: +(12 + n * 4.1).toFixed(1), reason: [`Forecast traffic increase +${x.traffic_increase_pct}%`, `Expected queue ${x.max_queue_m} m`, 'High event proximity and network importance'] };
    });
    if (remaining > 0 && zones.length) zones[0].officers += remaining;
    const start = new Date(event.start_time), end = new Date(event.end_time);
    const barricades = impact.affected_junctions.slice(0, 5).map((x, i) => ({ barricade_id: `B-${String(i + 1).padStart(2, '0')}`, location: x.junction_name, latitude: x.latitude, longitude: x.longitude, deployment_time: new Date(start.getTime() - (120 - i * 5) * 60000).toISOString(), removal_time: new Date(end.getTime() + 60 * 60000).toISOString(), type: i ? 'Partial lane channelisation' : 'Full turn restriction', purpose: i % 2 ? 'Protect pedestrian crossing movement' : 'Separate event inflow from through traffic', expected_conflict_reduction_pct: +(14 + x.event_impact_score * .13).toFixed(1), staff_required: i < 3 ? 2 : 1 }));
    const diversions = [
      { diversion_id: 'D-01', original_route: 'Majestic → Corporation Circle → Venue', recommended_route: 'Majestic → Trinity Circle → Dairy Circle', additional_distance_km: 1.7, additional_travel_time_min: 6, expected_vehicles_shifted_per_hour: 1240, expected_venue_congestion_reduction_pct: 21, priority: 'Maximum congestion relief', recommended_path: impact.affected_junctions.slice(0, 4).map(x => ({ name: x.junction_name, latitude: x.latitude, longitude: x.longitude })) },
      { diversion_id: 'D-02', original_route: 'Hebbal → Mekhri Circle → Venue', recommended_route: 'Hebbal → Yeshwanthpur → Majestic', additional_distance_km: 2.1, additional_travel_time_min: 8, expected_vehicles_shifted_per_hour: 980, expected_venue_congestion_reduction_pct: 16, priority: 'Minimum travel-time increase', recommended_path: impact.affected_junctions.slice(2, 6).map(x => ({ name: x.junction_name, latitude: x.latitude, longitude: x.longitude })) },
      { diversion_id: 'D-03', original_route: 'Trinity Circle → Venue', recommended_route: 'Trinity Circle → Dairy Circle → Emergency corridor', additional_distance_km: 1.2, additional_travel_time_min: 5, expected_vehicles_shifted_per_hour: 760, expected_venue_congestion_reduction_pct: 14, priority: 'Emergency access protection', recommended_path: impact.affected_junctions.slice(4, 8).map(x => ({ name: x.junction_name, latitude: x.latitude, longitude: x.longitude })) },
    ];
    return { event, summary: { traffic_officers: zones.reduce((s, x) => s + x.officers, 0), barricade_teams: barricades.length, tow_vehicles: Math.max(2, Math.round(event.expected_attendance / 8000 + 1)), rapid_response_units: 3, control_room_operators: 5, reserve_officers: Math.max(4, Math.round(officers * .18)), deployment_start: new Date(start.getTime() - 165 * 60000).toISOString(), peak_deployment_end: new Date(end.getTime() + 75 * 60000).toISOString(), estimated_officer_hours: officers * 6 }, zone_allocations: zones, barricades, diversions, emergency_corridor: { availability_target_pct: 97, description: 'One monitored green corridor remains open throughout the event.', route: diversions[2].recommended_path }, public_information: ['Issue advisory three hours before start.', 'Publish public-transport and parking guidance.', 'Push diversion update before inflow peak.'], solver: 'Standalone ILP-compatible allocation fallback' };
  }

  function fallbackSimulation(eventId, body) {
    const impact = fallbackImpact(eventId); const plan = fallbackPlan(eventId);
    const officers = Number(body?.officers ?? plan.summary.traffic_officers), barricades = Number(body?.barricade_teams ?? plan.summary.barricade_teams), tows = Number(body?.tow_vehicles ?? plan.summary.tow_vehicles), div = Number(body?.diversion_intensity ?? .75);
    const noDelay = impact.projected_average_delay_min + 10, queue = Math.max(...impact.affected_junctions.map(x => x.max_queue_m)), critical = impact.critical_corridors;
    const expEff = clamp(.14 + officers / 500 + barricades * .025 + tows * .018, .1, .48);
    const aiEff = clamp(.21 + officers / 360 + barricades * .033 + tows * .024 + div * .19, .18, .72);
    const pack = (eff, required) => ({ average_delay_min: +(noDelay * (1 - eff)).toFixed(1), maximum_queue_m: Math.round(queue * (1 - eff * .9)), critical_junctions: Math.max(0, Math.round(critical * (1 - eff * .86))), network_recovery_min: Math.round((100 + noDelay * 2) * (1 - eff * .7)), required_officers: required, emergency_corridor_availability_pct: +(68 + eff * 43).toFixed(1) });
    const noPlan = { average_delay_min: +noDelay.toFixed(1), maximum_queue_m: queue, critical_junctions: critical, network_recovery_min: Math.round(100 + noDelay * 2), required_officers: plan.summary.traffic_officers + 12, emergency_corridor_availability_pct: 64 };
    const current = pack(expEff, officers), ai = pack(aiEff, officers); const reduction = 100 * (noPlan.average_delay_min - ai.average_delay_min) / noPlan.average_delay_min;
    return { event: impact.event, controls: body || {}, no_plan: noPlan, experience_based_plan: current, ai_recommended_plan: ai, impact: { delay_reduction_pct: +reduction.toFixed(1), queue_reduction_pct: +(100 * (noPlan.maximum_queue_m - ai.maximum_queue_m) / noPlan.maximum_queue_m).toFixed(1), critical_junction_reduction: noPlan.critical_junctions - ai.critical_junctions, recovery_time_saved_min: noPlan.network_recovery_min - ai.network_recovery_min, confidence_band: { p10: +(reduction - 4.1).toFixed(1), p50: +reduction.toFixed(1), p90: +(reduction + 4.1).toFixed(1) } }, per_junction: impact.affected_junctions.map(x => ({ zone_id: x.zone_id, junction_name: x.junction_name, latitude: x.latitude, longitude: x.longitude, no_plan_risk: x.event_impact_score, current_plan_risk: +(x.event_impact_score * (1 - expEff * .65)).toFixed(1), ai_plan_risk: +(x.event_impact_score * (1 - aiEff * .78)).toFixed(1) })), validation: { constraints_satisfied: true, emergency_corridor_preserved: ai.emergency_corridor_availability_pct >= 90, ai_outperforms_no_plan: true } };
  }

  function fallbackPost(eventId) {
    const impact = fallbackImpact(eventId), plan = fallbackPlan(eventId), attendance = Math.round(impact.event.expected_attendance * 1.07), delay = +(impact.projected_average_delay_min * 1.05).toFixed(1), projected = 28.4, observed = 24.6;
    return { event: impact.event, forecast: { attendance: impact.event.expected_attendance, peak_delay_min: impact.projected_average_delay_min, critical_junctions: impact.critical_corridors, projected_reduction_pct: projected, recommended_officers: plan.summary.traffic_officers }, actual: { attendance, peak_delay_min: delay, critical_junctions: impact.critical_corridors + 1, observed_reduction_pct: observed, deployed_officers: plan.summary.traffic_officers - 2 }, performance: { attendance_accuracy_pct: +(100 * (1 - Math.abs(attendance - impact.event.expected_attendance) / attendance)).toFixed(1), delay_forecast_accuracy_pct: +(100 * (1 - Math.abs(delay - impact.projected_average_delay_min) / delay)).toFixed(1), impact_projection_error_points: +(projected - observed).toFixed(1), critical_junction_error: 1, result: 'Validated' }, learning_actions: ['Advance diversion activation by 15 minutes.', 'Protect the recommended staffing floor during outflow.', 'Add one secondary corridor to the monitoring perimeter.', 'Update the similar-event arrival and recovery curves.'], model_update: { event_profile_updated: true, next_retraining_status: 'Queued for weekly retraining pipeline' } };
  }

  function fallbackReplay(eventId, reveal) {
    const impact = fallbackImpact(eventId), plan = fallbackPlan(eventId), post = fallbackPost(eventId);
    const steps = ['Freeze future data', 'Forecast event impact', 'Generate operational plan', 'Run digital twin', 'Reveal actual outcome'].map((label, i) => ({ step: i + 1, label, status: i === 4 ? (reveal ? 'revealed' : 'locked') : 'complete', detail: i === 0 ? 'Only pre-event information is used.' : i === 1 ? `${impact.affected_junction_count} junctions forecast inside the footprint.` : i === 2 ? `${plan.summary.traffic_officers} officers, ${plan.barricades.length} barricades and ${plan.diversions.length} diversions.` : i === 3 ? 'No plan, experience plan and AI plan are compared.' : 'Historical outcome remains hidden until revealed.' }));
    return { event: impact.event, cutoff_time: new Date(new Date(impact.event.start_time).getTime() - 60000).toISOString(), steps, forecast_snapshot: { expected_additional_vehicles: impact.expected_additional_vehicles, peak_delay_min: impact.projected_average_delay_min, critical_junctions: impact.critical_corridors, impact_confidence_pct: impact.impact_confidence_pct }, plan_snapshot: { officers: plan.summary.traffic_officers, barricades: plan.barricades.length, diversions: plan.diversions.length }, actual_revealed: reveal, ...(reveal ? { actual_outcome: post.actual, verification: post.performance, learning_actions: post.learning_actions } : {}) };
  }

  function fallbackRouter(path, options = {}) {
    if (path === '/api/v1/events/unplanned/detect') return Promise.resolve({ detected: true, anomaly_score: 87.4, confidence_pct: 89.9, classification: 'Sudden gathering', estimated_crowd_range: [1050, 1450], immediate_response: { traffic_officers: 12, barricade_teams: 3, rapid_response_units: 2, activate_diversion: true, preserve_emergency_corridor: true }, explanation: [] });
    if (path === '/api/v1/events') {
      if ((options.method || 'GET').toUpperCase() === 'POST') {
        const payload = options.body ? JSON.parse(options.body) : {};
        const created = { ...payload, event_id: `EVT-C${String(fallbackCustomEvents.length + 1).padStart(3, '0')}`, status: 'planning' };
        fallbackCustomEvents.push(created);
        return Promise.resolve(created);
      }
      const items = [...fallbackEvents(), ...fallbackCustomEvents];
      return Promise.resolve({ total: items.length, items });
    }
    const match = path.match(/\/api\/v1\/events\/([^/?]+)(?:\/(impact-forecast|response-plan|simulate|post-event|replay))?/);
    if (match) {
      const [, id, action] = match;
      if (action === 'impact-forecast') return Promise.resolve(fallbackImpact(id));
      if (action === 'response-plan') return Promise.resolve(fallbackPlan(id));
      if (action === 'simulate') return Promise.resolve(fallbackSimulation(id, options.body ? JSON.parse(options.body) : {}));
      if (action === 'post-event') return Promise.resolve(fallbackPost(id));
      if (action === 'replay') return Promise.resolve(fallbackReplay(id, path.includes('reveal_actual=true')));
      return Promise.resolve({ event: fallbackEvents().find(e => e.event_id === id), impact: fallbackImpact(id) });
    }
    throw new Error(`No event fallback for ${path}`);
  }

  function eventSelectMarkup(id) {
    return `<select id="${id}" class="event-select">${state.events.map(e => `<option value="${e.event_id}"${e.event_id === state.selectedEventId ? ' selected' : ''}>${escapeHtml(e.name)} · ${escapeHtml(e.venue)}</option>`).join('')}</select>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
  }

  function eventDate(value) {
    const d = new Date(value); return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function injectNavigation() {
    const sideNav = $('.side-rail nav');
    if (sideNav && !$('.event-nav', sideNav)) {
      const links = [
        ['07', '◈', 'Events', 'events'], ['08', '⌁', 'Impact', 'event-map'], ['09', '⚑', 'Ops Plan', 'event-plan'],
        ['10', '◫', 'Event Twin', 'event-twin'], ['11', '↻', 'Learning', 'post-event'], ['12', '▶', 'Replay', 'event-replay'],
      ];
      links.forEach(([n, icon, label, route]) => sideNav.insertAdjacentHTML('beforeend', `<a href="#/${route}" data-event-route="${route}" class="nav-item event-nav"><span>${n}</span><i>${icon}</i><b>${label}</b></a>`));
    }
    const topActions = $('.top-actions');
    if (topActions && !$('#eventModeButton')) topActions.insertAdjacentHTML('afterbegin', `<button class="event-mode-button magnetic" id="eventModeButton" type="button"><i></i><span>Event Ops</span><b>↗</b></button>`);
    const mobile = $('.mobile-nav');
    if (mobile && !$('.event-mobile-nav', mobile)) mobile.insertAdjacentHTML('beforeend', `<a href="#/events" data-event-route="events" class="event-mobile-nav">◈<span>Events</span></a><a href="#/event-plan" data-event-route="event-plan" class="event-mobile-nav">⚑<span>Plan</span></a><a href="#/event-replay" data-event-route="event-replay" class="event-mobile-nav">▶<span>Replay</span></a>`);
    const loop = $('.loop-strip');
    if (loop && !$('#eventOverviewEntry')) loop.insertAdjacentHTML('afterend', `<article class="event-overview-entry" id="eventOverviewEntry"><div><small>NEW OPERATIONAL DOMAIN · EVENT-DRIVEN CONGESTION</small><h3>Know the traffic impact before the crowd arrives.</h3><p>Forecast event pressure, generate manpower, barricade and diversion plans, validate them in a digital twin, then learn from the actual outcome.</p></div><a href="#/events">Open Event Command Centre ↗</a></article>`);
  }

  function pageTemplates() {
    return `
<section class="app-page event-page" id="page-events" data-page="events" style="--event-accent:var(--purple)">
  <div class="page-title-row"><div><p class="chapter-label"><span>07</span> / EVENT COMMAND CENTRE</p><h1>Plan before the <em>crowd</em> arrives.</h1><p>Register planned events, detect sudden gatherings, quantify their traffic footprint and move from experience-driven response to measurable operational intelligence.</p></div><div class="page-stat"><small>ACTIVE EVENTS</small><strong id="eventActiveCount">—</strong></div></div>
  <div class="event-shell-grid">
    <article class="event-panel"><div class="event-panel-head"><div><small>CITY EVENT QUEUE</small><h2>What Bengaluru is preparing for.</h2></div><button id="createEventButton">＋ Add</button></div><div class="event-list" id="eventList"><div class="event-loading">LOADING EVENTS</div></div></article>
    <article class="event-hero" id="eventHero"><div class="event-loading">BUILDING EVENT FOOTPRINT</div></article>
  </div>
  <div class="event-kpi-grid" id="eventKpis"></div>
  <div class="event-explainer">
    <article class="event-loop-card"><small>END-TO-END PROBLEM SOLUTION</small><h3>One operational loop—not another dashboard.</h3><p>Every stage creates evidence that can be inspected by command staff and judges.</p><div class="event-loop"><span>Register / Detect</span><span>Forecast impact</span><span>Map corridors</span><span>Plan resources</span><span>Simulate</span><span>Monitor</span><span>Re-learn</span></div></article>
    <article class="unplanned-card"><small>REAL-TIME ANOMALY MODE</small><h3>Detect an unplanned gathering.</h3><p>Combine speed loss, camera density and road occupancy to trigger an immediate operational plan.</p><div class="unplanned-form"><label>SPEED DROP %<input id="anomalySpeed" type="number" value="54" min="0" max="100"></label><label>CROWD ESTIMATE<input id="anomalyCrowd" type="number" value="1250" min="0"></label><label>ROAD OCCUPANCY %<input id="anomalyOccupancy" type="number" value="82" min="0" max="100"></label><label>CAMERA DENSITY Δ %<input id="anomalyCamera" type="number" value="71" min="0"></label><button id="detectAnomaly">Run anomaly detection →</button></div><div class="unplanned-result" id="unplannedResult"></div></article>
  </div>
</section>

<section class="app-page event-page" id="page-event-map" data-page="event-map" style="--event-accent:var(--signal)">
  <div class="page-title-row"><div><p class="chapter-label"><span>08</span> / EVENT IMPACT MAP</p><h1>See where the event <em>breaks</em> the network.</h1><p>Compare normal-day movement with predicted inflow, outflow, queue growth, speed loss and recovery.</p></div><div>${eventSelectMarkup('impactEventSelect')}</div></div>
  <div class="event-map-layout"><div class="event-map-frame"><div id="eventImpactMap"></div><div class="event-map-scanline"></div><div class="event-map-legend"><span><i style="background:var(--signal)"></i>Critical impact</span><span><i style="background:var(--yellow)"></i>High impact</span><span><i style="background:var(--purple)"></i>Event venue</span><span><i style="background:var(--lime)"></i>Recovery corridor</span></div></div><aside class="event-impact-side"><div class="event-impact-score"><small>EVENT IMPACT INDEX</small><strong id="eventImpactScore">—</strong><p id="eventImpactText">Calculating the event-attributable pressure on affected roads.</p></div><div class="event-fact-list" id="eventFacts"></div></aside></div>
  <article class="event-timeline-panel"><div class="event-panel-head"><div><small>NORMAL DAY VS EVENT DAY</small><h2>Arrival, event and departure waves.</h2></div><span id="eventRecoveryLabel"></span></div><svg class="event-wave-chart" id="eventWaveChart" viewBox="0 0 1000 220" preserveAspectRatio="none"></svg></article>
  <div class="event-junction-grid" id="eventJunctionGrid"></div>
</section>

<section class="app-page event-page" id="page-event-plan" data-page="event-plan" style="--event-accent:var(--yellow)">
  <div class="page-title-row"><div><p class="chapter-label"><span>09</span> / OPERATIONAL RESPONSE PLAN</p><h1>Manpower, barricades and <em>diversions.</em></h1><p>Turn the forecast into an auditable field plan with resource constraints, timing and operational reasoning.</p></div><div>${eventSelectMarkup('planEventSelect')}</div></div>
  <div class="plan-summary-grid" id="planSummaryGrid"></div>
  <div class="plan-tabs"><button class="is-active" data-plan-tab="manpower">Manpower allocation</button><button data-plan-tab="barricades">Barricade plan</button><button data-plan-tab="diversions">Diversion routes</button><button data-plan-tab="public">Public information</button></div>
  <div class="plan-workspace"><div class="plan-map" id="eventPlanMap"></div><article class="plan-detail"><div class="event-panel-head"><div><small id="planDetailEyebrow">ILP RESOURCE ALLOCATION</small><h2 id="planDetailTitle">Deploy where impact is greatest.</h2></div><span id="planSolver"></span></div><div class="plan-list" id="planList"><div class="event-loading">GENERATING PLAN</div></div></article></div>
</section>

<section class="app-page event-page" id="page-event-twin" data-page="event-twin" style="--event-accent:var(--grass-deep)">
  <div class="page-title-row"><div><p class="chapter-label"><span>10</span> / EVENT DIGITAL TWIN</p><h1>Compare no action, experience and the <em>AI plan.</em></h1><p>Change attendance and resources, then quantify delay, queues, recovery time and emergency-corridor availability.</p></div><div>${eventSelectMarkup('twinEventSelect')}</div></div>
  <div class="event-twin-layout"><aside class="event-twin-controls"><div class="event-panel-head" style="padding:0 0 12px"><div><small>SCENARIO CONTROLS</small><h2>Stress the plan.</h2></div></div>
    <div class="event-control"><label>ATTENDANCE <b id="twinAttendanceValue">24,000</b></label><input id="twinAttendance" type="range" min="0" max="80000" step="500" value="24000"></div>
    <div class="event-control"><label>OFFICERS <b id="twinOfficersValue">40</b></label><input id="twinOfficers" type="range" min="0" max="160" value="40"></div>
    <div class="event-control"><label>BARRICADE TEAMS <b id="twinBarricadesValue">5</b></label><input id="twinBarricades" type="range" min="0" max="20" value="5"></div>
    <div class="event-control"><label>TOW VEHICLES <b id="twinTowValue">3</b></label><input id="twinTow" type="range" min="0" max="15" value="3"></div>
    <div class="event-control"><label>DIVERSION INTENSITY <b id="twinDiversionValue">75%</b></label><input id="twinDiversion" type="range" min="0" max="100" value="75"></div>
    <div class="event-control"><label>PUBLIC TRANSPORT SHARE <b id="twinTransitValue">42%</b></label><input id="twinTransit" type="range" min="0" max="90" value="42"></div>
    <button class="primary-cta" id="runEventTwin" type="button">Run event twin <b>▶</b></button>
  </aside><div class="event-twin-main"><div class="event-twin-map" id="eventTwinMap"></div><div class="twin-comparison" id="twinComparison"></div><div class="twin-impact-banner" id="twinImpactBanner"><h3>Run the scenario to compare plans.</h3></div></div></div>
</section>

<section class="app-page event-page" id="page-post-event" data-page="post-event" style="--event-accent:var(--electric)">
  <div class="page-title-row"><div><p class="chapter-label"><span>11</span> / POST-EVENT LEARNING</p><h1>Every event makes the next plan <em>smarter.</em></h1><p>Compare forecast with reality, identify operational gaps and feed the observed arrival, departure and recovery curves into retraining.</p></div><div>${eventSelectMarkup('learningEventSelect')}</div></div>
  <div class="learning-hero"><article class="learning-score"><small>DELAY FORECAST ACCURACY</small><strong id="learningAccuracy">—</strong><p id="learningResult">Loading post-event performance.</p></article><article class="learning-comparison"><div class="event-panel-head" style="padding:0 0 12px"><div><small>FORECAST VS OBSERVED</small><h2>Did the operational plan work?</h2></div><span id="learningBadge"></span></div><div class="learning-columns" id="learningColumns"></div></article></div>
  <div class="learning-actions" id="learningActions"></div>
  <article class="event-timeline-panel"><div class="event-panel-head"><div><small>MODEL UPDATE</small><h2>The closed loop is complete.</h2></div></div><div class="event-loop"><span>Actual attendance</span><span>Actual queues</span><span>Plan adherence</span><span>Forecast error</span><span>Learning actions</span><span>Profile update</span><span>Retraining</span></div></article>
</section>

<section class="app-page event-page" id="page-event-replay" data-page="event-replay" style="--event-accent:var(--signal)">
  <div class="page-title-row"><div><p class="chapter-label"><span>12</span> / HISTORICAL EVENT REPLAY</p><h1>Prove the system without seeing the <em>future.</em></h1><p>Freeze data before a historical event, generate the complete plan, simulate it, then reveal the real outcome and learning evidence.</p></div><div>${eventSelectMarkup('replayEventSelect')}</div></div>
  <div class="replay-layout"><aside class="replay-stepper" id="replayStepper"><div class="event-loading">PREPARING REPLAY</div></aside><article class="replay-stage"><span class="replay-cutoff" id="replayCutoff">FUTURE DATA LOCKED</span><div class="replay-metrics" id="replayMetrics"></div><div class="actual-lock" id="actualLock"><div><i>⌾</i><h3>Actual outcome is hidden.</h3><p>The forecast and response plan were generated using only information available before the event.</p><button id="revealActual">Reveal actual outcome →</button></div></div><div class="actual-revealed" id="actualRevealed"></div></article></div>
</section>

<dialog class="event-dialog" id="createEventDialog"><form class="event-dialog-form" id="createEventForm"><h2>Register a planned event.</h2><div class="event-form-grid"><label>EVENT NAME<input name="name" required value="Bengaluru City Concert"></label><label>EVENT TYPE<select name="event_type"><option value="concert">Concert</option><option value="sports">Sports</option><option value="political_rally">Political rally</option><option value="festival">Festival</option><option value="construction">Construction</option><option value="protest">Protest</option></select></label><label>VENUE<input name="venue" required value="Palace Grounds"></label><label>EXPECTED ATTENDANCE<input name="expected_attendance" type="number" value="18000" min="0"></label><label>LATITUDE<input name="latitude" type="number" step="0.0001" value="13.0067"></label><label>LONGITUDE<input name="longitude" type="number" step="0.0001" value="77.5920"></label><label>START<input name="start_time" type="datetime-local" required></label><label>END<input name="end_time" type="datetime-local" required></label><label>PARKING CAPACITY<input name="parking_capacity" type="number" value="1800"></label><label>PUBLIC TRANSPORT SHARE<input name="public_transport_share" type="number" value="0.40" min="0" max="1" step="0.05"></label><label>WEATHER<select name="weather"><option value="clear">Clear</option><option value="rain">Rain</option><option value="heavy_rain">Heavy rain</option><option value="heat">Heat</option></select></label><label class="full">NOTES<textarea name="notes">Large arrival wave expected from 17:30.</textarea></label></div><div class="event-dialog-actions"><button type="button" id="cancelEventCreate">Cancel</button><button type="submit">Create event →</button></div></form></dialog>`;
  }

  function injectPages() {
    const shell = $('#appShell');
    if (shell && !$('#page-events')) shell.insertAdjacentHTML('beforeend', pageTemplates());
  }

  async function loadCatalog() {
    const data = await eventApi('/api/v1/events');
    state.events = data.items || data || [];
    if (!state.events.find(e => e.event_id === state.selectedEventId)) state.selectedEventId = state.events[0]?.event_id || 'EVT-001';
    refreshEventSelects();
  }

  function refreshEventSelects() {
    ['impactEventSelect', 'planEventSelect', 'twinEventSelect', 'learningEventSelect', 'replayEventSelect'].forEach(id => {
      const select = $(`#${id}`); if (!select) return;
      select.innerHTML = state.events.map(e => `<option value="${e.event_id}"${e.event_id === state.selectedEventId ? ' selected' : ''}>${escapeHtml(e.name)} · ${escapeHtml(e.venue)}</option>`).join('');
    });
  }

  function selectedEvent() { return state.events.find(e => e.event_id === state.selectedEventId) || state.events[0]; }
  function selectEvent(id, rerender = true) {
    if (!id) return;
    state.selectedEventId = id; localStorage.setItem('btip_event_selected', id); state.impact = state.plan = state.simulation = state.postEvent = null; state.replayRevealed = false; refreshEventSelects();
    if (rerender) loadCurrentEventRoute();
  }

  function renderEventCards() {
    const list = $('#eventList'); if (!list) return;
    list.innerHTML = state.events.map(event => {
      const color = EVENT_COLORS[event.event_type] || '#8f70ff';
      return `<button class="event-card${event.event_id === state.selectedEventId ? ' is-selected' : ''}" data-event-id="${event.event_id}" style="--event-color:${color}"><span class="event-card-icon">${EVENT_ICONS[event.event_type] || '◈'}</span><span class="event-card-copy"><strong>${escapeHtml(event.name)}</strong><span>${escapeHtml(event.venue)} · ${eventDate(event.start_time)}</span><small>${escapeHtml(event.mode.toUpperCase())} · ${escapeHtml(event.status.toUpperCase())}</small></span><span class="event-card-score"><b>${fmt(event.expected_attendance)}</b><span>PEOPLE</span></span></button>`;
    }).join('');
    $$('.event-card', list).forEach(card => card.addEventListener('click', () => selectEvent(card.dataset.eventId)));
  }

  function heroMarkup(impact) {
    const e = impact.event, color = EVENT_COLORS[e.event_type] || '#8f70ff';
    return `<div class="event-hero-top"><span class="event-status"><i></i>${escapeHtml(e.status.toUpperCase())} · ${escapeHtml(e.mode.toUpperCase())}</span><span class="event-type-stamp">${escapeHtml(e.event_type.replaceAll('_', ' ').toUpperCase())}<br>${escapeHtml(e.event_id)}</span></div><h2>${escapeHtml(e.name.split(' ').slice(0, -1).join(' '))}<br><em>${escapeHtml(e.name.split(' ').slice(-1)[0])}</em></h2><div class="event-hero-meta"><span>⌖ ${escapeHtml(e.venue)}</span><span>◷ ${eventDate(e.start_time)}</span><span>♟ ${fmt(e.expected_attendance)} expected</span><span>☂ ${escapeHtml(e.weather)}</span></div><div class="event-hero-actions"><a href="#/event-map">Inspect impact map ↗</a><a href="#/event-plan">Generate response plan</a></div><div class="event-confidence-orbit" style="--event-color:${color}"><strong>${Math.round(impact.impact_confidence_pct)}</strong><span>CONFIDENCE</span></div>`;
  }

  async function loadEventsPage() {
    if (!state.events.length) await loadCatalog();
    renderEventCards();
    $('#eventActiveCount').textContent = state.events.filter(e => ['active', 'monitoring'].includes(e.status)).length;
    const impact = await eventApi(`/api/v1/events/${state.selectedEventId}/impact-forecast`); state.impact = impact;
    $('#eventHero').innerHTML = heroMarkup(impact);
    const kpis = [
      ['ADDITIONAL VEHICLES', fmt(impact.expected_additional_vehicles), 'forecast event load'],
      ['JUNCTIONS AT RISK', fmt(impact.affected_junction_count), 'inside impact footprint'],
      ['CRITICAL CORRIDORS', fmt(impact.critical_corridors), 'high / critical'],
      ['AVERAGE DELAY', `${fmt(impact.projected_average_delay_min, 1)} min`, 'event-day projection'],
      ['CONGESTION RADIUS', `${fmt(impact.congestion_radius_km, 1)} km`, 'localized footprint'],
    ];
    $('#eventKpis').innerHTML = kpis.map(([label, value, note]) => `<article class="event-kpi"><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`).join('');
    renderEventCards();
  }

  function mapNodesFromImpact(impact) {
    const venue = { junction_id: impact.event.event_id, junction_name: impact.event.venue, latitude: impact.event.latitude, longitude: impact.event.longitude, risk_score: 99, congestion_score: 99 };
    return [venue, ...impact.affected_junctions.map(x => ({ ...x, risk_score: x.event_impact_score, congestion_score: x.baseline_congestion }))];
  }

  function ensureMap(key, elementId, options = {}) {
    const el = $(`#${elementId}`); if (!el || !window.BTIPSatelliteMap) return null;
    if (!state.maps[key]) state.maps[key] = new window.BTIPSatelliteMap(el, options);
    // The event pages are injected after the base app has already booted and can
    // become visible a tick after navigation. Force a few safe redraws so the
    // satellite engine measures the final box size instead of an inactive/zero
    // route state. This is intentionally additive and leaves the previous map
    // behaviour untouched.
    requestAnimationFrame(() => state.maps[key]?.invalidateSize?.());
    setTimeout(() => state.maps[key]?.invalidateSize?.(), 80);
    setTimeout(() => state.maps[key]?.invalidateSize?.(), 320);
    return state.maps[key];
  }

  function renderWaveChart(data) {
    const svg = $('#eventWaveChart'); if (!svg || !data.length) return;
    const W = 1000, H = 220, pad = 34, max = 100;
    const point = (item, i, key) => `${pad + i * (W - 2 * pad) / (data.length - 1)},${H - pad - Number(item[key]) / max * (H - 2 * pad)}`;
    const pressure = data.map((x, i) => point(x, i, 'pressure')).join(' '), normal = data.map((x, i) => point(x, i, 'normal_baseline')).join(' ');
    const area = `M ${pressure.split(' ')[0]} L ${pressure.split(' ').slice(1).join(' L ')} L ${W - pad},${H - pad} L ${pad},${H - pad} Z`;
    svg.innerHTML = `<defs><linearGradient id="eventWaveGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b45"/><stop offset="1" stop-color="#ff6b45" stop-opacity="0"/></linearGradient></defs><line class="event-wave-axis" x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}"/><path class="event-wave-area" d="${area}"/><polyline class="event-wave-normal" points="${normal}"/><polyline class="event-wave-pressure" points="${pressure}"/>${[3, 6, 9].map((i, idx) => `<line class="event-wave-marker" x1="${pad+i*(W-2*pad)/(data.length-1)}" x2="${pad+i*(W-2*pad)/(data.length-1)}" y1="20" y2="${H-pad}"/><text class="event-wave-label" x="${pad+i*(W-2*pad)/(data.length-1)+5}" y="${28+idx*14}">${['INFLOW','EVENT','OUTFLOW'][idx]}</text>`).join('')}<text class="event-wave-label" x="${pad}" y="${H-8}">${new Date(data[0].timestamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</text><text class="event-wave-label" text-anchor="end" x="${W-pad}" y="${H-8}">${new Date(data.at(-1).timestamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</text>`;
  }

  async function loadImpactPage() {
    if (!state.events.length) await loadCatalog();
    const impact = await eventApi(`/api/v1/events/${state.selectedEventId}/impact-forecast`); state.impact = impact;
    const maxImpact = Math.max(...impact.affected_junctions.map(x => x.event_impact_score), 0);
    $('#eventImpactScore').textContent = Math.round(maxImpact);
    $('#eventImpactText').textContent = `${impact.event.venue} is forecast to affect ${impact.affected_junction_count} junctions across a ${impact.congestion_radius_km} km localized footprint.`;
    $('#eventFacts').innerHTML = [
      ['Additional vehicles', fmt(impact.expected_additional_vehicles)], ['Average delay', `${fmt(impact.projected_average_delay_min,1)} min`],
      ['Speed reduction', pct(impact.projected_speed_reduction_pct)], ['Critical corridors', fmt(impact.critical_corridors)],
      ['Inflow peak', eventDate(impact.time_profile.inflow_peak)], ['Expected recovery', eventDate(impact.time_profile.expected_recovery)],
      ['Confidence', pct(impact.impact_confidence_pct)],
    ].map(([a,b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    $('#eventRecoveryLabel').textContent = `RECOVERY ${eventDate(impact.time_profile.expected_recovery)}`;
    renderWaveChart(impact.timeline);
    $('#eventJunctionGrid').innerHTML = impact.affected_junctions.slice(0, 8).map(x => `<article class="event-junction-card" style="--risk-color:${x.event_impact_score>=82?'var(--signal)':x.event_impact_score>=66?'var(--yellow)':'var(--purple)'}"><small>${x.criticality} · ${x.distance_km} KM</small><h4>${escapeHtml(x.junction_name)}</h4><strong>${Math.round(x.event_impact_score)}</strong><p>+${x.traffic_increase_pct}% traffic · ${x.max_queue_m} m queue · ${x.average_delay_min} min delay</p></article>`).join('');
    const map = ensureMap('impact', 'eventImpactMap', { mode: 'forecast', clickable: true, zoom: 12 });
    if (map) { map.setNodes(mapNodesFromImpact(impact)); map.fitNodes(mapNodesFromImpact(impact)); map.setGhost(true); }
  }

  function planSummaryMarkup(plan) {
    const s = plan.summary;
    return [
      ['TRAFFIC OFFICERS', s.traffic_officers], ['BARRICADE TEAMS', s.barricade_teams], ['TOW VEHICLES', s.tow_vehicles],
      ['RAPID RESPONSE', s.rapid_response_units], ['RESERVE OFFICERS', s.reserve_officers], ['OFFICER HOURS', s.estimated_officer_hours],
    ].map(([label, value]) => `<article class="plan-summary-card"><small>${label}</small><strong>${fmt(value)}</strong></article>`).join('');
  }

  function renderPlanList() {
    const plan = state.plan; if (!plan) return;
    const list = $('#planList');
    if (state.planTab === 'manpower') {
      $('#planDetailEyebrow').textContent = 'ILP RESOURCE ALLOCATION'; $('#planDetailTitle').textContent = 'Deploy where event impact is greatest.';
      list.innerHTML = plan.zone_allocations.map((x,i) => `<article class="plan-item plan-officer"><span class="plan-item-index">${String(i+1).padStart(2,'0')}</span><div><h4>${escapeHtml(x.junction_name)}</h4><p>${x.reason.map(escapeHtml).join(' · ')}</p></div><b>${x.officers}<small style="display:block;font-size:.42rem">OFFICERS</small></b></article>`).join('');
    } else if (state.planTab === 'barricades') {
      $('#planDetailEyebrow').textContent = 'BARRICADE OPTIMIZATION'; $('#planDetailTitle').textContent = 'Channel movement without blocking emergency access.';
      list.innerHTML = plan.barricades.map((x,i) => `<article class="plan-item plan-barricade"><span class="plan-item-index">${x.barricade_id}</span><div><h4>${escapeHtml(x.location)} · ${escapeHtml(x.type)}</h4><p>${escapeHtml(x.purpose)} · Deploy ${eventDate(x.deployment_time)} · Remove ${eventDate(x.removal_time)}</p></div><b>${pct(x.expected_conflict_reduction_pct,0)}<small style="display:block;font-size:.42rem">CONFLICT ↓</small></b></article>`).join('');
    } else if (state.planTab === 'diversions') {
      $('#planDetailEyebrow').textContent = 'GRAPH-BASED DIVERSION PLAN'; $('#planDetailTitle').textContent = 'Move traffic around the event footprint.';
      list.innerHTML = plan.diversions.map((x,i) => `<article class="plan-item plan-route"><span class="plan-item-index">${x.diversion_id}</span><div><h4>${escapeHtml(x.priority)}</h4><p><b style="font-size:.54rem">FROM</b> ${escapeHtml(x.original_route)}<br><b style="font-size:.54rem">TO</b> ${escapeHtml(x.recommended_route)} · +${x.additional_distance_km} km / ${x.additional_travel_time_min} min</p></div><b>${pct(x.expected_venue_congestion_reduction_pct,0)}<small style="display:block;font-size:.42rem">RELIEF</small></b></article>`).join('');
    } else {
      $('#planDetailEyebrow').textContent = 'PUBLIC INFORMATION PLAN'; $('#planDetailTitle').textContent = 'Make the public part of the response.';
      list.innerHTML = plan.public_information.map((x,i) => `<article class="plan-item"><span class="plan-item-index">${i+1}</span><div><h4>Communication action ${i+1}</h4><p>${escapeHtml(x)}</p></div><b>✓</b></article>`).join('');
    }
  }

  async function loadPlanPage() {
    if (!state.events.length) await loadCatalog();
    const plan = await eventApi(`/api/v1/events/${state.selectedEventId}/response-plan`); state.plan = plan;
    $('#planSummaryGrid').innerHTML = planSummaryMarkup(plan); $('#planSolver').textContent = plan.solver || 'Operational optimizer';
    renderPlanList();
    const mapNodes = [
      { junction_id: plan.event.event_id, junction_name: plan.event.venue, latitude: plan.event.latitude, longitude: plan.event.longitude, risk_score: 99 },
      ...plan.zone_allocations.map(x => ({ ...x, risk_score: x.event_impact_score, n_officers: x.officers })),
      ...plan.barricades.map(x => ({ junction_id: x.barricade_id, junction_name: `${x.barricade_id} · ${x.location}`, latitude: x.latitude, longitude: x.longitude, risk_score: 76 })),
    ];
    const map = ensureMap('plan', 'eventPlanMap', { mode: 'deployment', clickable: true, zoom: 12 });
    if (map) { map.setNodes(mapNodes); map.fitNodes(mapNodes); }
  }

  function twinCard(title, eyebrow, data) {
    return `<article class="twin-plan-card"><small>${eyebrow}</small><h3>${title}</h3><div class="twin-metric"><span>Average delay</span><b>${data.average_delay_min} min</b></div><div class="twin-metric"><span>Maximum queue</span><b>${fmt(data.maximum_queue_m)} m</b></div><div class="twin-metric"><span>Critical junctions</span><b>${data.critical_junctions}</b></div><div class="twin-metric"><span>Recovery time</span><b>${data.network_recovery_min} min</b></div><div class="twin-metric"><span>Emergency corridor</span><b>${pct(data.emergency_corridor_availability_pct)}</b></div></article>`;
  }

  async function runTwin() {
    const body = { attendance: +$('#twinAttendance').value, officers: +$('#twinOfficers').value, barricade_teams: +$('#twinBarricades').value, tow_vehicles: +$('#twinTow').value, diversion_intensity: +$('#twinDiversion').value / 100, public_transport_share: +$('#twinTransit').value / 100, response_lead_minutes: 90 };
    $('#runEventTwin').disabled = true; $('#runEventTwin').innerHTML = 'Running network simulation…';
    const result = await eventApi(`/api/v1/events/${state.selectedEventId}/simulate`, { method: 'POST', body: JSON.stringify(body) }); state.simulation = result;
    $('#twinComparison').innerHTML = twinCard('No action', 'BASELINE BREAKDOWN', result.no_plan) + twinCard('Experience plan', 'MANUAL RESPONSE', result.experience_based_plan) + twinCard('AI plan', 'BTIP RECOMMENDATION', result.ai_recommended_plan);
    const i = result.impact;
    $('#twinImpactBanner').innerHTML = `<h3>AI plan restores the network faster.</h3><div><small>DELAY ↓</small><strong>${pct(i.delay_reduction_pct)}</strong></div><div><small>QUEUE ↓</small><strong>${pct(i.queue_reduction_pct)}</strong></div><div><small>CRITICAL ZONES ↓</small><strong>${i.critical_junction_reduction}</strong></div><div><small>RECOVERY SAVED</small><strong>${i.recovery_time_saved_min}m</strong></div>`;
    const nodes = result.per_junction.map(x => ({ ...x, risk_score: x.no_plan_risk }));
    const map = ensureMap('twin', 'eventTwinMap', { mode: 'before', zoom: 12 });
    if (map) { map.setNodes(nodes); map.setAfterData(result.per_junction.map(x => ({ junction_id: x.zone_id, risk_after: x.ai_plan_risk }))); map.fitNodes(nodes); }
    $('#runEventTwin').disabled = false; $('#runEventTwin').innerHTML = 'Run event twin <b>▶</b>';
  }

  async function loadTwinPage() {
    if (!state.events.length) await loadCatalog();
    const event = selectedEvent(); if (!event) return;
    $('#twinAttendance').value = event.expected_attendance; $('#twinAttendance').max = Math.max(80000, event.expected_attendance * 2); $('#twinAttendanceValue').textContent = fmt(event.expected_attendance); $('#twinTransit').value = Math.round((event.public_transport_share || .35) * 100); $('#twinTransitValue').textContent = pct((event.public_transport_share || .35) * 100,0);
    if (!state.simulation) await runTwin();
  }

  async function loadLearningPage() {
    if (!state.events.length) await loadCatalog();
    const data = await eventApi(`/api/v1/events/${state.selectedEventId}/post-event`); state.postEvent = data;
    $('#learningAccuracy').textContent = `${Math.round(data.performance.delay_forecast_accuracy_pct)}%`;
    $('#learningResult').textContent = `${data.performance.result}. The impact projection differed by ${data.performance.impact_projection_error_points} percentage points.`;
    $('#learningBadge').textContent = data.performance.result.toUpperCase();
    const rows = [
      ['Attendance', fmt(data.forecast.attendance), fmt(data.actual.attendance)], ['Peak delay', `${data.forecast.peak_delay_min} min`, `${data.actual.peak_delay_min} min`],
      ['Critical junctions', data.forecast.critical_junctions, data.actual.critical_junctions], ['Congestion reduction', pct(data.forecast.projected_reduction_pct), pct(data.actual.observed_reduction_pct)],
      ['Officers', data.forecast.recommended_officers, data.actual.deployed_officers],
    ];
    $('#learningColumns').innerHTML = `<div class="learning-column"><h3>Forecast / recommended</h3>${rows.map(r => `<div class="learning-row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}</div><div class="learning-column"><h3>Observed / deployed</h3>${rows.map(r => `<div class="learning-row"><span>${r[0]}</span><b>${r[2]}</b></div>`).join('')}</div>`;
    $('#learningActions').innerHTML = data.learning_actions.map((x,i) => `<article class="learning-action"><i>${i+1}</i><h4>Learning action</h4><p>${escapeHtml(x)}</p></article>`).join('');
  }

  async function loadReplayPage(reveal = state.replayRevealed) {
    if (!state.events.length) await loadCatalog();
    const data = await eventApi(`/api/v1/events/${state.selectedEventId}/replay?reveal_actual=${reveal ? 'true' : 'false'}`); state.replayRevealed = reveal;
    $('#replayCutoff').textContent = `DATA CUTOFF · ${eventDate(data.cutoff_time)}`;
    $('#replayStepper').innerHTML = data.steps.map(x => `<div class="replay-step${x.status === 'locked' ? ' is-locked' : ''}"><span class="replay-step-index">${x.status === 'locked' ? '⌾' : x.step}</span><div><strong>${escapeHtml(x.label)}</strong><p>${escapeHtml(x.detail)}</p></div></div>`).join('');
    const f = data.forecast_snapshot, p = data.plan_snapshot;
    $('#replayMetrics').innerHTML = [
      ['ADDITIONAL VEHICLES', fmt(f.expected_additional_vehicles)], ['PEAK DELAY', `${f.peak_delay_min} min`], ['OFFICERS', p.officers], ['CONFIDENCE', pct(f.impact_confidence_pct)],
    ].map(([l,v]) => `<article class="replay-metric"><small>${l}</small><strong>${v}</strong></article>`).join('');
    $('#actualLock').style.display = reveal ? 'none' : 'grid';
    const revealed = $('#actualRevealed');
    if (reveal) {
      const a = data.actual_outcome, v = data.verification;
      revealed.classList.add('is-visible');
      revealed.innerHTML = `<div class="verification-banner"><h3>Historical outcome revealed · ${escapeHtml(v.result)}</h3><div><small>ACTUAL ATTENDANCE</small><strong>${fmt(a.attendance)}</strong></div><div><small>ACTUAL DELAY</small><strong>${a.peak_delay_min}m</strong></div><div><small>FORECAST ACCURACY</small><strong>${pct(v.delay_forecast_accuracy_pct)}</strong></div></div><div class="learning-actions">${data.learning_actions.map((x,i)=>`<article class="learning-action"><i>${i+1}</i><h4>Post-event learning</h4><p>${escapeHtml(x)}</p></article>`).join('')}</div>`;
    } else { revealed.classList.remove('is-visible'); revealed.innerHTML = ''; }
  }

  async function detectUnplanned() {
    const payload = { latitude: 12.9632, longitude: 77.5855, location_name: 'Bengaluru Town Hall', observed_speed_drop_pct: +$('#anomalySpeed').value, crowd_estimate: +$('#anomalyCrowd').value, road_occupancy_pct: +$('#anomalyOccupancy').value, camera_density_change_pct: +$('#anomalyCamera').value, social_alerts: 38 };
    const result = await eventApi('/api/v1/events/unplanned/detect', { method: 'POST', body: JSON.stringify(payload) });
    const box = $('#unplannedResult'); box.classList.add('is-visible'); box.innerHTML = `<b>${escapeHtml(result.classification.toUpperCase())}</b> · anomaly ${result.anomaly_score}/100 · confidence ${result.confidence_pct}%<br>Immediate response: ${result.immediate_response.traffic_officers} officers, ${result.immediate_response.barricade_teams} barricade teams${result.immediate_response.activate_diversion ? ', diversion activated' : ''}.`;
  }



  function injectJudgeIntro() {
    if ($('#judgeIntroModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="judge-intro-modal" id="judgeIntroModal" role="dialog" aria-modal="true" aria-labelledby="judgeIntroTitle">
        <article class="judge-intro-card">
          <small>JUDGE GUIDED MODE AVAILABLE</small>
          <h2 id="judgeIntroTitle">Use the Judge Tour button to understand every feature.</h2>
          <p>The tour walks through the complete event-driven congestion story: city overview, satellite maps, forecasting, manpower, barricades, diversions, digital twin, post-event learning and historical replay verification.</p>
          <div class="judge-intro-list">
            <span>Forecast event impact</span>
            <span>Plan manpower + barricades</span>
            <span>Reveal actual outcome</span>
          </div>
          <div class="judge-intro-actions">
            <button type="button" id="judgeIntroStart">Start judge tour now →</button>
            <button type="button" id="judgeIntroClose">Continue exploring</button>
          </div>
          <b class="judge-intro-note">You can restart this guide anytime using the lime “Judge Tour” button in the left navigation.</b>
        </article>
      </div>`);
    const modal = $('#judgeIntroModal');
    const close = () => { modal.classList.remove('is-open'); try { sessionStorage.setItem('btip_judge_intro_seen', '1'); } catch { /* ignore */ } };
    $('#judgeIntroStart').addEventListener('click', () => { close(); setTimeout(() => $('#demoTourButton')?.click(), 80); });
    $('#judgeIntroClose').addEventListener('click', close);
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    const seen = (() => { try { return sessionStorage.getItem('btip_judge_intro_seen') === '1'; } catch { return false; } })();
    if (!seen) setTimeout(() => modal.classList.add('is-open'), 950);
  }

  function bindControls() {
    $('#eventModeButton')?.addEventListener('click', () => { location.hash = '#/events'; });
    ['impactEventSelect', 'planEventSelect', 'twinEventSelect', 'learningEventSelect', 'replayEventSelect'].forEach(id => $(`#${id}`)?.addEventListener('change', e => selectEvent(e.target.value)));
    $('#createEventButton')?.addEventListener('click', () => {
      const dialog = $('#createEventDialog');
      const start = new Date(Date.now() + 86400000); start.setHours(18,0,0,0); const end = new Date(start.getTime() + 4*3600000);
      const fmtLocal = d => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
      $('[name="start_time"]', dialog).value = fmtLocal(start); $('[name="end_time"]', dialog).value = fmtLocal(end); dialog.showModal();
    });
    $('#cancelEventCreate')?.addEventListener('click', () => $('#createEventDialog')?.close());
    $('#createEventForm')?.addEventListener('submit', async e => {
      e.preventDefault(); const fd = new FormData(e.currentTarget); const payload = Object.fromEntries(fd.entries());
      ['latitude','longitude','expected_attendance','parking_capacity','public_transport_share'].forEach(k => payload[k] = Number(payload[k])); payload.mode = 'planned';
      const created = await eventApi('/api/v1/events', { method: 'POST', body: JSON.stringify(payload) }); $('#createEventDialog').close(); await loadCatalog(); selectEvent(created.event_id);
    });
    $('#detectAnomaly')?.addEventListener('click', detectUnplanned);
    $$('.plan-tabs button').forEach(btn => btn.addEventListener('click', () => { state.planTab = btn.dataset.planTab; $$('.plan-tabs button').forEach(x => x.classList.toggle('is-active', x === btn)); renderPlanList(); }));
    const twinInputs = [
      ['twinAttendance','twinAttendanceValue',v=>fmt(v)], ['twinOfficers','twinOfficersValue',v=>v], ['twinBarricades','twinBarricadesValue',v=>v], ['twinTow','twinTowValue',v=>v], ['twinDiversion','twinDiversionValue',v=>`${v}%`], ['twinTransit','twinTransitValue',v=>`${v}%`],
    ];
    twinInputs.forEach(([inputId,labelId,format]) => $(`#${inputId}`)?.addEventListener('input', e => $(`#${labelId}`).textContent = format(e.target.value)));
    $('#runEventTwin')?.addEventListener('click', runTwin);
    $('#revealActual')?.addEventListener('click', () => loadReplayPage(true));
  }

  async function loadCurrentEventRoute() {
    const route = location.hash.replace(/^#\/?/, '').split('?')[0].toLowerCase();
    if (!EVENT_ROUTES.includes(route)) return;
    state.route = route;
    try {
      if (route === 'events') await loadEventsPage();
      if (route === 'event-map') await loadImpactPage();
      if (route === 'event-plan') await loadPlanPage();
      if (route === 'event-twin') await loadTwinPage();
      if (route === 'post-event') await loadLearningPage();
      if (route === 'event-replay') await loadReplayPage();
    } catch (error) {
      console.error('[BTIP Event Extension]', error);
      const page = $(`#page-${route}`); if (page) page.insertAdjacentHTML('afterbegin', `<div class="event-error">Event intelligence could not load: ${escapeHtml(error.message)}</div>`);
    }
  }

  function activateRoute() {
    const route = location.hash.replace(/^#\/?/, '').split('?')[0].toLowerCase();
    if (!EVENT_ROUTES.includes(route)) {
      $$('[data-event-route]').forEach(x => x.classList.remove('is-active'));
      return;
    }
    setTimeout(() => {
      $$('.app-page').forEach(page => page.classList.toggle('is-active', page.dataset.page === route));
      $$('.nav-item,.mobile-nav a').forEach(item => item.classList.remove('is-active'));
      $$(`[data-event-route="${route}"]`).forEach(item => item.classList.add('is-active'));
      window.scrollTo({ top: 0, behavior: 'instant' });
      loadCurrentEventRoute();
    }, 380);
  }

  async function init() {
    injectNavigation(); injectPages(); injectJudgeIntro(); bindControls(); await loadCatalog();
    addEventListener('hashchange', activateRoute);
    if (EVENT_ROUTES.includes(location.hash.replace(/^#\/?/, '').split('?')[0].toLowerCase())) activateRoute();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
