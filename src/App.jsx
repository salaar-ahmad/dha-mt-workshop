import { Component } from 'react';
import { HashRouter, MemoryRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './lib/store.jsx';
import { backend } from './lib/backend.js';
import { initials } from './lib/format.js';
import { Logo, Toast, ConfirmHost, askConfirm } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import { ROLES, workspaceFor, canOpen } from './lib/roles.js';
import Dashboard from './pages/Dashboard.jsx';
import JobBoard from './pages/JobBoard.jsx';
import NewJob from './pages/NewJob.jsx';
import JobDetail from './pages/JobDetail.jsx';
import Vehicles from './pages/Vehicles.jsx';
import VehicleHistory from './pages/VehicleHistory.jsx';
import Spares from './pages/Spares.jsx';
import Users from './pages/Users.jsx';
import { PrintJobCard, PrintRelease } from './pages/Print.jsx';


function Shell({ children }) {
  const { user, setUser, error, can } = useStore();
  const loc = useLocation();
  const ws = workspaceFor(user.role);
  const nav = useNavigate();
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Logo size={44} />
          <div className="topbar-brand">
            <b>DHA MT Workshop</b>
            <span>Mechanical Transport · Phase 6 &amp; 7, Islamabad</span>
          </div>
        </div>
        <nav className="topbar-nav">
          {ws.nav.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => `nav-link${(n.match ? n.match.test(loc.pathname) : isActive) ? ' active' : ''}`}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          <div className="user-chip"><span className="avatar">{initials(user.name)}</span>{user.name} · {ROLES[user.role]?.label || user.role}</div>
          <button className="signout" onClick={async () => { await backend.signOut(); nav('/', { replace: true }); setUser(null); }}>{backend.demo ? 'Switch login' : 'Sign out'}</button>
        </div>
      </header>
      {backend.demo && (
        <div className="demo-banner">
          <span>Demo mode: sample data, saved only in this browser. Connect Supabase to go live.</span>
          <button onClick={async () => { if (await askConfirm('Reset all demo data back to the sample fleet? Anything you entered will be lost.', 'Reset demo data', true)) backend.resetDemo(); }}>Reset demo data</button>
        </div>
      )}
      {!can.stages && !can.procure && <div className="readonly-note">View-only access. You can see every record but cannot change anything.</div>}
      {error && <div className="err-banner">Connection problem: {error}. Changes may not be saved.</div>}
      <main>{children}</main>
      <Toast />
      <ConfirmHost />
    </div>
  );
}

function NoAccess({ home }) {
  const { user } = useStore();
  if (home === '/') {
    return <div className="alert warn">Your login ({user.name}) has no workspace assigned yet. Ask AD Wksp to set your role.</div>;
  }
  return (
    <div className="form-wrap" style={{ maxWidth: 520, paddingTop: 40 }}>
      <div className="form-card" style={{ textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 8px', color: 'var(--green-900)' }}>Not part of your workspace</h2>
        <p style={{ margin: '0 0 22px', color: 'var(--ink-soft)', fontSize: 14.5 }}>
          This page is not available to the {ROLES[user.role]?.label} login. If you need it, ask AD Wksp or AM Wksp.
        </p>
        <Link className="btn btn-primary" to={home}>Go to my workspace</Link>
      </div>
    </div>
  );
}

function Routed() {
  const { user, loading } = useStore();
  const loc = useLocation();
  if (user === undefined) return <div className="loading">Loading…</div>;
  if (user === null) return <><Login /><Toast /></>;
  const home = workspaceFor(user.role).home;
  if (loc.pathname === '/' && home !== '/') return <Navigate to={home} replace />;
  if (!canOpen(user.role, loc.pathname)) return <Shell><NoAccess home={home} /></Shell>;
  return (
    <Routes>
      <Route path="/print/job/:id" element={<PrintJobCard />} />
      <Route path="/print/release/:id" element={<PrintRelease />} />
      <Route path="*" element={
        <Shell>
          {loading ? <div className="loading">Loading workshop data…</div> : (
            <Routes>
              <Route path="/" element={<NoAccess home={home} />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/jobs" element={<JobBoard />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/new" element={<NewJob />} />
              <Route path="/vehicles" element={<Vehicles />} />
              <Route path="/vehicles/:id" element={<VehicleHistory />} />
              <Route path="/spares" element={<Spares />} />
              <Route path="/users" element={<Users />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </Shell>
      } />
    </Routes>
  );
}

// Shows the error instead of a blank screen if any page crashes
class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h2 style={{ marginTop: 0, color: 'var(--green-900)' }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)' }}>The page hit an error. Reload to continue. If it happens again, send this message to the admin:</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--bg-sunken)', padding: 12, borderRadius: 8 }}>{String(this.state.err?.message || this.state.err)}</pre>
          <button className="btn btn-primary" onClick={() => { this.setState({ err: null }); }}>Try again</button>
        </div>
      </div>
    );
  }
}

// The live site uses the address bar (#/jobs etc.) so pages can be bookmarked.
// The demo keeps page changes in memory so it works inside embedded previews too.
const Router = backend.demo ? MemoryRouter : HashRouter;

export default function App() {
  return <ErrorBoundary><Router><Routed /></Router></ErrorBoundary>;
}
