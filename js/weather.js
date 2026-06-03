// ============================================================
// WEATHER MODULE — Open-Meteo API (free, no key required)
// Fetches GDDs, rainfall, temperature for a trial location
// ============================================================

const BASE_TEMP_F = 50; // GDD base temp for corn (°F)
const BASE_TEMP_C = 10; // GDD base temp (°C)

// Fetch weather for a lat/lng and date range
async function fetchTrialWeather(lat, lng, startDate, endDate) {
  if (!lat || !lng) throw new Error('No GPS coordinates for this trial');
  const url = `https://archive-api.open-meteo.com/v1/archive?` +
    `latitude=${lat}&longitude=${lng}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather API unavailable');
  return res.json();
}

// Also fetch current/forecast for ongoing trials
async function fetchCurrentWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration` +
    `&hourly=relative_humidity_2m,soil_temperature_0cm,soil_moisture_0_to_1cm` +
    `&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather forecast unavailable');
  return res.json();
}

function calcGDDs(data, baseTemp = BASE_TEMP_F) {
  const { temperature_2m_max: tmax, temperature_2m_min: tmin, time } = data.daily;
  let cumGDD = 0;
  return time.map((date, i) => {
    const avg = (Math.min(tmax[i], 86) + Math.max(tmin[i], baseTemp)) / 2;
    const gdd = Math.max(0, avg - baseTemp);
    cumGDD += gdd;
    return {
      date,
      tmax: tmax[i],
      tmin: tmin[i],
      precip: data.daily.precipitation_sum[i],
      gdd: parseFloat(gdd.toFixed(1)),
      cumGDD: parseFloat(cumGDD.toFixed(1)),
    };
  });
}

function summarizeWeather(dailyData) {
  const totalGDD = dailyData[dailyData.length - 1]?.cumGDD || 0;
  const totalPrecip = dailyData.reduce((s, d) => s + (d.precip || 0), 0);
  const avgTmax = dailyData.reduce((s, d) => s + d.tmax, 0) / dailyData.length;
  const avgTmin = dailyData.reduce((s, d) => s + d.tmin, 0) / dailyData.length;
  const dryDays = dailyData.filter(d => d.precip < 0.1).length;
  const wetDays = dailyData.filter(d => d.precip >= 0.1).length;
  return {
    totalGDD: parseFloat(totalGDD.toFixed(0)),
    totalPrecip: parseFloat(totalPrecip.toFixed(2)),
    avgTmax: parseFloat(avgTmax.toFixed(1)),
    avgTmin: parseFloat(avgTmin.toFixed(1)),
    dryDays,
    wetDays,
    days: dailyData.length,
  };
}

// Render weather panel into a container element
function renderWeatherPanel(containerId, weatherData, summary, forecast) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = `
    <div class="section-divider">Season weather summary</div>
    <div class="metric-grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px;">
      <div class="metric-card"><div class="metric-label">Total GDDs</div><div class="metric-value">${summary.totalGDD}<span class="metric-unit"> °F</span></div></div>
      <div class="metric-card"><div class="metric-label">Total precip</div><div class="metric-value">${summary.totalPrecip}<span class="metric-unit"> in</span></div></div>
      <div class="metric-card"><div class="metric-label">Avg high</div><div class="metric-value">${summary.avgTmax}<span class="metric-unit"> °F</span></div></div>
      <div class="metric-card"><div class="metric-label">Avg low</div><div class="metric-value">${summary.avgTmin}<span class="metric-unit"> °F</span></div></div>
      <div class="metric-card"><div class="metric-label">Rainy days</div><div class="metric-value">${summary.wetDays}</div></div>
      <div class="metric-card"><div class="metric-label">Dry days</div><div class="metric-value">${summary.dryDays}</div></div>
    </div>

    <div class="section-divider">Growing degree days accumulation</div>
    <div style="position:relative;height:200px;margin-bottom:16px;">
      <canvas id="gdd-chart" role="img" aria-label="GDD accumulation chart">Cumulative growing degree days over the season.</canvas>
    </div>

    <div class="section-divider">Precipitation</div>
    <div style="position:relative;height:160px;margin-bottom:16px;">
      <canvas id="precip-chart" role="img" aria-label="Daily precipitation chart">Daily precipitation totals.</canvas>
    </div>

    ${forecast ? renderForecastStrip(forecast) : ''}
  `;

  renderGDDChart(weatherData);
  renderPrecipChart(weatherData);
}

function renderForecastStrip(forecast) {
  const days = forecast.daily.time.slice(0, 7);
  const tmax = forecast.daily.temperature_2m_max;
  const tmin = forecast.daily.temperature_2m_min;
  const precip = forecast.daily.precipitation_sum;
  return `
    <div class="section-divider">7-day forecast</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:16px;">
      ${days.map((d, i) => {
        const dow = new Date(d).toLocaleDateString('en', {weekday:'short'});
        const precipIcon = precip[i] > 0.1 ? '🌧️' : precip[i] > 0 ? '🌦️' : '☀️';
        return `<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:8px 4px;text-align:center;">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">${dow}</div>
          <div style="font-size:16px;margin-bottom:4px;">${precipIcon}</div>
          <div style="font-size:12px;font-weight:500;">${Math.round(tmax[i])}°</div>
          <div style="font-size:11px;color:var(--text2);">${Math.round(tmin[i])}°</div>
          ${precip[i] > 0 ? `<div style="font-size:10px;color:var(--blue-600);margin-top:2px;">${precip[i].toFixed(2)}"</div>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
}

let gddChartInst = null, precipChartInst = null;

function renderGDDChart(dailyData) {
  const ctx = document.getElementById('gdd-chart');
  if (!ctx) return;
  if (gddChartInst) gddChartInst.destroy();
  // Sample every 3rd day for readability
  const sampled = dailyData.filter((_, i) => i % 3 === 0 || i === dailyData.length - 1);
  gddChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sampled.map(d => d.date.slice(5)),
      datasets: [{
        label: 'Cumulative GDDs',
        data: sampled.map(d => d.cumGDD),
        borderColor: '#3B6D11',
        backgroundColor: 'rgba(59,109,17,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(128,128,128,0.1)' } },
        y: { title: { display: true, text: 'GDDs (°F base 50)', font: { size: 10 } }, grid: { color: 'rgba(128,128,128,0.1)' } }
      }
    }
  });
}

function renderPrecipChart(dailyData) {
  const ctx = document.getElementById('precip-chart');
  if (!ctx) return;
  if (precipChartInst) precipChartInst.destroy();
  const sampled = dailyData.filter((_, i) => i % 2 === 0 || i === dailyData.length - 1);
  precipChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sampled.map(d => d.date.slice(5)),
      datasets: [{
        label: 'Precipitation (in)',
        data: sampled.map(d => d.precip),
        backgroundColor: '#185FA5',
        borderRadius: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
        y: { title: { display: true, text: 'Inches', font: { size: 10 } }, grid: { color: 'rgba(128,128,128,0.1)' } }
      }
    }
  });
}

// Geocode a field name/location to lat/lng using Nominatim
async function geocodeLocation(locationName) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  if (!data.length) throw new Error('Location not found');
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
}
