// ============================================================
// FIELDSTAT – Full Application Logic
// ============================================================

// ── STATE ────────────────────────────────────────────────────
const DB_KEY = 'farmprism_v2';
let appState = {
  seasons: ['2025'],
  currentSeason: '2025',
  trials: [],         // all trials
  observations: [],   // all observations
  nextTrialId: 1,
  nextObsId: 1,
};

let currentDesign = {};         // design wizard state
let currentCollectTrialId = null;
let currentAnalyzeTrialId = null;
let editingObsId = null;
let leafletMap = null;
let mapPlots = [];
let drawMode = false;
let webrReady = false;
let webrR = null;
let seasonChart = null;
let residChart = null;
let analysisResult = null;

const COLORS = [
  '#3B6D11','#185FA5','#BA7517','#993C1D',
  '#534AB7','#0F6E56','#A32D2D','#5F5E5A',
  '#1D9E75','#D4537E','#378ADD','#639922'
];

// ── PERSISTENCE ───────────────────────────────────────────────
function saveState() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(appState)); } catch(e) {}
}
function loadState() {
  try {
    const s = localStorage.getItem(DB_KEY);
    if (s) appState = { ...appState, ...JSON.parse(s) };
  } catch(e) {}
  if (!appState.seasons || !appState.seasons.length) appState.seasons = ['2025'];
  if (!appState.currentSeason) appState.currentSeason = appState.seasons[0];
}

// ── OFFLINE DETECTION ─────────────────────────────────────────
function updateOnlineStatus() {
  const badge = document.getElementById('offline-badge');
  if (badge) badge.classList.toggle('show', !navigator.onLine);
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ── NAV ───────────────────────────────────────────────────────
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');
  const activeBtn = btn || document.querySelector(`[data-page="${id}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  if (id === 'trials') renderTrialsPage();
  if (id === 'design') initDesign();
  if (id === 'collect') populateCollectSelector();
  if (id === 'analyze') populateAnalyzeSelector();
  if (id === 'seasons') buildSeasonComparison();
}
function toggleMobileNav() {
  document.getElementById('main-nav').classList.toggle('mobile-show');
}

// ── SEASONS ───────────────────────────────────────────────────
function openSeasonModal() {
  renderSeasonList();
  openModal('season-modal');
}
function renderSeasonList() {
  const el = document.getElementById('season-list');
  el.innerHTML = appState.seasons.map(s =>
    `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border-radius:6px;margin-bottom:6px;">
      <span style="flex:1;font-size:14px;">${s}</span>
      <span style="font-size:12px;color:var(--text2);">${appState.trials.filter(t=>t.season===s).length} trials</span>
      ${s === appState.currentSeason
        ? '<span class="badge badge-green">Current</span>'
        : `<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="selectSeason('${s}')">Select</button>`}
    </div>`
  ).join('');
}
function addSeason() {
  const val = document.getElementById('new-season-input').value.trim();
  if (!val || appState.seasons.includes(val)) return;
  appState.seasons.push(val);
  saveState();
  renderSeasonList();
  document.getElementById('new-season-input').value = '';
}
function selectSeason(s) {
  appState.currentSeason = s;
  document.getElementById('current-season-label').textContent = s;
  saveState();
  renderSeasonList();
  renderTrialsPage();
}

// ── TRIALS PAGE ───────────────────────────────────────────────
function renderTrialsPage() {
  const seasonTrials = appState.trials.filter(t => t.season === appState.currentSeason);
  document.getElementById('season-label').textContent = `${appState.currentSeason} growing season`;
  document.getElementById('current-season-label').textContent = appState.currentSeason;

  const totalPlots = seasonTrials.reduce((s,t) => s + (t.plots?.length||0), 0);
  const obs = appState.observations.filter(o => seasonTrials.some(t=>t.id===o.trialId));
  const complete = seasonTrials.filter(t => {
    const tObs = obs.filter(o=>o.trialId===t.id);
    return t.plots?.length > 0 && tObs.length >= t.plots.length;
  }).length;

  document.getElementById('m-trials').textContent = seasonTrials.length;
  document.getElementById('m-plots').textContent = totalPlots;
  document.getElementById('m-obs').textContent = obs.length;
  document.getElementById('m-complete').textContent = complete;

  const list = document.getElementById('trial-list');
  if (!seasonTrials.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text2);">
      <div style="font-size:40px;margin-bottom:12px;">🌱</div>
      <div style="font-size:16px;font-weight:500;margin-bottom:6px;">No trials this season</div>
      <div style="font-size:13px;">Create your first trial to get started</div>
    </div>`;
    return;
  }

  list.innerHTML = seasonTrials.map(t => {
    const tObs = appState.observations.filter(o=>o.trialId===t.id);
    const pct = t.plots?.length ? Math.round(tObs.length/t.plots.length*100) : 0;
    const status = pct >= 100 ? 'Complete' : pct > 0 ? 'In progress' : 'Established';
    const badgeClass = pct >= 100 ? 'badge-green' : pct > 0 ? 'badge-amber' : 'badge-blue';
    const icon = { corn:'🌽', soybeans:'🫘', wheat:'🌾', sorghum:'🌾', cotton:'⚪', canola:'🌼' }[t.crop?.toLowerCase()] || '🌱';
    return `<div class="trial-item" onclick="openTrial(${t.id})">
      <div class="trial-icon">${icon}</div>
      <div class="trial-info">
        <div class="trial-name">${t.name}</div>
        <div class="trial-meta">${t.field||'No field'} · ${t.design?.toUpperCase()||'RCBD'} · ${t.plots?.length||0} plots · ${tObs.length} obs</div>
      </div>
      <span class="badge ${badgeClass}">${status}</span>
    </div>`;
  }).join('');
}

function openTrial(id) {
  currentCollectTrialId = id;
  currentAnalyzeTrialId = id;
  showPage('collect');
  loadCollectTrial();
}

// ── DESIGN WIZARD ─────────────────────────────────────────────
function initDesign() {
  currentDesign = {
    name:'', crop:'Corn', field:'', season: appState.currentSeason,
    objective:'', variable:'Grain yield (bu/ac)',
    design:'rcbd', reps:4, plotLen:600, plotRows:4,
    treatments:[
      {name:'Control', rate:'0 lb/ac', color:COLORS[0], numericRate:0},
      {name:'Low N',   rate:'120 lb/ac', color:COLORS[1], numericRate:120},
      {name:'Standard N', rate:'180 lb/ac', color:COLORS[2], numericRate:180},
      {name:'High N', rate:'240 lb/ac', color:COLORS[3], numericRate:240},
    ],
    wpFactor:{name:'Tillage', levels:['Conv','Strip-till','No-till']},
    spFactor:{name:'N Rate', levels:['0 lb','120 lb','180 lb']},
    sspFactor:{name:'Fungicide', levels:['No','Yes']},
    stripA:{name:'N Rate', levels:['0 lb','120 lb','180 lb']},
    stripB:{name:'Population', levels:['28k','32k','36k']},
    gpsPlots: [],
  };
  designStep(1);
  onDesignChange();
  renderTreatmentInputs();
  renderWPLevels(); renderSPLevels(); renderSSPLevels();
  renderStripA(); renderStripB();
}

function designStep(n) {
  for (let i=1;i<=5;i++) {
    const s = document.getElementById(`design-step-${i}`);
    if(s) s.style.display = i===n ? 'block':'none';
    const ind = document.getElementById(`step-${i}-ind`);
    if(ind) ind.classList.toggle('active', i===n || i<n);
  }
  if (n===4) buildFieldMap();
  if (n===5) initLeafletMap();
}

const DESIGN_DESC = {
  rcbd: '📦 <strong>Recommended for most on-farm trials.</strong> Plots are grouped into blocks that account for natural field variability (soil type, slope, drainage). Each block contains one plot of every treatment, randomly assigned.',
  crd:  '🎲 All plots are assigned treatments completely at random, with no blocking. Use only when the field is highly uniform.',
  latin:'🔲 A square grid where each treatment appears exactly once in each row and column. Requires that number of treatments = number of rows = number of columns = replications.',
  strip:'↔️ Factor A runs in horizontal strips; Factor B runs in vertical strips. Their intersection plots capture the interaction. Ideal for two management factors like N rate × plant population.',
  split:'⬛ The field is divided into large whole-plots (one factor), each subdivided into sub-plots (a second factor). Gives more precision for the sub-plot factor at the cost of the whole-plot factor.',
  splitsplit:'⬛⬛ Three-factor design with whole-plots, sub-plots, and sub-sub-plots. Ideal for testing three factors simultaneously with varying precision requirements.',
};

function onDesignChange() {
  const d = document.getElementById('d-design')?.value || 'rcbd';
  currentDesign.design = d;
  document.getElementById('design-description').innerHTML = DESIGN_DESC[d] || '';
  document.getElementById('split-setup').style.display = (d==='split'||d==='splitsplit') ? 'block':'none';
  document.getElementById('splitsplit-setup').style.display = d==='splitsplit' ? 'block':'none';
  document.getElementById('strip-setup').style.display = d==='strip' ? 'block':'none';
  document.getElementById('reps-group').style.display = d==='latin' ? 'none':'flex';

  const hint = document.getElementById('treatment-setup-hint');
  if (d==='split' || d==='splitsplit' || d==='strip') {
    hint.style.display='block';
    hint.innerHTML = `This design uses <strong>factors with levels</strong> (defined in Step 2) instead of simple treatments. Treatments are automatically generated as factor combinations.`;
  } else {
    hint.style.display='none';
  }
  refreshDesignPreview();
}

function refreshDesignPreview() {}

