import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE, LOGIN_DOMAIN } from './config.js';
import { buildSeed } from './seed.js';
import { checkUserAction } from './userRules.js';

export const TABLES = ['vehicles', 'job_cards', 'spares', 'job_events'];

// Demo-only sample logins, one per role
const DEMO_USERS = [
  { id: 'd-ad', username: 'adwksp', name: 'Maj (R) Imran Sheikh', role: 'ad_wksp' },
  { id: 'd-am', username: 'amwksp', name: 'Capt (R) Usman Ali', role: 'am_wksp' },
  { id: 'd-mt', username: 'mtclerk', name: 'Zubair Khan', role: 'mt_clerk' },
  { id: 'd-pc', username: 'procclerk', name: 'Asad Mehmood', role: 'proc_clerk' },
  { id: 'd-ceo', username: 'ceo', name: 'CEO DHA', role: 'ceo' },
];

// ------------------------------------------------------------------
// Supabase backend (production)
// ------------------------------------------------------------------
function supabaseBackend() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const check = ({ data, error }) => {
    if (error) throw new Error(friendlyError(error));
    return data;
  };

  return {
    demo: false,
    async getUser() {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;
      const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (prof && prof.active === false) { await sb.auth.signOut(); return null; }
      return {
        id: user.id,
        name: prof?.full_name || user.email.split('@')[0],
        role: prof?.role || 'ceo',
      };
    },
    async signIn(username, password) {
      const email = username.includes('@') ? username.trim() : `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Wrong username or password.');
      return this.getUser();
    },
    async signOut() { await sb.auth.signOut(); },
    async fetchAll(table) {
      const out = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const rows = check(await sb.from(table).select('*').range(from, from + page - 1));
        out.push(...rows);
        if (rows.length < page) break;
      }
      return out;
    },
    async insert(table, row) {
      return check(await sb.from(table).insert(row).select().single());
    },
    async update(table, id, patch) {
      return check(await sb.from(table).update(patch).eq('id', id).select().single());
    },
    async remove(table, id) {
      check(await sb.from(table).delete().eq('id', id));
    },
    async adminUsers(action, payload = {}) {
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      let res;
      try {
        res = await fetch('/.netlify/functions/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ action, ...payload }),
        });
      } catch {
        throw new Error('Could not reach the server. Check the internet connection.');
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Server error (${res.status})`);
      return body;
    },
    subscribe(onChange) {
      const ch = sb.channel('mt-live');
      for (const t of TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange);
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}

function friendlyError(error) {
  const m = error.message || String(error);
  if (/job_cards_one_open_per_vehicle/.test(m)) return 'This vehicle already has an open job card.';
  if (/vehicles_vehicle_no_key/.test(m)) return 'A vehicle with this number already exists.';
  if (error.code === 'PGRST116' || /0 rows|no\) rows/i.test(m)) return 'Not saved: your login does not have permission for this, or the record was removed.';
  if (/row-level security/i.test(m)) return 'Your login does not have permission for this. Ask AD Wksp or AM Wksp.';
  if (/violates foreign key/.test(m)) return 'This record is linked to other records and cannot be removed.';
  return m;
}

