// assets/js/rss.js
const FEEDS = [
  // Legg gjerne til eller bytt ut etter smak
  { name: 'NRK',       url: 'https://www.nrk.no/toppsaker.rss' },
  { name: 'VG',        url: 'https://www.vg.no/rss/feed' },
  { name: 'Aftenposten', url: 'https://www.aftenposten.no/rss' },
  { name: 'Ringblad',  url: 'https://www.ringblad.no/rss' }
];

// Enkel CORS-proxy for lokal utvikling
const proxy = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

const $ = (s) => document.querySelector(s);

function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function parseRss(xmlText, sourceName, sourceUrl) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const items = [...doc.querySelectorAll('item')].slice(0, 10).map((it) => {
    const title = it.querySelector('title')?.textContent?.trim() || 'Uten tittel';
    const link  = it.querySelector('link')?.textContent?.trim() || '#';
    const date  = new Date(it.querySelector('pubDate')?.textContent || Date.now());
    return { title, link, date, source: sourceName || new URL(sourceUrl).hostname.replace(/^www\./,'') };
  });
  return items;
}

async function fetchFeed(f) {
  const res = await fetch(proxy(f.url));
  if (!res.ok) throw new Error(`RSS-feil: ${f.name}`);
  const txt = await res.text();
  return parseRss(txt, f.name, f.url);
}

function renderRSS(items) {
  const root = $('#rssList');
  if (!root) return;
  root.innerHTML = '';
  items.forEach((it) => {
    const div = document.createElement('div');
    div.className = 'rss-item';
    div.innerHTML = `
      <a href="${it.link}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>
      <span class="rss-meta">· ${escapeHtml(it.source)}</span>
    `;
    root.appendChild(div);
  });
}

export async function loadRSS() {
  try {
    const all = [];
    for (const f of FEEDS) {
      try { all.push(...await fetchFeed(f)); } catch { /* hopp over én feed ved feil */ }
    }
    all.sort((a, b) => b.date - a.date);
    renderRSS(all.slice(0, 12));
  } catch {
    const root = $('#rssList');
    if (root) root.textContent = 'Kunne ikke hente RSS akkurat nå.';
  }
}