// Treatment inputs
function renderTreatmentInputs() {
  const c = document.getElementById('treatment-inputs');
  c.innerHTML = currentDesign.treatments.map((t,i) =>
    `<div class="trt-item" id="trt-item-${i}">
      <div class="trt-swatch" style="background:${t.color}"></div>
      <input type="text" value="${t.name}" style="flex:2;font-size:13px;background:transparent;border:none;color:var(--text);min-width:80px;" onchange="currentDesign.treatments[${i}].name=this.value">
      <input type="text" value="${t.rate}" style="flex:1;font-size:12px;background:transparent;border:none;color:var(--text2);font-family:var(--font-mono);min-width:60px;" onchange="currentDesign.treatments[${i}].rate=this.value">
      <input type="number" value="${t.numericRate||0}" style="width:60px;font-size:12px;background:var(--surface2);border:var(--border);border-radius:4px;padding:3px 6px;" placeholder="Rate#" onchange="currentDesign.treatments[${i}].numericRate=+this.value">
      <input type="color" value="${t.color}" style="width:30px;height:28px;cursor:pointer;border:none;background:none;" onchange="currentDesign.treatments[${i}].color=this.value;document.querySelector('#trt-item-${i} .trt-swatch').style.background=this.value">
      <button class="btn-icon" onclick="removeTreatment(${i})">🗑️</button>
    </div>`
  ).join('');
}
function addTreatmentInput() {
  const i = currentDesign.treatments.length;
  currentDesign.treatments.push({name:`Treatment ${i+1}`, rate:'', color:COLORS[i%COLORS.length], numericRate:0});
  renderTreatmentInputs();
}
function removeTreatment(i) {
  if (currentDesign.treatments.length <= 2) { alert('Need at least 2 treatments.'); return; }
  currentDesign.treatments.splice(i,1);
  renderTreatmentInputs();
}

// Factor level editors
function renderLevelsList(containerId, levels, factorKey) {
  const c = document.getElementById(containerId);
  c.innerHTML = levels.map((lv,i) =>
    `<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
      <input type="text" value="${lv}" style="flex:1;font-size:13px;background:var(--surface);border:var(--border);border-radius:4px;padding:6px 8px;color:var(--text);" onchange="${factorKey}[${i}]='${lv}';this.closest('[id]') && updateFactor('${factorKey}',${i},this.value)">
      <button class="btn-icon" onclick="removeFactorLevel('${factorKey}',${i})">🗑️</button>
    </div>`
  ).join('') +
  `<button class="btn-add" style="margin-top:4px;" onclick="addFactorLevel('${factorKey}')">+ Add level</button>`;
}

function renderWPLevels() {
  const n = parseInt(document.getElementById('wp-levels')?.value||3);
  while(currentDesign.wpFactor.levels.length < n) currentDesign.wpFactor.levels.push(`Level ${currentDesign.wpFactor.levels.length+1}`);
  currentDesign.wpFactor.levels = currentDesign.wpFactor.levels.slice(0,n);
  renderLevelsList('wp-levels-list', currentDesign.wpFactor.levels, 'currentDesign.wpFactor.levels');
}
function renderSPLevels() {
  const n = parseInt(document.getElementById('sp-levels')?.value||3);
  while(currentDesign.spFactor.levels.length < n) currentDesign.spFactor.levels.push(`Level ${currentDesign.spFactor.levels.length+1}`);
  currentDesign.spFactor.levels = currentDesign.spFactor.levels.slice(0,n);
  renderLevelsList('sp-levels-list', currentDesign.spFactor.levels, 'currentDesign.spFactor.levels');
}
function renderSSPLevels() {
  const n = parseInt(document.getElementById('ssp-levels')?.value||2);
  while(currentDesign.sspFactor.levels.length < n) currentDesign.sspFactor.levels.push(`Level ${currentDesign.sspFactor.levels.length+1}`);
  currentDesign.sspFactor.levels = currentDesign.sspFactor.levels.slice(0,n);
  renderLevelsList('ssp-levels-list', currentDesign.sspFactor.levels, 'currentDesign.sspFactor.levels');
}
function renderStripA() {
  const n = parseInt(document.getElementById('strip-a-levels')?.value||3);
  while(currentDesign.stripA.levels.length < n) currentDesign.stripA.levels.push(`A${currentDesign.stripA.levels.length+1}`);
  currentDesign.stripA.levels = currentDesign.stripA.levels.slice(0,n);
  renderLevelsList('strip-a-list', currentDesign.stripA.levels, 'currentDesign.stripA.levels');
}
function renderStripB() {
  const n = parseInt(document.getElementById('strip-b-levels')?.value||3);
  while(currentDesign.stripB.levels.length < n) currentDesign.stripB.levels.push(`B${currentDesign.stripB.levels.length+1}`);
  currentDesign.stripB.levels = currentDesign.stripB.levels.slice(0,n);
  renderLevelsList('strip-b-list', currentDesign.stripB.levels, 'currentDesign.stripB.levels');
}

// ── FIELD MAP BUILDER ─────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function buildFieldMap() {
  readDesignFormValues();
  const d = currentDesign;
  const container = document.getElementById('field-map-container');
  const legend = document.getElementById('map-legend');
  container.innerHTML = '';
  legend.innerHTML = '';

  let plots = [], htmlGrid = '';

  if (d.design === 'rcbd') {
    plots = buildRCBD(d.treatments, d.reps);
    htmlGrid = renderRCBDMap(plots, d.treatments, d.reps);
  } else if (d.design === 'crd') {
    plots = buildCRD(d.treatments, d.reps);
    htmlGrid = renderCRDMap(plots, d.treatments);
  } else if (d.design === 'latin') {
    const n = d.treatments.length;
    plots = buildLatinSquare(d.treatments, n);
    htmlGrid = renderLatinMap(plots, d.treatments, n);
  } else if (d.design === 'strip') {
    const result = buildStripTrial(d.stripA, d.stripB, d.reps);
    plots = result.plots;
    htmlGrid = renderStripMap(result, d.stripA, d.stripB, d.reps);
  } else if (d.design === 'split') {
    const result = buildSplitPlot(d.wpFactor, d.spFactor, d.reps);
    plots = result.plots;
    htmlGrid = renderSplitMap(result, d.wpFactor, d.spFactor, d.reps);
  } else if (d.design === 'splitsplit') {
    const result = buildSplitSplitPlot(d.wpFactor, d.spFactor, d.sspFactor, d.reps);
    plots = result.plots;
    htmlGrid = renderSplitSplitMap(result, d.wpFactor, d.spFactor, d.sspFactor, d.reps);
  }

  container.innerHTML = htmlGrid;
  currentDesign.builtPlots = plots;

  const plotLen = d.plotLen || 600;
  const plotRows = d.plotRows || 4;
  const plotAc = (plotLen * plotRows * 30) / 43560;
  document.getElementById('total-plots').textContent = plots.length;
  document.getElementById('trial-area').textContent = `~${(plotAc * plots.length).toFixed(1)} ac`;

  // Legend
  const legendItems = getLegendItems(d);
  legend.innerHTML = legendItems.map(item =>
    `<div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text2);">
      <span style="width:10px;height:10px;border-radius:2px;background:${item.color};display:inline-block;"></span>${item.label}
    </div>`
  ).join('');
}

function getLegendItems(d) {
  if (d.design === 'strip') {
    return [
      ...d.stripA.levels.map((lv,i)=>({label:`${d.stripA.name}: ${lv}`, color:COLORS[i]})),
      ...d.stripB.levels.map((lv,i)=>({label:`${d.stripB.name}: ${lv}`, color:COLORS[i+d.stripA.levels.length]})),
    ];
  }
  if (d.design === 'split' || d.design === 'splitsplit') {
    return d.wpFactor.levels.map((lv,i)=>({label:`${d.wpFactor.name}: ${lv}`, color:COLORS[i]}));
  }
  return d.treatments.map(t=>({label:t.name, color:t.color}));
}

// RCBD
function buildRCBD(treatments, reps) {
  const plots = [];
  for (let r=0;r<reps;r++) {
    const order = shuffle(treatments.map((_,i)=>i));
    order.forEach((ti, pos) => {
      plots.push({ id:`${r+1}${String(pos+1).padStart(2,'0')}`, block:r+1, trtIdx:ti, trtName:treatments[ti].name, color:treatments[ti].color, factor:null });
    });
  }
  return plots;
}
function renderRCBDMap(plots, treatments, reps) {
  const n = treatments.length;
  let html = `<div class="field-map-wrap"><div class="field-map" style="grid-template-columns:repeat(${n},1fr);">`;
  for (let r=0;r<reps;r++) {
    html += `<div class="map-label" style="grid-column:1/-1;font-size:11px;padding:4px 0;color:var(--text2);">Block ${r+1}</div>`;
    const block = plots.filter(p=>p.block===r+1);
    block.forEach(p => {
      html += `<div class="plot-cell" style="background:${p.color};" title="${p.trtName} · Block ${r+1}">
        <span class="plot-id">#${p.id}</span>
        <span class="plot-trt">${abbreviate(p.trtName)}</span>
      </div>`;
    });
  }
  html += '</div></div>';
  return html;
}

// CRD
function buildCRD(treatments, reps) {
  const all = [];
  treatments.forEach((t,ti)=>{ for(let r=0;r<reps;r++) all.push({ti, trtName:t.name, color:t.color}); });
  const shuffled = shuffle(all);
  return shuffled.map((p,i)=>({id:String(i+101), block:null, trtIdx:p.ti, trtName:p.trtName, color:p.color}));
}
function renderCRDMap(plots, treatments) {
  const cols = Math.ceil(Math.sqrt(plots.length));
  let html = `<div class="field-map-wrap"><div class="field-map" style="grid-template-columns:repeat(${cols},1fr);">`;
  plots.forEach(p => {
    html += `<div class="plot-cell" style="background:${p.color};" title="${p.trtName}">
      <span class="plot-id">#${p.id}</span>
      <span class="plot-trt">${abbreviate(p.trtName)}</span>
    </div>`;
  });
  html += '</div></div>';
  return html;
}

