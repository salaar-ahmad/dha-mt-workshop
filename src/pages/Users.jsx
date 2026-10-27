import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { backend } from '../lib/backend.js';
import { ROLES } from '../lib/roles.js';
import { USER_ROLES, MIN_PASSWORD, USERNAME_RE, suggestPassword } from '../lib/userRules.js';
import { LOGIN_DOMAIN } from '../lib/config.js';
import { fmtDateTime } from '../lib/format.js';
import { Modal, askConfirm } from '../components/ui.jsx';

const ROLE_HELP = {
  ad_wksp: 'Full access. Manages logins and roles.',
  am_wksp: 'Full workshop access. Can view logins but not change them.',
  mt_clerk: 'Job cards, all stages, spares demands, vehicle list. Spares view only.',
  proc_clerk: 'Spares Register only: approve, receive, enter costs.',
  ceo: 'View only. Opens on the Overview.',
};
const ROLE_CHIP = { ad_wksp: 'final', am_wksp: 'inspected', mt_clerk: 'repair', proc_clerk: 'awaiting', ceo: 'received' };

function RolePicker({ value, onChange, disabled }) {
  return (
    <div className="role-pick" style={{ marginTop: 0 }}>
      {USER_ROLES.map((r) => (
        <button type="button" key={r} disabled={disabled} onClick={() => onChange(r)}
          className={value === r ? 'picked' : ''} aria-pressed={value === r}>
          <div style={{ textAlign: 'left' }}>
            {ROLES[r].label}
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', marginTop: 2 }}>{ROLE_HELP[r]}</div>
          </div>
          <span>{value === r ? '✓' : ''}</span>
        </button>
      ))}
    </div>
  );
}

function PasswordField({ value, onChange, label = 'Password' }) {
  return (
    <div className="field">
      <label>{label}<span className="req">*</span></label>
      <div className="unit-input">
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" spellCheck={false} />
        <button type="button" className="btn btn-secondary" onClick={() => onChange(suggestPassword())}>Suggest</button>
      </div>
      <div className="hint">At least {MIN_PASSWORD} characters. Write it down and hand it to the person; they cannot see it again here.</div>
    </div>
  );
}

function CreateModal({ onClose, onDone }) {
  const [f, setF] = useState({ full_name: '', username: '', role: 'mt_clerk', password: suggestPassword() });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const uname = f.username.trim().toLowerCase();
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await backend.adminUsers('create', { ...f, username: uname });
      onDone(`Login "${uname}" created. Password: ${f.password}`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="New Login" onClose={() => !busy && onClose()}>
      {err && <div className="alert err">{err}</div>}
      <div className="grid-2">
        <div className="field"><label>Full Name &amp; Rank<span className="req">*</span></label>
          <input type="text" value={f.full_name} onChange={set('full_name')} placeholder="e.g. Hav (R) Naeem Ahmed" autoFocus /></div>
        <div className="field"><label>Username<span className="req">*</span></label>
          <input type="text" value={f.username} onChange={set('username')} placeholder="e.g. mtclerk2" autoCapitalize="none" spellCheck={false}
            className={uname && !USERNAME_RE.test(uname) ? 'invalid' : ''} />
          <div className="hint">Signs in as <b>{uname || 'username'}</b>. Lowercase letters and numbers.</div></div>
      </div>
      <div className="field"><label>Role</label><RolePicker value={f.role} onChange={set('role')} /></div>
      <PasswordField value={f.password} onChange={set('password')} />
      <div className="actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create Login'}</button>
      </div>
    </Modal>
  );
}

