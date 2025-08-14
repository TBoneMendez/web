// assets/js/market.js
let chart;

// ---------- helpers ----------
const nf = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 });
const kr = new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 2 });

function formatValue(v, unit) {
  if (v == null || Number.isNaN(v)) return '--';
  if (unit === 'NOK') return kr.format(v);
  if (unit === 'kr/kWh') return `${nf.format(v)} kr/kWh`;
  if (unit === 'SEK') return `${nf.format(v)} SEK`;
  return nf.format(v);
}

function setKPIs(series, unit, isHourly) {
  const now = Date.now();

  // "Nå" = siste punkt <= nå (om timeserie); ellers siste punkt
  let current = null;
  if (isHourly) {
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].x <= now) { current = series[i]; break; }
    }
    if (!current) current = series[series.length - 1] || null;
  } else {
    current = series[series.length - 1] || null;
  }

  const ys  = series.map(p => p.y).filter(Number.isFinite);
  const avg = ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : null;
  const min = ys.length ? Math.min(...ys) : null;
  const max = ys.length ? Math.max(...ys) : null;

  const $now = document.getElementById('kpiNow');
  const $avg = document.getElementById('kpiAvg');
  const $mm  = document.getElementById('kpiMinMax');

  if ($now) $now.textContent = formatValue(current?.y ?? null, unit);
  if ($avg) $avg.textContent = formatValue(avg ?? null, unit);
  if ($mm)  $mm.textContent  = (min == null || max == null) ? '-- / --' : `${nf.format(min)} / ${nf.format(max)}`;

  return { avg, min, max, current };
}

// ---------- FX fetchers (with fallback) ----------
async function fetchFxExchangerateHost(base, quote, start, end) {
  const url = `https://api.exchangerate.host/timeseries?start_date=${start}&end_date=${end}&base=${base}&symbols=${quote}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('exchangerate.host failed');
  const j = await r.json();
  if (!j || j.success === false || !j.rates) throw new Error('Invalid FX response');
  return Object.keys(j.rates)
    .sort()
    .map(d => ({ x: new Date(d).getTime(), y: j.rates[d][quote] }))
    .filter(p => Number.isFinite(p.y));
}

async function fetchFxFrankfurter(base, quote, start, end) {
  const url = `https://api.frankfurter.app/${start}..${end}?from=${base}&to=${quote}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('frankfurter.app failed');
  const j = await r.json();
  if (!j || !j.rates) throw new Error('Invalid FX response');
  return Object.keys(j.rates)
    .sort()
    .map(d => ({ x: new Date(d).getTime(), y: j.rates[d][quote] }))
    .filter(p => Number.isFinite(p.y));
}

async function fetchFx(base, quote, months = 12) {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(end.getMonth() - months);

  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);

  try {
    const a = await fetchFxExchangerateHost(base, quote, s, e);
    if (a.length) return a;
    throw new Error('Empty');
  } catch {
    const b = await fetchFxFrankfurter(base, quote, s, e);
    return b;
  }
}

// ---------- Power (NO1) ----------
async function fetchPowerNO1() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');

  const t2 = new Date(today); t2.setDate(today.getDate() + 1);
  const y2 = t2.getFullYear();
  const m2 = String(t2.getMonth() + 1).padStart(2, '0');
  const d2 = String(t2.getDate()).padStart(2, '0');

  const urlToday    = `https://www.hvakosterstrommen.no/api/v1/prices/${y}/${m}-${d}_NO1.json`;
  const urlTomorrow = `https://www.hvakosterstrommen.no/api/v1/prices/${y2}/${m2}-${d2}_NO1.json`;

  const [r1, r2] = await Promise.allSettled([fetch(urlToday), fetch(urlTomorrow)]);
  const arr = [];

  if (r1.status === 'fulfilled') {
    const a1 = await r1.value.json();
    a1.forEach(row => arr.push({ x: new Date(row.time_start).getTime(), y: row.NOK_per_kWh }));
  }
  if (r2.status === 'fulfilled') {
    const a2 = await r2.value.json();
    a2.forEach(row => arr.push({ x: new Date(row.time_start).getTime(), y: row.NOK_per_kWh }));
  }

  arr.sort((a, b) => a.x - b.x);
  return arr;
}

