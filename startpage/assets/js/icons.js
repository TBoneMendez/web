// assets/js/icons.js
export function iconFor(url, category) {
  const u = (url || '').toLowerCase();
  const g = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="${d}"/></svg>`;

  // Kategori-ikoner (samme ikon for alle lenker i kategorien)
  const ICONS = {
    streaming: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-1 5.5 6 3.5-6 3.5V8.5z', // sirkel + play
    news:      'M4 5h12a2 2 0 0 1 2 2v10H6a2 2 0 0 1-2-2V5zm14 0h2v12a2 2 0 0 1-2 2H6v-2h12V5zm-9 3h7v2H9V8zm0 3h7v2H9v-2zM6 8h2v2H6V8zm0 3h2v2H6v-2z', // avis
    bank:      'M12 3 3 8v2h18V8l-9-5zm-7 6v7h2v-7H5zm4 0v7h2v-7H9zm4 0v7h2v-7h-2zm4 0v7h2v-7h-2z', // bankbygg
  };

  // Hvis kategori er gitt (streaming/news/bank) -> bruk ensartet ikon
  if (category && ICONS[category]) return g(ICONS[category]);

  // Google Suite: 
  if (u.includes('mail.google'))   return g('M12 13 2 6v12h20V6l-10 7Zm10-9H2l10 7 10-7Z');
  if (u.includes('drive.google'))  return g('M10.2 4h3.6l5.9 10.2-1.8 3.1H6.1L4.3 14.2 10.2 4Zm-4.1 10.2 1.8 3.1h8.2l1.8-3.1H6.1Z');
  if (u.includes('docs.google'))   return g('M8 2h6l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 6H8');
  if (u.includes('sheets.google')) return g('M4 3h10l6 6v12H4V3Zm10 0v6h6');

  // Fallback generisk
  return g('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 7h6v2H10v6H8V9a2 2 0 0 1 2-2Z');
}
