// ============================================================
// YIELD MONITOR IMPORT MODULE
// Supports: John Deere, Case IH, Ag Leader, generic CSV
// Matches imported data to trial plots by GPS or treatment order
// ============================================================

// Detect which monitor format based on column headers
function detectMonitorFormat(headers) {
  const h = headers.map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (h.some(c => c.includes('moistpct') || c.includes('yieldmass'))) return 'deere';
  if (h.some(c => c.includes('wetmass') || c.includes('distance'))) return 'agleader';
  if (h.some(c => c.includes('yld_vol_dr') || c.includes('speed_mph'))) return 'case';
  return 'generic';
}

// Column mappings for each monitor type
const FORMAT_MAP = {
  deere: {
    lat: ['latitude', 'lat'],
    lng: ['longitude', 'lon', 'lng'],
    yield: ['yielddrybushelsperacre', 'yield(drybushel/acre)', 'yieldmassperarea'],
    moisture: ['moistpct', 'moisture', 'grainmoisture'],
    speed: ['vehiclespeedmph', 'speed(mph)'],
  },
  agleader: {
    lat: ['latitude', 'lat'],
    lng: ['longitude', 'lon'],
    yield: ['yieldbu/ac', 'yield', 'dryyield'],
    moisture: ['moisture', 'grainmoisture%'],
    speed: ['speed', 'vehiclespeed'],
  },
  case: {
    lat: ['latitude', 'lat'],
    lng: ['longitude', 'lng', 'lon'],
    yield: ['yld_vol_dry', 'dryyield', 'yield'],
    moisture: ['moisture', 'grain_moisture'],
    speed: ['speed_mph', 'speed'],
  },
  generic: {
    lat: ['lat', 'latitude', 'y'],
    lng: ['lon', 'lng', 'longitude', 'x'],
    yield: ['yield', 'dryyield', 'bu_ac', 'bushels'],
    moisture: ['moisture', 'moist', 'moisture_pct'],
    speed: ['speed', 'mph'],
  }
};

