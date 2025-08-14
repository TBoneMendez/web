// Local state + persistence
import { DEFAULTS, CONFIG_URL } from './config.js';

const storageKey = 'startpage:v1';

export const state = {
  name: '',
  city: '',
  links: { gsuite: [], bank: [], streaming: [], news: [] },
  loadedFromConfig: false
};

export function loadLocal() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveLocal(data) {
  try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch {}
}

export function mergeDefaults(data) {
  return {
    name: data?.name ?? DEFAULTS.name,
    city: data?.city ?? DEFAULTS.city,
    links: {
      gsuite:   data?.links?.gsuite?.length   ? data.links.gsuite   : DEFAULTS.links.gsuite,
      bank:     data?.links?.bank?.length     ? data.links.bank     : DEFAULTS.links.bank,
      streaming:data?.links?.streaming?.length? data.links.streaming: DEFAULTS.links.streaming,
      news:     data?.links?.news?.length     ? data.links.news     : DEFAULTS.links.news,
    }
  };
}

export async function loadConfigIfAny() {
  if (!CONFIG_URL) return false;
  try {
    const r = await fetch(CONFIG_URL + (CONFIG_URL.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('Config not available');
    const cfg = await r.json();
    const merged = mergeDefaults(cfg);
    state.name = merged.name; state.city = merged.city; state.links = merged.links; state.loadedFromConfig = true;
    saveLocal(state);
    return true;
  } catch(e) { return false; }
}
