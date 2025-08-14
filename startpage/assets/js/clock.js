// assets/js/clock.js
export function renderClock() {
  const timeEl = document.querySelector('#bigClock');
  const dateEl = document.querySelector('#bigDate');
  const now = new Date();

  if (timeEl) {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    timeEl.textContent = `${hh}:${mm}`;
  }

  if (dateEl) {
    const fmt = new Intl.DateTimeFormat('no-NO', { weekday: 'short', day: '2-digit', month: 'short' });
    // f.eks. "tor. 14. aug."
    dateEl.textContent = fmt.format(now).replaceAll('.', '').replace(',', '');
  }
}

export function startClock() {
  renderClock();
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    renderClock();
    setInterval(renderClock, 60000);
  }, msToNextMinute);
}

export function renderCalendar() {
  const root = document.querySelector('#calendar');
  if (!root) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  const weekday = (first.getDay() + 6) % 7; // mandag=0
  start.setDate(first.getDate() - weekday);

  const DOW = ['Ma','Ti','On','To','Fr','Lø','Sø'];
  root.innerHTML = '';
  DOW.forEach(d => {
    const h = document.createElement('div');
    h.className = 'dow'; h.textContent = d;
    root.appendChild(h);
  });

  for (let i=0; i<42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const div = document.createElement('div');
    const out = d.getMonth() !== month;
    const isToday = d.toDateString() === now.toDateString();
    div.className = `day${out?' out':''}${isToday?' today':''}`;
    div.textContent = String(d.getDate());
    root.appendChild(div);
  }
}