function findColumn(headers, candidates) {
  const normalized = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const cand of candidates) {
    const idx = normalized.findIndex(h => h.includes(cand.replace(/[^a-z0-9]/g, '')));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

// Parse yield monitor CSV file
function parseYieldMonitorCSV(csvText) {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  if (result.errors.length && !result.data.length) {
    throw new Error('Could not parse CSV: ' + result.errors[0].message);
  }
  const headers = result.meta.fields || [];
  const format = detectMonitorFormat(headers);
  const map = FORMAT_MAP[format];

  const latCol = findColumn(headers, map.lat);
  const lngCol = findColumn(headers, map.lng);
  const yieldCol = findColumn(headers, map.yield);
  const moistCol = findColumn(headers, map.moisture);
  const speedCol = findColumn(headers, map.speed);

  if (!yieldCol) throw new Error('Could not find yield column. Found columns: ' + headers.join(', '));

  const points = result.data
    .filter(row => {
      const y = parseFloat(row[yieldCol]);
      return y > 0 && y < 500; // Filter obvious errors
    })
    .map(row => ({
      lat: latCol ? parseFloat(row[latCol]) : null,
      lng: lngCol ? parseFloat(row[lngCol]) : null,
      yield: parseFloat(row[yieldCol]),
      moisture: moistCol ? parseFloat(row[moistCol]) : null,
      speed: speedCol ? parseFloat(row[speedCol]) : null,
    }))
    .filter(p => !isNaN(p.yield));

  return { points, format, headers, yieldCol, latCol, lngCol, moistCol };
}

// Match yield points to trial plots using GPS boundaries or sequential order
function matchPointsToPlots(points, plots, gpsPlots) {
  const results = {};

  if (gpsPlots && gpsPlots.length > 0 && points[0]?.lat) {
    // GPS matching: assign each point to nearest plot center
    plots.forEach(plot => {
      const gps = gpsPlots.find(g => g.plotId === plot.id);
      if (!gps) return;
      const plotPoints = points.filter(p => {
        if (!p.lat || !p.lng) return false;
        const dist = haversineDistance(p.lat, p.lng, gps.lat, gps.lng);
        return dist < 200; // within 200 meters
      });
      if (plotPoints.length > 0) {
        // Remove outliers (>2 SD from mean)
        const yields = plotPoints.map(p => p.yield);
        const m = yields.reduce((a, b) => a + b, 0) / yields.length;
        const sd = Math.sqrt(yields.reduce((s, y) => s + (y - m) ** 2, 0) / yields.length);
        const filtered = plotPoints.filter(p => Math.abs(p.yield - m) <= 2 * sd);
        const avgYield = filtered.reduce((s, p) => s + p.yield, 0) / filtered.length;
        const avgMoist = filtered.filter(p => p.moisture).length
          ? filtered.reduce((s, p) => s + (p.moisture || 0), 0) / filtered.length : null;
        results[plot.id] = {
          yield: parseFloat(avgYield.toFixed(2)),
          moisture: avgMoist ? parseFloat(avgMoist.toFixed(1)) : null,
          pointCount: filtered.length,
          method: 'gps',
        };
      }
    });
  } else {
    // No GPS: divide points evenly by plot order (strip harvesting assumption)
    const chunkSize = Math.floor(points.length / plots.length);
    plots.forEach((plot, i) => {
      const chunk = points.slice(i * chunkSize, (i + 1) * chunkSize);
      if (!chunk.length) return;
      const yields = chunk.map(p => p.yield);
      const m = yields.reduce((a, b) => a + b, 0) / yields.length;
      const sd = Math.sqrt(yields.reduce((s, y) => s + (y - m) ** 2, 0) / yields.length);
      const filtered = chunk.filter(p => Math.abs(p.yield - m) <= 2 * sd);
      const avgYield = filtered.reduce((s, p) => s + p.yield, 0) / filtered.length;
      results[plot.id] = {
        yield: parseFloat(avgYield.toFixed(2)),
        moisture: null,
        pointCount: filtered.length,
        method: 'sequential',
      };
    });
  }

  return results;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Render import UI
function renderImportPanel(containerId, trial, onImportComplete) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="cicon">📥</span> Import yield monitor data</div>
      <div class="info-box blue" style="margin-bottom:12px;">
        Supports John Deere Operations Center, Ag Leader SMS, Case IH AFS, and generic CSV exports.
        Yield values will be automatically matched to your trial plots.
      </div>
      <div id="import-dropzone" style="
        border:2px dashed var(--text3);border-radius:var(--radius);
        padding:32px;text-align:center;cursor:pointer;transition:all 0.15s;
        background:var(--surface2);
      " onclick="document.getElementById('yield-file-input').click()"
         ondragover="event.preventDefault();this.style.borderColor='var(--green-600)'"
         ondragleave="this.style.borderColor='var(--text3)'"
         ondrop="handleYieldDrop(event,'${trial.id}')">
        <div style="font-size:32px;margin-bottom:8px;">📊</div>
        <div style="font-size:14px;font-weight:500;margin-bottom:4px;">Drop yield monitor CSV here</div>
        <div style="font-size:12px;color:var(--text2);">or click to browse · John Deere, Ag Leader, Case IH, generic CSV</div>
      </div>
      <input type="file" id="yield-file-input" accept=".csv,.txt" style="display:none"
        onchange="handleYieldFile(event,'${trial.id}')">
      <div id="import-status" style="margin-top:12px;"></div>
      <div id="import-preview" style="margin-top:12px;"></div>
    </div>
  `;
}

function handleYieldDrop(event, trialId) {
  event.preventDefault();
  document.getElementById('import-dropzone').style.borderColor = 'var(--text3)';
  const file = event.dataTransfer.files[0];
  if (file) processYieldFile(file, parseInt(trialId));
}

function handleYieldFile(event, trialId) {
  const file = event.target.files[0];
  if (file) processYieldFile(file, parseInt(trialId));
}

function processYieldFile(file, trialId) {
  const status = document.getElementById('import-status');
  status.innerHTML = `<div class="info-box blue">⏳ Reading file...</div>`;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const trial = appState.trials.find(t => t.id === trialId);
      if (!trial) throw new Error('Trial not found');
      const { points, format } = parseYieldMonitorCSV(e.target.result);
      const matched = matchPointsToPlots(points, trial.plots || [], trial.gpsPlots || []);
      const matchCount = Object.keys(matched).length;

      status.innerHTML = `<div class="info-box green">
        ✅ Detected format: <strong>${format}</strong> · ${points.length.toLocaleString()} data points read · ${matchCount} plots matched
        ${matched[Object.keys(matched)[0]]?.method === 'sequential' ? '<br>⚠️ No GPS data found — matched by sequential plot order. Verify plot assignments below.' : ''}
      </div>`;

      renderImportPreview(matched, trial);
    } catch (err) {
      status.innerHTML = `<div class="info-box" style="background:var(--red-50);color:var(--red-600);">❌ ${err.message}</div>`;
    }
  };
  reader.readAsText(file);
}

function renderImportPreview(matched, trial) {
  const preview = document.getElementById('import-preview');
  const rows = (trial.plots || []).map(p => {
    const m = matched[p.id];
    return `<tr>
      <td>${p.id}</td>
      <td>${p.trtName}</td>
      <td>${p.block || '–'}</td>
      <td>${m ? `<strong>${m.yield}</strong> bu/ac` : '<span style="color:var(--text3);">No data</span>'}</td>
      <td>${m?.moisture ? `${m.moisture}%` : '–'}</td>
      <td>${m?.pointCount || '–'}</td>
    </tr>`;
  }).join('');

  preview.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Plot</th><th>Treatment</th><th>Block</th><th>Avg yield</th><th>Moisture</th><th>Points</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="btn-row" style="margin-top:12px;">
      <button class="btn btn-primary" onclick="applyYieldImport(${JSON.stringify(matched).replace(/"/g,'&quot;')}, ${trial.id})">
        ✅ Apply to trial observations
      </button>
      <button class="btn btn-secondary" onclick="document.getElementById('import-preview').innerHTML=''">Cancel</button>
    </div>
  `;
}

function applyYieldImport(matched, trialId) {
  const trial = appState.trials.find(t => t.id === trialId);
  if (!trial) return;
  const today = new Date().toISOString().split('T')[0];
  let count = 0;
  Object.entries(matched).forEach(([plotId, data]) => {
    if (!data.yield) return;
    const existing = appState.observations.findIndex(o => o.trialId === trialId && o.plotId === plotId);
    const obs = {
      id: existing >= 0 ? appState.observations[existing].id : appState.nextObsId++,
      trialId, plotId,
      value: data.yield,
      secondary: data.moisture || '',
      date: today,
      notes: `Imported from yield monitor (${data.pointCount} points, ${data.method} match)`,
      savedAt: new Date().toISOString(),
      source: 'yield_monitor',
    };
    if (existing >= 0) appState.observations[existing] = obs;
    else appState.observations.push(obs);
    count++;
  });
  saveState();
  document.getElementById('import-status').innerHTML = `<div class="info-box green">✅ ${count} plot observations saved successfully.</div>`;
  document.getElementById('import-preview').innerHTML = '';
  if (typeof updateCollectProgress === 'function') updateCollectProgress(trial);
  if (typeof buildPlotGrid === 'function') buildPlotGrid(trial);
}
