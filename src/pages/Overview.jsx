import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { isOpen, jobDays, jobCost, timeInStatus, vehicleStats, faultText } from '../lib/metrics.js';
import { CATEGORIES, OVERDUE_DAYS, BER_THRESHOLD_PCT } from '../lib/config.js';
import { fmtRs, fmtDays, fmtDateTime, toDate, startOfYear, vehicleTitle } from '../lib/format.js';
import { StatusChip } from '../components/ui.jsx';

const DAY = 86400000;
const STAGE_PARTS = [
  { key: 'wait', label: 'Waiting for inspection', color: '#71717A' },
  { key: 'spares', label: 'Awaiting spares', color: '#B7791F' },
  { key: 'repair', label: 'Under repair', color: '#C2410C' },
  { key: 'final', label: 'Final inspection & release', color: '#6D28D9' },
];

function monthKey(d) {
  const x = new Date(toDate(d).getTime() + 5 * 3600000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
}
function lastMonths(n) {
  const out = [];
  const now = new Date(Date.now() + 5 * 3600000);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) });
  }
  return out;
}

function MonthBars({ months, values, fmt, unit }) {
  const max = Math.max(1, ...values);
  return (
    <div className="mbars">
      {months.map((m, i) => (
        <div className="mbar" key={m.key} title={`${m.label}: ${fmt(values[i])}${unit || ''}`}>
          <div className="mbar-val">{values[i] ? fmt(values[i]) : ''}</div>
          <div className="mbar-track"><div className="mbar-fill" style={{ height: `${(values[i] / max) * 100}%` }} /></div>
          <div className="mbar-lbl">{m.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const { data, idx, lastSync } = useStore();
  const nav = useNavigate();
  const now = Date.now();

  const strength = data.vehicles.filter((v) => !v.is_ber);
  const open = data.job_cards.filter(isOpen);
  const offIds = new Set(open.map((j) => j.vehicle_id));
  const avail = strength.length ? Math.round(((strength.length - strength.filter((v) => offIds.has(v.id)).length) / strength.length) * 100) : 0;
  const overdue = open.filter((j) => jobDays(j) >= OVERDUE_DAYS).sort((a, b) => jobDays(b) - jobDays(a));

  // Released in the last 90 days: average turnaround and where the time went
  const recent = data.job_cards.filter((j) => j.status === 'released' && j.released_at && now - toDate(j.released_at) <= 90 * DAY);
  const avgTurn = recent.length ? recent.reduce((s, j) => s + jobDays(j), 0) / recent.length : null;
  const parts = { wait: 0, spares: 0, repair: 0, final: 0 };
  for (const j of recent) {
    const t = timeInStatus(j, idx.eventsByJob.get(j.id));
    parts.wait += t.received || 0;
    parts.spares += (t.inspected || 0) + (t.awaiting_spares || 0);
    parts.repair += t.under_repair || 0;
    parts.final += (t.final_inspection || 0) + (t.ready || 0);
  }
  if (recent.length) for (const k in parts) parts[k] /= recent.length;
  const partsTotal = Object.values(parts).reduce((a, b) => a + b, 0) || 1;
  const biggest = STAGE_PARTS.reduce((a, b) => (parts[b.key] > parts[a.key] ? b : a), STAGE_PARTS[0]);

  // Spend
  const yStart = startOfYear();
  const costOf = (j) => jobCost(j, idx.sparesByJob.get(j.id));
  const spendYear = data.job_cards.filter((j) => toDate(j.received_at) >= yStart).reduce((s, j) => s + costOf(j), 0);
  const months = lastMonths(6);
  const opened = months.map((m) => data.job_cards.filter((j) => monthKey(j.received_at) === m.key).length);
  const spend = months.map((m) => data.job_cards.filter((j) => monthKey(j.received_at) === m.key).reduce((s, j) => s + costOf(j), 0));
  const thisMonthSpend = spend[spend.length - 1];

  // Availability by category
  const byCat = CATEGORIES.map((c) => {
    const vs = strength.filter((v) => v.category === c);
    const off = vs.filter((v) => offIds.has(v.id)).length;
    return { c, total: vs.length, off, pct: vs.length ? Math.round(((vs.length - off) / vs.length) * 100) : null };
  });

  // Vehicles to watch: highest repair cost this year + BER ratio
  const watch = data.vehicles.filter((v) => !v.is_ber).map((v) => {
    const s = vehicleStats(idx, v);
    const ratio = v.current_value ? (s.costLife / v.current_value) * 100 : null;
    return { v, s, ratio };
  }).filter((x) => x.s.breakdownsYear > 0)
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.s.costYear - a.s.costYear).slice(0, 6);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Workshop Overview</h1>
          <p>Fleet readiness, turnaround and repair spend for Phase 6 &amp; 7 at a glance</p>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Live · updated {lastSync ? fmtDateTime(lastSync) : '—'}</p>
      </div>

      <div className="section">
        <div className="kpi-grid">
          <div className="kpi" style={{ borderTopColor: avail >= 85 ? 'var(--good)' : avail >= 70 ? 'var(--amber)' : 'var(--red)' }}>
            <div className="label">Fleet Availability</div>
            <div className="value">{avail}%</div>
            <div className="sub">{strength.length - offIds.size} of {strength.length} vehicles fit</div>
          </div>
          <div className="kpi" style={{ borderTopColor: 'var(--orange)' }}>
            <div className="label">Off Road Now</div>
            <div className="value">{open.length}</div>
            <div className="sub" style={overdue.length ? { color: 'var(--red)', fontWeight: 600 } : null}>{overdue.length} over {OVERDUE_DAYS} days</div>
          </div>
          <div className="kpi">
            <div className="label">Avg Turnaround</div>
            <div className="value">{avgTurn != null ? avgTurn.toFixed(1) : '—'}<span style={{ fontSize: 16, marginLeft: 4 }}>days</span></div>
            <div className="sub">{recent.length} jobs released, last 90 days</div>
          </div>
          <div className="kpi" style={{ borderTopColor: 'var(--blue)' }}>
            <div className="label">Repair Spend (this yr)</div>
            <div className="value sm" style={{ fontSize: 30 }}>{fmtRs(spendYear, true)}</div>
            <div className="sub">{fmtRs(thisMonthSpend, true)} this month</div>
          </div>
        </div>
      </div>

      <div className="two-col">
        <div>
          <div className="section">
            <h2 className="section-title">Where repair time goes</h2>
            <div className="card pad">
              {recent.length === 0 ? <div className="empty-note">No vehicles released in the last 90 days.</div> : (
                <>
                  <p style={{ margin: '0 0 14px', fontSize: 14 }}>
                    Average vehicle spends <b>{avgTurn.toFixed(1)} days</b> in the workshop. The largest share is <b>{biggest.label.toLowerCase()}</b> ({parts[biggest.key].toFixed(1)} days).
                  </p>
                  <div className="stackbar" role="img" aria-label="Average days per stage">
                    {STAGE_PARTS.map((p) => parts[p.key] > 0 && (
                      <div key={p.key} style={{ flexGrow: parts[p.key] / partsTotal, background: p.color }} title={`${p.label}: ${parts[p.key].toFixed(1)} days`} />
                    ))}
                  </div>
                  <div className="legend">
                    {STAGE_PARTS.map((p) => (
                      <div key={p.key}><span className="sw" style={{ background: p.color }} />{p.label} <b>{parts[p.key].toFixed(1)} d</b></div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="section">
            <div className="grid-2">
              <div>
                <h2 className="section-title">Breakdowns per month</h2>
                <div className="card pad"><MonthBars months={months} values={opened} fmt={(v) => v} unit=" job cards" /></div>
              </div>
              <div>
                <h2 className="section-title">Repair spend per month</h2>
                <div className="card pad"><MonthBars months={months} values={spend} fmt={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} unit=" Rs" /></div>
              </div>
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">Vehicles to watch</h2>
            <div className="card clip table-wrap">
              <table className="stack">
                <thead><tr><th>Vehicle</th><th className="num">Breakdowns (yr)</th><th className="num">Days off road (yr)</th><th className="num">Spend (yr)</th><th>BER ratio</th></tr></thead>
                <tbody>
                  {watch.map(({ v, s, ratio }) => (
                    <tr key={v.id} className="rowlink" onClick={() => nav(`/vehicles/${v.id}`)}>
                      <td><b className="mono">{v.vehicle_no}</b><div className="muted" style={{ fontSize: 12 }}>{vehicleTitle(v)}</div></td>
                      <td className="num bdcount">{s.breakdownsYear}</td>
                      <td className="num">{Math.round(s.daysOffYear)}</td>
                      <td className="num">{fmtRs(s.costYear, true)}</td>
                      <td style={{ minWidth: 150 }}>
                        {ratio == null ? <span className="muted" style={{ fontSize: 12 }}>value not set</span> : (
                          <div className="mini-ber" title={`${Math.round(ratio)}% of vehicle value spent on repairs (BER at ${BER_THRESHOLD_PCT}%)`}>
                            <div className="mini-ber-track"><div className="mini-ber-fill" style={{ width: `${Math.min(100, (ratio / BER_THRESHOLD_PCT) * 100)}%`, background: ratio >= BER_THRESHOLD_PCT ? 'var(--red)' : ratio >= BER_THRESHOLD_PCT * 0.75 ? 'var(--amber)' : 'var(--green-600)' }} /></div>
                            <span className="mono" style={{ fontSize: 12.5, fontWeight: 700 }}>{Math.round(ratio)}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {watch.length === 0 && <tr className="empty-row"><td colSpan={5}>No breakdowns recorded this year.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="section">
            <h2 className="section-title">Availability by category</h2>
            <div className="card stack-card">
              {byCat.map(({ c, total, off, pct }) => (
                <div className="bar-row" key={c}>
                  <div className="bar-head"><b>{c}</b><span>{pct == null ? '—' : `${pct}%`} · {total - off}/{total}</span></div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${pct || 0}%`, background: pct >= 85 ? 'var(--green-600)' : pct >= 70 ? 'var(--amber)' : 'var(--red)' }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">Off road over {OVERDUE_DAYS} days</h2>
            <div className="card stack-card">
              {overdue.length === 0 && <div className="empty-note">None. Every vehicle in the workshop is within {OVERDUE_DAYS} days.</div>}
              {overdue.map((j) => {
                const v = idx.vehicleById.get(j.vehicle_id);
                return (
                  <Link key={j.id} className="spare-row" to={`/jobs/${j.id}`}>
                    <div>
                      <b>{v?.vehicle_no} · {vehicleTitle(v)}</b>
                      <div className="meta">{faultText(j)}</div>
                      <div style={{ marginTop: 6 }}><StatusChip status={j.status} /></div>
                    </div>
                    <div className="spare-days" style={{ color: 'var(--red)' }}>{fmtDays(jobDays(j))}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
