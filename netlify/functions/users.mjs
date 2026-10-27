// Server-side user management for the DHA MT Workshop app.
// Runs on Netlify, never in the browser, because it uses the Supabase service key.
//
// Netlify environment variables needed:
//   VITE_SUPABASE_URL          (same as the app)
//   SUPABASE_SERVICE_ROLE_KEY  (Supabase > Project Settings > API > service_role, keep secret)
//   VITE_LOGIN_DOMAIN          (optional, default dha-mt.local)
import { createClient } from '@supabase/supabase-js';
import { checkUserAction } from '../../src/lib/userRules.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const DISABLED_BAN = '876000h'; // ~100 years

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const domain = process.env.LOGIN_DOMAIN || process.env.VITE_LOGIN_DOMAIN || 'dha-mt.local';
  if (!url || !serviceKey) return json(500, { error: 'User management is not set up yet: add SUPABASE_SERVICE_ROLE_KEY in Netlify.' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    // 1. Who is calling? Verify their session token with Supabase.
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Please sign in again.' });
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who?.user) return json(401, { error: 'Your session has expired. Please sign in again.' });
    const { data: actorProf } = await admin.from('profiles').select('*').eq('id', who.user.id).maybeSingle();
    if (!actorProf || actorProf.active === false) return json(403, { error: 'Your login is disabled.' });
    const actor = { id: who.user.id, role: actorProf.role, name: actorProf.full_name };

    const body = await req.json().catch(() => ({}));
    const { action, ...p } = body;

    // 2. Current users (needed for the rules: duplicate usernames, last AD Wksp, etc.)
    const users = await listUsers(admin, domain);

    // 3. Same rules as the screens
    checkUserAction(actor, action, p, users);

    // 4. Do it
    const target = p.id ? users.find((u) => u.id === p.id) : null;
    let result = null;
    switch (action) {
      case 'list':
        result = { users, log: await recentLog(admin) };
        break;

      case 'create': {
        const username = p.username.trim().toLowerCase();
        const { data, error } = await admin.auth.admin.createUser({
          email: `${username}@${domain}`, password: p.password, email_confirm: true,
          user_metadata: { full_name: p.full_name.trim(), role: p.role },
        });
        if (error) throw error;
        const { error: pe } = await admin.from('profiles').upsert({
          id: data.user.id, full_name: p.full_name.trim(), role: p.role, active: true,
        });
        if (pe) throw pe;
        await log(admin, actor, 'Created login', username, roleText(p.role));
        result = { id: data.user.id };
        break;
      }

      case 'update': {
        const patch = {};
        if (p.full_name != null) patch.full_name = p.full_name.trim();
        if (p.role != null) patch.role = p.role;
        const { error } = await admin.from('profiles').update(patch).eq('id', target.id);
        if (error) throw error;
        const changes = [];
        if (patch.role && patch.role !== target.role) changes.push(`role ${roleText(target.role)} → ${roleText(patch.role)}`);
        if (patch.full_name && patch.full_name !== target.full_name) changes.push(`name → ${patch.full_name}`);
        if (changes.length) await log(admin, actor, 'Edited login', target.username, changes.join(', '));
        break;
      }

      case 'reset_password': {
        const { error } = await admin.auth.admin.updateUserById(target.id, { password: p.password });
        if (error) throw error;
        await log(admin, actor, 'Reset password', target.username, '');
        break;
      }

      case 'set_active': {
        const { error } = await admin.auth.admin.updateUserById(target.id, { ban_duration: p.active ? 'none' : DISABLED_BAN });
        if (error) throw error;
        await admin.from('profiles').update({ active: !!p.active }).eq('id', target.id);
        await log(admin, actor, p.active ? 'Enabled login' : 'Disabled login', target.username, '');
        break;
      }
    }
    return json(200, { ok: true, ...(result || {}) });
  } catch (e) {
    const msg = e?.message || String(e);
    if (/already been registered|already registered/i.test(msg)) return json(400, { error: 'That username is already taken.' });
    return json(e?.status && e.status < 500 ? e.status : 500, { error: msg });
  }
};

async function listUsers(admin, domain) {
  const all = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const { data: profs, error } = await admin.from('profiles').select('*');
  if (error) throw error;
  const byId = new Map(profs.map((x) => [x.id, x]));
  return all.map((u) => {
    const prof = byId.get(u.id) || {};
    const banned = u.banned_until && new Date(u.banned_until) > new Date();
    return {
      id: u.id,
      username: (u.email || '').endsWith('@' + domain) ? u.email.split('@')[0] : u.email,
      full_name: prof.full_name || '',
      role: prof.role || null,
      active: !banned && prof.active !== false,
      last_sign_in_at: u.last_sign_in_at || null,
      created_at: u.created_at,
    };
  }).sort((a, b) => a.username.localeCompare(b.username));
}

async function recentLog(admin) {
  const { data } = await admin.from('user_admin_log').select('*').order('at', { ascending: false }).limit(30);
  return data || [];
}

async function log(admin, actor, action, target, detail) {
  await admin.from('user_admin_log').insert({ actor_id: actor.id, actor_name: actor.name, action, target, detail });
}

const ROLE_TEXT = { ad_wksp: 'AD Wksp', am_wksp: 'AM Wksp', mt_clerk: 'MT Clerk', proc_clerk: 'Procurement Clerk', ceo: 'CEO' };
const roleText = (r) => ROLE_TEXT[r] || r || 'none';
