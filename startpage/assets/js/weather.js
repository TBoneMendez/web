// assets/js/weather.js
import { state } from './state.js';

// symbol_code -> emoji
const YR_SYMBOL = {
  clearsky_day: '☀️', clearsky_night: '🌙',
  fair_day: '🌤️', fair_night: '🌙',
  partlycloudy_day: '⛅', partlycloudy_night: '☁️',
  cloudy: '☁️', fog: '🌫️',
  lightrain: '🌦️', rain: '🌧️', heavyrain: '🌧️',
  lightrainshowers_day: '🌦️', lightrainshowers_night: '🌧️',
  rainshowers_day: '🌦️',  rainshowers_night: '🌧️',
  heavyrainshowers_day: '🌧️', heavyrainshowers_night: '🌧️',
  lightsnow: '🌨️', snow: '🌨️', heavysnow: '🌨️',
  lightsnowshowers_day: '🌨️', lightsnowshowers_night: '🌨️',
  snowshowers_day: '🌨️',  snowshowers_night: '🌨️',
  sleet: '🌨️', lightsleet: '🌨️', heavysleet: '🌨️',
  sleetshowers_day: '🌨️', sleetshowers_night: '🌨️',
  thunderstorm: '⛈️',
  lightrainandthunder: '⛈️', rainandthunder: '⛈️', heavyrainandthunder: '⛈️',
  lightsnowandthunder: '⛈️', snowandthunder: '⛈️', heavysnowandthunder: '⛈️',
  sleetandthunder: '⛈️', heavysleetandthunder: '⛈️',
  rainshowersandthunder_day: '⛈️', rainshowersandthunder_night: '⛈️',
  snowshowersandthunder_day: '⛈️', snowshowersandthunder_night: '⛈️',
  sleetshowersandthunder_day: '⛈️', sleetshowersandthunder_night: '⛈️',
};

// symbol_code -> norsk tekst
const YR_TEXT = {
  clearsky_day: 'Klarvær', clearsky_night: 'Klarvær',
  fair_day: 'Stort sett klart', fair_night: 'Stort sett klart',
  partlycloudy_day: 'Delvis skyet', partlycloudy_night: 'Delvis skyet',
  cloudy: 'Skyet', fog: 'Tåke',
  lightrain: 'Lett regn', rain: 'Regn', heavyrain: 'Kraftig regn',
  lightrainshowers_day: 'Lette regnbyger', lightrainshowers_night: 'Lette regnbyger',
  rainshowers_day: 'Regnbyger', rainshowers_night: 'Regnbyger',
  heavyrainshowers_day: 'Kraftige regnbyger', heavyrainshowers_night: 'Kraftige regnbyger',
  lightsnow: 'Lett snø', snow: 'Snø', heavysnow: 'Kraftig snø',
  lightsnowshowers_day: 'Lette snøbyger', lightsnowshowers_night: 'Lette snøbyger',
  snowshowers_day: 'Snøbyger', snowshowers_night: 'Snøbyger',
  sleet: 'Sludd', lightsleet: 'Lett sludd', heavysleet: 'Kraftig sludd',
  sleetshowers_day: 'Sluddbyger', sleetshowers_night: 'Sluddbyger',
  thunderstorm: 'Tordenvær',
  lightrainandthunder: 'Lett regn og torden',
  rainandthunder: 'Regn og torden',
  heavyrainandthunder: 'Kraftig regn og torden',
  lightsnowandthunder: 'Lett snø og torden',
  snowandthunder: 'Snø og torden',
  heavysnowandthunder: 'Kraftig snø og torden',
  sleetandthunder: 'Sludd og torden',
  heavysleetandthunder: 'Kraftig sludd og torden',
  rainshowersandthunder_day: 'Regnbyger og torden',
  rainshowersandthunder_night: 'Regnbyger og torden',
  snowshowersandthunder_day: 'Snøbyger og torden',
  snowshowersandthunder_night: 'Snøbyger og torden',
  sleetshowersandthunder_day: 'Sluddbyger og torden',
  sleetshowersandthunder_night: 'Sluddbyger og torden',
};

function symbolToEmoji(sym = '') {
  if (YR_SYMBOL[sym]) return YR_SYMBOL[sym];
  const s = String(sym).toLowerCase();
  if (s.includes('thunder')) return '⛈️';
  if (s.includes('snow')) return '🌨️';
  if (s.includes('sleet')) return '🌨️';
  if (s.includes('rain')) return '🌧️';
  if (s.includes('cloud')) return '☁️';
  if (s.includes('fair')) return '🌤️';
  if (s.includes('clear')) return '☀️';
  if (s.includes('fog')) return '🌫️';
  return '⛅';
}

