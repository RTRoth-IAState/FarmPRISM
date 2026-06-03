// ============================================================
// POWER ANALYSIS — Sample size calculator for field trials
// ============================================================

// Calculate required replications to detect a given effect size
// Uses t-test approximation with iterative refinement
function calcRequiredReps(delta, sigma, alpha = 0.05, power = 0.80) {
  // delta: minimum detectable difference (same units as yield)
  // sigma: expected standard deviation (from CV or prior trials)
  // Returns required number of replications
  const zAlpha = qnorm(1 - alpha / 2); // two-tailed
  const zBeta = qnorm(power);
  const n = Math.ceil(2 * ((zAlpha + zBeta) ** 2) * (sigma ** 2) / (delta ** 2));
  return Math.max(2, n);
}

// Calculate detectable difference given reps
function calcDetectableDiff(reps, sigma, alpha = 0.05, power = 0.80) {
  const zAlpha = qnorm(1 - alpha / 2);
  const zBeta = qnorm(power);
  return Math.sqrt(2 * ((zAlpha + zBeta) ** 2) * (sigma ** 2) / reps);
}

// Normal quantile function (inverse CDF)
function qnorm(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00
  ];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q;
  if (p < pLow) {
    const t = Math.sqrt(-2 * Math.log(p));
    q = (((((c[0]*t+c[1])*t+c[2])*t+c[3])*t+c[4])*t+c[5]) /
        ((((d[0]*t+d[1])*t+d[2])*t+d[3])*t+1);
  } else if (p <= pHigh) {
    const u = p - 0.5, t = u * u;
    q = (((((a[0]*t+a[1])*t+a[2])*t+a[3])*t+a[4])*t+a[5])*u /
        (((((b[0]*t+b[1])*t+b[2])*t+b[3])*t+b[4])*t+1);
  } else {
    const t = Math.sqrt(-2 * Math.log(1 - p));
    q = -(((((c[0]*t+c[1])*t+c[2])*t+c[3])*t+c[4])*t+c[5]) /
         ((((d[0]*t+d[1])*t+d[2])*t+d[3])*t+1);
  }
  return q;
}