// ------------------------------------------------------------------
// Demo backend: same API, data kept in this browser only
// ------------------------------------------------------------------
function localBackend() {
  const KEY = 'dha-mt-demo-v1';
  let mem = null;
  const listeners = new Set();

  const load = () => {
    if (mem) return mem;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) mem = JSON.parse(raw);
    } catch { /* storage blocked: memory only */ }
    if (!mem) { mem = buildSeed(); save(); }
    return mem;
  };
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* ignore */ }
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
  const notify = () => listeners.forEach((f) => f());

  const jobNo = (row) => {
    const db = load();
    const v = db.vehicles.find((x) => x.id === row.vehicle_id);
    const digits = ((v?.vehicle_no || '').replace(/\D/g, '') || '0').padStart(4, '0');
    const yr = new Date(new Date(row.received_at || Date.now()).getTime() + 5 * 3600000).getUTCFullYear();
    const seq = db.job_cards
      .filter((j) => j.vehicle_id === row.vehicle_id && String(j.job_no).startsWith(yr + '-'))
      .reduce((m, j) => Math.max(m, parseInt(String(j.job_no).split('-')[2], 10) || 0), 0) + 1;
    return `${yr}-${digits}-${String(seq).padStart(2, '0')}`;
  };

  const SKEY = 'dha-mt-demo-user';
  const UKEY = 'dha-mt-demo-logins';
  let current = null;
  try { current = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch { /* ignore */ }

  // Demo logins live in this browser, so user management can be tried out
  let logins = null;
  try { logins = JSON.parse(localStorage.getItem(UKEY) || 'null'); } catch { /* ignore */ }
  if (!logins) {
    logins = {
      users: DEMO_USERS.map((u) => ({ id: u.id, username: u.username, full_name: u.name, role: u.role, active: true, last_sign_in_at: null, created_at: new Date(Date.now() - 30 * 86400000).toISOString() })),
      log: [],
    };
  }
  const saveLogins = () => { try { localStorage.setItem(UKEY, JSON.stringify(logins)); } catch { /* ignore */ } };
  const asSession = (u) => ({ id: u.id, username: u.username, name: u.full_name, role: u.role });

  return {
    demo: true,
    get demoUsers() { return logins.users.filter((u) => u.active).map(asSession); },
    async getUser() {
      if (!current) return null;
      const u = logins.users.find((x) => x.id === current.id);
      if (!u || !u.active) return null;
      return asSession(u);
    },
    async adminUsers(action, p = {}) {
      const actor = await this.getUser();
      checkUserAction(actor, action, p, logins.users);
      const target = p.id ? logins.users.find((u) => u.id === p.id) : null;
      const addLog = (a, t, d = '') => logins.log.unshift({ id: uuid(), at: new Date().toISOString(), actor_name: actor.name, action: a, target: t, detail: d });
      const RT = { ad_wksp: 'AD Wksp', am_wksp: 'AM Wksp', mt_clerk: 'MT Clerk', proc_clerk: 'Procurement Clerk', ceo: 'CEO' };
      if (action === 'list') return { users: structuredClone(logins.users), log: logins.log.slice(0, 30) };
      if (action === 'create') {
        const username = p.username.trim().toLowerCase();
        logins.users.push({ id: uuid(), username, full_name: p.full_name.trim(), role: p.role, active: true, last_sign_in_at: null, created_at: new Date().toISOString() });
        addLog('Created login', username, RT[p.role]);
      } else if (action === 'update') {
        const ch = [];
        if (p.role && p.role !== target.role) ch.push(`role ${RT[target.role]} → ${RT[p.role]}`);
        if (p.full_name && p.full_name.trim() !== target.full_name) ch.push(`name → ${p.full_name.trim()}`);
        if (p.role) target.role = p.role;
        if (p.full_name) target.full_name = p.full_name.trim();
        if (ch.length) addLog('Edited login', target.username, ch.join(', '));
      } else if (action === 'reset_password') {
        addLog('Reset password', target.username);
      } else if (action === 'set_active') {
        target.active = !!p.active;
        addLog(p.active ? 'Enabled login' : 'Disabled login', target.username);
      }
      logins.users.sort((a, b) => a.username.localeCompare(b.username));
      saveLogins();
      return { ok: true };
    },
    async signIn(username) {
      const u = logins.users.find((x) => x.username === username && x.active) || logins.users.find((x) => x.active);
      u.last_sign_in_at = new Date().toISOString(); saveLogins();
      current = asSession(u);
      try { sessionStorage.setItem(SKEY, JSON.stringify(current)); } catch { /* ignore */ }
      return current;
    },
    async signOut() {
      current = null;
      try { sessionStorage.removeItem(SKEY); } catch { /* ignore */ }
    },
    async fetchAll(table) { return structuredClone(load()[table]); },
    async insert(table, row) {
      const db = load();
      if (table === 'job_cards') {
        if (db.job_cards.some((j) => j.vehicle_id === row.vehicle_id && !['released', 'ber'].includes(j.status))) {
          throw new Error('This vehicle already has an open job card.');
        }
      }
      if (table === 'vehicles' && db.vehicles.some((v) => v.vehicle_no.toLowerCase() === String(row.vehicle_no).toLowerCase())) {
        throw new Error('A vehicle with this number already exists.');
      }
      const now = new Date().toISOString();
      const rec = { id: uuid(), created_at: now, updated_at: now, ...row };
      if (table === 'job_cards') {
        rec.status ||= 'received';
        rec.received_at ||= now;
        rec.fail_count ??= 0;
        rec.job_no ||= jobNo(rec);
      }
      if (table === 'job_events') rec.at ||= now;
      db[table].push(rec);
      save(); notify();
      return structuredClone(rec);
    },
    async update(table, id, patch) {
      const db = load();
      const rec = db[table].find((r) => r.id === id);
      if (!rec) throw new Error('Record not found');
      if (table === 'vehicles' && patch.vehicle_no &&
          db.vehicles.some((v) => v.id !== id && v.vehicle_no.toLowerCase() === patch.vehicle_no.toLowerCase())) {
        throw new Error('A vehicle with this number already exists.');
      }
      Object.assign(rec, patch, { updated_at: new Date().toISOString() });
      save(); notify();
      return structuredClone(rec);
    },
    async remove(table, id) {
      const db = load();
      db[table] = db[table].filter((r) => r.id !== id);
      if (table === 'job_cards') {
        db.spares = db.spares.filter((s) => s.job_card_id !== id);
        db.job_events = db.job_events.filter((s) => s.job_card_id !== id);
      }
      save(); notify();
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    resetDemo() {
      mem = buildSeed(); save(); notify();
    },
  };
}

export const backend = DEMO_MODE ? localBackend() : supabaseBackend();
