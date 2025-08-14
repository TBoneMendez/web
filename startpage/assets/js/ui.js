// assets/js/ui.js
import { state, saveLocal } from './state.js';
import { iconFor } from './icons.js';

const $ = (sel) => document.querySelector(sel);

// Dynamisk hilsen (natt/morgen/dag/kveld)
export function renderGreeting() {
  const hour = new Date().getHours();
  let hello;
  if (hour < 6)       hello = 'God natt';
  else if (hour < 11) hello = 'God morgen';
  else if (hour < 18) hello = 'God dag';
  else if (hour < 23) hello = 'God kveld';
  else                hello = 'God natt';

  const name = (state.name || '').trim() || '👋';
  const greetEl = $('#greeting');
  const subEl   = $('#subtitle');

  if (greetEl) greetEl.textContent = `${hello} ${name}`;
  if (subEl)   subEl.textContent   = 'Be happy!';
}

// Rendrer lenke-seksjonene og gir like ikoner per kategori
export function renderLinks() {
  const sections = [
    ['#gsuiteLinks',     state.links.gsuite],     // Google Suite -> unike ikoner
    ['#bankLinks',       state.links.bank],       // Bank -> ensartet bank-ikon
    ['#streamingLinks',  state.links.streaming],  // Streaming -> ensartet play-ikon
    ['#newsLinks',       state.links.news],       // Nyheter -> ensartet avis-ikon
  ];

  sections.forEach(([sel, items]) => {
    const root = $(sel);
    if (!root) return;

    root.innerHTML = '';

    // Bestem kategori (gsuite = null -> domenespesifikke ikoner)
    const category =
      sel === '#streamingLinks' ? 'streaming' :
      sel === '#newsLinks'      ? 'news' :
      sel === '#bankLinks'      ? 'bank' : null;

    (items || []).forEach((item, idx) => {
      const a = document.createElement('a');
      a.className = 'link';
      a.href = item.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      // Ikon
      const iconSpan = document.createElement('span');
      iconSpan.innerHTML = iconFor(item.url, category);

      // Tittel
      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.title;

      a.append(iconSpan, labelSpan);

      // (Valgfritt) Drag-to-sort
      a.draggable = true;
      a.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', idx));
      a.addEventListener('dragover',  (e) => e.preventDefault());
      a.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        const to = idx;

        const key =
          sel === '#gsuiteLinks'    ? 'gsuite'   :
          sel === '#bankLinks'      ? 'bank'     :
          sel === '#streamingLinks' ? 'streaming':
                                      'news';

        const arr = state.links[key] || [];
        if (from >= 0 && from < arr.length && to >= 0 && to < arr.length) {
          arr.splice(to, 0, arr.splice(from, 1)[0]);
          saveLocal(state);
          renderLinks(); // re-render etter sortering
        }
      });

      root.appendChild(a);
    });
  });
}

// Editor finnes ikke i HTML nå, men app.js kan kalle bindEditor()
// Vi lager en no-op som ikke gjør noe hvis knappen mangler.
export function bindEditor() {
  const btn = document.querySelector('#editBtn');
  if (!btn) return;
  // Hvis du legger til editor-dialog senere, kan logikken bo her.
}
