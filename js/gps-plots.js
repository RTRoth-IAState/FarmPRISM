// ============================================================
// FARMPRISM — GPS Plot Layout Engine
// Draw a rectangle on satellite map → auto-generates plot grid
// Based on trial design (plots, reps, dimensions)
// ============================================================

let _map = null;
let _tileLayer = null;
let _plotLayers = [];       // L.Polygon layers for each plot
let _rectLayer = null;      // the drawn boundary rectangle
let _gridAngle = 0;         // rotation angle in degrees
let _drawingRect = false;
let _rectStart = null;
let _rectPreview = null;

// Initialize the Leaflet map on step 5
function initLeafletMap() {
  if (_map) {
    setTimeout(() => _map.invalidateSize(), 100);
    return;
  }
  _map = L.map('leaflet-map', { zoomControl: true }).setView([41.6, -93.6], 14);
  _tileLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles © Esri · USDA FSA', maxZoom: 20 }
  ).addTo(_map);

  _map.on('mousedown', onMapMouseDown);
  _map.on('mousemove', onMapMouseMove);
  _map.on('mouseup',   onMapMouseUp);

  // Touch support for mobile
  _map.on('touchstart', e => { if (_drawingRect) onMapMouseDown(e.touches ? {latlng: _map.layerPointToLatLng(_map.mouseEventToLayerPoint(e.originalEvent.touches[0]))} : e); });
  _map.on('touchmove',  e => { if (_drawingRect && e.originalEvent.touches[0]) { e.originalEvent.preventDefault(); onMapMouseMove({latlng: _map.containerPointToLatLng(L.point(e.originalEvent.touches[0].clientX - _map.getContainer().getBoundingClientRect().left, e.originalEvent.touches[0].clientY - _map.getContainer().getBoundingClientRect().top))}); } }, {passive: false});
  _map.on('touchend',   e => { if (_drawingRect) onMapMouseUp(e); });
}

function changeBasemap(type) {
  if (!_map) return;
  _map.removeLayer(_tileLayer);
  _tileLayer = type === 'satellite'
    ? L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {attribution:'Tiles © Esri', maxZoom:20})
    : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'© OpenStreetMap', maxZoom:19});
  _tileLayer.addTo(_map);
}

function locateUser() {
  if (!_map) initLeafletMap();
  _map.locate({ setView: true, maxZoom: 16 });
  _map.once('locationfound', e => {
    L.circleMarker(e.latlng, { radius: 8, color: '#3B6D11', fillColor: '#3B6D11', fillOpacity: 0.8 })
      .addTo(_map).bindPopup('Your location').openPopup();
  });
  _map.once('locationerror', () => alert('Could not get your location. Try entering coordinates manually.'));
}

// ── RECTANGLE DRAWING ─────────────────────────────────────────
function startRectDraw() {
  if (!_map) initLeafletMap();
  _drawingRect = true;
  _map.getContainer().style.cursor = 'crosshair';
  document.getElementById('draw-rect-btn').textContent = '⬜ Drawing... (drag on map)';
  document.getElementById('draw-rect-btn').style.background = 'var(--amber-50)';
  setGpsInfo('Click and drag on the satellite image to outline your trial area');
}

function onMapMouseDown(e) {
  if (!_drawingRect) return;
  _rectStart = e.latlng;
}

function onMapMouseMove(e) {
  if (!_drawingRect || !_rectStart) return;
  const bounds = L.latLngBounds(_rectStart, e.latlng);
  if (_rectPreview) _map.removeLayer(_rectPreview);
  _rectPreview = L.rectangle(bounds, {
    color: '#3B6D11', weight: 2, dashArray: '6 4',
    fillColor: '#3B6D11', fillOpacity: 0.1
  }).addTo(_map);
}

function onMapMouseUp(e) {
  if (!_drawingRect || !_rectStart) return;
  _drawingRect = false;
  _map.getContainer().style.cursor = '';
  document.getElementById('draw-rect-btn').textContent = '⬜ Draw trial area';
  document.getElementById('draw-rect-btn').style.background = '';

  if (_rectPreview) { _map.removeLayer(_rectPreview); _rectPreview = null; }

  const end = e.latlng || _rectStart;
  const bounds = L.latLngBounds(_rectStart, end);
  _rectStart = null;

  // Too small — ignore
  const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
  const widthM = _map.distance(sw, L.latLng(sw.lat, ne.lng));
  const heightM = _map.distance(sw, L.latLng(ne.lat, sw.lng));
  if (widthM < 10 || heightM < 10) {
    setGpsInfo('Area too small — try dragging a larger rectangle');
    return;
  }

  generatePlotGrid(bounds, widthM, heightM);
}