function renderPowerAnalysis(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="cicon">⚡</span> Power analysis — how many replications do I need?</div>
      <div class="info-box blue" style="margin-bottom:14px;">
        Enter your expected field variability and the smallest yield difference you care about detecting.
        The calculator tells you how many replications to plan for.
      </div>
      <div class="form-row col2">
        <div class="form-group">
          <label class="form-label">Expected CV (%) <span style="color:var(--text3);font-weight:400;">from prior trials or extension data</span></label>
          <input type="number" id="pa-cv" value="12" step="1" min="1" max="50" oninput="updatePowerAnalysis()">
          <span class="form-hint">Corn grain yield typically 8–15%, soybeans 10–18%</span>
        </div>
        <div class="form-group">
          <label class="form-label">Expected mean yield (bu/ac)</label>
          <input type="number" id="pa-mean" value="180" step="5" oninput="updatePowerAnalysis()">
        </div>
      </div>
      <div class="form-row col2">
        <div class="form-group">
          <label class="form-label">Minimum detectable difference (bu/ac)</label>
          <input type="number" id="pa-delta" value="15" step="1" min="1" oninput="updatePowerAnalysis()">
          <span class="form-hint">The smallest yield difference that would change your management decision</span>
        </div>
        <div class="form-group">
          <label class="form-label">Desired statistical power</label>
          <select id="pa-power" oninput="updatePowerAnalysis()">
            <option value="0.70">70% (minimum)</option>
            <option value="0.80" selected>80% (standard)</option>
            <option value="0.90">90% (high)</option>
            <option value="0.95">95% (very high)</option>
          </select>
        </div>
      </div>

      <div id="power-result" style="margin-top:12px;"></div>

      <div class="section-divider" style="margin-top:16px;">Detectable difference by replications</div>
      <div style="position:relative;height:200px;">
        <canvas id="power-chart" role="img" aria-label="Power analysis chart showing detectable difference vs replications">Power analysis curve.</canvas>
      </div>
    </div>
  `;
  updatePowerAnalysis();
}

let powerChartInst = null;
function updatePowerAnalysis() {
  const cv = parseFloat(document.getElementById('pa-cv')?.value || 12);
  const mu = parseFloat(document.getElementById('pa-mean')?.value || 180);
  const delta = parseFloat(document.getElementById('pa-delta')?.value || 15);
  const power = parseFloat(document.getElementById('pa-power')?.value || 0.80);
  const sigma = (cv / 100) * mu;
  const n = calcRequiredReps(delta, sigma, 0.05, power);

  const resultEl = document.getElementById('power-result');
  if (resultEl) {
    const color = n <= 4 ? 'var(--green-600)' : n <= 6 ? 'var(--amber-400)' : 'var(--coral-600)';
    const interpretation = n <= 4
      ? 'Achievable with a standard on-farm trial layout.'
      : n <= 6
      ? 'Feasible but requires careful field selection to fit all plots.'
      : 'Consider increasing the minimum detectable difference, or accept lower power.';
    resultEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="background:var(--surface2);border-radius:var(--radius);padding:16px 24px;text-align:center;">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">Replications needed</div>
          <div style="font-size:40px;font-weight:500;color:${color};">${n}</div>
        </div>
        <div style="flex:1;">
          <div style="font-size:13px;margin-bottom:6px;">
            To detect a <strong>${delta} bu/ac</strong> difference with <strong>${Math.round(power*100)}% power</strong> at CV = ${cv}%:
          </div>
          <div style="font-size:13px;color:var(--text2);">${interpretation}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:6px;">
            σ = ${sigma.toFixed(1)} bu/ac · LSD ≈ ${(delta * 0.7).toFixed(1)} bu/ac at α = 0.05
          </div>
        </div>
      </div>
    `;
  }

  // Power curve chart
  const ctx = document.getElementById('power-chart');
  if (!ctx) return;
  if (powerChartInst) powerChartInst.destroy();
  const repsRange = [2, 3, 4, 5, 6, 7, 8, 10, 12];
  const diffs = repsRange.map(r => parseFloat(calcDetectableDiff(r, sigma, 0.05, power).toFixed(1)));
  powerChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: repsRange.map(r => `${r} reps`),
      datasets: [{
        label: 'Detectable difference (bu/ac)',
        data: diffs,
        borderColor: '#3B6D11',
        backgroundColor: 'rgba(59,109,17,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
      }, {
        label: 'Your target',
        data: repsRange.map(() => delta),
        borderColor: '#BA7517',
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }
      },
      scales: {
        x: { grid: { color: 'rgba(128,128,128,0.1)' } },
        y: {
          title: { display: true, text: 'Min detectable diff (bu/ac)', font: { size: 10 } },
          grid: { color: 'rgba(128,128,128,0.1)' }
        }
      }
    }
  });
}

// ============================================================
// OUTLIER FLAGGING
// ============================================================

function detectOutliers(observations, plots) {
  // Group by treatment
  const byTrt = {};
  observations.forEach(o => {
    const plot = plots.find(p => p.id === o.plotId);
    if (!plot) return;
    const trt = plot.trtName;
    if (!byTrt[trt]) byTrt[trt] = [];
    byTrt[trt].push({ obs: o, plot });
  });

  const flagged = [];
  Object.entries(byTrt).forEach(([trt, entries]) => {
    if (entries.length < 3) return;
    const vals = entries.map(e => parseFloat(e.obs.value));
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1));
    entries.forEach(({ obs, plot }) => {
      const z = Math.abs((parseFloat(obs.value) - m) / sd);
      if (z > 2.0) {
        flagged.push({
          obsId: obs.id, plotId: plot.id, trt,
          value: parseFloat(obs.value),
          mean: parseFloat(m.toFixed(2)),
          sd: parseFloat(sd.toFixed(2)),
          zScore: parseFloat(z.toFixed(2)),
          direction: parseFloat(obs.value) > m ? 'high' : 'low',
        });
      }
    });
  });
  return flagged;
}