// LATIN SQUARE — true n×n grid, each treatment once per row and column
function buildLatinSquare(treatments, n) {
  // Generate a proper Latin square using cyclic method then shuffle
  const base = Array.from({length:n},(_,i)=>i);
  let square = Array.from({length:n}, (_,r) => base.map(c=>(r+c)%n));
  // Shuffle rows and columns for randomization
  const rowOrder = shuffle(Array.from({length:n},(_,i)=>i));
  const colOrder = shuffle(Array.from({length:n},(_,i)=>i));
  const rand = rowOrder.map(r => colOrder.map(c => square[r][c]));

  const plots = [];
  for (let r=0;r<n;r++) for (let c=0;c<n;c++) {
    const ti = rand[r][c];
    plots.push({ id:`R${r+1}C${c+1}`, row:r+1, col:c+1, trtIdx:ti,
      trtName:treatments[ti].name, color:treatments[ti].color });
  }
  return plots;
}
function renderLatinMap(plots, treatments, n) {
  let html = `<div class="field-map-wrap">
    <div style="font-size:11px;color:var(--text2);margin-bottom:6px;">Each row and column contains every treatment exactly once (n=${n}×${n})</div>
    <div class="field-map" style="grid-template-columns:repeat(${n},1fr);">`;
  for (let r=0;r<n;r++) {
    const row = plots.filter(p=>p.row===r+1);
    row.forEach(p => {
      html += `<div class="plot-cell" style="background:${p.color};" title="${p.trtName} · Row ${p.row} Col ${p.col}">
        <span class="plot-id">R${p.row}C${p.col}</span>
        <span class="plot-trt">${abbreviate(p.trtName)}</span>
      </div>`;
    });
  }
  html += '</div></div>';
  return html;
}

// STRIP TRIAL — randomized within reps, proper intersection plots
function buildStripTrial(stripA, stripB, reps) {
  const plots = [];
  for (let rep=0;rep<reps;rep++) {
    const rowOrder = shuffle(Array.from({length:stripA.levels.length},(_,i)=>i));
    const colOrder = shuffle(Array.from({length:stripB.levels.length},(_,i)=>i));
    rowOrder.forEach((ai, ri) => {
      colOrder.forEach((bi, ci) => {
        plots.push({
          id:`R${rep+1}-A${ai+1}B${bi+1}`, rep:rep+1,
          aIdx:ai, bIdx:bi,
          aLevel:stripA.levels[ai], bLevel:stripB.levels[bi],
          trtName:`${stripA.levels[ai]} × ${stripB.levels[bi]}`,
          aColor:COLORS[ai], bColor:COLORS[bi+stripA.levels.length],
        });
      });
    });
  }
  return { plots, rowOrders: [], colOrders:[] };
}
function renderStripMap({plots}, stripA, stripB, reps) {
  const nA = stripA.levels.length, nB = stripB.levels.length;
  let html = `<div class="field-map-wrap">`;
  html += `<div style="font-size:11px;color:var(--text2);margin-bottom:8px;">
    Horizontal strips = ${stripA.name} · Vertical strips = ${stripB.name} · ${reps} reps side by side
  </div>`;

  for (let rep=0;rep<reps;rep++) {
    html += `<div style="margin-bottom:12px;">
      <div class="map-label" style="font-size:11px;color:var(--text2);margin-bottom:4px;">Rep ${rep+1}</div>
      <div style="display:grid;grid-template-columns:60px repeat(${nB},1fr);gap:2px;">`;

    // Column headers (Factor B)
    html += `<div></div>`;
    stripB.levels.forEach((lv,bi) => {
      html += `<div style="font-size:10px;text-align:center;padding:3px;background:${COLORS[bi+nA]};color:white;border-radius:4px 4px 0 0;">${lv}</div>`;
    });

    // Rows (Factor A)
    for (let ai=0;ai<nA;ai++) {
      html += `<div style="font-size:10px;display:flex;align-items:center;padding:2px 4px;background:${COLORS[ai]};color:white;border-radius:4px 0 0 4px;">${stripA.levels[ai]}</div>`;
      for (let bi=0;bi<nB;bi++) {
        const plot = plots.find(p=>p.rep===rep+1&&p.aIdx===ai&&p.bIdx===bi);
        html += `<div class="plot-cell" style="background:linear-gradient(135deg,${COLORS[ai]} 50%,${COLORS[bi+nA]} 50%);min-height:40px;" title="${plot?.trtName}">
          <span class="plot-id">${plot?.id||''}</span>
        </div>`;
      }
    }
    html += `</div></div>`;
  }
  html += `</div>`;
  return html;
}

// SPLIT-PLOT
function buildSplitPlot(wpFactor, spFactor, reps) {
  const plots = [];
  for (let rep=0;rep<reps;rep++) {
    const wpOrder = shuffle(Array.from({length:wpFactor.levels.length},(_,i)=>i));
    wpOrder.forEach((wi, wpos) => {
      const spOrder = shuffle(Array.from({length:spFactor.levels.length},(_,i)=>i));
      spOrder.forEach((si, spos) => {
        plots.push({
          id:`B${rep+1}W${wi+1}S${si+1}`, block:rep+1,
          wpIdx:wi, spIdx:si,
          wpLevel:wpFactor.levels[wi], spLevel:spFactor.levels[si],
          trtName:`${wpFactor.levels[wi]} / ${spFactor.levels[si]}`,
          wpColor:COLORS[wi], spColor:COLORS[si+wpFactor.levels.length],
        });
      });
    });
  }
  return {plots};
}
function renderSplitMap({plots}, wpFactor, spFactor, reps) {
  const nWP = wpFactor.levels.length, nSP = spFactor.levels.length;
  let html = `<div class="field-map-wrap">
    <div style="font-size:11px;color:var(--text2);margin-bottom:8px;">
      Large cells = <strong>${wpFactor.name}</strong> (whole plots) · Each divided into <strong>${spFactor.name}</strong> sub-plots
    </div>`;

  for (let rep=0;rep<reps;rep++) {
    html += `<div style="margin-bottom:12px;">
      <div class="map-label" style="font-size:11px;color:var(--text2);margin-bottom:4px;">Block ${rep+1}</div>
      <div style="display:grid;grid-template-columns:repeat(${nWP},1fr);gap:4px;">`;
    const wpOrder = [...new Set(plots.filter(p=>p.block===rep+1).map(p=>p.wpIdx))];
    wpOrder.forEach(wi => {
      const spPlots = plots.filter(p=>p.block===rep+1&&p.wpIdx===wi);
      html += `<div style="border:2px solid ${COLORS[wi]};border-radius:6px;overflow:hidden;">
        <div style="background:${COLORS[wi]};color:white;font-size:11px;padding:3px 6px;font-weight:500;">${wpFactor.levels[wi]}</div>
        <div style="display:grid;grid-template-columns:repeat(${nSP},1fr);gap:2px;padding:3px;">`;
      spPlots.forEach(p => {
        html += `<div class="plot-cell" style="background:${p.spColor};min-width:40px;min-height:38px;" title="${p.trtName}">
          <span class="plot-id">${p.id}</span>
          <span class="plot-trt">${abbreviate(p.spLevel)}</span>
        </div>`;
      });
      html += `</div></div>`;
    });
    html += `</div></div>`;
  }
  html += `</div>`;
  return html;
}

// SPLIT-SPLIT-PLOT
function buildSplitSplitPlot(wpFactor, spFactor, sspFactor, reps) {
  const plots = [];
  for (let rep=0;rep<reps;rep++) {
    const wpOrder = shuffle(Array.from({length:wpFactor.levels.length},(_,i)=>i));
    wpOrder.forEach(wi => {
      const spOrder = shuffle(Array.from({length:spFactor.levels.length},(_,i)=>i));
      spOrder.forEach(si => {
        const sspOrder = shuffle(Array.from({length:sspFactor.levels.length},(_,i)=>i));
        sspOrder.forEach(ssi => {
          plots.push({
            id:`B${rep+1}W${wi}S${si}SS${ssi}`, block:rep+1,
            wpIdx:wi, spIdx:si, sspIdx:ssi,
            wpLevel:wpFactor.levels[wi], spLevel:spFactor.levels[si], sspLevel:sspFactor.levels[ssi],
            trtName:`${wpFactor.levels[wi]} / ${spFactor.levels[si]} / ${sspFactor.levels[ssi]}`,
            wpColor:COLORS[wi], spColor:COLORS[si+wpFactor.levels.length],
            sspColor:COLORS[ssi+wpFactor.levels.length+spFactor.levels.length],
          });
        });
      });
    });
  }
  return {plots};
}
function renderSplitSplitMap({plots}, wpFactor, spFactor, sspFactor, reps) {
  const nWP = wpFactor.levels.length, nSP = spFactor.levels.length, nSSP = sspFactor.levels.length;
  let html = `<div class="field-map-wrap">
    <div style="font-size:11px;color:var(--text2);margin-bottom:8px;">
      <strong>${wpFactor.name}</strong> (whole) → <strong>${spFactor.name}</strong> (sub) → <strong>${sspFactor.name}</strong> (sub-sub)
    </div>`;
  for (let rep=0;rep<reps;rep++) {
    html += `<div style="margin-bottom:14px;"><div class="map-label" style="font-size:11px;color:var(--text2);margin-bottom:4px;">Block ${rep+1}</div>
      <div style="display:grid;grid-template-columns:repeat(${nWP},1fr);gap:4px;">`;
    const wpOrder = [...new Set(plots.filter(p=>p.block===rep+1).map(p=>p.wpIdx))];
    wpOrder.forEach(wi => {
      html += `<div style="border:2px solid ${COLORS[wi]};border-radius:6px;overflow:hidden;">
        <div style="background:${COLORS[wi]};color:white;font-size:10px;padding:3px 6px;">${wpFactor.levels[wi]}</div>`;
      const spOrder = [...new Set(plots.filter(p=>p.block===rep+1&&p.wpIdx===wi).map(p=>p.spIdx))];
      html += `<div style="display:grid;grid-template-columns:repeat(${nSP},1fr);gap:2px;padding:2px;">`;
      spOrder.forEach(si => {
        const color2 = COLORS[si+nWP];
        html += `<div style="border:1px solid ${color2};border-radius:4px;overflow:hidden;">
          <div style="background:${color2};color:white;font-size:9px;padding:2px 4px;">${spFactor.levels[si]}</div>
          <div style="display:grid;grid-template-columns:repeat(${nSSP},1fr);gap:1px;padding:2px;">`;
        const sspOrder = plots.filter(p=>p.block===rep+1&&p.wpIdx===wi&&p.spIdx===si);
        sspOrder.forEach(p => {
          html += `<div class="plot-cell" style="background:${p.sspColor};min-height:32px;font-size:9px;" title="${p.trtName}">
            <span class="plot-trt">${abbreviate(p.sspLevel)}</span>
          </div>`;
        });
        html += `</div></div>`;
      });
      html += `</div></div>`;
    });
    html += `</div></div>`;
  }
  html += `</div>`;
  return html;
}

