/* DONOR LIBRARY: search, filters, list and profile panel.
   Data = data/donors.json + approved participant submissions (from store.js). */
(async () => {
'use strict';
const { h, arr, SDG } = DPE;
const $ = s => document.querySelector(s);

const LINKS = { website: 'Official website', strategy: 'Strategy', annualReport: 'Annual report', partnership: 'Partnership page', contact: 'Contact page' };
const SORTS = { name: 'Name (A–Z)', type: 'Organisation type', sdgs: 'Most SDGs covered' };

const state = { q: '', sort: 'name', sel: {}, openId: null, pushed: false, pop: null };
let baseDonors = [], donors = [], byId = new Map(), filters = [], VALUES = {}, meta = {};

/* ---------- loading ---------- */
try {
  const res = await fetch('data/donors.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  baseDonors = data.donors || [];
  meta = data.meta || {};
} catch (err) {
  console.error(err);
  $('#list').replaceChildren(h('div', { class: 'empty' },
    h('strong', { text: 'The donor data could not be loaded.' }),
    'Check that data/donors.json exists and is valid JSON. If you opened index.html directly from your computer, start a local server first (see README).'));
  return;
}

/* Turn an approved participant submission into a library profile */
function submissionToDonor(s) {
  const c = s.card;
  const lines = String(c.links || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  const firstUrl = lines.find(l => /^https:\/\//.test(l));
  return {
    id: 'sub-' + s.id,
    contributed: true,
    name: c.name,
    type: c.type,
    shortDescription: [c.annualFunding ? `Annual funding: ${c.annualFunding}.` : '', arr(c.priorities).length ? `Priorities: ${arr(c.priorities).join(', ')}.` : ''].join(' ').trim(),
    priorities: arr(c.priorities),
    sectors: [], regions: [], countries: [],
    focusText: c.regions || '',
    sdgs: arr(c.sdgs).map(Number),
    modalities: String(c.modalities || '').split(/[,;]+/).map(x => x.trim()).filter(Boolean),
    worksWith: [],
    annualFunding: c.annualFunding || '',
    innovativeFinance: c.innovative || '',
    opportunities: arr(c.opportunities),
    challenges: arr(c.challenges),
    references: lines,
    links: { website: firstUrl || '' },
    source: `Participant submission by ${s.userName} (Donor Detective Challenge)`,
    lastChecked: (s.reviewedAt || '').slice(0, 10)
  };
}

async function loadDynamic() {
  const approved = await Store.approvedSubmissions();
  donors = baseDonors.concat(approved.map(submissionToDonor));
  byId = new Map(donors.map(d => [d.id, d]));
  filters = (await Store.getFilterConfig()).filter(f => DPE.FILTER_FIELDS[f.key]);
  filters.forEach(f => { if (!state.sel[f.key]) state.sel[f.key] = new Set(); });
  // drop selections for filters the admin removed
  Object.keys(state.sel).forEach(k => { if (!filters.some(f => f.key === k)) delete state.sel[k]; });
  VALUES = Object.fromEntries(filters.map(f => [f.key, valuesOf(f.key)]));
}
const valuesOf = k => {
  const s = [...new Set(donors.flatMap(d => arr(d[k])))];
  return k === 'sdgs' ? s.sort((a, b) => a - b) : s.sort((a, b) => String(a).localeCompare(b));
};
const quick = () => filters.filter(f => f.place === 'quick');
const more = () => filters.filter(f => f.place !== 'quick');
const labelOf = k => filters.find(f => f.key === k)?.label || DPE.FILTER_FIELDS[k] || k;
const lab = (k, v) => k === 'sdgs' ? `SDG ${v} · ${SDG[v] || ''}` : String(v);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------- filtering ---------- */
function matches(d, skip) {
  if (state.q) {
    const hay = norm([d.name, d.type, d.shortDescription, d.overview, d.howToPartner, d.focusText, d.innovativeFinance,
      ...arr(d.countries), ...arr(d.priorities), ...arr(d.sectors), ...arr(d.regions)].join(' '));
    if (!norm(state.q).split(/\s+/).every(w => hay.includes(w))) return false;
  }
  for (const [k, set] of Object.entries(state.sel)) {
    if (k === skip || !set.size) continue;
    if (!arr(d[k]).some(v => set.has(v))) return false;
  }
  return true;
}
function counts(k) {
  const c = new Map();
  donors.filter(d => matches(d, k)).forEach(d => arr(d[k]).forEach(v => c.set(v, (c.get(v) || 0) + 1)));
  return c;
}
function results() {
  const r = donors.filter(d => matches(d));
  if (state.sort === 'type') r.sort((a, b) => String(a.type).localeCompare(b.type) || a.name.localeCompare(b.name));
  else if (state.sort === 'sdgs') r.sort((a, b) => arr(b.sdgs).length - arr(a.sdgs).length || a.name.localeCompare(b.name));
  else r.sort((a, b) => a.name.localeCompare(b.name));
  return r;
}
const selectedIn = list => list.reduce((n, f) => n + (state.sel[f.key]?.size || 0), 0);

/* ---------- filter bar ---------- */
let leaveTimer = null;
const cancelLeave = () => { clearTimeout(leaveTimer); leaveTimer = null; };
const scheduleLeave = e => {
  if (e.pointerType !== 'mouse' || !state.pop) return;
  cancelLeave();
  leaveTimer = setTimeout(() => closePop(), 400);   // close when the mouse moves away
};

function renderPills() {
  const wrap = $('#pills');
  wrap.replaceChildren();
  quick().forEach(({ key: k, label }) => {
    const n = state.sel[k].size;
    wrap.append(h('button', {
      type: 'button', class: 'pill' + (n ? ' is-active' : '') + (state.pop === k ? ' is-open' : ''),
      'aria-haspopup': 'dialog', 'aria-expanded': String(state.pop === k), dataset: { key: k },
      onclick: e => togglePop(k, e.currentTarget),
      onpointerleave: scheduleLeave, onpointerenter: e => { if (state.pop === k) cancelLeave(); }
    }, label, n ? h('span', { class: 'pill-count', text: n }) : null, h('span', { class: 'caret', 'aria-hidden': 'true', text: '▾' })));
  });
  const m = selectedIn(more()) + (state.sort !== 'name' ? 1 : 0);
  wrap.append(h('button', { type: 'button', class: 'pill more' + (m ? ' is-active' : ''), onclick: openMore },
    'More filters & sort', m ? h('span', { class: 'pill-count', text: m }) : null));
  if (selectedIn(filters) || state.q)
    wrap.append(h('button', { type: 'button', class: 'pill clear', onclick: clearAll, text: 'Clear all' }));
}

function optionList(k, container) {
  const c = counts(k);
  VALUES[k].forEach(v => {
    const id = `opt-${k}-${String(v).replace(/\W+/g, '-')}-${container.id}`;
    const checked = state.sel[k].has(v);
    const n = c.get(v) || 0;
    container.append(h('label', { class: 'opt' + (checked ? ' is-checked' : '') + (!n && !checked ? ' is-empty' : ''), for: id },
      h('input', { type: 'checkbox', id, checked, onchange: e => { e.target.checked ? state.sel[k].add(v) : state.sel[k].delete(v); update({ keep: id }); } }),
      h('span', { text: lab(k, v) }),
      h('span', { class: 'count', text: n })));
  });
  if (!VALUES[k].length) container.append(h('p', { class: 'muted', style: 'padding:.5rem', text: 'No values yet.' }));
}

/* ---------- quick-filter popover ---------- */
const pop = $('#popover');
pop.addEventListener('pointerleave', scheduleLeave);
pop.addEventListener('pointerenter', cancelLeave);

function togglePop(k, btn) { state.pop === k ? closePop() : openPop(k, btn); }
function openPop(k, btn) {
  cancelLeave();
  state.pop = k;
  renderPop();
  renderPills();
  positionPop(document.querySelector(`.pill[data-key="${k}"]`) || btn);
  pop.querySelector('input')?.focus({ preventScroll: true });
}
function renderPop() {
  const k = state.pop;
  if (!k) return;
  const body = h('div', { class: 'pop-body', id: 'pop-body' });
  optionList(k, body);
  pop.setAttribute('aria-label', labelOf(k));
  pop.replaceChildren(
    h('div', { class: 'pop-head', text: labelOf(k) }), body,
    h('div', { class: 'pop-foot' },
      h('button', { type: 'button', class: 'btn text', text: 'Clear', onclick: () => { state.sel[k].clear(); update(); } }),
      h('button', { type: 'button', class: 'btn primary', text: 'Done', onclick: () => closePop(true) })));
  pop.hidden = false;
}
function positionPop(btn) {
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  pop.style.top = `${r.bottom + 6}px`;
  pop.style.left = `${Math.max(16, Math.min(r.left, window.innerWidth - pop.offsetWidth - 16))}px`;
}
function closePop(focusBtn) {
  cancelLeave();
  const k = state.pop;
  if (!k) return;
  state.pop = null;
  pop.hidden = true;
  renderPills();
  if (focusBtn) document.querySelector(`.pill[data-key="${k}"]`)?.focus();
}
document.addEventListener('pointerdown', e => {
  if (state.pop && !e.target.closest('#popover') && !e.target.closest('.pill[data-key]')) closePop();
});
window.addEventListener('resize', () => { if (state.pop) closePop(); measureToolbar(); });
window.addEventListener('scroll', () => { if (state.pop) positionPop(document.querySelector(`.pill[data-key="${state.pop}"]`)); }, { passive: true });
$('#pills').addEventListener('scroll', () => { if (state.pop) closePop(); }, { passive: true });

/* ---------- more filters dialog ---------- */
function renderMore() {
  const body = $('#more-body');
  body.replaceChildren();
  const so = h('div', { class: 'sort-opts', role: 'radiogroup', 'aria-label': 'Sort results by' });
  Object.entries(SORTS).forEach(([v, t]) => so.append(h('label', {},
    h('input', { type: 'radio', name: 'sort', value: v, checked: state.sort === v, onchange: () => { state.sort = v; update(); } }), t)));
  body.append(h('div', { class: 'more-sec' }, h('h3', { text: 'Sort results by' }), so));
  more().forEach(({ key: k, label }) => {
    const grid = h('div', { class: 'opt-grid', id: `more-${k}` });
    optionList(k, grid);
    body.append(h('div', { class: 'more-sec' }, h('h3', { text: label }), grid));
  });
  const n = results().length;
  $('#more-done').textContent = `Show ${n} result${n === 1 ? '' : 's'}`;
}
function openMore() { closePop(); renderMore(); $('#more').showModal(); }
$('#more-close').addEventListener('click', () => $('#more').close());
$('#more-done').addEventListener('click', () => $('#more').close());
$('#more-clear').addEventListener('click', () => { more().forEach(f => state.sel[f.key].clear()); state.sort = 'name'; update(); });
$('#more').addEventListener('click', e => { if (e.target === $('#more')) $('#more').close(); });

/* ---------- active filter chips ---------- */
function renderChips() {
  const ul = $('#chips');
  ul.replaceChildren();
  if (state.q) ul.append(h('li', {}, h('button', { type: 'button', class: 'chip', 'aria-label': `Remove search "${state.q}"`,
    onclick: () => { state.q = ''; $('#q').value = ''; update(); } }, h('b', { text: 'Search:' }), ` “${state.q}”`, h('span', { 'aria-hidden': 'true', text: '×' }))));
  for (const [k, set] of Object.entries(state.sel)) set.forEach(v => ul.append(h('li', {},
    h('button', { type: 'button', class: 'chip', 'aria-label': `Remove filter ${labelOf(k)}: ${lab(k, v)}`, onclick: () => { set.delete(v); update(); } },
      h('b', { text: labelOf(k) + ':' }), ' ' + (k === 'sdgs' ? `SDG ${v}` : v), h('span', { 'aria-hidden': 'true', text: '×' })))));
}

/* ---------- cards ---------- */
const geoText = d => [...arr(d.regions), ...arr(d.countries)].join(' · ') || d.focusText || '';
function renderList(r) {
  const list = $('#list');
  list.replaceChildren();
  $('#count').textContent = `${r.length} ${r.length === 1 ? 'organisation' : 'organisations'}`;
  if (!r.length) {
    list.append(h('div', { class: 'empty' }, h('strong', { text: 'No organisations match these filters' }),
      'Try removing a filter or searching for a broader term. ',
      h('button', { type: 'button', class: 'btn', text: 'Clear all filters', onclick: clearAll })));
    return;
  }
  const hit = state.sel.sectors || new Set();
  r.forEach(d => {
    list.append(h('article', { class: 'card' + (d.id === state.openId ? ' is-selected' : ''), dataset: { id: d.id } },
      h('h3', {}, h('button', { type: 'button', class: 'card-link', 'aria-pressed': String(d.id === state.openId), onclick: () => select(d.id) }, d.name)),
      h('div', { class: 'card-badges' },
        h('p', { class: 'card-type', text: d.type }),
        d.contributed ? h('p', { class: 'card-type contributed', text: 'Participant profile' }) : null),
      geoText(d) ? h('p', { class: 'card-geo', text: geoText(d) }) : null,
      arr(d.modalities).length ? h('ul', { class: 'mods', 'aria-label': 'Funding and partnership modalities' },
        arr(d.modalities).slice(0, 3).map(m => h('li', { class: 'mod' }, h('span', { 'aria-hidden': 'true', text: '✓' }), m))) : null,
      d.shortDescription ? h('p', { class: 'card-desc', text: d.shortDescription }) : null,
      arr(d.sectors).length ? h('ul', { class: 'tags tags-sectors', 'aria-label': 'Sectors' }, arr(d.sectors).map(s => h('li', { class: 'tag' + (hit.has(s) ? ' hit' : ''), text: s }))) : null,
      h('ul', { class: 'tags tags-sdgs', 'aria-label': 'SDGs' }, arr(d.sdgs).map(n => h('li', { class: 'sdg', title: SDG[n], text: `SDG ${n}` })))));
  });
}

/* ---------- profile panel ---------- */
const paragraphs = text => String(text || '').split(/\n\s*\n/).filter(Boolean).map(p => h('p', { text: p.trim() }));
const bullets = items => h('ul', { class: 'bul' }, arr(items).map(p => h('li', { text: p })));
function similarTo(d) {
  const score = o => ['sectors', 'priorities', 'regions', 'sdgs'].reduce((s, k) => s + arr(o[k]).filter(v => arr(d[k]).includes(v)).length, 0);
  return donors.filter(o => o.id !== d.id).map(o => [o, score(o)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
}
function renderDetail(d) {
  const panel = $('#detail');
  const links = Object.entries(d.links || {}).filter(([, u]) => /^https:\/\//.test(u));
  const site = /^https:\/\//.test(d.links?.website || '') ? d.links.website : null;
  const glance = [
    d.annualFunding ? ['Annual funding volume', h('dd', { text: d.annualFunding })] : null,
    arr(d.modalities).length ? ['Funding & partnership', h('dd', {}, h('ul', { class: 'mods' }, arr(d.modalities).map(m => h('li', { class: 'mod' }, h('span', { 'aria-hidden': 'true', text: '✓' }), m))))] : null,
    arr(d.worksWith).length ? ['Works with', h('dd', { text: arr(d.worksWith).join(', ') })] : null,
    arr(d.sectors).length ? ['Sectors', h('dd', { text: arr(d.sectors).join(', ') })] : null
  ].filter(Boolean);

  panel.replaceChildren(
    h('div', { class: 'd-head' },
      h('button', { type: 'button', class: 'd-back', onclick: closeDetail }, h('span', { 'aria-hidden': 'true', text: '←' }), 'Back to results'),
      h('div', { class: 'd-top' },
        h('div', { style: 'flex:1;min-width:0' },
          h('h2', { id: 'd-title', tabindex: '-1', text: d.name }),
          h('div', { class: 'card-badges' }, h('p', { class: 'card-type', text: d.type }),
            d.contributed ? h('p', { class: 'card-type contributed', text: 'Participant profile' }) : null)),
        h('button', { type: 'button', class: 'icon-btn d-close', 'aria-label': 'Close profile', onclick: closeDetail, text: '×' })),
      geoText(d) ? h('p', { class: 'd-geo', text: geoText(d) }) : null,
      site ? h('div', { class: 'd-actions' }, h('a', { class: 'btn primary', href: site, target: '_blank', rel: 'noopener noreferrer' }, 'Visit official website ↗')) : null),
    h('div', { class: 'd-body' },
      glance.length ? h('section', {}, h('dl', { class: 'glance' }, glance.map(([t, dd]) => h('div', {}, h('dt', { text: t }), dd)))) : null,
      d.overview ? h('section', {}, h('h3', { text: 'About' }), paragraphs(d.overview)) : null,
      arr(d.priorities).length ? h('section', {}, h('h3', { text: d.contributed ? 'Top priority sectors / themes' : 'Thematic priorities' }), bullets(d.priorities)) : null,
      d.howToPartner ? h('section', {}, h('h3', { text: 'How to partner' }), paragraphs(d.howToPartner)) : null,
      d.innovativeFinance ? h('section', {}, h('h3', { text: 'Innovative financing mechanisms' }), paragraphs(d.innovativeFinance)) : null,
      arr(d.opportunities).length ? h('section', {}, h('h3', { text: 'Opportunities for partnership' }), bullets(d.opportunities)) : null,
      arr(d.challenges).length ? h('section', {}, h('h3', { text: 'Challenges / barriers' }), bullets(d.challenges)) : null,
      arr(d.sdgs).length ? h('section', {}, h('h3', { text: 'Relevant SDGs' }),
        h('ul', { class: 'tags' }, arr(d.sdgs).map(n => h('li', { class: 'sdg', title: SDG[n], text: `SDG ${n} · ${SDG[n]}` })))) : null,
      d.contributed
        ? (arr(d.references).length ? h('section', {}, h('h3', { text: 'Links and references' }),
            h('ul', { class: 'links' }, arr(d.references).map(r => h('li', {}, /^https:\/\//.test(r) ? h('a', { href: r, target: '_blank', rel: 'noopener noreferrer', text: r }) : r)))) : null)
        : h('section', {}, h('h3', { text: 'Useful links' }),
            links.length ? h('ul', { class: 'links' }, links.map(([k, u]) => h('li', {}, h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, `${LINKS[k] || k} ↗`)))) : h('p', { class: 'muted', text: 'No links yet.' })),
      h('section', {}, h('h3', { text: 'Similar organisations' }),
        h('ul', { class: 'similar' }, similarTo(d).map(o => h('li', {}, h('button', { type: 'button', onclick: () => select(o.id) },
          h('strong', { text: o.name }), h('span', { text: [o.type, ...arr(o.sectors).slice(0, 2)].join(' · ') })))))),
      h('div', { class: 'source' },
        h('p', { text: `Source: ${d.source || '—'}` }),
        h('p', { text: `Last checked: ${d.lastChecked || 'not yet verified'}` })),
      h('p', { class: 'key-hint' }, 'Press ', h('kbd', { text: 'Esc' }), ' or ', h('kbd', { text: '←' }), ' to close')));
}

/* ---------- open / close, linked to browser history ---------- */
const isPhone = () => window.matchMedia('(max-width: 820px)').matches;
function select(id) {
  if (!byId.has(id)) return;
  if (state.openId) location.replace('#' + id);          // switching donors: no extra history step
  else { state.pushed = true; location.hash = id; }      // first open: one step, so Back closes it
}
function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (byId.has(id)) showDetail(id); else hideDetail();
}
function markSelected(id) {
  document.querySelectorAll('.card').forEach(c => {
    const on = c.dataset.id === id;
    c.classList.toggle('is-selected', on);
    c.querySelector('.card-link').setAttribute('aria-pressed', String(on));
  });
}
function showDetail(id) {
  state.openId = id;
  renderDetail(byId.get(id));
  const panel = $('#detail');
  panel.hidden = false;
  panel.scrollTop = 0;
  $('#split').classList.add('is-open');
  document.body.classList.toggle('lock', isPhone());
  markSelected(id);
  $('#d-title')?.focus({ preventScroll: true });
}
function hideDetail() {
  if (!state.openId) return;
  const id = state.openId;
  state.openId = null;
  state.pushed = false;
  $('#detail').hidden = true;
  $('#split').classList.remove('is-open');
  document.body.classList.remove('lock');
  markSelected(null);
  document.querySelector(`.card[data-id="${CSS.escape(id)}"] .card-link`)?.focus({ preventScroll: !isPhone() });
}
function closeDetail() {
  if (state.pushed) {
    history.back();
    setTimeout(() => { if (state.openId) clearHash(); }, 350);
  } else clearHash();
}
function clearHash() {
  try { history.replaceState(null, '', location.pathname + location.search); } catch { location.hash = ''; }
  hideDetail();
}
window.addEventListener('hashchange', route);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.pop) { closePop(true); return; }
  if (document.querySelector('dialog[open]')) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (state.openId && !typing && (e.key === 'Escape' || e.key === 'ArrowLeft')) { e.preventDefault(); closeDetail(); }
});

(() => {   // swipe right on the full-screen profile (phone) to go back
  let x0 = null, y0 = 0;
  const panel = $('#detail');
  panel.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = t.clientX > 24 ? t.clientX : null; y0 = t.clientY; }, { passive: true });
  panel.addEventListener('touchend', e => {
    if (x0 == null || !isPhone()) return;
    const t = e.changedTouches[0];
    if (t.clientX - x0 > 80 && Math.abs(t.clientY - y0) < 60) closeDetail();
    x0 = null;
  }, { passive: true });
})();

/* ---------- search ---------- */
let timer;
$('#q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); update(); }, 180); });
$('#search-form').addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); state.q = $('#q').value.trim(); update(); $('#q').blur(); });

function clearAll() {
  Object.values(state.sel).forEach(s => s.clear());
  state.q = ''; $('#q').value = ''; state.sort = 'name';
  update();
}

/* ---------- render cycle ---------- */
function update(opts = {}) {
  const r = results();
  renderPills();
  renderChips();
  renderList(r);
  if (state.pop) {
    if (!quick().some(f => f.key === state.pop)) closePop();
    else {
      const st = $('#pop-body')?.scrollTop || 0;
      renderPop();
      $('#pop-body').scrollTop = st;
      positionPop(document.querySelector(`.pill[data-key="${state.pop}"]`));
    }
  }
  if ($('#more').open) { const b = $('#more-body'), st = b.scrollTop; renderMore(); b.scrollTop = st; }
  if (opts.keep) document.getElementById(opts.keep)?.focus({ preventScroll: true });
  measureToolbar();
}
function measureToolbar() {
  document.documentElement.style.setProperty('--toolbar-h', $('#toolbar').offsetHeight + 'px');
}

/* Reload when a submission is approved or an admin changes the filters */
window.addEventListener('store:change', async () => {
  await loadDynamic();
  update();
  if (state.openId && !byId.has(state.openId)) clearHash();
});

$('#updated').textContent = meta.lastUpdated || '';
$('#source-note').textContent = meta.sourceNote || '';
await loadDynamic();
update();
route();
})();