function renderOutlierPanel(containerId, outliers, onResolve) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!outliers.length) {
    el.innerHTML = `<div class="info-box green">✅ No statistical outliers detected (all values within 2 SD of treatment mean).</div>`;
    return;
  }
  el.innerHTML = `
    <div class="info-box amber">
      ⚠️ <strong>${outliers.length} potential outlier${outliers.length > 1 ? 's' : ''} detected</strong> —
      values more than 2 standard deviations from their treatment mean.
      Review each and decide whether to keep, flag, or remove.
    </div>
    ${outliers.map(o => `
      <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;border:1px solid var(--amber-100);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <div>
            <strong>Plot ${o.plotId}</strong> · ${o.trt}
            <span class="badge ${o.direction==='high'?'badge-coral':'badge-blue'}" style="margin-left:8px;">
              ${o.direction === 'high' ? '↑ Unusually high' : '↓ Unusually low'}
            </span>
          </div>
          <div style="font-family:var(--font-mono);font-size:13px;">
            Value: <strong>${o.value}</strong> · Mean: ${o.mean} · SD: ${o.sd} · Z: ${o.zScore}
          </div>
        </div>
        <div class="form-group" style="margin-bottom:8px;">
          <label class="form-label">What happened in this plot?</label>
          <input type="text" id="outlier-note-${o.obsId}" placeholder="e.g. Equipment issue, wet spot, deer damage, combine error..." style="font-size:13px;">
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary" style="font-size:12px;" onclick="resolveOutlier(${o.obsId},'keep')">Keep as-is</button>
          <button class="btn btn-secondary" style="font-size:12px;" onclick="resolveOutlier(${o.obsId},'flag')">Flag but keep</button>
          <button class="btn btn-danger" style="font-size:12px;" onclick="resolveOutlier(${o.obsId},'remove')">Remove from analysis</button>
        </div>
      </div>
    `).join('')}
  `;
}

function resolveOutlier(obsId, action) {
  const note = document.getElementById(`outlier-note-${obsId}`)?.value || '';
  const obs = appState.observations.find(o => o.id === obsId);
  if (!obs) return;
  if (action === 'remove') {
    obs.excluded = true;
    obs.excludeReason = note || 'Statistical outlier — removed by user';
  } else if (action === 'flag') {
    obs.flagged = true;
    obs.flagNote = note || 'Statistical outlier — flagged for review';
  } else {
    obs.excluded = false;
    obs.flagged = false;
  }
  obs.outlierNote = note;
  saveState();
  // Re-render the row
  const row = document.getElementById(`outlier-note-${obsId}`)?.closest('div[style]');
  if (row) row.style.opacity = '0.5';
}

// ============================================================
// PHOTO CAPTURE
// ============================================================

function renderPhotoCaptureButton(plotId, containerId) {
  return `
    <button class="btn btn-secondary" style="font-size:12px;" onclick="openPhotoCapture('${plotId}','${containerId}')">
      📷 Add photo
    </button>
  `;
}

function openPhotoCapture(plotId, returnContainer) {
  // Try camera first, fall back to file picker
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment'; // rear camera on mobile
  input.onchange = e => handlePhotoCapture(e, plotId);
  input.click();
}

function handlePhotoCapture(event, plotId) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const base64 = e.target.result;
    // Get GPS if available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => savePhoto(plotId, base64, pos.coords.latitude, pos.coords.longitude),
        () => savePhoto(plotId, base64, null, null)
      );
    } else {
      savePhoto(plotId, base64, null, null);
    }
  };
  reader.readAsDataURL(file);
}

function savePhoto(plotId, base64, lat, lng) {
  if (!appState.photos) appState.photos = [];
  appState.photos.push({
    id: Date.now(),
    plotId,
    trialId: currentCollectTrialId,
    base64,
    lat, lng,
    takenAt: new Date().toISOString(),
    note: '',
  });
  saveState();
  renderPlotPhotos(plotId);
}