function abbreviate(name) {
  if (!name) return '';
  return name.length > 8 ? name.substring(0,7)+'…' : name;
}

function readDesignFormValues() {
  currentDesign.name = document.getElementById('d-name')?.value || currentDesign.name;
  currentDesign.crop = document.getElementById('d-crop')?.value || currentDesign.crop;
  currentDesign.field = document.getElementById('d-field')?.value || currentDesign.field;
  currentDesign.season = document.getElementById('d-season')?.value || currentDesign.season;
  currentDesign.objective = document.getElementById('d-objective')?.value || currentDesign.objective;
  currentDesign.variable = document.getElementById('d-variable')?.value || currentDesign.variable;
  const customVar = document.getElementById('d-variable-custom')?.value;
  if (customVar && currentDesign.variable === 'Custom...') currentDesign.variable = customVar;
  currentDesign.design = document.getElementById('d-design')?.value || currentDesign.design;
  currentDesign.reps = parseInt(document.getElementById('d-reps')?.value || 4);
  currentDesign.plotLen = parseInt(document.getElementById('d-plot-len')?.value || 600);
  currentDesign.plotRows = parseInt(document.getElementById('d-plot-rows')?.value || 4);
  currentDesign.wpFactor.name = document.getElementById('wp-factor-name')?.value || currentDesign.wpFactor.name;
  currentDesign.spFactor.name = document.getElementById('sp-factor-name')?.value || currentDesign.spFactor.name;
  currentDesign.sspFactor.name = document.getElementById('ssp-factor-name')?.value || currentDesign.sspFactor.name;
  currentDesign.stripA.name = document.getElementById('strip-a-name')?.value || currentDesign.stripA.name;
  currentDesign.stripB.name = document.getElementById('strip-b-name')?.value || currentDesign.stripB.name;
}

// ── SAVE TRIAL ────────────────────────────────────────────────
function saveTrial() {
  readDesignFormValues();
  if (!currentDesign.name) { alert('Please enter a trial name.'); designStep(1); return; }
  const trial = {
    id: appState.nextTrialId++,
    name: currentDesign.name,
    crop: currentDesign.crop,
    field: currentDesign.field,
    season: currentDesign.season || appState.currentSeason,
    objective: currentDesign.objective,
    variable: currentDesign.variable,
    design: currentDesign.design,
    reps: currentDesign.reps,
    plotLen: currentDesign.plotLen,
    plotRows: currentDesign.plotRows,
    treatments: currentDesign.treatments,
    wpFactor: currentDesign.wpFactor,
    spFactor: currentDesign.spFactor,
    sspFactor: currentDesign.sspFactor,
    stripA: currentDesign.stripA,
    stripB: currentDesign.stripB,
    plots: currentDesign.builtPlots || [],
    gpsPlots: currentDesign.gpsPlots || [],
    createdAt: new Date().toISOString(),
  };
  appState.trials.push(trial);
  saveState();
  currentCollectTrialId = trial.id;
  currentAnalyzeTrialId = trial.id;
  // Populate all page selectors with new trial
  if (typeof populateAllSelectors === 'function') populateAllSelectors();
  showPage('collect');
  loadCollectTrial();
}

// ── GPS / LEAFLET — handled by js/gps-plots.js ───────────────
// Legacy variables kept for compatibility
let tileLayer = null;
let leafletMap = null; // gps-plots.js uses _map internally
// initLeafletMap, changeBasemap, locateUser, clearMapPlots, toggleDrawMode
// are all defined in js/gps-plots.js and override these stubs
function initLeafletMap() { /* overridden by gps-plots.js */ }

// ── DATA COLLECTION ───────────────────────────────────────────
function populateCollectSelector() {
  const sel = document.getElementById('collect-trial-select');
  sel.innerHTML = '<option value="">— Select trial —</option>' +
    appState.trials.map(t=>`<option value="${t.id}">${t.name} (${t.season})</option>`).join('');
  if (currentCollectTrialId) {
    sel.value = currentCollectTrialId;
    loadCollectTrial();
  }
}

function loadCollectTrial() {
  const sel = document.getElementById('collect-trial-select');
  const id = parseInt(sel.value);
  if (!id) { document.getElementById('collect-content').style.display='none'; return; }
  currentCollectTrialId = id;
  const trial = appState.trials.find(t=>t.id===id);
  if (!trial) return;
  document.getElementById('collect-trial-name').textContent = `${trial.name} · ${trial.field||''} · ${trial.crop}`;
  document.getElementById('collect-content').style.display='block';
  document.getElementById('obs-var-label').textContent = trial.variable || 'Yield (bu/ac)';
  updateCollectProgress(trial);
  buildPlotGrid(trial);
  populateObsPlotSelect(trial);
  document.getElementById('obs-date').value = new Date().toISOString().split('T')[0];
  setCollectTab('grid', document.querySelector('#page-collect .tab-btn'));
}

function updateCollectProgress(trial) {
  const obs = appState.observations.filter(o=>o.trialId===trial.id);
  const total = trial.plots?.length || 0;
  const collected = obs.length;
  const pct = total ? Math.round(collected/total*100) : 0;
  document.getElementById('collect-progress-label').textContent = `${collected} of ${total} plots`;
  document.getElementById('collect-pct-badge').textContent = `${pct}%`;
  document.getElementById('collect-progress-fill').style.width = `${pct}%`;
}

function buildPlotGrid(trial) {
  const grid = document.getElementById('plot-grid-container');
  const obs = appState.observations.filter(o=>o.trialId===trial.id);
  grid.innerHTML = (trial.plots||[]).map(p => {
    const o = obs.find(ob=>ob.plotId===p.id);
    const color = p.color || p.wpColor || '#3B6D11';
    return `<div class="plot-card ${o?'collected':''}" onclick="selectPlotForEntry('${p.id}')">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:12px;font-weight:500;font-family:var(--font-mono);">Plot ${p.id}</span>
        <span style="font-size:14px;">${o?'✅':'⭕'}</span>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px;display:flex;align-items:center;gap:4px;">
        <span style="width:8px;height:8px;border-radius:2px;background:${color};display:inline-block;"></span>
        ${p.trtName||'–'}${p.block?` · Blk ${p.block}`:''}
      </div>
      ${o ? `<div class="pc-val" style="font-size:18px;font-weight:500;">${parseFloat(o.value).toFixed(1)}</div>` : '<div style="font-size:12px;color:var(--text2);">Tap to enter</div>'}
    </div>`;
  }).join('');
}

function selectPlotForEntry(plotId) {
  document.getElementById('obs-plot-select').value = plotId;
  onObsPlotChange();
  setCollectTab('enter', document.querySelectorAll('#page-collect .tab-btn')[1]);
}

function populateObsPlotSelect(trial) {
  const sel = document.getElementById('obs-plot-select');
  sel.innerHTML = (trial.plots||[]).map(p=>
    `<option value="${p.id}">Plot ${p.id} – ${p.trtName}</option>`
  ).join('');
  onObsPlotChange();
}

function onObsPlotChange() {
  const trial = appState.trials.find(t=>t.id===currentCollectTrialId);
  if (!trial) return;
  const plotId = document.getElementById('obs-plot-select').value;
  const plot = trial.plots.find(p=>p.id===plotId);
  const obs = appState.observations.find(o=>o.trialId===trial.id&&o.plotId===plotId);
  const info = document.getElementById('obs-plot-info');
  if (plot) {
    info.style.display='block';
    info.innerHTML = `<strong>${plot.trtName}</strong>${plot.block?` · Block ${plot.block}`:''}${plot.wpLevel?` · ${trial.wpFactor?.name}: ${plot.wpLevel}`:''}`;
  }
  if (obs) {
    document.getElementById('obs-value').value = obs.value;
    document.getElementById('obs-notes').value = obs.notes||'';
    document.getElementById('obs-sec').value = obs.secondary||'';
  } else {
    document.getElementById('obs-value').value = '0';
    document.getElementById('obs-notes').value = '';
    document.getElementById('obs-sec').value = '';
  }
}

function stepObs(delta) {
  const inp = document.getElementById('obs-value');
  inp.value = (parseFloat(inp.value||0) + delta).toFixed(1);
}

function saveObservation() {
  const trial = appState.trials.find(t=>t.id===currentCollectTrialId);
  if (!trial) return;
  const plotId = document.getElementById('obs-plot-select').value;
  const value = parseFloat(document.getElementById('obs-value').value);
  const date = document.getElementById('obs-date').value;
  const notes = document.getElementById('obs-notes').value;
  const secondary = document.getElementById('obs-sec').value;
  const quality = document.getElementById('obs-quality').value;
  if (isNaN(value)) { alert('Enter a valid value.'); return; }
  // Upsert
  const existing = appState.observations.findIndex(o=>o.trialId===trial.id&&o.plotId===plotId);
  const obs = { id: existing>=0 ? appState.observations[existing].id : appState.nextObsId++,
    trialId:trial.id, plotId, value, date, notes, secondary, quality, savedAt:new Date().toISOString() };
  if (existing>=0) appState.observations[existing]=obs; else appState.observations.push(obs);
  saveState();
  updateCollectProgress(trial);
  buildPlotGrid(trial);
}

function saveAndNext() {
  saveObservation();
  const sel = document.getElementById('obs-plot-select');
  const opts = sel.options;
  const i = sel.selectedIndex;
  if (i < opts.length-1) { sel.selectedIndex = i+1; onObsPlotChange(); }
}

