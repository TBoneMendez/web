// assets/js/app.js
import { startClock, renderCalendar } from './clock.js';
import { getWeather } from './weather.js';
import { renderGreeting, renderLinks, bindEditor } from './ui.js';
import { state, loadLocal, mergeDefaults, loadConfigIfAny } from './state.js';
import { loadRSS } from './rss.js';
import { loadMarket, bindMarket } from './market.js';

function bindCardLinks() {
  const go = (url) => window.open(url, '_blank', 'noopener,noreferrer');

  const bind = (selector, url) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const open = () => go(url);

    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        open();
      }
    });
  };

  bind('#clockCard', 'https://calendar.google.com/');
  bind('#weatherCard', 'https://www.yr.no/nb');
}

// Update greeting every minute
function startGreetingTicker() {
  renderGreeting(); // now
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    renderGreeting();
    setInterval(renderGreeting, 60 * 1000);
  }, msToNextMinute);
}

(async function init() {
  // 1) State
  const local = loadLocal();
  const merged = mergeDefaults(local || {});
  state.name  = merged.name;
  state.city  = merged.city;
  state.links = merged.links;

  // 2) Valgfri fjern-konfig
  await loadConfigIfAny();

  // 3) UI
  renderLinks();
  startGreetingTicker(); // Dynamic greeting

  // 4) Clock + Calendar
  startClock();       // calls renderClock internally and syncs to whole minute
  renderCalendar();

  // 5) Vær (Yr, med geo->fallback + hourly)
  getWeather();

  // 6) RSS (Nyheter) – last now and then every 15 min
  loadRSS();
  setInterval(loadRSS, 15 * 60 * 1000);

  // 7) market / trend (graph + KPI's)
  bindMarket();   // <-- må bindes etter at select#datasetSelect finnes i DOM
  loadMarket();   // <-- laster valgt datasett og tegner graf + KPI

  // 8) Øvrige bindings (hvis editor-knapp finnes)
  if (document.querySelector('#editBtn')) {
    bindEditor();
  }
  bindCardLinks();
})();

// Funfact med fallback og auto-gjenpåføring hvis noe overskriver #subtitle
(() => {
  const SEL = '#subtitle';
  const el0 = document.querySelector(SEL);
  if (!el0) return; // finnes ikke
  // fallback beholdes fordi HTML har "Be happy!"
  let funfact = null;

  const desired = () => `...Forresten: ${funfact}`;
  const apply = () => {
    if (!funfact) return;
    const el = document.querySelector(SEL);
    if (el && el.textContent.trim() !== desired()) el.textContent = desired();
  };

  // Hent funfact én gang; bruk bare hvis innhold finnes
  fetch('/assets/funfact?ts=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.text() : '')
    .then(t => {
      const v = (t || '').trim();
      if (!v) return;        // ingen fil/innhold -> behold fallback
      funfact = v;
      apply();

      // Gjenpåfør hvis andre scripts overskriver eller bytter node
      const mo = new MutationObserver(apply);
      mo.observe(document.body, { childList: true, characterData: true, subtree: true });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
    })
    .catch(() => { /* behold fallback */ });
})();