function EditModal({ u, self, onClose, onDone }) {
  const [f, setF] = useState({ full_name: u.full_name, role: u.role });
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn, msg) => {
    setBusy(true); setErr('');
    try { await fn(); onDone(msg); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const save = async () => {
    if (f.role !== u.role && !(await askConfirm(`Change ${u.full_name} from ${ROLES[u.role]?.label} to ${ROLES[f.role].label}? Their tabs and permissions change the next time the page loads.`, 'Change role'))) return;
    run(() => backend.adminUsers('update', { id: u.id, full_name: f.full_name, role: f.role }), 'Login updated');
  };
  return (
    <Modal title={`Edit ${u.username}`} onClose={() => !busy && onClose()}>
      {err && <div className="alert err">{err}</div>}
      <div className="field"><label>Full Name &amp; Rank</label>
        <input type="text" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
      <div className="field"><label>Role</label>
        {self
          ? <div className="alert info" style={{ marginBottom: 0 }}>You cannot change your own role. Another AD Wksp has to do it.</div>
          : <RolePicker value={f.role} onChange={(r) => setF({ ...f, role: r })} />}
      </div>
      <div className="actions" style={{ marginTop: 18 }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button>
      </div>
      <div className="divider" />
      {!showPw ? (
        <button className="linkbtn" onClick={() => { setShowPw(true); setPw(suggestPassword()); }}>Reset password…</button>
      ) : (
        <div className="sub-form">
          <div className="sub-form-title">Reset password for {u.username}</div>
          <PasswordField value={pw} onChange={setPw} label="New password" />
          <div className="step-actions" style={{ marginTop: 6 }}>
            <button className="btn btn-primary" disabled={busy}
              onClick={() => run(() => backend.adminUsers('reset_password', { id: u.id, password: pw }), `Password for "${u.username}" reset to: ${pw}`)}>Set New Password</button>
            <button className="linkbtn" onClick={() => setShowPw(false)}>Cancel</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Users() {
  const { user, can, notify } = useStore();
  const [state, setState] = useState({ users: null, log: [] });
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const [showOff, setShowOff] = useState(false);

  const load = useCallback(async () => {
    try { setState(await backend.adminUsers('list')); setErr(''); }
    catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const done = (msg) => { setCreating(false); setEditing(null); setNotice(msg); load(); };
  const toggle = async (u) => {
    const on = !u.active;
    if (!on && !(await askConfirm(`Disable ${u.full_name} (${u.username})? They will be signed out and cannot sign in until enabled again. Their past entries stay.`, 'Disable login', true))) return;
    try {
      await backend.adminUsers('set_active', { id: u.id, active: on });
      notify(on ? `${u.username} enabled` : `${u.username} disabled`); load();
    } catch (e) { notify(e.message, 'err'); }
  };

  const users = state.users || [];
  const shown = users.filter((u) => showOff || u.active);
  const counts = USER_ROLES.map((r) => [r, users.filter((u) => u.active && u.role === r).length]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p>{can.manageUsers ? 'Create logins, set roles, reset passwords and disable accounts.' : 'Who can sign in and what role they have. Only AD Wksp can make changes.'}</p>
        </div>
        {can.manageUsers && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Login</button>}
      </div>

      {err && <div className="alert err">{err}</div>}
      {notice && (
        <div className="alert info" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{notice}</span><button className="linkbtn" onClick={() => setNotice('')}>Dismiss</button>
        </div>
      )}

      <div className="summary-row">
        {counts.map(([r, n]) => <div className="sum-chip" key={r}><b>{n}</b>{ROLES[r].label}</div>)}
      </div>

      <div className="toolbar">
        <label className={`tick${showOff ? ' on' : ''}`} style={{ padding: '8px 12px' }}>
          <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />Show disabled logins
        </label>
        <span className="muted" style={{ fontSize: 12.5 }}>Usernames sign in without the @{LOGIN_DOMAIN} part.</span>
      </div>

      <div className="card clip table-wrap section">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Last sign-in</th>{can.manageUsers && <th />}</tr></thead>
          <tbody>
            {state.users == null && !err && <tr className="empty-row"><td colSpan={6}>Loading logins…</td></tr>}
            {shown.map((u) => (
              <tr key={u.id} style={u.active ? null : { opacity: 0.6 }}>
                <td><b>{u.full_name || '—'}</b>{u.id === user.id && <span className="muted" style={{ fontSize: 12 }}> (you)</span>}</td>
                <td className="mono">{u.username}</td>
                <td>{u.role ? <span className={`chip chip-${ROLE_CHIP[u.role]}`}>{ROLES[u.role]?.label || u.role}</span> : <span className="muted">No role</span>}</td>
                <td>{u.active ? <span className="chip chip-released">Active</span> : <span className="chip chip-ber">Disabled</span>}</td>
                <td className="muted" style={{ fontSize: 13 }}>{u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : 'Never'}</td>
                {can.manageUsers && (
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(u)}>Edit</button>{' '}
                    {u.id !== user.id && (
                      <button className={`btn btn-sm ${u.active ? 'btn-ghost-danger' : 'btn-secondary'}`} onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section">
        <h2 className="section-title">Recent changes to logins</h2>
        <div className="card stack-card">
          {state.log.length === 0 && <div className="empty-note">No changes recorded yet.</div>}
          <ul className="events">
            {state.log.map((l) => (
              <li key={l.id}><b>{l.action}</b> · {l.target}{l.detail ? ` (${l.detail})` : ''} · by {l.actor_name} · {fmtDateTime(l.at)}</li>
            ))}
          </ul>
        </div>
      </div>

      {creating && <CreateModal onClose={() => setCreating(false)} onDone={done} />}
      {editing && <EditModal u={editing} self={editing.id === user.id} onClose={() => setEditing(null)} onDone={done} />}
    </>
  );
}
