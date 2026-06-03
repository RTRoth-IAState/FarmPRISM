// ============================================================
// FARMPRISM — Rich Report Module
// Farmer-friendly summary + Agronomist full report
// Both with charts, visualization, interpretation
// ============================================================

// ── FARMER SUMMARY REPORT ────────────────────────────────────
function buildFarmerReport(trial, result, data, weatherData) {
  const { trtMeans, tukey, p_trt, CV } = result;
  const sorted = tukey?.sorted || Object.keys(trtMeans);
  const bestTrt = sorted[0];
  const worstTrt = sorted[sorted.length - 1];
  const bestMean = trtMeans[bestTrt] || 0;
  const worstMean = trtMeans[worstTrt] || bestMean;
  const yieldGain = (bestMean - worstMean).toFixed(1);
  const sig = p_trt < 0.05;
  const colors = (trial.treatments || []).reduce((m, t) => ({ ...m, [t.name]: t.color }), {});
  const maxMean = Math.max(...sorted.map(t => trtMeans[t]));

  // Economic estimate
  const cornPrice = 4.50;
  const revenueGain = (parseFloat(yieldGain) * cornPrice).toFixed(0);

  return `
<div id="farmer-report" style="font-family:var(--font-main);max-width:680px;">

  <!-- Header -->
  <div style="background:var(--green-600);color:white;padding:20px 24px;border-radius:var(--radius) var(--radius) 0 0;margin-bottom:0;">
    <div style="font-size:10px;letter-spacing:0.1em;opacity:0.75;margin-bottom:6px;">FARMPRISM · FARMER SUMMARY REPORT</div>
    <div style="font-size:22px;font-weight:500;">${trial.name}</div>
    <div style="font-size:13px;opacity:0.85;margin-top:4px;">${trial.crop} · ${trial.field || 'No field'} · ${trial.season} · ${trial.design?.toUpperCase()}</div>
  </div>

  <!-- Bottom line -->
  <div style="background:${sig ? 'var(--green-50)' : 'var(--amber-50)'};border:1px solid ${sig ? 'var(--green-100)' : 'var(--amber-100)'};padding:16px 20px;margin-bottom:16px;">
    <div style="font-size:15px;font-weight:500;color:${sig ? 'var(--green-800)' : 'var(--amber-800)'};margin-bottom:6px;">
      ${sig ? '✅ The verdict: There IS a real difference between treatments' : '⚠️ The verdict: No clear winner this season'}
    </div>
    <div style="font-size:13px;color:${sig ? 'var(--green-800)' : 'var(--amber-800)'};">
      ${sig
        ? `<strong>${bestTrt}</strong> outperformed the lowest-yielding treatment by <strong>${yieldGain} bu/ac</strong> — at $${cornPrice}/bu that's roughly <strong>$${revenueGain}/acre</strong>. This difference is statistically real, not just field noise (p = ${parseFloat(p_trt).toFixed(3)}).`
        : `Differences between treatments were too small relative to field variability to draw conclusions (p = ${parseFloat(p_trt).toFixed(3)}). Run the trial again next season before making management changes.`}
    </div>
  </div>

  <!-- Yield chart -->
  <div style="background:var(--surface);border:var(--border);border-radius:var(--radius);padding:16px 20px;margin-bottom:14px;">
    <div style="font-size:14px;font-weight:500;margin-bottom:14px;">Yield by treatment</div>
    ${sorted.map((trt, i) => {
      const m = trtMeans[trt];
      const pct = (m / maxMean * 100).toFixed(1);
      const color = colors[trt] || COLORS[i % COLORS.length];
      const letters = tukey?.letters?.[trt]?.join('') || '';
      const vals = data.filter(d => d.trt === trt).map(d => d.value);
      const s = vals.length > 1 ? Math.sqrt(vals.reduce((s,v) => s + (v - m)**2, 0) / (vals.length-1)) : 0;
      return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:10px;height:10px;border-radius:2px;background:${color};flex-shrink:0;"></div>
            <span style="font-size:13px;">${trt}</span>
            ${letters ? `<span style="font-size:11px;font-weight:600;color:var(--text2);">${letters}</span>` : ''}
          </div>
          <span style="font-size:13px;font-weight:500;">${m.toFixed(1)} bu/ac <span style="font-size:11px;font-weight:400;color:var(--text2);">±${s.toFixed(1)}</span></span>
        </div>
        <div style="background:var(--surface2);border-radius:100px;height:20px;position:relative;">
          <div style="background:${color};width:${pct}%;height:20px;border-radius:100px;transition:width 0.6s;"></div>
        </div>
      </div>`;
    }).join('')}
    <div style="font-size:11px;color:var(--text2);margin-top:8px;">
      Letters indicate Tukey HSD grouping (α=0.05) — treatments sharing a letter are not significantly different.
      Error bars = ±1 standard deviation.
    </div>
  </div>

  <!-- Key numbers -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px;">
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 14px;">
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">Best treatment</div>
      <div style="font-size:15px;font-weight:500;">${bestTrt}</div>
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 14px;">
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">Yield advantage</div>
      <div style="font-size:22px;font-weight:500;color:var(--green-600);">+${yieldGain}<span style="font-size:12px;font-weight:400;color:var(--text2);"> bu/ac</span></div>
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 14px;">
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">Revenue advantage</div>
      <div style="font-size:22px;font-weight:500;color:var(--green-600);">+$${revenueGain}<span style="font-size:12px;font-weight:400;color:var(--text2);"> /acre</span></div>
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 14px;">
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">Field variability (CV)</div>
      <div style="font-size:22px;font-weight:500;">${parseFloat(CV||0).toFixed(1)}<span style="font-size:12px;font-weight:400;color:var(--text2);">%</span></div>
    </div>
  </div>

  ${weatherData ? `
  <!-- Weather context -->
  <div style="background:var(--surface);border:var(--border);border-radius:var(--radius);padding:16px 20px;margin-bottom:14px;">
    <div style="font-size:14px;font-weight:500;margin-bottom:10px;">🌤️ Growing season conditions</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
      <div style="text-align:center;">
        <div style="font-size:24px;font-weight:500;">${weatherData.totalGDD}</div>
        <div style="font-size:11px;color:var(--text2);">Total GDDs (°F base 50)</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:24px;font-weight:500;">${weatherData.totalPrecip}"</div>
        <div style="font-size:11px;color:var(--text2);">Total precipitation</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:24px;font-weight:500;">${weatherData.avgTmax}°</div>
        <div style="font-size:11px;color:var(--text2);">Average daily high (°F)</div>
      </div>
    </div>
  </div>` : ''}

  <!-- What to do next -->
  <div style="background:var(--surface);border:var(--border);border-radius:var(--radius);padding:16px 20px;margin-bottom:14px;">
    <div style="font-size:14px;font-weight:500;margin-bottom:10px;">📋 What to do next</div>
    ${sig ? `
    <div style="font-size:13px;color:var(--text2);line-height:1.7;">
      <div style="margin-bottom:8px;">✅ Consider adopting <strong>${bestTrt}</strong> on a larger portion of your acres next season.</div>
      <div style="margin-bottom:8px;">🔁 Repeat this trial for 1–2 more seasons to confirm — one year is strong evidence but two years is conclusive.</div>
      <div>📞 Share these results with your agronomist or extension agent — use the Agronomist Report for a full statistical writeup.</div>
    </div>` : `
    <div style="font-size:13px;color:var(--text2);line-height:1.7;">
      <div style="margin-bottom:8px;">🔁 Run the trial again next season with the same treatments — one inconclusive year doesn't mean the treatments are equal.</div>
      <div style="margin-bottom:8px;">📐 Consider adding replications next year to increase statistical power.</div>
      <div>📞 Talk to your agronomist about whether field variability might be masking real treatment differences.</div>
    </div>`}
  </div>

  <div style="font-size:11px;color:var(--text3);text-align:center;padding:8px;">
    Generated by FarmPRISM · ${new Date().toLocaleDateString()} · ${data.length} observations · ${trial.design?.toUpperCase()} design
  </div>
</div>`;
}

// ── AGRONOMIST FULL REPORT ────────────────────────────────────
function buildAgronomistReport(trial, result, data, weatherData) {
  const { trtMeans, tukey, p_trt, F_trt, CV,
          SS_trt, SS_block, SS_error, df_trt, df_block, df_error,
          MS_trt, MS_block, MS_error, F_block, p_block, MSE } = result;
  const sorted = tukey?.sorted || Object.keys(trtMeans);
  const gm = data.reduce((s, d) => s + d.value, 0) / data.length;
  const colors = (trial.treatments || []).reduce((m, t) => ({ ...m, [t.name]: t.color }), {});

  return `
<div id="agron-report" style="font-family:var(--font-main);max-width:680px;">

  <!-- Header -->
  <div style="border-bottom:2px solid var(--green-600);padding-bottom:12px;margin-bottom:16px;">
    <div style="font-size:10px;font-weight:500;letter-spacing:0.1em;color:var(--text2);margin-bottom:4px;">FARMPRISM · TECHNICAL ANALYSIS REPORT</div>
    <div style="font-size:20px;font-weight:500;">${trial.name}</div>
  </div>

  <!-- Trial metadata table -->
  <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:16px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
      ${[
        ['Crop', trial.crop], ['Field', trial.field || '–'],
        ['Season', trial.season], ['Design', trial.design?.toUpperCase()],
        ['Replications', trial.reps || '–'], ['Observations', data.length],
        ['Primary variable', trial.variable], ['Objective', trial.objective || '–'],
      ].map(([k,v]) => `<div><span style="color:var(--text2);">${k}:</span> <strong>${v}</strong></div>`).join('')}
    </div>
  </div>

  <!-- ANOVA table -->
  <div style="margin-bottom:16px;">
    <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Analysis of Variance — ${trial.design?.toUpperCase()}</div>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="border-bottom:1px solid var(--text3);">
          <th style="text-align:left;padding:7px 10px;color:var(--text2);font-weight:500;">Source</th>
          <th style="text-align:right;padding:7px 8px;color:var(--text2);font-weight:500;">df</th>
          <th style="text-align:right;padding:7px 8px;color:var(--text2);font-weight:500;">SS</th>
          <th style="text-align:right;padding:7px 8px;color:var(--text2);font-weight:500;">MS</th>
          <th style="text-align:right;padding:7px 8px;color:var(--text2);font-weight:500;">F</th>
          <th style="text-align:right;padding:7px 8px;color:var(--text2);font-weight:500;">Pr(>F)</th>
        </tr>
      </thead>
      <tbody>
        ${SS_block !== undefined && trial.design !== 'crd' ? `
        <tr style="border-bottom:1px solid var(--surface2);">
          <td style="padding:7px 10px;">Block</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${df_block}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${SS_block?.toFixed(2)}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${MS_block?.toFixed(2)}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${F_block?.toFixed(3)}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);color:var(--text2);">${p_block?.toFixed(4)} ${pValueLabel(p_block)}</td>
        </tr>` : ''}
        <tr style="border-bottom:1px solid var(--surface2);">
          <td style="padding:7px 10px;"><strong>Treatment</strong></td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${df_trt}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${SS_trt?.toFixed(2)}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${MS_trt?.toFixed(2)}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${F_trt?.toFixed(3)}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);font-weight:600;color:${p_trt<0.05?'var(--green-600)':'var(--text2)'};">${p_trt?.toFixed(4)} ${pValueLabel(p_trt)}</td>
        </tr>
        <tr style="border-bottom:1px solid var(--surface2);">
          <td style="padding:7px 10px;">Residual</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${df_error}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${SS_error?.toFixed(2)}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${MS_error?.toFixed(2)}</td>
          <td style="text-align:right;padding:7px 8px;">–</td>
          <td style="text-align:right;padding:7px 8px;">–</td>
        </tr>
        <tr>
          <td style="padding:7px 10px;"><strong>Total</strong></td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${(df_block||0)+df_trt+df_error}</td>
          <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${((SS_block||0)+SS_trt+SS_error).toFixed(2)}</td>
          <td style="text-align:right;padding:7px 8px;">–</td>
          <td style="text-align:right;padding:7px 8px;">–</td>
          <td style="text-align:right;padding:7px 8px;">–</td>
        </tr>
      </tbody>
    </table>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-top:6px;">
      Grand mean: ${gm.toFixed(3)} · CV: ${parseFloat(CV||0).toFixed(2)}% · MSE: ${MS_error?.toFixed(3)} ·
      Tukey LSD (0.05): ${tukey?.HSD?.toFixed(3) || '–'} · Significance: *** p&lt;0.001 · ** p&lt;0.01 · * p&lt;0.05 · ns p≥0.05
    </div>
  </div>

  <!-- Means table with SE -->
  <div style="margin-bottom:16px;">
    <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Treatment Means — Tukey HSD Grouping (α = 0.05)</div>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="border-bottom:1px solid var(--text3);">
          <th style="text-align:left;padding:7px 10px;color:var(--text2);font-weight:500;">Treatment</th>
          <th style="text-align:right;padding:7px 8px;color:var(--text2);font-weight:500;">n</th>
          <th style="text-align:right;padding:7px 8px;color:var(--text2);font-weight:500;">Mean</th>
          <th style="text-align:right;padding:7px 8px;color:var(--text2);font-weight:500;">Std Dev</th>
          <th style="text-align:right;padding:7px 8px;color:var(--text2);font-weight:500;">SE</th>
          <th style="text-align:right;padding:7px 8px;color:var(--text2);font-weight:500;">95% CI</th>
          <th style="text-align:center;padding:7px 8px;color:var(--text2);font-weight:500;">Group</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((trt, i) => {
          const vals = data.filter(d => d.trt === trt).map(d => d.value);
          const m = trtMeans[trt];
          const s = vals.length > 1 ? Math.sqrt(vals.reduce((sum,v) => sum + (v-m)**2, 0) / (vals.length-1)) : 0;
          const se = s / Math.sqrt(vals.length);
          const t95 = 2.0; // approximate t critical
          const ci = (t95 * se).toFixed(2);
          const color = colors[trt] || COLORS[i % COLORS.length];
          const letters = tukey?.letters?.[trt]?.join('') || '–';
          return `<tr style="border-bottom:1px solid var(--surface2);">
            <td style="padding:7px 10px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0;"></div>
                ${trt}
              </div>
            </td>
            <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${vals.length}</td>
            <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);font-weight:500;">${m.toFixed(3)}</td>
            <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">±${s.toFixed(3)}</td>
            <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${se.toFixed(3)}</td>
            <td style="text-align:right;padding:7px 8px;font-family:var(--font-mono);">${(m-parseFloat(ci)).toFixed(2)}–${(m+parseFloat(ci)).toFixed(2)}</td>
            <td style="text-align:center;padding:7px 8px;font-weight:700;font-size:13px;">${letters}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
  </div>

  <!-- Means with error bars chart (rendered after inject) -->
  <div style="margin-bottom:16px;">
    <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Treatment means with 95% confidence intervals</div>
    <div style="position:relative;height:${Math.max(200, sorted.length * 52 + 60)}px;">
      <canvas id="agron-means-chart" role="img" aria-label="Horizontal bar chart of treatment means with error bars">Treatment means with confidence intervals.</canvas>
    </div>
  </div>

  <!-- Residual plot -->
  <div style="margin-bottom:16px;">
    <div style="font-size:13px;font-weight:500;margin-bottom:4px;">Residuals vs fitted values</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:8px;">Points should be randomly scattered around zero with no pattern — indicates ANOVA assumptions are met.</div>
    <div style="position:relative;height:200px;">
      <canvas id="agron-resid-chart" role="img" aria-label="Residual plot">Residuals vs fitted values scatter plot.</canvas>
    </div>
  </div>

  <!-- Statistical interpretation -->
  <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Statistical interpretation</div>
    <div style="font-size:12px;color:var(--text2);line-height:1.8;">
      ${p_trt < 0.05
        ? `The ${trial.design?.toUpperCase()} ANOVA detected a statistically significant treatment effect
           (F<sub>${df_trt},${df_error}</sub> = ${parseFloat(F_trt||0).toFixed(3)}, p = ${parseFloat(p_trt||1).toFixed(4)}).
           Treatment accounted for ${(SS_trt/((SS_block||0)+SS_trt+SS_error)*100).toFixed(1)}% of total variation.
           The coefficient of variation (CV = ${parseFloat(CV||0).toFixed(1)}%) indicates
           ${parseFloat(CV||20) < 10 ? 'excellent' : parseFloat(CV||20) < 15 ? 'good' : 'acceptable'} experimental precision.
           Tukey HSD separations (α = 0.05, HSD = ${tukey?.HSD?.toFixed(2)||'–'}) are shown in the grouping column above.`
        : `The ${trial.design?.toUpperCase()} ANOVA did not detect a statistically significant treatment effect
           (F<sub>${df_trt},${df_error}</sub> = ${parseFloat(F_trt||0).toFixed(3)}, p = ${parseFloat(p_trt||1).toFixed(4)}).
           The observed treatment differences are within the range expected from random field variation.
           CV = ${parseFloat(CV||0).toFixed(1)}%. Consider a power analysis to determine whether additional
           replications would improve detection capability.`}
      ${SS_block !== undefined && trial.design !== 'crd'
        ? ` Block variation was ${p_block < 0.05 ? 'significant (p = ' + parseFloat(p_block).toFixed(4) + '), confirming the utility of blocking in this trial.' : 'not significant (p = ' + parseFloat(p_block||1).toFixed(4) + '), suggesting the field was relatively uniform — a CRD may have been equally appropriate.'}`
        : ''}
    </div>
  </div>

  ${weatherData ? `
  <!-- Weather context -->
  <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Growing season conditions</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:12px;">
      <div><div style="color:var(--text2);">Cumulative GDDs</div><div style="font-size:16px;font-weight:500;">${weatherData.totalGDD} °F</div></div>
      <div><div style="color:var(--text2);">Total precipitation</div><div style="font-size:16px;font-weight:500;">${weatherData.totalPrecip}"</div></div>
      <div><div style="color:var(--text2);">Mean daily high</div><div style="font-size:16px;font-weight:500;">${weatherData.avgTmax}°F</div></div>
      <div><div style="color:var(--text2);">Mean daily low</div><div style="font-size:16px;font-weight:500;">${weatherData.avgTmin}°F</div></div>
      <div><div style="color:var(--text2);">Rainy days</div><div style="font-size:16px;font-weight:500;">${weatherData.wetDays}</div></div>
      <div><div style="color:var(--text2);">Dry days</div><div style="font-size:16px;font-weight:500;">${weatherData.dryDays}</div></div>
    </div>
  </div>` : ''}

  <div style="font-size:11px;color:var(--text3);text-align:center;padding:8px;border-top:var(--border);margin-top:8px;">
    FarmPRISM statistical analysis · Generated ${new Date().toLocaleString()} · ${data.length} observations · WebR/JS ANOVA engine
  </div>
</div>`;
}

// Render charts inside the report HTML after it's injected into the DOM
function renderReportCharts(result, data, type) {
  const { trtMeans, tukey, residuals } = result;
  const sorted = tukey?.sorted || Object.keys(trtMeans);

  if (type === 'agronomist') {
    // Horizontal bar with error bars
    const ctx1 = document.getElementById('agron-means-chart');
    if (ctx1) {
      const vals = sorted.map(trt => {
        const v = data.filter(d => d.trt === trt).map(d => d.value);
        const m = trtMeans[trt];
        const s = v.length > 1 ? Math.sqrt(v.reduce((s,x) => s+(x-m)**2,0)/(v.length-1)) : 0;
        return { m, se: s/Math.sqrt(v.length) };
      });
      if (window._reportMeansChart) window._reportMeansChart.destroy();
      window._reportMeansChart = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: sorted,
          datasets: [{
            label: 'Mean yield',
            data: sorted.map(t => parseFloat(trtMeans[t].toFixed(2))),
            backgroundColor: sorted.map((t,i) => (result.trial?.treatments||[]).find(tr=>tr.name===t)?.color || COLORS[i%COLORS.length]),
            borderWidth: 0,
            borderRadius: 3,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x.toFixed(2)} bu/ac` } }
          },
          scales: {
            x: { title: { display: true, text: 'Mean yield (bu/ac)' }, grid: { color: 'rgba(128,128,128,0.1)' } },
            y: { grid: { display: false } }
          }
        }
      });
    }
    // Residual chart
    const ctx2 = document.getElementById('agron-resid-chart');
    if (ctx2 && residuals?.length) {
      if (window._reportResidChart) window._reportResidChart.destroy();
      window._reportResidChart = new Chart(ctx2, {
        type: 'scatter',
        data: { datasets: [{
          label: 'Residuals',
          data: residuals.map(r => ({ x: parseFloat(r.fitted.toFixed(2)), y: parseFloat(r.resid.toFixed(2)) })),
          backgroundColor: 'rgba(59,109,17,0.55)', pointRadius: 5, pointHoverRadius: 7,
        }]},
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            label: ctx => ` Fitted: ${ctx.parsed.x.toFixed(2)}, Resid: ${ctx.parsed.y.toFixed(2)}`
          }}},
          scales: {
            x: { title: { display: true, text: 'Fitted values' }, grid: { color: 'rgba(128,128,128,0.1)' } },
            y: { title: { display: true, text: 'Residuals' }, grid: { color: 'rgba(128,128,128,0.1)' } }
          }
        }
      });
    }
  }
}