function setCollectTab(tab, btn) {
  ['grid','enter','review'].forEach(t=>{
    document.getElementById('collect-'+t).style.display = t===tab?'block':'none';
  });
  document.querySelectorAll('#page-collect .tab-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tab==='review') buildReviewTable();
}

function buildReviewTable() {
  const trial = appState.trials.find(t=>t.id===currentCollectTrialId);
  const body = document.getElementById('review-body');
  if (!trial) { body.innerHTML=''; return; }
  const obs = appState.observations.filter(o=>o.trialId===trial.id);
  body.innerHTML = obs.map(o => {
    const plot = trial.plots?.find(p=>p.id===o.plotId);
    return `<tr>
      <td>${o.plotId}</td>
      <td>${plot?.block||'–'}</td>
      <td>${plot?.trtName||'–'}</td>
      <td><strong>${parseFloat(o.value).toFixed(2)}</strong></td>
      <td>${o.date||'–'}</td>
      <td><button class="btn-icon" onclick="openEditObs(${o.id})">✏️</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:20px;">No observations yet</td></tr>';
}

function openEditObs(id) {
  const obs = appState.observations.find(o=>o.id===id);
  if (!obs) return;
  editingObsId = id;
  document.getElementById('edit-obs-val').value = obs.value;
  document.getElementById('edit-obs-notes').value = obs.notes||'';
  openModal('edit-obs-modal');
}
function saveEditObs() {
  const obs = appState.observations.find(o=>o.id===editingObsId);
  if (!obs) return;
  obs.value = parseFloat(document.getElementById('edit-obs-val').value);
  obs.notes = document.getElementById('edit-obs-notes').value;
  saveState();
  closeModal('edit-obs-modal');
  buildReviewTable();
}
function deleteObsFromModal() {
  if (!confirm('Delete this observation?')) return;
  appState.observations = appState.observations.filter(o=>o.id!==editingObsId);
  saveState();
  closeModal('edit-obs-modal');
  const trial = appState.trials.find(t=>t.id===currentCollectTrialId);
  if (trial) { updateCollectProgress(trial); buildPlotGrid(trial); }
  buildReviewTable();
}

// ── STATISTICAL ANALYSIS (PURE JS FALLBACK) ───────────────────
// We implement ANOVA, Tukey HSD, and residual diagnostics in JS
// WebR is loaded for enhanced R-based output when available.

function mean(arr) { return arr.reduce((a,b)=>a+b,0)/arr.length; }
function variance(arr) { const m=mean(arr); return arr.reduce((s,x)=>s+(x-m)**2,0)/(arr.length-1); }
function sd(arr) { return Math.sqrt(variance(arr)); }

function computeRCBD_ANOVA(data) {
  // data: [{trt, block, value}]
  const trts = [...new Set(data.map(d=>d.trt))];
  const blocks = [...new Set(data.map(d=>d.block))];
  const N = data.length, t = trts.length, b = blocks.length;
  const grandMean = mean(data.map(d=>d.value));

  const trtMeans = Object.fromEntries(trts.map(tr => [tr, mean(data.filter(d=>d.trt===tr).map(d=>d.value))]));
  const blockMeans = Object.fromEntries(blocks.map(bl => [bl, mean(data.filter(d=>d.block===bl).map(d=>d.value))]));

  const SS_total = data.reduce((s,d)=>s+(d.value-grandMean)**2,0);
  const SS_trt = b * trts.reduce((s,tr)=>s+(trtMeans[tr]-grandMean)**2,0);
  const SS_block = t * blocks.reduce((s,bl)=>s+(blockMeans[bl]-grandMean)**2,0);
  const SS_error = SS_total - SS_trt - SS_block;

  const df_trt = t-1, df_block = b-1, df_error = (t-1)*(b-1);
  const MS_trt = SS_trt/df_trt, MS_block = SS_block/df_block, MS_error = SS_error/df_error;
  const F_trt = MS_trt/MS_error, F_block = MS_block/MS_error;

  // p-value approximation using F distribution (Wilson-Hilferty)
  const pValueF = (F, df1, df2) => {
    if (F <= 0) return 1;
    const x = df2/(df2+df1*F);
    return incompleteBeta(x, df2/2, df1/2);
  };

  const p_trt = pValueF(F_trt, df_trt, df_error);
  const p_block = pValueF(F_block, df_block, df_error);

  // Tukey HSD
  const MSE = MS_error;
  const r = b; // number of reps per treatment in RCBD
  const trtStdErr = Math.sqrt(MSE/r);
  const tukey = tukeyHSD(trtMeans, trts, MSE, r, df_error);

  // Residuals
  const residuals = data.map(d => ({ fitted: trtMeans[d.trt]+blockMeans[d.block]-grandMean, resid: d.value-(trtMeans[d.trt]+blockMeans[d.block]-grandMean) }));
  const CV = (Math.sqrt(MSE)/grandMean*100).toFixed(1);

  return { trts, trtMeans, blockMeans, grandMean, SS_trt, SS_block, SS_error, SS_total,
    df_trt, df_block, df_error, MS_trt, MS_block, MS_error, F_trt, F_block,
    p_trt, p_block, tukey, residuals, CV, MSE };
}

function computeCRD_ANOVA(data) {
  const trts = [...new Set(data.map(d=>d.trt))];
  const N = data.length, t = trts.length;
  const grandMean = mean(data.map(d=>d.value));
  const trtMeans = Object.fromEntries(trts.map(tr=>[tr,mean(data.filter(d=>d.trt===tr).map(d=>d.value))]));
  const trtCounts = Object.fromEntries(trts.map(tr=>[tr,data.filter(d=>d.trt===tr).length]));
  const SS_trt = trts.reduce((s,tr)=>s+trtCounts[tr]*(trtMeans[tr]-grandMean)**2,0);
  const SS_error = data.reduce((s,d)=>s+(d.value-trtMeans[d.trt])**2,0);
  const df_trt = t-1, df_error = N-t;
  const MS_trt = SS_trt/df_trt, MS_error = SS_error/df_error;
  const F_trt = MS_trt/MS_error;
  const p_trt = incompleteBeta(df_error/(df_error+df_trt*F_trt), df_error/2, df_trt/2);
  const r = N/t;
  const tukey = tukeyHSD(trtMeans, trts, MS_error, r, df_error);
  const residuals = data.map(d=>({fitted:trtMeans[d.trt], resid:d.value-trtMeans[d.trt]}));
  const CV = (Math.sqrt(MS_error)/grandMean*100).toFixed(1);
  return {trts,trtMeans,grandMean,SS_trt,SS_error,df_trt,df_error,MS_trt,MS_error,
    F_trt,p_trt,tukey,residuals,CV,MSE:MS_error};
}

// Tukey HSD using Studentized Range Distribution approximation
function tukeyHSD(trtMeans, trts, MSE, r, dfError) {
  const k = trts.length;
  // Critical q values table (α=0.05) indexed by [k][dfError]
  const qCrit = criticalQ(k, dfError);
  const HSD = qCrit * Math.sqrt(MSE/r);
  // Sort treatments by mean descending
  const sorted = [...trts].sort((a,b)=>trtMeans[b]-trtMeans[a]);
  // Assign letters
  const letters = {};
  let letter = 0;
  sorted.forEach(t => letters[t] = []);
  const letterNames = 'ABCDEFGHIJ'.split('');
  let groups = [];
  for (let i=0;i<sorted.length;i++) {
    let inGroup = false;
    for (let g=groups.length-1;g>=0;g--) {
      if (Math.abs(trtMeans[sorted[i]] - trtMeans[groups[g][0]]) <= HSD) {
        groups[g].push(sorted[i]); inGroup=true; break;
      }
    }
    if (!inGroup) groups.push([sorted[i]]);
  }
  // Assign letter labels
  const assigned = {};
  sorted.forEach(t => assigned[t]=[]);
  groups.forEach((grp,gi) => {
    grp.forEach(t => assigned[t].push(letterNames[gi]));
  });
  return { HSD, groups, letters: assigned, sorted };
}

function criticalQ(k, df) {
  // Approximation table for α=0.05
  const table = {
    2:{1:17.97,2:6.08,3:4.50,4:3.93,5:3.64,6:3.46,7:3.34,8:3.26,9:3.20,10:3.15,12:3.08,20:2.95,30:2.89,60:2.83,120:2.80},
    3:{1:26.98,2:8.33,3:5.91,4:5.04,5:4.65,6:4.34,7:4.16,8:4.04,9:3.95,10:3.88,12:3.77,20:3.58,30:3.49,60:3.40,120:3.36},
    4:{1:32.82,2:9.80,3:6.82,4:5.76,5:5.22,6:4.90,7:4.68,8:4.53,9:4.41,10:4.33,12:4.20,20:3.96,30:3.85,60:3.74,120:3.69},
    5:{1:37.08,2:10.88,3:7.50,4:6.29,5:5.67,6:5.30,7:5.06,8:4.89,9:4.76,10:4.65,12:4.51,20:4.23,30:4.10,60:3.98,120:3.92},
    6:{1:40.41,2:11.74,3:8.04,4:6.71,5:6.03,6:5.63,7:5.36,8:5.17,9:5.02,10:4.91,12:4.75,20:4.45,30:4.30,60:4.16,120:4.10},
    7:{1:43.12,2:12.44,3:8.48,4:7.05,5:6.33,6:5.90,7:5.61,8:5.40,9:5.24,10:5.12,12:4.95,20:4.62,30:4.46,60:4.31,120:4.24},
    8:{1:45.40,2:13.03,3:8.85,4:7.35,5:6.58,6:6.12,7:5.82,8:5.60,9:5.43,10:5.30,12:5.12,20:4.77,30:4.60,60:4.44,120:4.36},
  };
  const row = table[Math.min(k,8)] || table[8];
  const dfs = [1,2,3,4,5,6,7,8,9,10,12,20,30,60,120];
  const dfCapped = Math.max(1, Math.min(df, 120));
  let best = dfs[0];
  dfs.forEach(d => { if (d <= dfCapped) best = d; });
  return row[best] || 4.0;
}

// Regularized Incomplete Beta function (for p-values)
function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a+b);
  const front = Math.exp(Math.log(x)*a + Math.log(1-x)*b - lbeta)/a;
  return front * betaCF(x,a,b);
}
function lgamma(z) {
  // Stirling approximation
  if (z < 0.5) return Math.log(Math.PI/Math.sin(Math.PI*z)) - lgamma(1-z);
  z--; let x=0.99999999999980993;
  const c=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  c.forEach((ci,i)=>x+=ci/(z+i+1));
  const t=z+7.5;
  return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x);
}
function betaCF(x,a,b) {
  let h=1,qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;
  if(Math.abs(d)<1e-30)d=1e-30; d=1/d; h=d;
  for(let m=1;m<=100;m++){
    let m2=2*m, aa=m*(b-m)*x/((qam+m2)*(a+m2));
    d=1+aa*d; if(Math.abs(d)<1e-30)d=1e-30;
    c=1+aa/c; if(Math.abs(c)<1e-30)c=1e-30;
    d=1/d; h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
    d=1+aa*d; if(Math.abs(d)<1e-30)d=1e-30;
    c=1+aa/c; if(Math.abs(c)<1e-30)c=1e-30;
    d=1/d; const del=d*c; h*=del;
    if(Math.abs(del-1)<1e-10)break;
  }
  return h;
}

function pValueLabel(p) {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return 'ns';
}

// ── ANALYZE PAGE ──────────────────────────────────────────────
function populateAnalyzeSelector() {
  const sel = document.getElementById('analyze-trial-select');
  sel.innerHTML = '<option value="">— Select trial —</option>' +
    appState.trials.map(t=>`<option value="${t.id}">${t.name} (${t.season})</option>`).join('');
  if (currentAnalyzeTrialId) { sel.value = currentAnalyzeTrialId; loadAnalysisTrial(); }
  initWebR();
}

function loadAnalysisTrial() {
  const id = parseInt(document.getElementById('analyze-trial-select').value);
  if (!id) return;
  currentAnalyzeTrialId = id;
  const trial = appState.trials.find(t=>t.id===id);
  if (!trial) return;
  document.getElementById('analyze-trial-name').textContent = `${trial.name} · ${trial.variable}`;
}

async function initWebR() {
  // Attempt to load WebR; gracefully fall back to JS stats if unavailable
  const statusEl = document.getElementById('webr-status');
  try {
    const { WebR } = await import('https://webr.r-wasm.org/v0.4.0/webr.mjs');
    webrR = new WebR();
    await webrR.init();
    webrReady = true;
    statusEl.innerHTML = '<span style="color:var(--green-600);">✅ R engine ready (WebR)</span>';
    setTimeout(()=>statusEl.style.display='none', 2000);
  } catch(e) {
    statusEl.innerHTML = '<span style="color:var(--amber-800);">⚡ Using built-in statistics engine</span>';
    setTimeout(()=>statusEl.style.display='none', 2000);
  }
}

async function runAnalysis() {
  const id = currentAnalyzeTrialId;
  if (!id) { alert('Select a trial first.'); return; }
  const trial = appState.trials.find(t=>t.id===id);
  if (!trial) return;

  const obs = appState.observations.filter(o=>o.trialId===id);
  if (obs.length < 3) { alert('Need at least 3 observations to run analysis.'); return; }

  document.getElementById('analyze-content').style.display='block';

  // Build data frame
  let data = [];
  if (trial.design === 'rcbd' || trial.design === 'latin') {
    obs.forEach(o => {
      const plot = trial.plots?.find(p=>p.id===o.plotId);
      if (plot) data.push({ trt:plot.trtName, block:String(plot.block||plot.row||1), value:parseFloat(o.value) });
    });
  } else {
    obs.forEach(o => {
      const plot = trial.plots?.find(p=>p.id===o.plotId);
      if (plot) data.push({ trt:plot.trtName, block:String(plot.block||1), value:parseFloat(o.value) });
    });
  }

  let result;
  if (webrReady && webrR) {
    result = await runRAnalysis(webrR, data, trial.design);
  } else {
    result = trial.design==='crd' ? computeCRD_ANOVA(data) : computeRCBD_ANOVA(data);
  }

  analysisResult = { trial, result, data };
  renderAnalysis(trial, result, data);
}

async function runRAnalysis(R, data, design) {
  try {
    const trtStr = data.map(d=>`"${d.trt}"`).join(',');
    const blockStr = data.map(d=>`"${d.block}"`).join(',');
    const valStr = data.map(d=>d.value).join(',');
    const rCode = `
      tryCatch({
        df <- data.frame(
          trt = factor(c(${trtStr})),
          block = factor(c(${blockStr})),
          value = c(${valStr})
        )
        ${design==='crd'
          ? 'model <- aov(value ~ trt, data=df)'
          : 'model <- aov(value ~ trt + block, data=df)'}
        av <- summary(model)[[1]]
        resid <- residuals(model)
        fitted <- fitted(model)
        # Tukey HSD
        tk <- TukeyHSD(model, "trt")$trt
        list(
          fTrt = av["trt","F value"],
          pTrt = av["trt","Pr(>F)"],
          msTrt = av["trt","Mean Sq"],
          msError = av["Residuals","Mean Sq"],
          ssTrt = av["trt","Sum Sq"],
          ssError = av["Residuals","Sum Sq"],
          dfTrt = av["trt","Df"],
          dfError = av["Residuals","Df"],
          resid = as.numeric(resid),
          fitted = as.numeric(fitted),
          tukeyDiff = tk[,"diff"],
          tukeyLwr = tk[,"lwr"],
          tukeyUpr = tk[,"upr"],
          tukeyP = tk[,"p adj"],
          tukeyRownames = rownames(tk),
          grandMean = mean(df$value),
          CV = sd(df$value)/mean(df$value)*100
        )
      }, error = function(e) list(error=conditionMessage(e)))
    `;
    const res = await R.evalR(rCode);
    const obj = await res.toJs({depth:2});
    if (obj.error) throw new Error(obj.error);
    // Convert to our standard format and merge with JS result for compatibility
    const jsFallback = computeRCBD_ANOVA(data);
    return {
      ...jsFallback,
      F_trt: obj.fTrt?.values?.[0] || jsFallback.F_trt,
      p_trt: obj.pTrt?.values?.[0] || jsFallback.p_trt,
      MS_error: obj.msError?.values?.[0] || jsFallback.MS_error,
      grandMean: obj.grandMean?.values?.[0] || jsFallback.grandMean,
      CV: obj.CV?.values?.[0]?.toFixed(1) || jsFallback.CV,
      residuals: (obj.resid?.values||[]).map((r,i)=>({resid:r, fitted:(obj.fitted?.values||[])[i]||0})),
      source: 'WebR/R',
    };
  } catch(e) {
    console.warn('WebR analysis failed, using JS fallback:', e);
    return computeRCBD_ANOVA(data);
  }
}

function renderAnalysis(trial, result, data) {
  const gm = result.grandMean || mean(data.map(d=>d.value));
  const {F_trt, p_trt, CV, trts, trtMeans, tukey} = result;

  // Metrics
  document.getElementById('analyze-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">Grand mean</div><div class="metric-value">${gm.toFixed(1)}<span class="metric-unit"> ${trial.variable?.split('(')[1]?.replace(')','') || 'units'}</span></div></div>
    <div class="metric-card"><div class="metric-label">CV (%)</div><div class="metric-value">${parseFloat(CV||0).toFixed(1)}</div></div>
    <div class="metric-card"><div class="metric-label">F-statistic</div><div class="metric-value">${parseFloat(F_trt||0).toFixed(2)}</div></div>
    <div class="metric-card"><div class="metric-label">p-value</div><div class="metric-value" style="color:${p_trt<0.05?'var(--green-600)':'var(--text2)'};">${parseFloat(p_trt||1).toFixed(4)}</div></div>
  `;

  // Insight box
  const insight = document.getElementById('analyze-insight');
  insight.style.display='block';
  const sig = p_trt < 0.05;
  const bestTrt = tukey?.sorted?.[0] || trts?.[0];
  insight.innerHTML = sig
    ? `✅ <strong>Statistically significant treatment effect</strong> (p = ${parseFloat(p_trt).toFixed(4)}). <strong>${bestTrt}</strong> produced the highest mean. Tukey HSD grouping below — treatments sharing a letter are not significantly different (α = 0.05). CV = ${CV}% indicates ${parseFloat(CV)<15?'good experimental precision':'moderate variability — consider field design adjustments next season'}.`
    : `⚠️ <strong>No statistically significant treatment effect</strong> (p = ${parseFloat(p_trt).toFixed(4)}). The observed differences may be due to field variability rather than treatment effects. Consider increasing replication or plot size in future trials.`;

  renderMeansBars(trial, result);
  renderMeansTable(trial, result, data);
  renderANOVATable(trial, result);
  renderResidualChart(result);
  calcEcon();
  renderReport(trial, result, data);
}

function renderMeansBars(trial, result) {
  const {tukey, trtMeans, trts} = result;
  const sorted = tukey?.sorted || trts;
  const maxMean = Math.max(...sorted.map(t=>trtMeans[t]));
  const colors = trial.treatments?.reduce((m,t)=>({...m,[t.name]:t.color}),{}) || {};

  document.getElementById('means-bars').innerHTML = sorted.map(trt => {
    const m = trtMeans[trt];
    const pct = (m/maxMean*85).toFixed(1);
    const color = colors[trt] || COLORS[sorted.indexOf(trt)%COLORS.length];
    const letters = tukey?.letters?.[trt]?.join('') || '';
    return `<div class="bar-chart-row">
      <span class="bar-label">${trt}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%;background:${color};">
          <span class="bar-val">${m.toFixed(1)}</span>
        </div>
      </div>
      <span class="bar-sig">${letters}</span>
    </div>`;
  }).join('');
}

function renderMeansTable(trial, result, data) {
  const {tukey, trtMeans, trts} = result;
  const sorted = tukey?.sorted || trts;
  const table = document.getElementById('means-table');
  table.querySelector('thead').innerHTML = `<tr><th>Treatment</th><th>n</th><th>Mean</th><th>Std Dev</th><th>Tukey group</th></tr>`;
  table.querySelector('tbody').innerHTML = sorted.map(trt => {
    const vals = data.filter(d=>d.trt===trt).map(d=>d.value);
    const m = mean(vals), s = vals.length>1?sd(vals):0;
    const letters = tukey?.letters?.[trt]?.join('') || '–';
    const colors = trial.treatments?.reduce((m,t)=>({...m,[t.name]:t.color}),{}) || {};
    const color = colors[trt] || '#3B6D11';
    return `<tr>
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px;"></span>${trt}</td>
      <td>${vals.length}</td>
      <td><strong>${m.toFixed(2)}</strong></td>
      <td>±${s.toFixed(2)}</td>
      <td><span class="badge badge-green">${letters}</span></td>
    </tr>`;
  }).join('');
}

function renderANOVATable(trial, result) {
  const {SS_trt,SS_block,SS_error,df_trt,df_block,df_error,MS_trt,MS_block,MS_error,F_trt,F_block,p_trt,p_block} = result;
  const table = document.getElementById('anova-table');
  const rows = [];
  if (SS_block !== undefined && trial.design !== 'crd') {
    rows.push({src:'Block', df:df_block, ss:SS_block, ms:MS_block, F:F_block, p:p_block});
  }
  rows.push({src:'Treatment', df:df_trt, ss:SS_trt, ms:MS_trt, F:F_trt, p:p_trt});
  rows.push({src:'Residual', df:df_error, ss:SS_error, ms:MS_error, F:null, p:null});
  rows.push({src:'Total', df:(df_block||0)+df_trt+df_error, ss:(SS_block||0)+SS_trt+SS_error, ms:null,F:null,p:null});

  table.querySelector('thead').innerHTML = `<tr><th>Source</th><th>df</th><th>SS</th><th>MS</th><th>F</th><th>Pr(&gt;F)</th></tr>`;
  table.querySelector('tbody').innerHTML = rows.map(r => {
    const sigClass = r.p !== null ? (r.p<0.05?'class="anova-sig"':'class="anova-ns"') : '';
    return `<tr>
      <td><strong>${r.src}</strong></td>
      <td>${r.df??'–'}</td>
      <td>${r.ss!=null?r.ss.toFixed(2):'–'}</td>
      <td>${r.ms!=null?r.ms.toFixed(2):'–'}</td>
      <td>${r.F!=null?r.F.toFixed(3):'–'}</td>
      <td ${sigClass}>${r.p!=null?`${r.p.toFixed(4)} ${pValueLabel(r.p)}`:'–'}</td>
    </tr>`;
  }).join('');
}

function renderResidualChart(result) {
  const {residuals} = result;
  if (!residuals?.length) return;
  const ctx = document.getElementById('resid-chart');
  if (!ctx) return;
  if (residChart) residChart.destroy();
  residChart = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: [{
      label:'Residuals',
      data: residuals.map(r=>({x:parseFloat(r.fitted.toFixed(3)),y:parseFloat(r.resid.toFixed(3))})),
      backgroundColor:'rgba(59,109,17,0.6)',
      pointRadius:5,
    }]},
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{title:{display:true,text:'Fitted values'},grid:{color:'rgba(128,128,128,0.1)'}},
        y:{title:{display:true,text:'Residuals'},grid:{color:'rgba(128,128,128,0.1)'}},
      }
    }
  });
}

