// ---------- Globals ----------
let MONTHLY = null;             // totals (all loans)
let MONTHLY_BY_LOAN = null;     // per-loan breakdown for filterable chart
let chart = null;
let showAll = false;

// ---------- Helpers ----------
function q(id){ return document.getElementById(id) }
function num(x){ const n=parseFloat(String(x).replace(/\s/g,'').replace(',','.')); return isNaN(n)?0:n }
function parseDate(x){ const t=Date.parse(x); return isNaN(t)?0:t }
function visibleCards(){ return Array.from(document.querySelectorAll('.loan-card')).filter(c=>c.style.display!=='none') }
function daysSince(dateStr){ const t=Date.parse(dateStr); if(isNaN(t)) return Infinity; return (Date.now()-t)/(1000*60*60*24) }

function monthFilterIndices() {
  if (!MONTHLY) return [];
  if (showAll) return MONTHLY.months.map((m,i)=>({i,m}));
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return MONTHLY.months
    .map((m,i)=>({i,m, d:new Date(m+'-01')}))
    .filter(o=> o.d >= start)
    .map(o=>({i:o.i, m:o.m}));
}

function renderMonthlyChart() {
  if (!MONTHLY) return;
  const metric = q('metricSelect')?.value || 'interest'; // 'interest' | 'principal'
  const idxs = monthFilterIndices();
  const labels = idxs.map(o=>o.m);

  let pick;
  if (MONTHLY_BY_LOAN && MONTHLY_BY_LOAN.months?.length) {
    // Sum only visible loan cards
    const visibleIds = Array.from(document.querySelectorAll('.loan-card'))
      .filter(c=>c.style.display!=='none')
      .map(c=>String(c.dataset.loan));
    pick = (key) => {
      return idxs.map(({i})=>{
        let s = 0;
        visibleIds.forEach(id=>{
          const L = MONTHLY_BY_LOAN.loans?.[id];
          if (!L) return;
          const arr = L[key] || [];
          s += Number(arr[i]||0);
        });
        return s;
      });
    };
  } else {
    // Fallback: total series
    pick = (key)=> idxs.map(o => (MONTHLY[key][o.i] || 0));
  }

  const base = (metric==='principal') ? '59,130,246' : '16,185,129'; // blue vs teal
  const datasets = [
    { type:'bar', label:'Actual',    data: pick(metric+'_actual'),
      backgroundColor:`rgba(${base},0.75)`, borderColor:`rgba(${base},1)`, borderWidth:1, stack:'s' },
    { type:'bar', label:'Estimated', data: pick(metric+'_estimated'),
      backgroundColor:`rgba(${base},0.25)`, borderColor:`rgba(${base},0.6)`, borderWidth:1, borderDash:[6,4], stack:'s' }
  ];

  const cfg = {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive:true, maintainAspectRatio:false,
      scales: { x:{stacked:true, grid:{display:false}}, y:{stacked:true, beginAtZero:true, grid:{color:'rgba(0,0,0,0.06)'}} },
      plugins: { legend:{position:'top'}, tooltip:{callbacks:{label:(c)=>`${c.dataset.label}: ${c.parsed.y.toFixed(0)}`}} }
    }
  };
  const ctx = document.getElementById('monthlyChart')?.getContext('2d');
  if (!ctx) return;
  if (chart) chart.destroy();
  chart = new Chart(ctx, cfg);
}

function markDelayed(){
  document.querySelectorAll('.loan-card').forEach(card=>{
    const st=(card.dataset.status||'').toLowerCase();
    const badge=card.querySelector('.status-badge');
    if(!badge) return;
    card.dataset.delayed="false";
    if(st==='repaid'){ badge.textContent='Repaid';   badge.className='status-badge bg-green-100 text-green-700 border-green-300'; return; }
    if(st==='assigned'){ badge.textContent='Assigned'; badge.className='status-badge bg-blue-100 text-blue-700 border-blue-300'; return; }
    const d=daysSince(card.dataset.lastpay||'');
    if(d>31){ card.dataset.delayed="true"; badge.textContent='Active (Delayed)'; badge.className='status-badge bg-red-100 text-red-700 border-red-300'; }
    else    { badge.textContent='Active';          badge.className='status-badge bg-yellow-100 text-yellow-700 border-yellow-300'; }
  });
}

