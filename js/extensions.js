// ============================================================
// EXTENSIONS — Wires new feature modules into the main app
// ============================================================

// Extend showPage to handle new pages
const _originalShowPage = showPage;
showPage = function(id, btn) {
  // Handle new pages
  if (['weather','power','import'].includes(id)) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const page = document.getElementById('page-' + id);
    if (page) page.classList.add('active');
    const activeBtn = btn || document.querySelector(`[data-page="${id}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    if (id === 'weather') initWeatherPage();
    if (id === 'power') initPowerPage();
    if (id === 'import') initImportPage();
    return;
  }
  _originalShowPage(id, btn);
};

// ── WEATHER PAGE ──────────────────────────────────────────────
function initWeatherPage() {
  populateAllSelectors();
  if (currentCollectTrialId) {
    const sel = document.getElementById('weather-trial-select');
    if (sel) { sel.value = currentCollectTrialId; loadTrialWeather(); }
  }
}

function loadTrialWeather() {
  const id = parseInt(document.getElementById('weather-trial-select').value);
  if (!id) return;
  const trial = appState.trials.find(t => t.id === id);
  if (!trial) return;

  // Check if we have cached weather
  const cached = (appState.weatherCache || {})[id];
  if (cached) {
    renderWeatherPanel('weather-panel', cached.daily, cached.summary, cached.forecast);
    return;
  }

  // Show location input
  document.getElementById('weather-location-row').style.display = 'grid';
  document.getElementById('weather-fetch-btn-row').style.display = 'flex';

  // Pre-fill location from trial field name
  if (trial.field) document.getElementById('weather-location').value = trial.field;

  // Pre-fill start date (April 1 of trial season or planting date)
  const yr = trial.season || new Date().getFullYear();
  document.getElementById('weather-start').value = `${yr}-04-01`;
}

async function fetchWeatherForTrial() {
  const id = parseInt(document.getElementById('weather-trial-select').value);
  const location = document.getElementById('weather-location').value.trim();
  const startDate = document.getElementById('weather-start').value;
  if (!id || !location || !startDate) { alert('Please select a trial and enter a location.'); return; }

  const trial = appState.trials.find(t => t.id === id);
  const loading = document.getElementById('weather-loading');
  const panel = document.getElementById('weather-panel');
  loading.style.display = 'flex';
  panel.innerHTML = '';

  try {
    let lat, lng;
    // Try parsing as coordinates first
    const coordMatch = location.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lng = parseFloat(coordMatch[2]);
    } else if (trial.gpsPlots?.length) {
      lat = trial.gpsPlots[0].lat;
      lng = trial.gpsPlots[0].lng;
    } else {
      // Geocode the location string
      const geo = await geocodeLocation(location);
      lat = geo.lat; lng = geo.lng;
    }

    const endDate = new Date().toISOString().split('T')[0];
    const [historical, forecast] = await Promise.all([
      fetchTrialWeather(lat, lng, startDate, endDate),
      fetchCurrentWeather(lat, lng).catch(() => null),
    ]);

    const daily = calcGDDs(historical);
    const summary = summarizeWeather(daily);

    // Cache it
    if (!appState.weatherCache) appState.weatherCache = {};
    appState.weatherCache[id] = { daily, summary, forecast, lat, lng, fetchedAt: new Date().toISOString() };
    saveState();

    loading.style.display = 'none';
    renderWeatherPanel('weather-panel', daily, summary, forecast);

  } catch (err) {
    loading.style.display = 'none';
    panel.innerHTML = `<div class="info-box" style="background:var(--red-50);color:var(--red-600);">
      ❌ Could not fetch weather: ${err.message}
      <br><br>Try entering coordinates directly (e.g. <strong>42.03, -93.62</strong> for Ames, Iowa).
    </div>`;
  }
}

// ── POWER ANALYSIS PAGE ───────────────────────────────────────
function initPowerPage() {
  renderPowerAnalysis('power-analysis-container');
}

// ── IMPORT PAGE ───────────────────────────────────────────────
function initImportPage() {
  populateAllSelectors();
}

function loadImportTrial() {
  const id = parseInt(document.getElementById('import-trial-select').value);
  if (!id) { document.getElementById('import-panel').innerHTML = ''; return; }
  const trial = appState.trials.find(t => t.id === id);
  if (!trial) return;
  renderImportPanel('import-panel', trial, () => {});
}

// ── EXTEND ANALYZE PAGE — outlier flagging + rich reports ──
const _originalRenderAnalysis = renderAnalysis;
renderAnalysis = function(trial, result, data) {
  _originalRenderAnalysis(trial, result, data);

  // Outlier detection — inject above tabs
  const obs = appState.observations.filter(o => o.trialId === trial.id && !o.excluded);
  const outliers = detectOutliers(obs, trial.plots || []);
  const tabsEl = document.querySelector('#page-analyze .tabs');
  if (tabsEl) {
    let outlierDiv = document.getElementById('outlier-panel');
    if (!outlierDiv) {
      outlierDiv = document.createElement('div');
      outlierDiv.id = 'outlier-panel';
      outlierDiv.style.marginBottom = '14px';
      tabsEl.parentNode.insertBefore(outlierDiv, tabsEl);
    }
    if (outliers.length) renderOutlierPanel('outlier-panel', outliers);
    else outlierDiv.innerHTML = '';
  }

  // Use rich report module
  renderFullReportTab(trial, result, data);
};

// ── EXTEND COLLECT PAGE — photo capture in plot cards ─────────
const _originalBuildPlotGrid = buildPlotGrid;
buildPlotGrid = function(trial) {
  _originalBuildPlotGrid(trial);
  // Add photo counts to collected plot cards
  setTimeout(() => {
    (trial.plots || []).forEach(p => {
      const photos = (appState.photos || []).filter(ph => ph.plotId === p.id && ph.trialId === trial.id);
      if (photos.length) {
        const card = document.querySelector(`.plot-card[data-plotid="${p.id}"]`);
        // Cards don't have data-plotid yet — the count will show in enter tab
      }
    });
  }, 100);
};

// Add photo UI to the data entry form
const _originalOnObsPlotChange = onObsPlotChange;
onObsPlotChange = function() {
  _originalOnObsPlotChange();
  const trial = appState.trials.find(t => t.id === currentCollectTrialId);
  if (!trial) return;
  const plotId = document.getElementById('obs-plot-select')?.value;
  if (!plotId) return;

  // Inject photo UI below the form if not already there
  let photoSection = document.getElementById('photo-section');
  const formCard = document.querySelector('#collect-enter .card');
  if (!photoSection && formCard) {
    photoSection = document.createElement('div');
    photoSection.id = 'photo-section';
    photoSection.style.marginTop = '12px';
    formCard.appendChild(photoSection);
  }
  if (photoSection) {
    const photos = (appState.photos || []).filter(p => p.plotId === plotId && p.trialId === trial.id);
    photoSection.innerHTML = `
      <div class="section-divider">Photos for this plot</div>
      <div id="photos-${plotId}" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
        ${photos.map(p => `
          <div style="position:relative;display:inline-block;">
            <img src="${p.base64}" style="width:80px;height:60px;object-fit:cover;border-radius:6px;border:var(--border);" alt="Plot photo">
            ${p.lat ? `<div style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:white;font-size:8px;padding:1px 3px;border-radius:2px;">📍</div>` : ''}
            <button onclick="deletePhoto(${p.id})" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;">×</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-secondary" style="font-size:12px;" onclick="openPhotoCapture('${plotId}','photos-${plotId}')">
        📷 Add photo
      </button>
    `;
  }
};

// ── BENCHMARKING UI STUB ──────────────────────────────────────
// Full implementation requires a backend API. This provides the UI
// and explains what's needed to activate it.
function renderBenchmarkingPanel(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="cicon">🏆</span> Regional benchmarking</div>
      <div class="info-box amber" style="margin-bottom:14px;">
        <strong>Coming soon — requires backend setup.</strong>
        Regional benchmarking pools anonymized trial data from participating farmers so you can compare your results to neighbors running similar trials. To activate this feature, you'll need to deploy a small API server (Node.js or Supabase) and connect it here.
      </div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:14px;">
        When enabled, this will show:
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        ${['Your yield vs county average', 'Best treatments in your region', 'Top performers by soil type', 'Year-over-year county trends'].map(item =>
          `<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;font-size:13px;color:var(--text2);">
            <span style="opacity:0.4;">📊</span> ${item}
          </div>`
        ).join('')}
      </div>
      <div class="section-divider">Your local data (this device only)</div>
      <div id="local-benchmark"></div>
    </div>
  `;
  renderLocalBenchmark();
}

function renderLocalBenchmark() {
  const el = document.getElementById('local-benchmark');
  if (!el) return;
  // Compute cross-trial statistics from local data
  const completedTrials = appState.trials.filter(t => {
    const obs = appState.observations.filter(o => o.trialId === t.id);
    return obs.length >= (t.plots?.length || 4);
  });
  if (!completedTrials.length) {
    el.innerHTML = `<div style="font-size:13px;color:var(--text2);">Complete at least one trial to see local statistics.</div>`;
    return;
  }
  const rows = completedTrials.map(t => {
    const obs = appState.observations.filter(o => o.trialId === t.id && !o.excluded);
    const vals = obs.map(o => parseFloat(o.value));
    const m = vals.reduce((a,b)=>a+b,0)/vals.length;
    const best = obs.reduce((best, o) => parseFloat(o.value) > parseFloat(best?.value||0) ? o : best, obs[0]);
    const bestPlot = t.plots?.find(p => p.id === best?.plotId);
    return `<tr>
      <td>${t.season}</td>
      <td>${t.name}</td>
      <td>${t.crop}</td>
      <td>${m.toFixed(1)}</td>
      <td>${bestPlot?.trtName || '–'}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Season</th><th>Trial</th><th>Crop</th><th>Grand mean</th><th>Top treatment</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── TRIAL STATE — ensure new trials populate all page selectors ──
const _origSaveTrial = typeof saveTrial !== 'undefined' ? saveTrial : null;

function populateAllSelectors() {
  const trialOptions = '<option value="">— Select trial —</option>' +
    appState.trials.map(t => `<option value="${t.id}">${t.name} (${t.season})</option>`).join('');
  ['collect-trial-select','analyze-trial-select','weather-trial-select','import-trial-select'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = trialOptions;
  });
  // Restore current selections
  if (currentCollectTrialId) {
    const cs = document.getElementById('collect-trial-select');
    if (cs) cs.value = currentCollectTrialId;
  }
  if (currentAnalyzeTrialId) {
    const as = document.getElementById('analyze-trial-select');
    if (as) as.value = currentAnalyzeTrialId;
  }
}

// Patch showPage to always repopulate selectors when switching pages
const _origShowPageExt = showPage;
showPage = function(id, btn) {
  _origShowPageExt(id, btn);
  // After any page switch, ensure all selectors are current
  setTimeout(populateAllSelectors, 50);
};

// ── CHECK FOR SHARED TRIAL ON LOAD ────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkForSharedTrial();
  setTimeout(populateAllSelectors, 200);
});