function setAnalyzeTab(tab, btn) {
  ['means','anova','econ','report'].forEach(t=>{
    const el = document.getElementById('atab-'+t);
    if (el) el.style.display = t===tab?'block':'none';
  });
  document.querySelectorAll('#page-analyze .tab-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function calcEcon() {
  if (!analysisResult) return;
  const {trial, result, data} = analysisResult;
  const price = parseFloat(document.getElementById('econ-price')?.value||4.5);
  const inputCost = parseFloat(document.getElementById('econ-cost')?.value||0.45);
  const {trtMeans, tukey} = result;
  const sorted = tukey?.sorted || Object.keys(trtMeans);
  const trts = trial.treatments || [];
  const getTrtObj = name => trts.find(t=>t.name===name);
  const controlMean = trtMeans[sorted[sorted.length-1]] || Object.values(trtMeans)[0];

  let bestNet = -Infinity, bestTrt='';
  const tbody = document.getElementById('econ-body');
  if (!tbody) return;
  tbody.innerHTML = sorted.map(trt => {
    const m = trtMeans[trt];
    const tObj = getTrtObj(trt);
    const rate = tObj?.numericRate || 0;
    const gross = m * price;
    const cost = rate * inputCost;
    const net = gross - cost;
    const vs = net - (controlMean * price);
    if (net > bestNet) { bestNet=net; bestTrt=trt; }
    const color = vs>0?'var(--green-600)':'var(--coral-600)';
    return `<tr>
      <td>${trt}</td>
      <td>${m.toFixed(1)}</td>
      <td>$${gross.toFixed(0)}</td>
      <td>$${cost.toFixed(0)}</td>
      <td><strong>$${net.toFixed(0)}</strong></td>
      <td style="color:${color};">${vs>=0?'+':''}$${vs.toFixed(0)}</td>
    </tr>`;
  }).join('');

  const rec = document.getElementById('econ-rec');
  if (rec) {
    rec.style.display='block';
    rec.innerHTML = `💡 At current prices, <strong>${bestTrt}</strong> returns the highest net revenue. Adjust prices above to model different market scenarios.`;
  }
}

function renderReport(trial, result, data) {
  // Handled by js/reports.js renderFullReportTab — called from extensions.js
  const el = document.getElementById('report-preview');
  if (!el) return;
  const {trtMeans, tukey, p_trt, F_trt, CV} = result;
  const sorted = tukey?.sorted || Object.keys(trtMeans);
  const gm = mean(data.map(d=>d.value));
  el.innerHTML = `
    <div class="report-section">
      <h3>Trial information</h3>
      <table class="data-table">
        <tr><td style="color:var(--text2);width:140px;">Trial name</td><td><strong>${trial.name}</strong></td></tr>
        <tr><td style="color:var(--text2);">Crop</td><td>${trial.crop}</td></tr>
        <tr><td style="color:var(--text2);">Field</td><td>${trial.field||'–'}</td></tr>
        <tr><td style="color:var(--text2);">Season</td><td>${trial.season}</td></tr>
        <tr><td style="color:var(--text2);">Design</td><td>${trial.design?.toUpperCase()}</td></tr>
        <tr><td style="color:var(--text2);">Objective</td><td>${trial.objective||'–'}</td></tr>
        <tr><td style="color:var(--text2);">Variable</td><td>${trial.variable}</td></tr>
        <tr><td style="color:var(--text2);">Observations</td><td>${data.length}</td></tr>
      </table>
    </div>
    <div class="report-section">
      <h3>Statistical summary</h3>
      <table class="data-table">
        <tr><td style="color:var(--text2);width:140px;">Grand mean</td><td>${gm.toFixed(2)}</td></tr>
        <tr><td style="color:var(--text2);">CV (%)</td><td>${parseFloat(CV||0).toFixed(1)}%</td></tr>
        <tr><td style="color:var(--text2);">F-statistic (Trt)</td><td>${parseFloat(F_trt||0).toFixed(3)}</td></tr>
        <tr><td style="color:var(--text2);">p-value (Trt)</td><td style="color:${p_trt<0.05?'var(--green-600)':'var(--text)'};">${parseFloat(p_trt||1).toFixed(4)} ${pValueLabel(p_trt)}</td></tr>
        <tr><td style="color:var(--text2);">Tukey LSD</td><td>${result.tukey?.HSD?.toFixed(2)||'–'}</td></tr>
      </table>
    </div>
    <div class="report-section">
      <h3>Treatment means</h3>
      <table class="data-table">
        <thead><tr><th>Rank</th><th>Treatment</th><th>Mean</th><th>Group</th></tr></thead>
        <tbody>
        ${sorted.map((trt,i) => {
          const vals = data.filter(d=>d.trt===trt).map(d=>d.value);
          const m = mean(vals);
          const letters = tukey?.letters?.[trt]?.join('')||'–';
          return `<tr><td>${i+1}</td><td>${trt}</td><td>${m.toFixed(2)}</td><td>${letters}</td></tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>
    <div class="report-section">
      <h3>Interpretation</h3>
      <p style="font-size:13px;line-height:1.7;color:var(--text2);">
        ${p_trt<0.05
          ? `The ${trial.design?.toUpperCase()} analysis revealed a statistically significant treatment effect (F = ${parseFloat(F_trt||0).toFixed(2)}, p = ${parseFloat(p_trt||1).toFixed(4)}). The top-performing treatment was <strong>${sorted[0]}</strong> with a mean of ${trtMeans[sorted[0]]?.toFixed(2)} ${trial.variable?.split('(')[1]?.replace(')','') || 'units'}. The CV of ${parseFloat(CV||0).toFixed(1)}% indicates ${parseFloat(CV||20)<15?'good':'moderate'} experimental precision.`
          : `The ${trial.design?.toUpperCase()} analysis did not detect a statistically significant treatment effect (F = ${parseFloat(F_trt||0).toFixed(2)}, p = ${parseFloat(p_trt||1).toFixed(4)}). Observed differences among treatment means are likely attributable to field variability. Consider increasing replication in future trials.`}
      </p>
    </div>
  `;
}

// ── EXPORT ────────────────────────────────────────────────────
function exportCSV() {
  const trial = appState.trials.find(t=>t.id===(currentCollectTrialId||currentAnalyzeTrialId));
  if (!trial) { alert('No trial selected.'); return; }
  const obs = appState.observations.filter(o=>o.trialId===trial.id);
  const rows = obs.map(o => {
    const plot = trial.plots?.find(p=>p.id===o.plotId) || {};
    return {
      trial_id: trial.id, trial_name: trial.name, season: trial.season,
      crop: trial.crop, field: trial.field, design: trial.design,
      plot_id: o.plotId, block: plot.block||'', treatment: plot.trtName||'',
      value: o.value, variable: trial.variable, date: o.date,
      secondary: o.secondary||'', notes: o.notes||''
    };
  });
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`${trial.name.replace(/\s+/g,'_')}_${trial.season}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function exportPDF() {
  if (!analysisResult) { alert('Run analysis first.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const { trial, result, data } = analysisResult;
  const {trtMeans, tukey, p_trt, F_trt, CV} = result;
  const sorted = tukey?.sorted || Object.keys(trtMeans);
  const gm = mean(data.map(d=>d.value));

  // Header
  doc.setFillColor(59,109,17);
  doc.rect(0,0,210,18,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(14); doc.setFont(undefined,'bold');
  doc.text('FarmPRISM – Trial Analysis Report', 14, 12);
  doc.setTextColor(0,0,0);

  // Trial info
  doc.setFontSize(12); doc.setFont(undefined,'bold');
  doc.text(trial.name, 14, 28);
  doc.setFontSize(9); doc.setFont(undefined,'normal');
  doc.setTextColor(100,100,100);
  doc.text(`${trial.crop} · ${trial.field||'No field'} · Season ${trial.season} · Design: ${trial.design?.toUpperCase()}`, 14, 35);
  doc.setTextColor(0,0,0);

  // Key stats
  doc.setFontSize(10); doc.setFont(undefined,'bold');
  doc.text('Statistical Results', 14, 48);
  doc.setFont(undefined,'normal'); doc.setFontSize(9);
  const stats = [
    ['Grand mean:', `${gm.toFixed(2)} ${trial.variable||''}`],
    ['CV:', `${parseFloat(CV||0).toFixed(1)}%`],
    ['F-statistic (Treatment):', `${parseFloat(F_trt||0).toFixed(3)}`],
    ['p-value:', `${parseFloat(p_trt||1).toFixed(4)} ${pValueLabel(p_trt)}`],
    ['Tukey HSD:', `${result.tukey?.HSD?.toFixed(2)||'–'}`],
  ];
  stats.forEach(([k,v],i) => {
    doc.setTextColor(100,100,100); doc.text(k, 14, 56+i*7);
    doc.setTextColor(0,0,0); doc.text(v, 70, 56+i*7);
  });

  // Means table
  doc.setFontSize(10); doc.setFont(undefined,'bold');
  doc.text('Treatment Means (Tukey HSD Grouping)', 14, 100);
  doc.setFont(undefined,'normal'); doc.setFontSize(9);
  doc.setFillColor(240,243,235);
  doc.rect(14,104,182,6,'F');
  doc.setFont(undefined,'bold');
  ['Rank','Treatment','n','Mean','Std Dev','Group'].forEach((h,i)=>{
    doc.text(h, [14,30,80,110,135,162][i], 108);
  });
  doc.setFont(undefined,'normal');
  sorted.forEach((trt,i) => {
    const vals = data.filter(d=>d.trt===trt).map(d=>d.value);
    const m = mean(vals); const s = vals.length>1?sd(vals):0;
    const y = 118+i*7;
    if (i%2===0){doc.setFillColor(250,251,248);doc.rect(14,y-4,182,7,'F');}
    doc.text(String(i+1), 14, y);
    doc.text(trt.substring(0,25), 30, y);
    doc.text(String(vals.length), 80, y);
    doc.text(m.toFixed(2), 110, y);
    doc.text(`±${s.toFixed(2)}`, 135, y);
    doc.text(tukey?.letters?.[trt]?.join('')||'–', 162, y);
  });

  // Interpretation
  const startY = 120 + sorted.length*7;
  doc.setFontSize(10); doc.setFont(undefined,'bold');
  doc.text('Interpretation', 14, startY+4);
  doc.setFont(undefined,'normal'); doc.setFontSize(9);
  const interpretation = p_trt<0.05
    ? `Statistically significant treatment effect detected (F=${parseFloat(F_trt||0).toFixed(2)}, p=${parseFloat(p_trt||1).toFixed(4)}). Best treatment: ${sorted[0]} with mean ${trtMeans[sorted[0]]?.toFixed(2)}.`
    : `No significant treatment effect (p=${parseFloat(p_trt||1).toFixed(4)}). Observed differences likely due to field variability.`;
  doc.text(doc.splitTextToSize(interpretation, 182), 14, startY+12);

  // Footer
  doc.setFontSize(8); doc.setTextColor(150,150,150);
  doc.text(`Generated by FarmPRISM · ${new Date().toLocaleDateString()}`, 14, 285);

  doc.save(`${trial.name.replace(/\s+/g,'_')}_report.pdf`);
}

// ── SEASON COMPARISON ─────────────────────────────────────────
function buildSeasonComparison() {
  // Populate filters
  const nameFilter = document.getElementById('season-trial-filter');
  const uniqueNames = [...new Set(appState.trials.map(t=>t.name))];
  nameFilter.innerHTML = '<option value="">— All trials —</option>' +
    uniqueNames.map(n=>`<option value="${n}">${n}</option>`).join('');

  const allTrials = appState.trials;
  const body = document.getElementById('season-body');
  const datasets = [];
  const labels = [...new Set(allTrials.map(t=>t.season))].sort();

  allTrials.forEach((trial,ti) => {
    const obs = appState.observations.filter(o=>o.trialId===trial.id);
    if (!obs.length) return;
    const data = obs.map(o => {
      const plot = trial.plots?.find(p=>p.id===o.plotId);
      return { trt: plot?.trtName||'Unknown', block:String(plot?.block||1), value:parseFloat(o.value) };
    });
    const result = trial.design==='crd' ? computeCRD_ANOVA(data) : computeRCBD_ANOVA(data);
    const {trtMeans, tukey, p_trt} = result;
    const sorted = tukey?.sorted || Object.keys(trtMeans);
    const bestTrt = sorted[0];
    const controlMean = trtMeans[sorted[sorted.length-1]] || Object.values(trtMeans)[0];
    const bestMean = trtMeans[bestTrt];
    const pctGain = ((bestMean-controlMean)/controlMean*100).toFixed(1);
    body && (body.innerHTML += `<tr>
      <td>${trial.season}</td>
      <td>${trial.name}</td>
      <td>${bestTrt}</td>
      <td>${bestMean?.toFixed(2)||'–'}</td>
      <td style="color:var(--green-600);">+${pctGain}%</td>
      <td class="${p_trt<0.05?'anova-sig':'anova-ns'}">${parseFloat(p_trt||1).toFixed(4)} ${pValueLabel(p_trt)}</td>
    </tr>`);
    datasets.push({ label:`${trial.name} (${trial.season})`, data:[{x:trial.season,y:bestMean}], backgroundColor:COLORS[ti%COLORS.length], borderColor:COLORS[ti%COLORS.length], borderWidth:2 });
  });

  // Season chart
  const ctx = document.getElementById('season-chart');
  if (!ctx) return;
  if (seasonChart) seasonChart.destroy();
  seasonChart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}},
      scales:{
        x:{title:{display:true,text:'Season'}},
        y:{title:{display:true,text:'Mean yield (best treatment)'},beginAtZero:false},
      }
    }
  });
}