function recomputeKPIs(){
  const cards=visibleCards();
  const companies=new Set(cards.map(c=>c.dataset.company));
  let invested=0, acc=0, est=0;
  cards.forEach(c=>{ invested+=num(c.dataset.invested); acc+=num(c.dataset.acc); est+=num(c.dataset.est); });
  q('kpiCompanies') && (q('kpiCompanies').textContent = companies.size);
  q('kpiLoans') && (q('kpiLoans').textContent = cards.length);
  q('kpiInvested') && (q('kpiInvested').textContent = Math.round(invested));
  q('kpiAccInt') && (q('kpiAccInt').textContent = Math.round(acc));
  q('kpiEstInt') && (q('kpiEstInt').textContent = Math.round(est));
}

function recomputeCompanies(){
  const rows = {};
  visibleCards().forEach(c=>{
    const co=c.dataset.company;
    const st=(c.dataset.status||'').toLowerCase();
    rows[co]=rows[co]||{Company:co, loans:0, active:0, repaid:0, invested:0, acc:0, est:0};
    rows[co].loans += 1;
    rows[co][st] = (rows[co][st]||0) + 1;
    rows[co].invested += num(c.dataset.invested);
    rows[co].acc      += num(c.dataset.acc);
    rows[co].est      += num(c.dataset.est);
  });

  const arr = Object.values(rows).map(r => ({
    ...r,
    ret: r.est > 0 ? (r.acc / r.est * 100) : 0
  }));

  const key=q('companySortKey')?.value||'loans';
  const dir=q('companySortDir')?.value||'desc';
  const pick=(r)=> key==='loans'? r.loans : (key==='invested'? r.invested : (key==='acc'? r.acc : r.est));
  arr.sort((a,b)=> dir==='asc' ? (pick(a)-pick(b)) : (pick(b)-pick(a)) );

  const tbody=q('companyBody'); if(!tbody) return;
  tbody.innerHTML = arr.map(r=>`
    <tr class="border-b last:border-0">
      <td class="py-1 pr-4">${r.Company}</td>
      <td class="py-1 pr-4">${r.loans}</td>
      <td class="py-1 pr-4">${r.active||0}</td>
      <td class="py-1 pr-4">${r.repaid||0}</td>
      <td class="py-1 pr-4">${Math.round(r.invested)}</td>
      <td class="py-1 pr-4">${Math.round(r.est)}</td>
      <td class="py-1 pr-4">${Math.round(r.acc)}</td>
      <td class="py-1 pr-0">${r.ret.toFixed(1)}%</td>
    </tr>`).join('');
}function recomputeCompanies(){
  const rows = {};
  visibleCards().forEach(c=>{
    const co=c.dataset.company;
    const st=(c.dataset.status||'').toLowerCase();
    rows[co]=rows[co]||{Company:co, loans:0, active:0, repaid:0, invested:0, acc:0, est:0};
    rows[co].loans += 1;
    rows[co][st] = (rows[co][st]||0) + 1;
    rows[co].invested += num(c.dataset.invested);
    rows[co].acc      += num(c.dataset.acc);
    rows[co].est      += num(c.dataset.est);
  });

  const arr = Object.values(rows).map(r => ({
    ...r,
    ret: r.est > 0 ? (r.acc / r.est * 100) : 0
  }));

  const key=q('companySortKey')?.value||'loans';
  const dir=q('companySortDir')?.value||'desc';
  const pick=(r)=> key==='loans'? r.loans : (key==='invested'? r.invested : (key==='acc'? r.acc : r.est));
  arr.sort((a,b)=> dir==='asc' ? (pick(a)-pick(b)) : (pick(b)-pick(a)) );

  const tbody=q('companyBody'); if(!tbody) return;
  tbody.innerHTML = arr.map(r=>`
    <tr class="border-b last:border-0">
      <td class="py-1 pr-4">${r.Company}</td>
      <td class="py-1 pr-4">${r.loans}</td>
      <td class="py-1 pr-4">${r.active||0}</td>
      <td class="py-1 pr-4">${r.repaid||0}</td>
      <td class="py-1 pr-4">${Math.round(r.invested)}</td>
      <td class="py-1 pr-4">${Math.round(r.est)}</td>
      <td class="py-1 pr-4">${Math.round(r.acc)}</td>
      <td class="py-1 pr-0">${r.ret.toFixed(1)}%</td>
    </tr>`).join('');
}