// ── EXTEND REPORT TAB ─────────────────────────────────────────
// Called from extensions.js after analysis runs
function renderFullReportTab(trial, result, data) {
  const reportDiv = document.getElementById('atab-report');
  if (!reportDiv) return;

  // Get cached weather for this trial
  const wx = (appState.weatherCache || {})[trial.id];
  const wxSummary = wx?.summary || null;
  // Attach trial ref for chart coloring
  result.trial = trial;

  reportDiv.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="cicon">📄</span> Choose report style</div>
      <div class="tabs" id="report-style-tabs">
        <button class="tab-btn active" onclick="switchReport('farmer',this)">🌾 Farmer summary</button>
        <button class="tab-btn" onclick="switchReport('agronomist',this)">🔬 Agronomist report</button>
      </div>
      <div id="report-content"></div>
      <div class="btn-row" style="margin-top:16px;">
        <button class="btn btn-primary" onclick="exportReportPDF()">⬇️ Download PDF</button>
        <button class="btn btn-secondary" onclick="exportCSV()">⬇️ Export data CSV</button>
        <button class="btn btn-secondary" onclick="createShareLink(${trial.id})">🔗 Share link</button>
      </div>
      <div id="share-result" style="margin-top:8px;"></div>
    </div>
  `;

  window._currentReportData = { trial, result, data, wxSummary };
  switchReport('farmer', document.querySelector('#report-style-tabs .tab-btn'));
}

function switchReport(type, btn) {
  document.querySelectorAll('#report-style-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (!window._currentReportData) return;
  const { trial, result, data, wxSummary } = window._currentReportData;
  const container = document.getElementById('report-content');
  if (!container) return;

  container.innerHTML = type === 'farmer'
    ? buildFarmerReport(trial, result, data, wxSummary)
    : buildAgronomistReport(trial, result, data, wxSummary);

  setTimeout(() => renderReportCharts(result, data, type), 100);
}

function exportReportPDF() {
  if (!window._currentReportData) { alert('Run analysis first.'); return; }
  const { trial, result, data, wxSummary } = window._currentReportData;
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { alert('PDF library not loaded yet, try again in a moment.'); return; }
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const { trtMeans, tukey, p_trt, F_trt, CV } = result;
  const sorted = tukey?.sorted || Object.keys(trtMeans);
  const gm = data.reduce((s, d) => s + d.value, 0) / data.length;

  // Header band
  doc.setFillColor(59, 109, 17);
  doc.rect(0, 0, 216, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15); doc.setFont(undefined, 'bold');
  doc.text('FarmPRISM — Trial Analysis Report', 14, 10);
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`${trial.name} · ${trial.crop} · ${trial.field || ''} · ${trial.season}`, 14, 17);

  doc.setTextColor(0, 0, 0); let y = 30;

  // Key stats
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('Statistical Results', 14, y); y += 7;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  const stats = [
    ['Design', trial.design?.toUpperCase()],
    ['Grand mean', `${gm.toFixed(2)} ${trial.variable || 'bu/ac'}`],
    ['CV', `${parseFloat(CV||0).toFixed(1)}%`],
    ['F (Treatment)', `${parseFloat(F_trt||0).toFixed(3)}`],
    ['p-value', `${parseFloat(p_trt||1).toFixed(4)} ${pValueLabel(p_trt)}`],
    ['Tukey HSD', `${tukey?.HSD?.toFixed(2) || '–'}`],
  ];
  stats.forEach(([k, v]) => {
    doc.setTextColor(120, 120, 120); doc.text(k + ':', 14, y);
    doc.setTextColor(0, 0, 0); doc.text(v, 65, y); y += 6;
  });
  y += 4;

  // Means table
  doc.setFont(undefined, 'bold'); doc.setFontSize(11);
  doc.text('Treatment Means', 14, y); y += 7;
  doc.setFillColor(240, 244, 236);
  doc.rect(14, y - 4, 188, 6, 'F');
  doc.setFontSize(8); doc.setFont(undefined, 'bold');
  doc.text('Treatment', 16, y);
  doc.text('n', 100, y); doc.text('Mean', 112, y);
  doc.text('Std Dev', 135, y); doc.text('Group', 168, y); y += 6;
  doc.setFont(undefined, 'normal');
  sorted.forEach((trt, i) => {
    const vals = data.filter(d => d.trt === trt).map(d => d.value);
    const m = trtMeans[trt];
    const s = vals.length > 1 ? Math.sqrt(vals.reduce((sum,v) => sum+(v-m)**2,0)/(vals.length-1)) : 0;
    const letters = tukey?.letters?.[trt]?.join('') || '–';
    if (i % 2 === 0) { doc.setFillColor(250, 251, 248); doc.rect(14, y-4, 188, 6, 'F'); }
    doc.setFontSize(8);
    doc.text(trt.substring(0, 30), 16, y);
    doc.text(String(vals.length), 100, y); doc.text(m.toFixed(2), 112, y);
    doc.text(`±${s.toFixed(2)}`, 135, y); doc.text(letters, 168, y);
    y += 6;
  });
  y += 6;

  // Interpretation
  doc.setFont(undefined, 'bold'); doc.setFontSize(11);
  doc.text('Interpretation', 14, y); y += 7;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  const interp = p_trt < 0.05
    ? `Statistically significant treatment effect (F=${parseFloat(F_trt||0).toFixed(3)}, p=${parseFloat(p_trt||1).toFixed(4)}). Best treatment: ${sorted[0]} (${trtMeans[sorted[0]]?.toFixed(2)}). CV=${parseFloat(CV||0).toFixed(1)}%.`
    : `No significant treatment effect (p=${parseFloat(p_trt||1).toFixed(4)}). Differences attributable to field variability. Consider increasing replications.`;
  doc.text(doc.splitTextToSize(interp, 188), 14, y); y += 16;

  if (wxSummary) {
    doc.setFont(undefined, 'bold'); doc.setFontSize(10);
    doc.text('Growing Season Conditions', 14, y); y += 6;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(`GDDs: ${wxSummary.totalGDD} °F · Precipitation: ${wxSummary.totalPrecip}" · Avg high: ${wxSummary.avgTmax}°F`, 14, y);
  }

  // Footer
  doc.setFontSize(7); doc.setTextColor(150, 150, 150);
  doc.text(`FarmPRISM – Plot Research & Integrated Statistical Management · ${new Date().toLocaleDateString()}`, 14, 272);

  doc.save(`${trial.name.replace(/\s+/g,'_')}_${trial.season}_report.pdf`);
}

function createShareLink(trialId) {
  const url = generateShareLink(trialId);
  if (!url) { alert('Could not generate share link.'); return; }
  const el = document.getElementById('share-result');
  if (!el) { navigator.clipboard.writeText(url).then(() => alert('Link copied!')).catch(() => prompt('Copy:', url)); return; }
  el.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;">
      <input type="text" value="${url}" readonly style="flex:1;font-size:11px;font-family:var(--font-mono);background:var(--surface2);border:var(--border);border-radius:var(--radius-sm);padding:7px 10px;">
      <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${url}').then(()=>alert('Copied!'))">📋 Copy</button>
    </div>
    <div class="info-box amber" style="margin-top:8px;font-size:11px;">Anyone with this link can view (but not edit) your trial data and results.</div>
  `;
}