// ── MODALS ────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target===el) el.classList.remove('open'); });
});

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  updateOnlineStatus();
  renderTrialsPage();
  document.getElementById('current-season-label').textContent = appState.currentSeason;

  // Demo data if empty
  if (!appState.trials.length) loadDemoData();
});

function loadDemoData() {
  // Pre-load a sample completed trial for demonstration
  const trial = {
    id: appState.nextTrialId++,
    name: 'Nitrogen Rate Study',
    crop: 'Corn', field: 'North 40', season: '2025',
    objective: 'Determine optimal N rate for yield',
    variable: 'Grain yield (bu/ac)', design: 'rcbd', reps: 4,
    plotLen: 600, plotRows: 4,
    treatments: [
      {name:'Control (0 lb)',  rate:'0 lb/ac',   color:COLORS[0], numericRate:0},
      {name:'Low N (120 lb)',  rate:'120 lb/ac',  color:COLORS[1], numericRate:120},
      {name:'Std N (180 lb)',  rate:'180 lb/ac',  color:COLORS[2], numericRate:180},
      {name:'High N (240 lb)', rate:'240 lb/ac',  color:COLORS[3], numericRate:240},
    ],
    plots: [], gpsPlots:[], createdAt: new Date().toISOString(),
  };
  // Build plots
  const trtNames = trial.treatments.map(t=>t.name);
  for (let r=0;r<4;r++) {
    const order = shuffle(trtNames.map((_,i)=>i));
    order.forEach((ti,pos)=>{
      trial.plots.push({id:`${r+1}${String(pos+1).padStart(2,'0')}`, block:r+1, trtIdx:ti, trtName:trtNames[ti], color:trial.treatments[ti].color});
    });
  }
  appState.trials.push(trial);

  // Obs data (realistic values with block effects)
  const blockEffect = [3.2,-1.8,0.4,-1.8];
  const trtEffect = [0, 17.5, 23.1, 24.6];
  const baseMean = 160;
  trial.plots.forEach(p => {
    const val = baseMean + blockEffect[p.block-1] + trtEffect[p.trtIdx] + (Math.random()-0.5)*8;
    appState.observations.push({
      id:appState.nextObsId++, trialId:trial.id, plotId:p.id,
      value:parseFloat(val.toFixed(1)), date:'2025-10-15', notes:'', secondary:'14.5',
      savedAt:new Date().toISOString(),
    });
  });

  // Second season trial
  const trial2 = {...trial, id:appState.nextTrialId++, season:'2024', name:'Nitrogen Rate Study', createdAt:'2024-01-01T00:00:00Z'};
  trial2.plots = JSON.parse(JSON.stringify(trial.plots));
  appState.trials.push(trial2);
  trial2.plots.forEach(p => {
    const val = baseMean - 8 + blockEffect[p.block-1]*0.8 + trtEffect[p.trtIdx]*0.9 + (Math.random()-0.5)*9;
    appState.observations.push({
      id:appState.nextObsId++, trialId:trial2.id, plotId:p.id,
      value:parseFloat(val.toFixed(1)), date:'2024-10-12', notes:'', secondary:'15.1',
      savedAt:new Date().toISOString(),
    });
  });

  appState.currentSeason = '2025';
  saveState();
  renderTrialsPage();
}
