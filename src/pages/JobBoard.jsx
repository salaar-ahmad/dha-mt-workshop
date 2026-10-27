import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { jobDays, faultText, isOpen } from '../lib/metrics.js';
import { fmtDays, vehicleTitle, toDate } from '../lib/format.js';
import { OVERDUE_DAYS } from '../lib/config.js';

const COLS = [
  { key: 'received', label: 'Received', color: '#52525B', match: (j) => j.status === 'received' },
  { key: 'inspected', label: 'Inspected', color: '#1D4ED8', match: (j) => j.status === 'inspected' },
  { key: 'awaiting', label: 'Awaiting Spares', color: '#8A5B07', match: (j) => j.status === 'awaiting_spares' },
  { key: 'repair', label: 'Under Repair', color: '#C2410C', match: (j) => j.status === 'under_repair' },
  { key: 'final', label: 'Final Insp. / Ready', color: '#6D28D9', match: (j) => j.status === 'final_inspection' || j.status === 'ready' },
  { key: 'released', label: 'Released Today', color: '#15803D', match: (j) => j.status === 'released' && isToday(j.released_at) },
];

function isToday(v) {
  const d = toDate(v);
  if (!d) return false;
  const f = (x) => new Date(x.getTime() + 5 * 3600000).toISOString().slice(0, 10);
  return f(d) === f(new Date());
}

let lastStage = null; // remembers the phone stage tab while moving between pages

export default function JobBoard() {
  const { data, idx, can } = useStore();
  const [q, setQ] = useState('');
  const [stage, setStageRaw] = useState(lastStage);
  const setStage = (k) => { lastStage = k; setStageRaw(k); };
  const query = q.trim().toLowerCase();

  const jobs = data.job_cards.filter((j) => {
    if (!query) return true;
    const v = idx.vehicleById.get(j.vehicle_id);
    return [v?.vehicle_no, vehicleTitle(v), j.job_no, faultText(j)].join(' ').toLowerCase().includes(query);
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Job Board</h1>
          <p>Every vehicle in the workshop, by stage. Tap a card to update it.</p>
        </div>
        <div className="head-actions">
          <div className="search" style={{ minWidth: 240 }}>
            <input type="text" placeholder="Find vehicle or job no…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {can.receive && <Link className="btn btn-primary" to="/new">+ New Job Card</Link>}
        </div>
      </div>

      {(() => {
        const counts = Object.fromEntries(COLS.map((c) => [c.key, jobs.filter(c.match).length]));
        const active = stage || (COLS.find((c) => counts[c.key] > 0) || COLS[0]).key;
        return (
          <>
            <div className="stage-tabs" role="tablist" aria-label="Stage">
              {COLS.map((c) => (
                <button key={c.key} role="tab" aria-selected={active === c.key} className={active === c.key ? 'on' : ''} onClick={() => setStage(c.key)}
                  ref={(el) => { if (el && active === c.key) el.scrollIntoView({ block: 'nearest', inline: 'center' }); }}>
                  <span className="dot" style={{ background: c.color }} />{c.label}<span className="n">{counts[c.key]}</span>
                </button>
              ))}
            </div>
      <div className="board">
        {COLS.map((c) => {
          const list = jobs.filter(c.match).map((j) => ({ j, v: idx.vehicleById.get(j.vehicle_id), days: jobDays(j) }))
            .sort((a, b) => b.days - a.days);
          return (
            <div className={`col${active === c.key ? '' : ' m-hide'}`} key={c.key}>
              <div className="col-head">
                <div><span className="dot" style={{ background: c.color }} /><b>{c.label}</b></div>
                <span className="col-count">{list.length}</span>
              </div>
              {list.length === 0 && <div className="col-empty">Nothing here</div>}
              {list.map(({ j, v, days }) => (
                <Link key={j.id} className="job-card" to={`/jobs/${j.id}`}>
                  <div className="no">
                    {v?.vehicle_no}
                    {j.status === 'ready' && <span className="mini-tag ready">Ready</span>}
                    {j.status === 'under_repair' && j.road_test === 'fail' && <span className="mini-tag fail">Re-work</span>}
                  </div>
                  <div className="type">{vehicleTitle(v)}</div>
                  <div className="fault">{faultText(j)}{j.status === 'released' ? ' (resolved)' : ''}</div>
                  <div className="foot">
                    <span className={`days-badge${days >= OVERDUE_DAYS && isOpen(j) ? ' hot' : ''}`}>{fmtDays(days)}</span>
                    <span className="view-link">View →</span>
                  </div>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
          </>
        );
      })()}
    </>
  );
}