function statusRank(card){
  const st=(card.dataset.status||'').toLowerCase();
  const delayed=(card.dataset.delayed||'false')==='true';
  if(st==='repaid') return 0;
  if(st==='assigned') return 1;
  if(st==='active' && !delayed) return 2;
  if(st==='active' && delayed) return 3;
  return -1;
}

function sortLoans(){
  const key=q('loanSortKey')?.value||'status';
  const dir=q('loanSortDir')?.value||'desc';
  const grid=q('loanGrid');
  if(!grid) return;
  const cards=Array.from(grid.children).filter(c=>c.style.display!=='none');

  const toVal=c=>{
    if(key==='status')    return statusRank(c);
    if(key==='lastpay')   return parseDate(c.dataset.lastpay);
    if(key==='returnpct') return num(c.dataset.returnpct);
    if(key==='acc')       return num(c.dataset.acc);
    if(key==='invested')  return num(c.dataset.invested);
    if(key==='interest')  return num(c.dataset.interest);
    if(key==='duration')  return num(c.dataset.duration);
    return 0;
  };

  cards.sort((a,b)=> dir==='asc' ? (toVal(a)-toVal(b)) : (toVal(b)-toVal(a)) );
  cards.forEach(c=>grid.appendChild(c));
}

function applyGlobalFilters(){
  const txt=(q('filterText')?.value||'').toLowerCase();
  const status=(q('statusSelect')?.value||'').toLowerCase();

  document.querySelectorAll('.loan-card').forEach(card=>{
    const c=(card.dataset.company||'').toLowerCase();
    const id=(card.dataset.loan||'').toLowerCase();
    const st=(card.dataset.status||'').toLowerCase();
    const delayed=(card.dataset.delayed||'false')==='true';

    const matchTxt=!txt || c.includes(txt) || id.includes(txt);
    let matchStatus=true;
    if(status==='active')   matchStatus = (st==='active');             // includes delayed and on-time
    if(status==='delayed')  matchStatus = (st==='active' && delayed);  // only delayed
    if(status==='assigned') matchStatus = (st==='assigned');
    if(status==='repaid')   matchStatus = (st==='repaid');

    card.style.display = (matchTxt && matchStatus) ? '' : 'none';
  });

  recomputeKPIs();
  recomputeCompanies();
  sortLoans();
  renderMonthlyChart();   // timeline follows filters
}

function bindControls(){
  q('metricSelect')?.addEventListener('change', renderMonthlyChart);
  q('thisYearBtn')?.addEventListener('click', ()=>{ showAll=false; renderMonthlyChart(); });
  q('allDataBtn')?.addEventListener('click',  ()=>{ showAll=true;  renderMonthlyChart(); });

  ['filterText','statusSelect'].forEach(id=>{
    const el=q(id); if(!el) return;
    el.addEventListener('input', ()=>{ markDelayed(); applyGlobalFilters(); });
    el.addEventListener('change', ()=>{ markDelayed(); applyGlobalFilters(); });
  });
  ['companySortKey','companySortDir'].forEach(id=>{
    const el=q(id); if(!el) return;
    el.addEventListener('change', ()=>{ recomputeCompanies(); });
  });
  ['loanSortKey','loanSortDir'].forEach(id=>{
    const el=q(id); if(!el) return;
    el.addEventListener('change', ()=>{ sortLoans(); });
  });
}

function wire(){
  try {
    const el = document.getElementById('monthlyData');
    MONTHLY = el ? JSON.parse(el.textContent || '{}') : null;
    const el2 = document.getElementById('monthlyByLoanData');
    MONTHLY_BY_LOAN = el2 ? JSON.parse(el2.textContent || 'null') : null;
  } catch { MONTHLY = null; MONTHLY_BY_LOAN = null; }

  renderMonthlyChart();
  markDelayed();
  applyGlobalFilters();
  sortLoans();
  bindControls();
}

// First load
document.addEventListener('DOMContentLoaded', wire);

// After HTMX swaps the #dashboard (on upload), re-wire
document.addEventListener('htmx:afterSwap', (evt) => {
  if (evt.detail && evt.detail.target && evt.detail.target.id === 'dashboard') {
    const p = document.getElementById('pasteInput');
    if (p) p.value = '';
    wire();
  }
});
