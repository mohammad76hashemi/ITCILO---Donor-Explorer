/* ACCOUNT FEATURES: login, Donor Profile Card form, my submissions,
   admin review (approve / return) and admin filter management. */
(() => {
'use strict';
const { h, arr, SDG } = DPE;
const $ = s => document.querySelector(s);
let user = null;

/* ---------- helpers ---------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3200);
}
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const STATUS = { pending: 'Waiting for review', approved: 'Approved', rejected: 'Returned' };
const badge = s => h('span', { class: `status status-${s}`, text: STATUS[s] || s });

/* Close buttons and backdrop clicks for every dialog */
document.querySelectorAll('dialog.modal').forEach(d => {
  d.addEventListener('click', e => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
});

/* ---------- top bar ---------- */
async function renderAccount() {
  user = await Store.currentUser();
  const nav = $('#account');
  nav.replaceChildren();
  if (!user) {
    nav.append(h('button', { type: 'button', class: 'top-btn solid', onclick: openLogin }, 'Log in'));
    return;
  }
  nav.append(h('button', { type: 'button', class: 'top-btn solid', onclick: openForm }, '+ Submit a donor card'));
  if (user.role === 'admin') {
    const pending = (await Store.allSubmissions()).filter(s => s.status === 'pending').length;
    nav.append(
      h('button', { type: 'button', class: 'top-btn', onclick: () => openReview('pending') }, 'Review',
        pending ? h('span', { class: 'top-count', text: pending, 'aria-label': `${pending} waiting` }) : null),
      h('button', { type: 'button', class: 'top-btn', onclick: openFilters }, 'Manage filters'));
  } else {
    const mine = await Store.mySubmissions();
    nav.append(h('button', { type: 'button', class: 'top-btn', onclick: openMine }, 'My submissions',
      mine.length ? h('span', { class: 'top-count', text: mine.length }) : null));
  }
  nav.append(h('span', { class: 'top-user', title: user.email },
    h('span', { class: 'avatar', 'aria-hidden': 'true', text: (user.name || user.email)[0].toUpperCase() }),
    h('span', { class: 'top-name', text: user.name }),
    user.role === 'admin' ? h('span', { class: 'role', text: 'Admin' }) : null));
  nav.append(h('button', { type: 'button', class: 'top-btn link', onclick: logout }, 'Log out'));
}

/* ---------- login ---------- */
function openLogin() {
  $('#login-error').hidden = true;
  $('#demo-note').hidden = !Store.isDemo;
  $('#login-dlg').showModal();
  $('#login-email').focus();
}
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#login-error');
  const email = $('#login-email').value, pw = $('#login-password').value;
  if (!email || !pw) { err.textContent = 'Enter your email and password.'; err.hidden = false; return; }
  try {
    const u = await Store.login(email, pw);
    $('#login-dlg').close();
    $('#login-form').reset();
    toast(`Logged in as ${u.name}`);
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});
async function logout() {
  await Store.logout();
  toast('Logged out');
}

/* ---------- Donor Profile Card form ---------- */
(() => {
  const picker = $('#sdg-picker');
  Object.entries(SDG).forEach(([n, name]) => picker.append(
    h('label', { class: 'sdg-opt' },
      h('input', { type: 'checkbox', name: 'sdgs', value: n }),
      h('span', { class: 'sdg-num', text: n }),
      h('span', { class: 'sdg-name', text: name }))));
})();

function openForm() {
  if (!user) { openLogin(); return; }
  $('#card-error').hidden = true;
  $('#card-form').querySelectorAll('.invalid').forEach(x => x.classList.remove('invalid'));
  $('#submit-dlg').showModal();
  $('#submit-dlg .modal-body').scrollTop = 0;
  $('#f-name').focus();
}

function readForm(form) {
  const fd = new FormData(form);
  const all = k => fd.getAll(k).map(v => String(v).trim()).filter(Boolean);
  const one = k => String(fd.get(k) || '').trim();
  return {
    name: one('name'), type: one('type'), annualFunding: one('annualFunding'),
    priorities: all('priorities'), regions: one('regions'), modalities: one('modalities'),
    innovative: one('innovative'), sdgs: all('sdgs').map(Number),
    opportunities: all('opportunities'), challenges: all('challenges'), links: one('links')
  };
}

$('#card-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, err = $('#card-error');
  form.querySelectorAll('.invalid').forEach(x => x.classList.remove('invalid'));
  const missing = [];
  form.querySelectorAll('[required]').forEach(inp => {
    if (!inp.value.trim()) { inp.classList.add('invalid'); missing.push(inp); }
  });
  const card = readForm(form);
  if (!card.sdgs.length) { $('#sdg-field').classList.add('invalid'); missing.push($('#sdg-picker input')); }
  if (missing.length) {
    err.textContent = `Please complete the ${missing.length} required field${missing.length === 1 ? '' : 's'} marked in red.`;
    err.hidden = false;
    missing[0].focus();
    return;
  }
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await Store.submit(card);
    form.reset();
    $('#submit-dlg').close();
    toast('Card sent for review. You can follow it in “My submissions”.');
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
/* Clear the red mark as soon as a field is filled in */
$('#card-form').addEventListener('input', e => {
  if (e.target.value?.trim()) e.target.classList.remove('invalid');
  if (e.target.name === 'sdgs') $('#sdg-field').classList.remove('invalid');
  if (!$('#card-form .invalid')) $('#card-error').hidden = true;
});

/* Read-only view of a card (used in My submissions and Review) */
function cardView(c) {
  const row = (label, value) => value && (Array.isArray(value) ? value.length : true)
    ? h('div', { class: 'cv-row' }, h('dt', { text: label }),
        h('dd', {}, Array.isArray(value) ? h('ul', {}, value.map(v => h('li', { text: v }))) : value))
    : null;
  return h('dl', { class: 'card-view' },
    row('Type of donor', c.type),
    row('Annual funding volume', c.annualFunding),
    row('Top priorities', arr(c.priorities)),
    row('Regions / countries', c.regions),
    row('Funding modalities', c.modalities),
    row('Innovative financing', c.innovative),
    row('SDGs', arr(c.sdgs).map(n => `SDG ${n} · ${SDG[n]}`)),
    row('Opportunities', arr(c.opportunities)),
    row('Challenges / barriers', arr(c.challenges)),
    row('Links / references', String(c.links || '').split(/\n+/).filter(Boolean)));
}

/* ---------- my submissions ---------- */
async function openMine() {
  await renderMine();
  $('#mine-dlg').showModal();
}
async function renderMine() {
  const body = $('#mine-body');
  const list = await Store.mySubmissions();
  body.replaceChildren();
  if (!list.length) {
    body.append(h('div', { class: 'empty-small' }, h('strong', { text: 'You have not submitted a card yet.' }),
      h('button', { type: 'button', class: 'btn primary', onclick: () => { $('#mine-dlg').close(); openForm(); } }, 'Submit a donor card')));
    return;
  }
  list.forEach(s => body.append(h('details', { class: 'sub-item' },
    h('summary', {},
      h('span', { class: 'sub-title' }, h('strong', { text: s.card.name }), h('span', { class: 'muted', text: `Sent ${fmtDate(s.submittedAt)}` })),
      badge(s.status)),
    s.note ? h('p', { class: 'review-note' }, h('strong', { text: 'Reviewer note: ' }), s.note) : null,
    cardView(s.card))));
}

/* ---------- admin: review ---------- */
let reviewTab = 'pending';
async function openReview(tab) {
  reviewTab = tab || 'pending';
  await renderReview();
  $('#review-dlg').showModal();
}
$('#review-tabs').addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (!t) return;
  reviewTab = t.dataset.tab;
  renderReview();
});
async function renderReview() {
  document.querySelectorAll('#review-tabs .tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === reviewTab)));
  const body = $('#review-body');
  const all = await Store.allSubmissions();
  const list = all.filter(s => s.status === reviewTab);
  body.replaceChildren();
  if (!list.length) {
    body.append(h('div', { class: 'empty-small' }, h('strong', { text: reviewTab === 'pending' ? 'Nothing is waiting for review.' : 'No cards here yet.' })));
    return;
  }
  list.forEach(s => {
    const noteId = `note-${s.id}`;
    body.append(h('details', { class: 'sub-item', open: reviewTab === 'pending' && list.length < 4 },
      h('summary', {},
        h('span', { class: 'sub-title' }, h('strong', { text: s.card.name }),
          h('span', { class: 'muted', text: `${s.userName} · ${s.userEmail} · ${fmtDate(s.submittedAt)}` })),
        badge(s.status)),
      cardView(s.card),
      s.status === 'pending'
        ? h('div', { class: 'review-actions' },
            h('label', { for: noteId, text: 'Note to the participant (optional, shown if you return the card)' }),
            h('textarea', { id: noteId, rows: '2', maxlength: '600' }),
            h('div', { class: 'foot-btns' },
              h('button', { type: 'button', class: 'btn danger', onclick: () => decide(s.id, 'reject', noteId) }, 'Return for changes'),
              h('button', { type: 'button', class: 'btn primary', onclick: () => decide(s.id, 'approve', noteId) }, 'Approve and publish')))
        : h('p', { class: 'muted' }, `${STATUS[s.status]} by ${s.reviewer} on ${fmtDate(s.reviewedAt)}`, s.note ? ` · Note: ${s.note}` : '')));
  });
}
async function decide(id, decision, noteId) {
  try {
    await Store.review(id, decision, document.getElementById(noteId)?.value.trim());
    toast(decision === 'approve' ? 'Approved. The card is now in the library.' : 'Returned to the participant.');
    renderReview();
  } catch (ex) { toast(ex.message); }
}

/* ---------- admin: manage filters ---------- */
let draft = [];
async function openFilters() {
  draft = (await Store.getFilterConfig()).map(f => ({ ...f }));
  renderFilterRows();
  $('#filters-dlg').showModal();
}
function renderFilterRows() {
  const ol = $('#filter-rows');
  ol.replaceChildren();
  draft.forEach((f, i) => {
    const id = `fl-${f.key}`;
    ol.append(h('li', { class: 'filter-row' },
      h('div', { class: 'fr-name' },
        h('label', { for: id, class: 'sr-only', text: `Label for ${DPE.FILTER_FIELDS[f.key]}` }),
        h('input', { type: 'text', id, value: f.label, maxlength: '40', oninput: e => { f.label = e.target.value; } }),
        h('span', { class: 'muted', text: `Data field: ${DPE.FILTER_FIELDS[f.key]}` })),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `Where to show ${f.label}` },
        ['quick', 'more'].map(p => h('label', {},
          h('input', { type: 'radio', name: `place-${f.key}`, value: p, checked: f.place === p, onchange: () => { f.place = p; } }),
          p === 'quick' ? 'Filter bar' : 'More filters'))),
      h('div', { class: 'fr-btns' },
        h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Move ${f.label} up`, disabled: i === 0, onclick: () => move(i, -1), text: '↑' }),
        h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Move ${f.label} down`, disabled: i === draft.length - 1, onclick: () => move(i, 1), text: '↓' }),
        h('button', { type: 'button', class: 'btn text danger-text', onclick: () => { draft.splice(i, 1); renderFilterRows(); } }, 'Remove'))));
  });
  const sel = $('#add-filter-field');
  sel.replaceChildren();
  const unused = Object.entries(DPE.FILTER_FIELDS).filter(([k]) => !draft.some(f => f.key === k));
  unused.forEach(([k, l]) => sel.append(h('option', { value: k, text: l })));
  sel.disabled = $('#add-filter-btn').disabled = !unused.length;
  if (!unused.length) sel.append(h('option', { text: 'All fields are in use' }));
}
function move(i, d) {
  const [x] = draft.splice(i, 1);
  draft.splice(i + d, 0, x);
  renderFilterRows();
}
$('#add-filter-btn').addEventListener('click', () => {
  const k = $('#add-filter-field').value;
  if (!DPE.FILTER_FIELDS[k]) return;
  draft.push({ key: k, label: DPE.FILTER_FIELDS[k], place: 'more' });
  renderFilterRows();
});
$('#filters-save').addEventListener('click', async () => {
  draft.forEach(f => { f.label = f.label.trim() || DPE.FILTER_FIELDS[f.key]; });
  try {
    await Store.saveFilterConfig(draft);
    $('#filters-dlg').close();
    toast('Filters saved');
  } catch (ex) { toast(ex.message); }
});
$('#filters-reset').addEventListener('click', async () => {
  try {
    await Store.resetFilterConfig();
    draft = DPE.DEFAULT_FILTERS.map(f => ({ ...f }));
    renderFilterRows();
    toast('Default filters restored');
  } catch (ex) { toast(ex.message); }
});

/* ---------- keep everything in sync ---------- */
window.addEventListener('store:change', async () => {
  await renderAccount();
  if ($('#mine-dlg').open) renderMine();
  if ($('#review-dlg').open) renderReview();
});
renderAccount();
})();