// ── PLOT GRID GENERATION ──────────────────────────────────────
function generatePlotGrid(bounds, widthM, heightM) {
  clearMapPlots();

  const plots = currentDesign.builtPlots || [];
  if (!plots.length) {
    setGpsInfo('⚠️ Go back and finalize the field map first (Step 4)');
    return;
  }

  // Plot dimensions in meters
  const plotLenFt = currentDesign.plotLen || 600;
  const plotRowsFt = (currentDesign.plotRows || 4) * 30; // 30 ft row spacing
  const plotLenM = plotLenFt * 0.3048;
  const plotWidM = plotRowsFt * 0.3048;

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const center = bounds.getCenter();

  // Determine layout: plots run along the long axis
  const landscape = widthM >= heightM;
  const cols = landscape
    ? Math.max(1, Math.round(widthM / plotWidM))
    : Math.max(1, Math.round(widthM / plotLenM));
  const rows = landscape
    ? Math.max(1, Math.round(heightM / plotLenM))
    : Math.max(1, Math.round(heightM / plotWidM));

  // Cell size in degrees (approximate)
  const latPerM  = 1 / 111320;
  const lngPerM  = 1 / (111320 * Math.cos(center.lat * Math.PI / 180));
  const cellH = landscape ? plotLenM : plotWidM;
  const cellW = landscape ? plotWidM : plotLenM;

  const totalCols = cols, totalRows = rows;
  const originLat = sw.lat;
  const originLng = sw.lng;

  // Generate polygons, assign treatments in plot order
  _plotLayers = [];
  const angle = _gridAngle * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);

  let plotIdx = 0;
  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < totalCols; c++) {
      const plot = plots[plotIdx % plots.length];
      const color = plot?.color || plot?.wpColor || '#3B6D11';

      // Corner offsets in meters from SW origin
      const corners = [
        [r * cellH,       c * cellW],
        [r * cellH,      (c+1) * cellW],
        [(r+1) * cellH,  (c+1) * cellW],
        [(r+1) * cellH,   c * cellW],
      ];

      // Apply rotation around center
      const cxM = (totalCols * cellW) / 2;
      const cyM = (totalRows * cellH) / 2;
      const latlngs = corners.map(([dy, dx]) => {
        const rx = (dx - cxM) * cos - (dy - cyM) * sin + cxM;
        const ry = (dx - cxM) * sin + (dy - cyM) * cos + cyM;
        return L.latLng(originLat + ry * latPerM, originLng + rx * lngPerM);
      });

      const poly = L.polygon(latlngs, {
        color: '#fff', weight: 1.5,
        fillColor: color, fillOpacity: 0.65,
      }).addTo(_map);

      const label = plot ? `<strong>${plot.id}</strong><br>${plot.trtName}${plot.block ? '<br>Block ' + plot.block : ''}` : '';
      poly.bindPopup(label);

      // Add label marker at centroid
      const centroid = latlngs.reduce((acc, ll) =>
        [acc[0] + ll.lat / latlngs.length, acc[1] + ll.lng / latlngs.length], [0, 0]);
      const marker = L.marker(centroid, {
        icon: L.divIcon({
          html: `<div style="background:${color};color:white;font-size:9px;font-weight:600;padding:2px 4px;border-radius:3px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.4);">${plot?.id || ''}</div>`,
          iconAnchor: [20, 10], className: ''
        })
      }).addTo(_map);

      _plotLayers.push({ poly, marker, plotIdx: plotIdx % plots.length });

      // Store GPS for this plot
      if (plot) {
        const existing = currentDesign.gpsPlots.findIndex(g => g.plotId === plot.id);
        const gpsEntry = { plotId: plot.id, lat: centroid[0], lng: centroid[1],
          corners: latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng })) };
        if (existing >= 0) currentDesign.gpsPlots[existing] = gpsEntry;
        else currentDesign.gpsPlots.push(gpsEntry);
      }
      plotIdx++;
    }
  }

  // Draw boundary
  if (_rectLayer) _map.removeLayer(_rectLayer);
  _rectLayer = L.rectangle(bounds, { color: '#fff', weight: 2, fillOpacity: 0, dashArray: '4 4' }).addTo(_map);

  const coveredPlots = Math.min(plotIdx, plots.length);
  const areaAc = (widthM * heightM * 0.000247105).toFixed(1);
  setGpsInfo(`✅ ${totalRows} rows × ${totalCols} columns = ${totalRows * totalCols} plot cells · ${coveredPlots} of ${plots.length} trial plots placed · ~${areaAc} acres · Use Rotate buttons to align with field rows`);
  document.getElementById('gps-plot-info').style.display = 'block';
}

function rotateGrid(degrees) {
  _gridAngle = (_gridAngle + degrees + 360) % 360;
  // Re-generate with existing bounds if we have plots
  if (_plotLayers.length && _rectLayer) {
    generatePlotGrid(_rectLayer.getBounds(),
      _map.distance(_rectLayer.getBounds().getSouthWest(), L.latLng(_rectLayer.getBounds().getSouthWest().lat, _rectLayer.getBounds().getNorthEast().lng)),
      _map.distance(_rectLayer.getBounds().getSouthWest(), L.latLng(_rectLayer.getBounds().getNorthEast().lat, _rectLayer.getBounds().getSouthWest().lng))
    );
  }
}

function clearMapPlots() {
  _plotLayers.forEach(({ poly, marker }) => {
    if (_map) { _map.removeLayer(poly); _map.removeLayer(marker); }
  });
  _plotLayers = [];
  if (_rectLayer && _map) { _map.removeLayer(_rectLayer); _rectLayer = null; }
  currentDesign.gpsPlots = [];
  _gridAngle = 0;
  setGpsInfo('');
  document.getElementById('gps-plot-info').style.display = 'none';
}

function setGpsInfo(msg) {
  const el = document.getElementById('gps-plot-info');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

// Legacy stubs to avoid breaking existing references
function toggleDrawMode() { startRectDraw(); }
function onMapClick() {}
