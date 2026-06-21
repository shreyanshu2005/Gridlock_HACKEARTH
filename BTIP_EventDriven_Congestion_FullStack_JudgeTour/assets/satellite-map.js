(() => {
  'use strict';

  const TILE_SIZE = 256;
  const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };
  const DEFAULT_ZOOM = 12;
  const CITY_BOUNDS = { south: 12.74, north: 13.17, west: 77.36, east: 77.84 };
  const COLORS = {
    ink: '#10242c', paper: '#f8f7ef', lime: '#b8ff3d', signal: '#ff6b45', yellow: '#ffc928',
    grass: '#54d566', electric: '#2f73ff', purple: '#8f70ff', white: '#ffffff'
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const svgNS = 'http://www.w3.org/2000/svg';
  const createSVG = (name, attrs = {}) => {
    const node = document.createElementNS(svgNS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  };
  const nodeId = (node) => node.junction_id || node.zone_id || node.id || '';
  const nodeLat = (node) => Number(node.centroid_lat ?? node.latitude ?? node.lat ?? DEFAULT_CENTER.lat);
  const nodeLng = (node) => Number(node.centroid_lng ?? node.longitude ?? node.lng ?? DEFAULT_CENTER.lng);
  const riskColor = (score) => score >= 82 ? COLORS.signal : score >= 66 ? COLORS.yellow : score >= 42 ? COLORS.grass : COLORS.electric;

  function project(lat, lng, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const sin = Math.sin(clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180);
    return {
      x: (lng + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
  }

  function unproject(x, y, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const lng = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
  }

  class BTIPSatelliteMap {
    constructor(container, options = {}) {
      if (!container) throw new Error('BTIPSatelliteMap requires a container element.');
      this.container = container;
      this.mode = options.mode || 'risk';
      this.clickable = Boolean(options.clickable);
      this.onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
      this.quiet = Boolean(options.quiet);
      this.zoom = Number(options.zoom || DEFAULT_ZOOM);
      this.center = { ...(options.center || DEFAULT_CENTER) };
      this.nodes = [];
      this.afterData = null;
      this.selected = null;
      this.hour = 18;
      this.ghostEnabled = true;
      this.clusterEnabled = true;
      this.syncPeers = new Set();
      this.dragState = null;
      this.renderQueued = false;
      this.lastTileError = 0;
      this.destroyed = false;
      this._buildDOM();
      this._bind();
      this.resizeObserver = new ResizeObserver(() => this.render());
      this.resizeObserver.observe(this.container);
      this.render();
    }

    _buildDOM() {
      this.container.classList.add('btip-satellite-map', `map-mode-${this.mode}`);
      this.container.setAttribute('role', 'application');
      this.container.setAttribute('aria-label', this.container.getAttribute('aria-label') || 'Interactive Bengaluru satellite map');
      this.container.tabIndex = 0;
      this.container.innerHTML = `
        <div class="btip-map-base" aria-hidden="true"></div>
        <div class="btip-map-tiles" aria-hidden="true"></div>
        <div class="btip-map-label-tiles" aria-hidden="true"></div>
        <svg class="btip-map-overlay" aria-hidden="true"></svg>
        <div class="btip-map-scan" aria-hidden="true"></div>
        <div class="btip-map-vignette" aria-hidden="true"></div>
        <div class="btip-map-tooltip" role="status"></div>
        <div class="btip-map-controls" aria-label="Map controls">
          <button type="button" data-map-action="zoom-in" aria-label="Zoom in">＋</button>
          <button type="button" data-map-action="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" data-map-action="reset" aria-label="Reset Bengaluru view">◎</button>
        </div>
        <div class="btip-map-provider"><span>LIVE SATELLITE</span><b>ESRI WORLD IMAGERY</b></div>
        <div class="btip-map-attribution">Imagery © Esri · Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community</div>
        <div class="btip-map-offline"><strong>SATELLITE SIGNAL UNAVAILABLE</strong><span>Connect to the internet to load live imagery. Traffic intelligence remains active.</span></div>
      `;
      this.base = this.container.querySelector('.btip-map-base');
      this.tilePane = this.container.querySelector('.btip-map-tiles');
      this.labelPane = this.container.querySelector('.btip-map-label-tiles');
      this.overlay = this.container.querySelector('.btip-map-overlay');
      this.tooltip = this.container.querySelector('.btip-map-tooltip');
    }

    _bind() {
      this.container.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        this.container.setPointerCapture?.(event.pointerId);
        this.dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          dx: 0,
          dy: 0,
          centerWorld: project(this.center.lat, this.center.lng, this.zoom),
        };
        this.container.classList.add('is-dragging');
      });

      this.container.addEventListener('pointermove', (event) => {
        if (this.dragState && event.pointerId === this.dragState.pointerId) {
          const dx = event.clientX - this.dragState.startX;
          const dy = event.clientY - this.dragState.startY;
          this.dragState.dx = dx;
          this.dragState.dy = dy;
          const transform = `translate3d(${dx}px,${dy}px,0)`;
          this.tilePane.style.transform = transform;
          this.labelPane.style.transform = transform;
          this.overlay.style.transform = transform;
          this.tooltip.classList.remove('is-visible');
          return;
        }
        this._updateTooltip(event.clientX, event.clientY);
      });

      const finishDrag = (event) => {
        if (!this.dragState || (event.pointerId != null && event.pointerId !== this.dragState.pointerId)) return;
        const moved = Math.hypot(this.dragState.dx, this.dragState.dy);
        const world = {
          x: this.dragState.centerWorld.x - this.dragState.dx,
          y: this.dragState.centerWorld.y - this.dragState.dy,
        };
        this.dragState = null;
        this.container.classList.remove('is-dragging');
        this.tilePane.style.transform = '';
        this.labelPane.style.transform = '';
        this.overlay.style.transform = '';
        const next = unproject(world.x, world.y, this.zoom);
        this.setView(next, this.zoom);
        if (moved < 7 && this.clickable && event?.clientX != null) this._handleSelect(event.clientX, event.clientY);
      };
      this.container.addEventListener('pointerup', finishDrag);
      this.container.addEventListener('pointercancel', finishDrag);
      this.container.addEventListener('pointerleave', () => {
        if (!this.dragState) this.tooltip.classList.remove('is-visible');
      });

      this.container.addEventListener('wheel', (event) => {
        event.preventDefault();
        const rect = this.container.getBoundingClientRect();
        const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const oldZoom = this.zoom;
        const nextZoom = clamp(this.zoom + (event.deltaY < 0 ? 1 : -1), 10, 17);
        if (nextZoom === oldZoom) return;
        const oldCenter = project(this.center.lat, this.center.lng, oldZoom);
        const oldTopLeft = { x: oldCenter.x - rect.width / 2, y: oldCenter.y - rect.height / 2 };
        const oldCursorWorld = { x: oldTopLeft.x + cursor.x, y: oldTopLeft.y + cursor.y };
        const scale = Math.pow(2, nextZoom - oldZoom);
        const newCursorWorld = { x: oldCursorWorld.x * scale, y: oldCursorWorld.y * scale };
        const newCenterWorld = { x: newCursorWorld.x - cursor.x + rect.width / 2, y: newCursorWorld.y - cursor.y + rect.height / 2 };
        this.setView(unproject(newCenterWorld.x, newCenterWorld.y, nextZoom), nextZoom);
      }, { passive: false });

      this.container.addEventListener('dblclick', (event) => {
        event.preventDefault();
        this.setView(this.center, clamp(this.zoom + 1, 10, 17));
      });

      this.container.querySelectorAll('[data-map-action]').forEach((button) => {
        button.addEventListener('pointerdown', (event) => event.stopPropagation());
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const action = button.dataset.mapAction;
          if (action === 'zoom-in') this.setView(this.center, clamp(this.zoom + 1, 10, 17));
          if (action === 'zoom-out') this.setView(this.center, clamp(this.zoom - 1, 10, 17));
          if (action === 'reset') this.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        });
      });

      this.container.addEventListener('keydown', (event) => {
        const centerWorld = project(this.center.lat, this.center.lng, this.zoom);
        const step = 90;
        if (event.key === '+' || event.key === '=') this.setView(this.center, clamp(this.zoom + 1, 10, 17));
        else if (event.key === '-') this.setView(this.center, clamp(this.zoom - 1, 10, 17));
        else if (event.key === 'ArrowLeft') this.setView(unproject(centerWorld.x - step, centerWorld.y, this.zoom), this.zoom);
        else if (event.key === 'ArrowRight') this.setView(unproject(centerWorld.x + step, centerWorld.y, this.zoom), this.zoom);
        else if (event.key === 'ArrowUp') this.setView(unproject(centerWorld.x, centerWorld.y - step, this.zoom), this.zoom);
        else if (event.key === 'ArrowDown') this.setView(unproject(centerWorld.x, centerWorld.y + step, this.zoom), this.zoom);
        else return;
        event.preventDefault();
      });
    }

    _clampCenter(center) {
      return {
        lat: clamp(Number(center.lat), CITY_BOUNDS.south, CITY_BOUNDS.north),
        lng: clamp(Number(center.lng), CITY_BOUNDS.west, CITY_BOUNDS.east),
      };
    }

    setView(center, zoom = this.zoom, fromSync = false) {
      this.center = this._clampCenter(center);
      this.zoom = clamp(Math.round(Number(zoom) || DEFAULT_ZOOM), 10, 17);
      this.render();
      if (!fromSync) this.syncPeers.forEach((peer) => peer.setView(this.center, this.zoom, true));
    }

    syncWith(peer) {
      if (!peer || peer === this) return;
      this.syncPeers.add(peer);
      peer.syncPeers.add(this);
      peer.setView(this.center, this.zoom, true);
    }

    setMode(mode) {
      this.container.classList.remove(`map-mode-${this.mode}`);
      this.mode = mode || 'risk';
      this.container.classList.add(`map-mode-${this.mode}`);
      this._renderOverlay();
    }

    setNodes(nodes) {
      this.nodes = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
      this._renderOverlay();
    }

    setAfterData(data) {
      this.afterData = Array.isArray(data) ? data : null;
      this._renderOverlay();
    }

    setHour(hour) {
      this.hour = clamp(Number(hour) || 0, 0, 23);
      this._renderOverlay();
    }

    setGhost(enabled) {
      this.ghostEnabled = Boolean(enabled);
      this._renderOverlay();
    }

    setClusterBoundaries(enabled) {
      this.clusterEnabled = Boolean(enabled);
      this._renderOverlay();
    }

    select(zoneId, { focus = false } = {}) {
      this.selected = zoneId;
      const node = this.nodes.find((item) => nodeId(item) === zoneId);
      if (focus && node) this.focus(node);
      else this._renderOverlay();
    }

    focus(node, zoom = Math.max(14, this.zoom)) {
      if (!node) return;
      this.setView({ lat: nodeLat(node), lng: nodeLng(node) }, zoom);
      this.selected = nodeId(node);
      this._renderOverlay();
    }

    fitNodes(nodes = this.nodes, padding = 0.03) {
      if (!nodes?.length) return this.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      if (nodes.length === 1) return this.focus(nodes[0], 14);
      const lats = nodes.map(nodeLat);
      const lngs = nodes.map(nodeLng);
      const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
      const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs), padding);
      const zoom = span < 0.03 ? 14 : span < 0.07 ? 13 : span < 0.16 ? 12 : 11;
      this.setView(center, zoom);
    }

    invalidateSize() {
      this.render();
    }

    render() {
      if (this.destroyed || this.renderQueued) return;
      this.renderQueued = true;
      requestAnimationFrame(() => {
        this.renderQueued = false;
        this._renderTiles();
        this._renderOverlay();
      });
    }

    _renderTiles() {
      const rect = this.container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      if (width < 4 || height < 4) return;
      const centerWorld = project(this.center.lat, this.center.lng, this.zoom);
      const topLeft = { x: centerWorld.x - width / 2, y: centerWorld.y - height / 2 };
      const minX = Math.floor(topLeft.x / TILE_SIZE) - 1;
      const maxX = Math.floor((topLeft.x + width) / TILE_SIZE) + 1;
      const minY = Math.floor(topLeft.y / TILE_SIZE) - 1;
      const maxY = Math.floor((topLeft.y + height) / TILE_SIZE) + 1;
      const tileCount = Math.pow(2, this.zoom);
      const imageryFragment = document.createDocumentFragment();
      const labelFragment = document.createDocumentFragment();
      let pending = 0;
      let loaded = 0;
      const markLoaded = () => {
        loaded += 1;
        if (loaded >= pending) this.container.classList.remove('is-loading-tiles');
      };
      this.container.classList.add('is-loading-tiles');

      for (let tileY = minY; tileY <= maxY; tileY += 1) {
        if (tileY < 0 || tileY >= tileCount) continue;
        for (let tileX = minX; tileX <= maxX; tileX += 1) {
          const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
          const left = tileX * TILE_SIZE - topLeft.x;
          const top = tileY * TILE_SIZE - topLeft.y;
          const imagery = document.createElement('img');
          imagery.alt = '';
          imagery.draggable = false;
          imagery.decoding = 'async';
          imagery.loading = 'eager';
          imagery.style.transform = `translate3d(${Math.round(left)}px,${Math.round(top)}px,0)`;
          imagery.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${this.zoom}/${tileY}/${wrappedX}`;
          imagery.dataset.fallback = '0';
          pending += 1;
          imagery.onload = markLoaded;
          imagery.onerror = () => {
            if (imagery.dataset.fallback === '0') {
              imagery.dataset.fallback = '1';
              imagery.src = `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${this.zoom}/${tileY}/${wrappedX}`;
              return;
            }
            imagery.style.visibility = 'hidden';
            this.lastTileError += 1;
            if (this.lastTileError > 5) this.container.classList.add('tiles-offline');
            markLoaded();
          };
          imageryFragment.appendChild(imagery);

          const labels = document.createElement('img');
          labels.alt = '';
          labels.draggable = false;
          labels.decoding = 'async';
          labels.loading = 'lazy';
          labels.style.transform = `translate3d(${Math.round(left)}px,${Math.round(top)}px,0)`;
          labels.src = `https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${this.zoom}/${tileY}/${wrappedX}`;
          labels.onerror = () => { labels.style.display = 'none'; };
          labelFragment.appendChild(labels);
        }
      }
      this.tilePane.replaceChildren(imageryFragment);
      this.labelPane.replaceChildren(labelFragment);
      if (!pending) this.container.classList.remove('is-loading-tiles');
    }

    _hourFactor() {
      const morning = Math.exp(-Math.pow((this.hour - 9) / 2.7, 2));
      const evening = Math.exp(-Math.pow((this.hour - 18.5) / 3, 2));
      return 0.58 + 0.43 * Math.max(morning, evening);
    }

    _scoreFor(node) {
      let score = Number(node.risk_score ?? node.score ?? 50);
      if (this.afterData) {
        const after = this.afterData.find((item) => item.junction_id === nodeId(node));
        if (after) score = Number(after.risk_after ?? score);
      }
      if (this.mode === 'after' && !this.afterData) score *= 0.72;
      if (this.mode === 'density' || this.mode === 'violations') score *= this._hourFactor();
      return clamp(score, 1, 100);
    }

    _pointFor(node) {
      const rect = this.container.getBoundingClientRect();
      const centerWorld = project(this.center.lat, this.center.lng, this.zoom);
      const world = project(nodeLat(node), nodeLng(node), this.zoom);
      return { x: world.x - centerWorld.x + rect.width / 2, y: world.y - centerWorld.y + rect.height / 2 };
    }

    _renderOverlay() {
      const rect = this.container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      if (width < 4 || height < 4) return;
      this.overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
      this.overlay.replaceChildren();

      const boundary = [
        [13.145, 77.470], [13.150, 77.650], [13.070, 77.770], [12.900, 77.775],
        [12.790, 77.665], [12.810, 77.475], [12.935, 77.405], [13.075, 77.415],
      ];
      const boundaryPoints = boundary.map(([lat, lng]) => {
        const point = this._pointFor({ lat, lng });
        return `${point.x},${point.y}`;
      }).join(' ');
      this.overlay.appendChild(createSVG('polygon', { points: boundaryPoints, class: 'sat-city-boundary' }));

      const visibleNodes = this.nodes.filter((node) => {
        const p = this._pointFor(node);
        return p.x > -90 && p.y > -90 && p.x < width + 90 && p.y < height + 90;
      });
      const pairs = [[0,1],[1,5],[2,7],[3,4],[4,5],[8,9],[6,10],[10,14],[12,13],[0,6],[9,11],[5,15]];
      pairs.forEach(([aIndex, bIndex], index) => {
        const a = this.nodes[aIndex];
        const b = this.nodes[bIndex];
        if (!a || !b) return;
        const p1 = this._pointFor(a);
        const p2 = this._pointFor(b);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const bend = (index % 2 ? 1 : -1) * (14 + index * 1.5);
        const path = createSVG('path', {
          d: `M ${p1.x} ${p1.y} Q ${mx + bend} ${my - bend} ${p2.x} ${p2.y}`,
          class: `sat-route sat-route-${this.mode}`,
        });
        this.overlay.appendChild(path);
      });

      visibleNodes.forEach((node, index) => {
        const point = this._pointFor(node);
        const score = this._scoreFor(node);
        const congestion = Number(node.congestion_score ?? score);
        let color = riskColor(score);
        if (this.mode === 'flow') color = COLORS.electric;
        if (this.mode === 'congestion') color = congestion >= 78 ? COLORS.purple : COLORS.electric;
        if (this.mode === 'forecast') color = index % 2 ? COLORS.signal : COLORS.purple;
        if (this.mode === 'after') color = score >= 66 ? COLORS.yellow : COLORS.grass;
        const radius = this.mode === 'density' || this.mode === 'violations' ? 12 + score * 0.23 : 7 + score * 0.08;

        if (this.clusterEnabled && ['density', 'risk', 'congestion'].includes(this.mode)) {
          const boundaryCircle = createSVG('circle', {
            cx: point.x, cy: point.y, r: radius * 2.15,
            class: 'sat-cluster-ring',
            style: `--node-color:${color}`,
          });
          this.overlay.appendChild(boundaryCircle);
        }

        const halo = createSVG('circle', {
          cx: point.x, cy: point.y, r: radius * 1.75,
          class: 'sat-node-halo',
          style: `--node-color:${color}`,
        });
        this.overlay.appendChild(halo);

        const core = createSVG('circle', {
          cx: point.x, cy: point.y, r: Math.max(5, radius * 0.52),
          class: `sat-node-core${this.selected === nodeId(node) ? ' is-selected' : ''}`,
          fill: color,
          'data-zone': nodeId(node),
        });
        const title = createSVG('title');
        title.textContent = `${node.junction_name || node.name || nodeId(node)} · Risk ${Math.round(score)}`;
        core.appendChild(title);
        this.overlay.appendChild(core);

        if (node.n_officers) {
          const pin = createSVG('g', { class: 'sat-officer-pin', transform: `translate(${point.x},${point.y - radius - 8})` });
          pin.appendChild(createSVG('circle', { cx: 0, cy: 0, r: 14, fill: COLORS.paper, stroke: COLORS.ink, 'stroke-width': 2 }));
          const text = createSVG('text', { x: 0, y: 4, 'text-anchor': 'middle' });
          text.textContent = String(node.n_officers);
          pin.appendChild(text);
          this.overlay.appendChild(pin);
        }

        if (!this.quiet && this.zoom >= 12 && (score >= 65 || this.selected === nodeId(node))) {
          const label = createSVG('g', { class: 'sat-node-label', transform: `translate(${point.x + 10},${point.y - 12})` });
          const name = node.junction_name || node.name || nodeId(node);
          const widthEstimate = Math.max(64, name.length * 6.3 + 18);
          label.appendChild(createSVG('rect', { x: 0, y: -15, width: widthEstimate, height: 22, rx: 8 }));
          const text = createSVG('text', { x: 9, y: 0 });
          text.textContent = name;
          label.appendChild(text);
          this.overlay.appendChild(label);
        }

        if (this.ghostEnabled && this.mode === 'forecast') {
          const ghost = createSVG('circle', {
            cx: point.x + 10 + index * 1.5,
            cy: point.y - 7 - index,
            r: radius * 2.6,
            class: 'sat-forecast-ghost',
          });
          this.overlay.appendChild(ghost);
        }
      });

      if (!visibleNodes.length) {
        const empty = createSVG('text', { x: width / 2, y: height / 2, class: 'sat-empty-label', 'text-anchor': 'middle' });
        empty.textContent = 'NO TRAFFIC SIGNALS IN THIS VIEW';
        this.overlay.appendChild(empty);
      }
    }

    _nearest(clientX, clientY, threshold = 30) {
      const rect = this.container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let best = null;
      let bestDistance = Infinity;
      this.nodes.forEach((node) => {
        const p = this._pointFor(node);
        const distance = Math.hypot(p.x - x, p.y - y);
        if (distance < threshold && distance < bestDistance) {
          best = node;
          bestDistance = distance;
        }
      });
      return best;
    }

    _updateTooltip(clientX, clientY) {
      const node = this._nearest(clientX, clientY, 34);
      if (!node) {
        this.tooltip.classList.remove('is-visible');
        this.container.style.cursor = this.clickable ? 'grab' : 'default';
        return;
      }
      const rect = this.container.getBoundingClientRect();
      const score = this._scoreFor(node);
      this.tooltip.innerHTML = `<small>${nodeId(node)}</small><strong>${node.junction_name || node.name || 'Junction'}</strong><span>Risk ${Math.round(score)} · ${score >= 82 ? 'Critical' : score >= 66 ? 'High' : score >= 42 ? 'Medium' : 'Low'}</span>`;
      this.tooltip.style.left = `${clamp(clientX - rect.left + 15, 8, rect.width - 180)}px`;
      this.tooltip.style.top = `${clamp(clientY - rect.top - 20, 8, rect.height - 82)}px`;
      this.tooltip.classList.add('is-visible');
      this.container.style.cursor = this.clickable ? 'pointer' : 'grab';
    }

    _handleSelect(clientX, clientY) {
      const node = this._nearest(clientX, clientY, 36);
      if (!node) return;
      this.selected = nodeId(node);
      this._renderOverlay();
      this.onSelect?.(node);
    }

    destroy() {
      this.destroyed = true;
      this.resizeObserver?.disconnect();
      this.syncPeers.clear();
      this.container.replaceChildren();
    }
  }

  window.BTIPSatelliteMap = BTIPSatelliteMap;
})();