// ---------- renderer ----------
function startOfCurrentHour(ts) {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function renderChart(series, { unit, timeUnit, splitAfterNow, label }) {
  const { avg } = setKPIs(series, unit, timeUnit === 'hour');

  // Avg reference
  const avgLine = (Number.isFinite(avg) && series.length >= 2)
    ? [
        { x: series[0].x, y: avg },
        { x: series[series.length - 1].x, y: avg }
      ]
    : [];

  // Colors
  const baseColor   = '#7c9aff';
  const futureColor = '#f59e0b';
  const avgColor    = 'rgba(255,255,255,0.7)';
  const tickColor   = '#0b1020';

  // Current hour marker (power)
  let nowPoint = null;
  if (timeUnit === 'hour' && series.length) {
    const hourStart = startOfCurrentHour(Date.now());
    const idx = series.findIndex(p => p.x === hourStart);
    if (idx >= 0) nowPoint = { x: hourStart, y: series[idx].y };
  }

  const dsLine = {
    label,
    data: series,
    parsing: { xAxisKey: 'x', yAxisKey: 'y' },
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.25,
    borderColor: baseColor,
    segment: {}
  };

  // Different color for future (hourly)
  if (splitAfterNow) {
    dsLine.segment = {
      borderColor(ctx) {
        const startX = ctx.p0.parsed.x;
        const hrStart = startOfCurrentHour(Date.now());
        return startX >= hrStart ? futureColor : baseColor;
      }
    };
  }

  const dsAvg = {
    label: 'Snitt',
    data: avgLine,
    parsing: { xAxisKey: 'x', yAxisKey: 'y' },
    borderColor: avgColor,
    borderDash: [6, 6],
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0
  };

  const dsNow = nowPoint ? {
    label: 'Nå',
    data: [nowPoint],
    parsing: { xAxisKey: 'x', yAxisKey: 'y' },
    pointRadius: 4,
    pointHoverRadius: 5,
    pointBackgroundColor: '#101010',
    pointBorderColor: '#ffffff',
    pointBorderWidth: 2,
    showLine: false
  } : null;

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('marketChart'), {
    type: 'line',
    data: { datasets: dsNow ? [dsLine, dsAvg, dsNow] : [dsLine, dsAvg] },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => formatValue(ctx.parsed.y, unit) }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: timeUnit,
            // enkle norske 24t/dag-format uten locale-objekt
            displayFormats: { hour: 'HH', day: 'd. MMM' },
            tooltipFormat: timeUnit === 'hour' ? 'HH:mm' : 'd. MMM yyyy'
          },
          grid:  { color: 'rgba(0,0,0,0.06)' },
          ticks: { color: tickColor }
        },
        y: {
          grid:  { color: 'rgba(0,0,0,0.06)' },
          ticks: { color: tickColor, callback: v => formatValue(v, unit) }
        }
      }
    }
  });
}

// ---------- controller ----------
export async function loadMarket() {
  const sel  = document.getElementById('datasetSelect');
  const note = document.getElementById('marketNote');
  const id   = sel?.value || 'eur-nok';

  // reset KPIs while loading
  setKPIs([], null, false);

  try {
    if (id === 'eur-nok') {
      note.textContent = 'Kilde: exchangerate.host / frankfurter.app – 12 mnd';
      renderChart(await fetchFx('EUR', 'NOK', 12), { unit: 'NOK', timeUnit: 'day',  splitAfterNow: false, label: 'EUR → NOK' });
    } else if (id === 'usd-nok') {
      note.textContent = 'Kilde: exchangerate.host / frankfurter.app – 12 mnd';
      renderChart(await fetchFx('USD', 'NOK', 12), { unit: 'NOK', timeUnit: 'day',  splitAfterNow: false, label: 'USD → NOK' });
    } else if (id === 'nok-sek') {
      note.textContent = 'Kilde: exchangerate.host / frankfurter.app – 12 mnd';
      renderChart(await fetchFx('NOK', 'SEK', 12), { unit: 'SEK', timeUnit: 'day',  splitAfterNow: false, label: 'NOK → SEK' });
    } else if (id === 'power-no1') {
      note.textContent = 'Kilde: hvakosterstrommen.no – i dag + i morgen (NO1)';
      renderChart(await fetchPowerNO1(),             { unit: 'kr/kWh', timeUnit: 'hour', splitAfterNow: true,  label: 'Strøm (NO1)' });
    }
  } catch (e) {
    if (note) note.textContent = `Kunne ikke hente data: ${e.message || e}`;
    if (chart) chart.destroy();
    setKPIs([], null, false);
  }
}

export function bindMarket() {
  const sel = document.getElementById('datasetSelect');
  if (sel) sel.addEventListener('change', () => loadMarket());
}
