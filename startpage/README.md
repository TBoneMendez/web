# Personal Start Page

A lightweight, single‑page “start page” built with plain HTML/CSS/JS. It shows the time/calendar, local weather, quick links (Google Suite, Banking, Streaming, News), a small RSS feed section, a market chart (FX + power prices), **and a full‑width Google Search bar**.

Everything runs client‑side; no bundlers or frameworks required.

---

## Features

- **Clock & calendar**
  - Compact month view with today clearly highlighted.
  - Click the card to open Google Calendar in a new tab.
- **Weather (Yr)**
  - Uses browser geolocation when available; **falls back to Hønefoss (Lat 60.18, Lon 10.21)** if permission is denied or unavailable.
  - Hourly strip starts from the next full hour.
  - Clicking opens **yr.no**.
- **Quick links**
  - Google Suite keeps individual icons; Streaming/News/Bank use consistent category icons for a tidy look.
  - All links open in a new tab.
- **RSS headlines**
  - A small, scrollable list of recent headlines under the News card.
- **Market chart**
  - Datasets: **EUR→NOK (12m)**, **USD→NOK (12m)**, **NOK→SEK (12m)**, **Power NO1 (today + tomorrow)**.
  - KPIs on the left: **Now**, **Average**, **Min/Max** for the visible period.
  - For the power dataset, the line after the current hour is color‑shifted to indicate future hours and the current hour is marked.
- **Google Search (new)**
  - A low‑profile, **full‑width** search bar under the clock/weather row.
  - Opens results on google.com in a new tab.
  - Keyboard‑friendly (focus input, press **Enter**).

---

## Project layout

```
index.html
assets/
  css/
    style.css
  js/
    app.js          # bootstraps the page
    clock.js        # time & calendar
    weather.js      # Yr (with fallback)
    ui.js           # greeting, link rendering, icons
    rss.js          # simple RSS loader
    market.js       # chart + KPIs
    state.js        # local storage + remote config
    config.js       # default links (you can customize here)
```

> Tip: If you keep `CONFIG_URL` empty in `assets/js/config.js`, the page uses the defaults defined in the same file. You can later point `CONFIG_URL` at a hosted JSON to override name, city and links without rebuilding.

---

## Running locally

You only need a static file server so the browser can fetch local files with `fetch()`.

### Option A — Python (recommended simplest)

From the **same folder as `index.html`**:

```bash
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

### Option B — VS Code “Live Server”

Install the Live Server extension, right‑click `index.html` → **Open with Live Server**.

### Option C — Node one‑liner

```bash
npx http-server -p 8080
```

---

## Google Search bar

The search card lives in `index.html`:

```html
<section class="card span-12 search-card" id="searchCard">
  <form action="https://www.google.com/search" method="GET" target="_blank" rel="noopener">
    <div class="search-row">
      <input id="searchBox" class="search-input" type="text" name="q"
             placeholder="Søk på Google…" required />
      <button class="chip search-btn" type="submit">Søk</button>
    </div>
  </form>
</section>
```

- The input name `q` is Google’s standard query parameter.
- The form targets a new tab and requires no API key.
- You can customize the placeholder text or replace the endpoint with a custom search engine if you prefer.

The styles for this card are in `assets/css/style.css` under the `/* --- Google-søk-kort --- */` section.

---

## Configuration & customization

- Edit `assets/js/config.js` to change default link groups (Google Suite, Bank & finance, Streaming, News).  
  The project already includes multiple popular Norwegian services and can be extended easily.
- `state.js` merges your local settings with these defaults and can optionally load a remote JSON if `CONFIG_URL` is set.
- Icons:
  - Google Suite uses app‑specific SVGs.
  - Other categories share a single, consistent icon per category for visual harmony.

---

## Privacy notes

- Weather uses the browser’s **geolocation API**. If denied, the app falls back to a static location (Hønefoss) and labels the source accordingly.
- RSS feeds are fetched as JSON via public endpoints; no tracking is added by this project.
- All links open in new tabs and do not include additional query params beyond what the target service needs.

---

## Troubleshooting

- **Weather won’t load** — Ensure location permission is allowed, or expect to see the Hønefoss fallback. Check the browser console for network errors.
- **RSS empty** — Some feeds can be temporarily unavailable or block requests. The UI should degrade gracefully.
- **Chart empty** — If a dataset API is unreachable, the note above the chart will explain the failure.
- **Styling looks off** — Clear cache/disable extensions; this is a pure CSS layout and should render under any modern evergreen browser.

---

## Deploying

It’s a static site — host it anywhere:
- GitHub Pages (place files at repo root or `/docs`).
- Netlify / Vercel (drag‑and‑drop).
- Any S3/Blob/static hosting.

---

## License

MIT — do whatever you want, no warranty. Attribution is appreciated.

