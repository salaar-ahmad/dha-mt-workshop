import { useState } from 'react';
import { backend } from '../lib/backend.js';
import { useStore } from '../lib/store.jsx';
import { Logo } from '../components/ui.jsx';
import { ROLES } from '../lib/roles.js';

export default function Login() {
  const { setUser } = useStore();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!u || !p) return setErr('Enter your username and password.');
    setBusy(true); setErr('');
    try { setUser(await backend.signIn(u, p)); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <Logo size={64} />
          <div><b>DHA MT Workshop</b><span>Mechanical Transport · Phase 6 &amp; 7</span></div>
        </div>
        {backend.demo && (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--ink-soft)' }}>Demo: pick a login to see what that person sees.</p>
            <div className="role-pick">
              {backend.demoUsers.map((d) => (
                <button type="button" key={d.username} onClick={async () => setUser(await backend.signIn(d.username))}>
                  <div style={{ textAlign: 'left' }}>{ROLES[d.role]?.label}<div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>{d.name} · {d.username}</div></div><span>{ROLES[d.role]?.group}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {!backend.demo && <>
        {err && <div className="alert err">{err}</div>}
        <div className="field">
          <label>Username</label>
          <input type="text" value={u} onChange={(e) => setU(e.target.value)} autoFocus autoCapitalize="none" autoComplete="username" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        </>}
      </form>
    </div>
  );
}