function symbolToText(sym = '') {
  if (YR_TEXT[sym]) return YR_TEXT[sym];
  const s = String(sym).toLowerCase();
  if (s.includes('thunder')) return 'Tordenvær';
  if (s.includes('heavyrain')) return 'Kraftig regn';
  if (s.includes('lightrain')) return 'Lett regn';
  if (s.includes('rain')) return 'Regn';
  if (s.includes('heavysnow')) return 'Kraftig snø';
  if (s.includes('lightsnow')) return 'Lett snø';
  if (s.includes('snow')) return 'Snø';
  if (s.includes('sleet')) return 'Sludd';
  if (s.includes('cloudy')) return 'Skyet';
  if (s.includes('partlycloudy')) return 'Delvis skyet';
  if (s.includes('fair')) return 'Stort sett klart';
  if (s.includes('clear')) return 'Klarvær';
  if (s.includes('fog')) return 'Tåke';
  return 'Oppdatert vær';
}

const $  = (s) => document.querySelector(s);
const set = (s, txt) => { const el = $(s); if (el) el.textContent = txt; };
const put = (s, node) => { const el = $(s); if (el) { el.innerHTML = ''; el.appendChild(node); } };

function fmtCoord(lat, lon) { return `Lat ${lat.toFixed(2)}, Lon ${lon.toFixed(2)}`; }

async function resolveCoords(opts) {
  if (opts && Number.isFinite(opts.lat) && Number.isFinite(opts.lon)) {
    return { lat: +opts.lat, lon: +opts.lon, source: 'manual' };
  }
  if ('geolocation' in navigator) {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 })
      );
      return { lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'geo' };
    } catch {}
  }
  return { lat: 60.18, lon: 10.21, source: 'fallback' }; // Hønefoss-ish
}

async function fetchYrCompact(lat, lon) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Yr feilet');
  return r.json();
}

function readNowFromYr(data) {
  const ts = data?.properties?.timeseries;
  if (!Array.isArray(ts) || !ts.length) return null;

  const now = Date.now();
  let row = ts[0];
  for (let i = 0; i < ts.length; i++) {
    const t = new Date(ts[i].time).getTime();
    if (t >= now) { row = ts[i]; break; }
  }

  const temp = row?.data?.instant?.details?.air_temperature;
  const sym = row?.data?.next_1_hours?.summary?.symbol_code
           || row?.data?.next_6_hours?.summary?.symbol_code
           || '';
  return {
    temp: Number.isFinite(temp) ? Math.round(temp) : null,
    emoji: symbolToEmoji(sym),
    text:  symbolToText(sym),
    symbol_code: sym
  };
}

function buildHourlyFromYr(data) {
  const ts = data?.properties?.timeseries || [];
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1); // start på neste hele time

  const items = [];
  for (let i = 0; i < ts.length && items.length < 6; i++) {
    const row = ts[i];
    const sym1h = row?.data?.next_1_hours?.summary?.symbol_code;
    if (!sym1h) continue;

    const dt = new Date(row.time);
    if (dt < nextHour) continue;

    items.push({
      hour: String(dt.getHours()).padStart(2, '0'),
      temp: Math.round(row?.data?.instant?.details?.air_temperature ?? NaN),
      emoji: symbolToEmoji(sym1h)
    });
  }
  return items;
}

function renderHourly(items) {
  const wrap = document.createElement('div');
  wrap.className = 'hourly';
  items.forEach(it => {
    const card = document.createElement('div');
    card.className = 'hour';
    const h = document.createElement('div'); h.className='h'; h.textContent = it.hour;
    const e = document.createElement('div'); e.className='e'; e.textContent = it.emoji;
    const t = document.createElement('div'); t.className='t'; t.textContent = `${it.temp}°`;
    card.append(h, e, t);
    wrap.appendChild(card);
  });
  put('#hourly', wrap);
}

export async function getWeather(opts = {}) {
  const { lat, lon, source } = await resolveCoords(opts);

  // Vis "(Hønefoss)" når vi er på fallback, ellers by/koordinater
  const city = state.city?.trim();
  set('#weatherLocation',
    source === 'fallback' ? '(Hønefoss)' : (city || fmtCoord(lat, lon))
  );

  try {
    const data = await fetchYrCompact(lat, lon);

    const nowVals = readNowFromYr(data);
    if (nowVals && nowVals.temp !== null) {
      set('#weatherTemp', `${nowVals.temp}°`);
      set('#weatherDesc', nowVals.text);           // ← beskrivende norsk tekst
      const icon = $('#weatherIcon'); if (icon) icon.textContent = nowVals.emoji;
    } else {
      set('#weatherTemp', '--°');
      set('#weatherDesc', 'Kunne ikke hente vær');
    }

    const items = buildHourlyFromYr(data);         // neste hele time →
    if (items.length) renderHourly(items);
  } catch {
    set('#weatherTemp', '--°');
    set('#weatherDesc', 'Kunne ikke hente vær');
  }
}
