import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { isOpen, jobDays, faultText, spareStatus, sparePendingDays, breakdownsThisYear } from '../lib/metrics.js';
import { fmtDays, fmtDateTime, vehicleTitle, toDate, startOfYear } from '../lib/format.js';
import { OVERDUE_DAYS } from '../lib/config.js';
import { StatusChip } from '../components/ui.jsx';

export default function Dashboard() {
  const { data, idx, lastSync } = useStore();
  const nav = useNavigate();

  const open = data.job_cards.filter(isOpen).map((j) => ({ j, v: idx.vehicleById.get(j.vehicle_id), days: jobDays(j) }))
    .sort((a, b) => b.days - a.days);
  const by = (s) => open.filter((o) => o.j.status === s);
  const awaiting = by('awaiting_spares');
  const repair = by('under_repair');
  const ready = by('ready');
  const finalI = by('final_inspection');

  const strength = data.vehicles.filter((v) => !v.is_ber);
  const offRoadIds = new Set(open.map((o) => o.j.vehicle_id));
  const avail = strength.length ? Math.round(((strength.length - strength.filter((v) => offRoadIds.has(v.id)).length) / strength.length) * 100) : 0;

  const catCount = {};
  for (const o of open) if (o.v) catCount[o.v.category] = (catCount[o.v.category] || 0) + 1;
  const catText = Object.entries(catCount).map(([k, n]) => `${n} ${k}`).join(' · ') || 'none in workshop';

  const openJobIds = new Set(open.map((o) => o.j.id));
  const pendingSpares = data.spares.filter((s) => !s.received_on && openJobIds.has(s.job_card_id))
    .map((s) => ({ s, days: sparePendingDays(s), j: idx.jobById.get(s.job_card_id) }))
    .sort((a, b) => b.days - a.days);
  const lpPending = pendingSpares.filter((p) => p.s.source === 'Local Purchase').length;

  const yStart = startOfYear();
  const top = data.vehicles.map((v) => ({ v, n: breakdownsThisYear(idx, v.id) }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5);
  const maxN = top[0]?.n || 1;

  const releasedThisMonth = data.job_cards.filter((j) => {
    if (j.status !== 'released' || !j.released_at) return false;
    const d = toDate(j.released_at), n = new Date();
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  }).length;
  const jobsYear = data.job_cards.filter((j) => toDate(j.received_at) >= yStart).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Live overview of all vehicles currently in the workshop</p>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Updated {lastSync ? fmtDateTime(lastSync) : '—'}</p>
      </div>

      <div className="section">
        <div className="kpi-grid">
          <Link className="kpi" to="/jobs" style={{ color: 'inherit' }}>
            <div className="label">Vehicles in Workshop</div>
            <div className="value">{open.length}</div>
            <div className="sub">{catText}</div>
          </Link>
          <Link className="kpi" to="/spares" style={{ borderTopColor: 'var(--amber)', color: 'inherit' }}>
            <div className="label">Awaiting Spares</div>
            <div className="value">{awaiting.length}</div>
            <div className="sub">{lpPending} spare{lpPending === 1 ? '' : 's'} pending Local Purchase</div>
          </Link>
          <Link className="kpi" to="/jobs" style={{ borderTopColor: 'var(--orange)', color: 'inherit' }}>
            <div className="label">Under Repair</div>
            <div className="value">{repair.length}</div>
            <div className="sub">{repair.filter((o) => o.j.repair_class === 'Major').length} major repair class</div>
          </Link>
          <Link className="kpi" to="/jobs" style={{ borderTopColor: 'var(--purple)', color: 'inherit' }}>
            <div className="label">Ready for Release</div>
            <div className="value">{ready.length}</div>
            <div className="sub">{finalI.length} more at final inspection</div>
          </Link>
          <Link className="kpi" to="/vehicles" style={{ borderTopColor: 'var(--good)', color: 'inherit' }}>
            <div className="label">Fleet Availability</div>
            <div className="value">{avail}%</div>
            <div className="sub">of {strength.length} vehicles on strength</div>
          </Link>
        </div>
      </div>

      <div className="two-col">
        <div className="section">
          <h2 className="section-title">Off-Road Vehicles, by days in workshop</h2>
          <div className="card clip table-wrap">
            <table className="stack">
              <thead><tr><th>Vehicle No</th><th>Type</th><th>Fault Reported</th><th>Status</th><th>Days in Workshop</th></tr></thead>
              <tbody>
                {open.length === 0 && <tr className="empty-row"><td colSpan={5}>No vehicles in the workshop. Whole fleet is fit.</td></tr>}
                {open.map(({ j, v, days }) => {
                  const over = days >= OVERDUE_DAYS;
                  return (
                    <tr key={j.id} className={`rowlink${over ? ' row-over' : ''}`} onClick={() => nav(`/jobs/${j.id}`)}>
                      <td className="mono"><b>{v?.vehicle_no}</b></td>
                      <td>{vehicleTitle(v)}</td>
                      <td>{faultText(j)}</td>
                      <td><StatusChip status={j.status} /></td>
                      <td className={over ? 'days-over' : ''}>{fmtDays(days)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Red rows: off road {OVERDUE_DAYS}+ days · {releasedThisMonth} released this month · {jobsYear} job cards this year
          </p>
        </div>

        <div>
          <div className="section">
            <h2 className="section-title">Top 5 Vehicles by Breakdowns, this year</h2>
            <div className="card stack-card">
              {top.length === 0 && <div className="empty-note">No breakdowns recorded this year.</div>}
              {top.map(({ v, n }) => (
                <Link key={v.id} className="bar-row" to={`/vehicles/${v.id}`}>
                  <div className="bar-head"><b>{v.vehicle_no} · {vehicleTitle(v)}</b><span>{n}</span></div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / maxN) * 100}%` }} /></div>
                </Link>
              ))}
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">Spares Waiting Longest</h2>
            <div className="card stack-card">
              {pendingSpares.length === 0 && <div className="empty-note">No spares pending.</div>}
              {pendingSpares.slice(0, 6).map(({ s, days, j }) => (
                <Link key={s.id} className="spare-row" to={`/jobs/${j.id}`}>
                  <div>
                    <b>{s.part_name}</b>
                    <div className="meta">{idx.vehicleById.get(j.vehicle_id)?.vehicle_no} · {s.source} · {spareStatus(s) === 'approved' ? 'Approved' : 'Not yet approved'}</div>
                  </div>
                  <div className="spare-days" style={days >= 10 ? { color: 'var(--red)' } : null}>{days}d</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