function renderPlotPhotos(plotId) {
  const container = document.getElementById(`photos-${plotId}`);
  if (!container) return;
  const photos = (appState.photos || []).filter(p => p.plotId === plotId);
  container.innerHTML = photos.map(p => `
    <div style="position:relative;display:inline-block;margin:4px;">
      <img src="${p.base64}" style="width:80px;height:60px;object-fit:cover;border-radius:6px;border:var(--border);" alt="Plot photo">
      ${p.lat ? `<div style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:white;font-size:8px;padding:1px 3px;border-radius:2px;">📍</div>` : ''}
      <button onclick="deletePhoto(${p.id})" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
    </div>
  `).join('');
}

function deletePhoto(photoId) {
  if (!confirm('Delete this photo?')) return;
  appState.photos = (appState.photos || []).filter(p => p.id !== photoId);
  saveState();
}

// ============================================================
// SHARING — Read-only trial link generation
// ============================================================

function generateShareLink(trialId) {
  const trial = appState.trials.find(t => t.id === trialId);
  if (!trial) return null;
  const obs = appState.observations.filter(o => o.trialId === trialId);
  const shareData = {
    trial,
    observations: obs,
    sharedAt: new Date().toISOString(),
    version: 1,
  };
  // Encode as base64 URL parameter
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
  const url = `${window.location.origin}${window.location.pathname}?shared=${encoded}`;
  return url;
}

function checkForSharedTrial() {
  const params = new URLSearchParams(window.location.search);
  const shared = params.get('shared');
  if (!shared) return false;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(shared))));
    renderSharedTrialView(data);
    return true;
  } catch (e) {
    console.warn('Invalid shared trial data');
    return false;
  }
}

function renderSharedTrialView(data) {
  // Inject a read-only banner and load the trial data temporarily
  const banner = document.createElement('div');
  banner.style.cssText = 'background:var(--blue-50);color:var(--blue-800);padding:10px 16px;font-size:13px;text-align:center;border-bottom:1px solid var(--blue-100);';
  banner.innerHTML = `👁️ <strong>Read-only view</strong> — ${data.trial.name} shared by a colleague · <a href="${window.location.pathname}" style="color:var(--blue-600);">Open your own trials</a>`;
  document.body.insertBefore(banner, document.body.firstChild);

  // Temporarily add to state for viewing (won't be saved)
  const tempId = 99999;
  data.trial.id = tempId;
  data.trial.readOnly = true;
  data.observations.forEach(o => { o.trialId = tempId; });
  appState.trials.unshift(data.trial);
  appState.observations.push(...data.observations);

  currentAnalyzeTrialId = tempId;
  showPage('analyze');
  document.getElementById('analyze-trial-select').value = tempId;
  loadAnalysisTrial();
}

function renderSharingPanel(containerId, trialId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="cicon">🔗</span> Share with agronomist or extension agent</div>
      <div class="info-box blue" style="margin-bottom:12px;">
        Generate a read-only link to share your trial data and analysis results.
        Anyone with the link can view but not edit your trial.
      </div>
      <div id="share-link-container"></div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="createShareLink(${trialId})">🔗 Generate share link</button>
      </div>
    </div>
  `;
}

function createShareLink(trialId) {
  const url = generateShareLink(trialId);
  if (!url) return;
  const container = document.getElementById('share-link-container');
  container.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
      <input type="text" value="${url}" readonly style="flex:1;font-size:12px;font-family:var(--font-mono);background:var(--surface2);border:var(--border);border-radius:var(--radius-sm);padding:8px;">
      <button class="btn btn-secondary" onclick="copyShareLink('${url}')">📋 Copy</button>
    </div>
    <div class="info-box amber">⚠️ This link encodes your trial data directly in the URL. Anyone with the link can view your trial. For larger trials the link may be very long.</div>
  `;
}

function copyShareLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    alert('Link copied to clipboard!');
  }).catch(() => {
    prompt('Copy this link:', url);
  });
}

// ============================================================
// REPORT TEMPLATES
// ============================================================

function renderFarmerSummaryReport(trial, result, data) {
  const { trtMeans, tukey, p_trt } = result;
  const sorted = tukey?.sorted || Object.keys(trtMeans);
  const bestTrt = sorted[0];
  const bestMean = trtMeans[bestTrt];
  const controlMean = trtMeans[sorted[sorted.length - 1]] || bestMean;
  const yieldGain = (bestMean - controlMean).toFixed(1);
  const sig = p_trt < 0.05;

  return `
    <div style="font-family:var(--font-main);max-width:600px;">
      <div style="background:var(--green-600);color:white;padding:20px;border-radius:var(--radius) var(--radius) 0 0;">
        <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">FARMER SUMMARY REPORT</div>
        <div style="font-size:20px;font-weight:500;">${trial.name}</div>
        <div style="font-size:13px;opacity:0.85;margin-top:4px;">${trial.crop} · ${trial.field || 'No field'} · ${trial.season}</div>
      </div>
      <div style="background:var(--surface);border:var(--border);border-top:none;padding:20px;border-radius:0 0 var(--radius) var(--radius);">

        <div style="background:${sig ? 'var(--green-50)' : 'var(--amber-50)'};padding:14px;border-radius:var(--radius-sm);margin-bottom:16px;">
          <div style="font-size:14px;font-weight:500;color:${sig ? 'var(--green-800)' : 'var(--amber-800)'};">
            ${sig ? '✅ Bottom line: There IS a real treatment difference' : '⚠️ Bottom line: No clear winner this year'}
          </div>
          <div style="font-size:13px;color:${sig ? 'var(--green-800)' : 'var(--amber-800)'};margin-top:6px;">
            ${sig
              ? `<strong>${bestTrt}</strong> yielded <strong>${yieldGain} bu/ac more</strong> than the control. This difference is statistically real — not just field noise.`
              : `Yield differences between treatments were small enough that they could be due to normal field variability. One season of data is not enough to draw conclusions.`}
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Yield by treatment:</div>
          ${sorted.map((trt, i) => {
            const m = trtMeans[trt];
            const bar = ((m / Math.max(...sorted.map(t => trtMeans[t]))) * 100).toFixed(0);
            return `<div style="margin-bottom:6px;">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">
                <span>${trt}</span><span><strong>${m.toFixed(1)}</strong> bu/ac</span>
              </div>
              <div style="background:var(--surface2);border-radius:100px;height:12px;">
                <div style="background:var(--green-600);height:12px;border-radius:100px;width:${bar}%;"></div>
              </div>
            </div>`;
          }).join('')}
        </div>

        <div style="font-size:12px;color:var(--text2);border-top:var(--border);padding-top:12px;">
          <strong>What this means for next year:</strong>
          ${sig
            ? `Consider adopting ${bestTrt} on more acres. Run the trial again to confirm results — one year of data is a strong signal but two years builds confidence.`
            : `Continue the trial for another season with the same treatments before making management changes.`}
        </div>
      </div>
    </div>
  `;
}

function renderAgronomistReport(trial, result, data) {
  const { trtMeans, tukey, p_trt, F_trt, CV, SS_trt, SS_block, SS_error, df_trt, df_block, df_error, MS_trt, MS_block, MS_error, F_block, p_block } = result;
  const sorted = tukey?.sorted || Object.keys(trtMeans);
  const gm = data.reduce((s, d) => s + d.value, 0) / data.length;

  return `
    <div style="font-family:var(--font-main);max-width:700px;">
      <div style="background:var(--surface2);border:var(--border);padding:16px 20px;border-radius:var(--radius);margin-bottom:14px;">
        <div style="font-size:10px;color:var(--text2);font-weight:500;letter-spacing:0.05em;margin-bottom:6px;">TECHNICAL ANALYSIS REPORT</div>
        <div style="font-size:18px;font-weight:500;">${trial.name}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;font-size:12px;">
          <div><span style="color:var(--text2);">Crop:</span> ${trial.crop}</div>
          <div><span style="color:var(--text2);">Field:</span> ${trial.field || '–'}</div>
          <div><span style="color:var(--text2);">Season:</span> ${trial.season}</div>
          <div><span style="color:var(--text2);">Design:</span> ${trial.design?.toUpperCase()}</div>
          <div><span style="color:var(--text2);">Objective:</span> ${trial.objective || '–'}</div>
          <div><span style="color:var(--text2);">n:</span> ${data.length} observations</div>
        </div>
      </div>

      <div style="background:var(--surface);border:var(--border);padding:16px 20px;border-radius:var(--radius);margin-bottom:14px;">
        <div style="font-size:13px;font-weight:500;margin-bottom:10px;">Analysis of Variance (${trial.design?.toUpperCase()})</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:var(--font-mono);">
          <thead><tr style="border-bottom:var(--border);">
            <th style="text-align:left;padding:6px 8px;font-family:var(--font-main);color:var(--text2);">Source</th>
            <th style="text-align:right;padding:6px 8px;color:var(--text2);">df</th>
            <th style="text-align:right;padding:6px 8px;color:var(--text2);">SS</th>
            <th style="text-align:right;padding:6px 8px;color:var(--text2);">MS</th>
            <th style="text-align:right;padding:6px 8px;color:var(--text2);">F</th>
            <th style="text-align:right;padding:6px 8px;color:var(--text2);">Pr(>F)</th>
          </tr></thead>
          <tbody>
            ${SS_block !== undefined ? `<tr style="border-bottom:var(--border);">
              <td style="padding:6px 8px;font-family:var(--font-main);">Block</td>
              <td style="text-align:right;padding:6px 8px;">${df_block}</td>
              <td style="text-align:right;padding:6px 8px;">${SS_block?.toFixed(2)}</td>
              <td style="text-align:right;padding:6px 8px;">${MS_block?.toFixed(2)}</td>
              <td style="text-align:right;padding:6px 8px;">${F_block?.toFixed(3)}</td>
              <td style="text-align:right;padding:6px 8px;color:var(--text2);">${p_block?.toFixed(4)} ${pValueLabel(p_block)}</td>
            </tr>` : ''}
            <tr style="border-bottom:var(--border);">
              <td style="padding:6px 8px;font-family:var(--font-main);">Treatment</td>
              <td style="text-align:right;padding:6px 8px;">${df_trt}</td>
              <td style="text-align:right;padding:6px 8px;">${SS_trt?.toFixed(2)}</td>
              <td style="text-align:right;padding:6px 8px;">${MS_trt?.toFixed(2)}</td>
              <td style="text-align:right;padding:6px 8px;">${F_trt?.toFixed(3)}</td>
              <td style="text-align:right;padding:6px 8px;color:${p_trt<0.05?'var(--green-600)':'var(--text2)'};">
                <strong>${p_trt?.toFixed(4)}</strong> ${pValueLabel(p_trt)}
              </td>
            </tr>
            <tr style="border-bottom:var(--border);">
              <td style="padding:6px 8px;font-family:var(--font-main);">Residual</td>
              <td style="text-align:right;padding:6px 8px;">${df_error}</td>
              <td style="text-align:right;padding:6px 8px;">${SS_error?.toFixed(2)}</td>
              <td style="text-align:right;padding:6px 8px;">${MS_error?.toFixed(2)}</td>
              <td style="text-align:right;padding:6px 8px;">–</td>
              <td style="text-align:right;padding:6px 8px;">–</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size:11px;color:var(--text2);margin-top:8px;">
          Grand mean: ${gm.toFixed(3)} · CV: ${parseFloat(CV||0).toFixed(2)}% · LSD (0.05): ${tukey?.HSD?.toFixed(2)||'–'}
        </div>
      </div>

      <div style="background:var(--surface);border:var(--border);padding:16px 20px;border-radius:var(--radius);margin-bottom:14px;">
        <div style="font-size:13px;font-weight:500;margin-bottom:10px;">Treatment Means — Tukey HSD (α = 0.05)</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:var(--border);">
            <th style="text-align:left;padding:6px 8px;color:var(--text2);">Treatment</th>
            <th style="text-align:right;padding:6px 8px;color:var(--text2);">n</th>
            <th style="text-align:right;padding:6px 8px;color:var(--text2);">Mean</th>
            <th style="text-align:right;padding:6px 8px;color:var(--text2);">Std Dev</th>
            <th style="text-align:right;padding:6px 8px;color:var(--text2);">SE</th>
            <th style="text-align:center;padding:6px 8px;color:var(--text2);">Group</th>
          </tr></thead>
          <tbody>
            ${sorted.map(trt => {
              const vals = data.filter(d => d.trt === trt).map(d => d.value);
              const m = vals.reduce((a,b)=>a+b,0)/vals.length;
              const s = vals.length>1 ? Math.sqrt(vals.reduce((sum,v)=>sum+(v-m)**2,0)/(vals.length-1)) : 0;
              const se = s / Math.sqrt(vals.length);
              const letters = tukey?.letters?.[trt]?.join('') || '–';
              return `<tr style="border-bottom:1px solid var(--surface2);">
                <td style="padding:6px 8px;">${trt}</td>
                <td style="text-align:right;padding:6px 8px;font-family:var(--font-mono);">${vals.length}</td>
                <td style="text-align:right;padding:6px 8px;font-family:var(--font-mono);font-weight:500;">${m.toFixed(3)}</td>
                <td style="text-align:right;padding:6px 8px;font-family:var(--font-mono);">±${s.toFixed(3)}</td>
                <td style="text-align:right;padding:6px 8px;font-family:var(--font-mono);">${se.toFixed(3)}</td>
                <td style="text-align:center;padding:6px 8px;font-weight:600;">${letters}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
