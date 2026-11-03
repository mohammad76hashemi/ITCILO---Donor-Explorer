/* DATA LAYER — DEMO VERSION
   ------------------------------------------------------------------
   This file pretends to be a server. It keeps users, submissions and the
   admin's filter settings in the browser's localStorage, so the whole
   login → submit → approve flow can be demonstrated without a backend.

   Limits of the demo:
   - Data stays in ONE browser. A student on another computer would not
     appear in the admin's review queue.
   - Passwords are not secure. Use only the demo accounts.

   For the real site, replace the body of each function below with calls
   to a real backend (for example Supabase). app.js and portal.js only use
   these functions, so nothing else needs to change.
   ------------------------------------------------------------------ */
(() => {
'use strict';

const DEMO_USERS = {
  'student@demo.org': { password: 'demo', name: 'Demo Student', role: 'student' },
  'admin@demo.org':   { password: 'demo', name: 'Course Admin', role: 'admin' }
};
const KEYS = { session: 'dpe.session', subs: 'dpe.submissions', config: 'dpe.filterConfig', overrides: 'dpe.profileOverrides' };
const memory = {};

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : (key in memory ? memory[key] : fallback); }
  catch { return key in memory ? memory[key] : fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { throw new Error('Cannot save: browser storage is blocked or full. No changes were saved.'); }
  memory[key] = value;
  window.dispatchEvent(new CustomEvent('store:change', { detail: { key } }));
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const wait = (ms = 150) => new Promise(r => setTimeout(r, ms));   // imitates network delay

async function currentUser() {
  return read(KEYS.session, null);
}

async function login(email, password) {
  await wait();
  const e = String(email || '').trim().toLowerCase();
  let u = DEMO_USERS[e];
  // In the demo, any other email with the password "demo" logs in as a student
  if (!u && password === 'demo' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) u = { password: 'demo', name: e.split('@')[0], role: 'student' };
  if (!u || u.password !== password) throw new Error('Email or password is incorrect.');
  const session = { email: e, name: u.name, role: u.role };
  write(KEYS.session, session);
  return session;
}

async function logout() {
  write(KEYS.session, null);
}

async function submit(card) {
  const user = await currentUser();
  if (!user) throw new Error('Please log in first.');
  await wait();
  const subs = read(KEYS.subs, []);
  const rec = {
    id: newId(), status: 'pending', card,
    userEmail: user.email, userName: user.name,
    submittedAt: new Date().toISOString(), reviewedAt: null, reviewer: null, note: ''
  };
  subs.push(rec);
  write(KEYS.subs, subs);
  return rec;
}

/* Everything the logged-in user has sent (for "My submissions", and later for tracking) */
async function mySubmissions() {
  const user = await currentUser();
  if (!user) return [];
  return read(KEYS.subs, []).filter(s => s.userEmail === user.email).reverse();
}

async function allSubmissions() {
  const user = await currentUser();
  if (user?.role !== 'admin') throw new Error('Only admins can see this.');
  return read(KEYS.subs, []).slice().reverse();
}

async function review(id, decision, note) {
  const user = await currentUser();
  if (user?.role !== 'admin') throw new Error('Only admins can review submissions.');
  await wait();
  const subs = read(KEYS.subs, []);
  const s = subs.find(x => x.id === id);
  if (!s) throw new Error('Submission not found.');
  if (!['approve', 'reject'].includes(decision)) throw new Error('Invalid review decision.');
  if (s.status !== 'pending') throw new Error('This card is no longer waiting for review.');
  recordHistory(s, 'review:' + decision, user);
  s.status = decision === 'approve' ? 'approved' : 'rejected';
  s.note = note || '';
  s.reviewer = user.email;
  s.reviewedAt = new Date().toISOString();
  write(KEYS.subs, subs);
  return s;
}

/* Approved submissions, ready to show in the public library */
async function approvedSubmissions() {
  return read(KEYS.subs, []).filter(s => s.status === 'approved');
}

async function getFilterConfig() {
  return read(KEYS.config, null) || DPE.DEFAULT_FILTERS.map(f => ({ ...f }));
}

async function saveFilterConfig(cfg) {
  const user = await currentUser();
  if (user?.role !== 'admin') throw new Error('Only admins can change filters.');
  write(KEYS.config, cfg);
}

async function resetFilterConfig() {
  const user = await currentUser();
  if (user?.role !== 'admin') throw new Error('Only admins can change filters.');
  try { localStorage.removeItem(KEYS.config); } catch {}
  delete memory[KEYS.config];
  window.dispatchEvent(new CustomEvent('store:change', { detail: { key: KEYS.config } }));
}


function recordHistory(s, action, user) {
  s.history = Array.isArray(s.history) ? s.history : [];
  const previous = { ...s }; delete previous.history;
  s.history.push({ action, at: new Date().toISOString(), by: user.email,
    previous: JSON.parse(JSON.stringify(previous)) });
}
function validateCard(card) {
  if (!card || !String(card.name || '').trim() || !String(card.type || '').trim())
    throw new Error('Donor name and type are required.');
  if (!Array.isArray(card.sdgs) || !card.sdgs.length || card.sdgs.some(n => !Number.isInteger(n) || n < 1 || n > 17))
    throw new Error('Select valid SDGs.');
}
async function updateSubmission(id, card, expectedVersion) {
  const user = await currentUser();
  if (!user) throw new Error('Please log in first.');
  validateCard(card);
  const subs = read(KEYS.subs, []), s = subs.find(x => x.id === id);
  if (!s) throw new Error('Submission not found.');
  if (expectedVersion !== undefined && (s.version || 1) !== expectedVersion)
    throw new Error('This card changed after you opened it. Close and reopen the editor.');
  const admin = user.role === 'admin';
  if (!admin && (s.userEmail !== user.email || s.status !== 'rejected'))
    throw new Error('You can only resubmit your own returned cards.');
  recordHistory(s, admin ? 'admin-edit' : 'resubmit', user);
  s.card = { ...s.card, ...card };
  s.version = (s.version || 1) + 1;
  s.updatedAt = new Date().toISOString(); s.updatedBy = user.email;
  if (!admin) {
    s.status = 'pending'; s.resubmittedAt = s.updatedAt;
    s.note = ''; s.reviewer = null; s.reviewedAt = null;
  }
  write(KEYS.subs, subs); return s;
}
async function getProfileOverrides() { return read(KEYS.overrides, {}); }
async function saveProfile(id, profile, expectedRevision) {
  const user = await currentUser();
  if (user?.role !== 'admin') throw new Error('Only admins can edit library profiles.');
  if (!id || !String(profile.name || '').trim()) throw new Error('Profile name is required.');
  const overrides = read(KEYS.overrides, {}), old = overrides[id];
  if (expectedRevision !== undefined && (old?.revision || 0) !== expectedRevision)
    throw new Error('This profile changed. Close and reopen the editor.');
  const history = old?.history || [];
  if (old) { const previous = { ...old }; delete previous.history; history.push(previous); }
  overrides[id] = { profile: { ...profile, id }, revision: (old?.revision || 0) + 1,
    updatedAt: new Date().toISOString(), updatedBy: user.email, history };
  write(KEYS.overrides, overrides);
}

window.Store = {
  updateSubmission, getProfileOverrides, saveProfile,
  isDemo: true,
  currentUser, login, logout,
  submit, mySubmissions, allSubmissions, review, approvedSubmissions,
  getFilterConfig, saveFilterConfig, resetFilterConfig
};

/* Keep two open tabs in sync (e.g. student tab and admin tab in the same browser) */
window.addEventListener('storage', e => {
  if (Object.values(KEYS).includes(e.key)) window.dispatchEvent(new CustomEvent('store:change', { detail: { key: e.key } }));
});
})();
