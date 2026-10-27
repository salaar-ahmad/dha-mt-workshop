import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { spareStatus, sparePendingDays, spareCost, SPARE_LABEL } from '../lib/metrics.js';
import { SPARE_SOURCES } from '../lib/config.js';
import { fmtDate, fmtNum, fmtRs } from '../lib/format.js';
import { downloadCSV } from '../lib/csv.js';
import { Seg, useAction } from '../components/ui.jsx';
import { SpareRowCells } from './JobDetail.jsx';
import { updateSpare } from '../lib/actions.js';

function CostCell({ s, run }) {
  const [v, setV] = useState(s.unit_cost ?? '');
  const save = () => {
    const n = v === '' ? null : Number(v);
    if (n === (s.unit_cost ?? null)) return;
    run(() => updateSpare(s.id, { unit_cost: n }), 'Cost saved');
  };
  return (
    <div className="compact" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>Rs</span>
      <input type="number" value={v} placeholder="unit cost" onChange={(e) => setV(e.target.value)} onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} style={{ width: 110, minHeight: 32, padding: '5px 8px', fontSize: 13 }} />
    </div>
  );
}

export default function Spares() {
  const { data, idx, can, canOpen } = useStore();
  const [status, setStatus] = useState('pending');
  const [age, setAge] = useState('all');
  const [source, setSource] = useState('all');
  const [q, setQ] = useState('');
  const [busy, run] = useAction();

  const all = data.spares.map((s) => {
    const j = idx.jobById.get(s.job_card_id);
    return { s, j, v: j && idx.vehicleById.get(j.vehicle_id), st: spareStatus(s), days: sparePendingDays(s) };
  }).sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || String(b.s.demanded_on).localeCompare(String(a.s.demanded_on)));

  const count = (k) => all.filter((r) => r.st === k).length;
  const late = all.filter((r) => r.days != null && r.days >= 7).length;
  const query = q.trim().toLowerCase();

  const rows = all.filter((r) => {
    if (status === 'pending' && r.st === 'received') return false;
    if (!['all', 'pending'].includes(status) && r.st !== status) return false;
    if (age !== 'all' && !(r.days != null && r.days >= Number(age))) return false;
    if (source !== 'all' && r.s.source !== source) return false;
    if (query && !`${r.v?.vehicle_no} ${r.s.part_name} ${r.s.part_no || ''} ${r.j?.job_no}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const exportCsv = () => downloadCSV(`spares-register-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Vehicle No', 'Job No', 'Part', 'Part No', 'Qty', 'Source', 'Unit cost (Rs)', 'Total (Rs)', 'Demanded', 'Approved', 'Received', 'Status', 'Days pending'],
    rows.map(({ s, j, v, st, days }) => [v?.vehicle_no, j?.job_no, s.part_name, s.part_no, s.qty, s.source, s.unit_cost, spareCost(s) || '',
      s.demanded_on, s.approved_on, s.received_on, SPARE_LABEL[st], days ?? '']));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Spares Register</h1>
          <p>{can.procure ? 'Every spare part demand across all job cards. Mark approvals and receipts here as they happen.' : 'Track every spare demanded against your job cards. Procurement updates approvals and receipts.'}</p>
        </div>
        <button className="btn btn-secondary" onClick={exportCsv}>Export to Excel (CSV)</button>
      </div>

      <div className="summary-row">
        <div className="sum-chip"><b>{count('demanded')}</b> Demanded, not approved</div>
        <div className="sum-chip"><b>{count('approved')}</b> Approved, not received</div>
        <div className="sum-chip"><b>{count('received')}</b> Received</div>
        <div className={`sum-chip${late ? ' hot' : ''}`}><b>{late}</b> waiting 7+ days</div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <Seg options={[{ value: 'pending', label: 'Pending' }, { value: 'demanded', label: 'Demanded' }, { value: 'approved', label: 'Approved' }, { value: 'received', label: 'Received' }, { value: 'all', label: 'All' }]}
            value={status} onChange={setStatus} />
          <div className="search" style={{ maxWidth: 260 }}><input type="text" placeholder="Vehicle, part or job no…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="head-actions">
          <select className="age" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="all">All sources</option>
            {SPARE_SOURCES.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select className="age" value={age} onChange={(e) => setAge(e.target.value)}>
            <option value="all">All ages</option>
            <option value="7">Waiting 7+ days</option>
            <option value="14">Waiting 14+ days</option>
          </select>
        </div>
      </div>
      <div className="count-note">Showing {rows.length} of {all.length} demands{busy ? ' · saving…' : ''}</div>

      <div className="card clip table-wrap">
        <table className="spares-table stack">
          <thead>
            <tr><th>Vehicle No</th><th>Part</th><th>Part No.</th><th className="num">Qty</th><th>Source</th><th>Demanded</th><th>Approved</th><th>Received</th><th>Status</th><th>Days Pending</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr className="empty-row"><td colSpan={10}>No spares match these filters.</td></tr>}
            {rows.map(({ s, j, v, days }) => {
              const editable = can.procure && j && !['released', 'ber'].includes(j.status);
              const cls = days == null ? 'days-dash' : days >= 10 ? 'days-hot' : days >= 5 ? 'days-warm' : '';
              return (
                <tr key={s.id}>
                  <td className="mono">{canOpen(`/jobs/${j?.id}`) ? <Link to={`/jobs/${j?.id}`}><b>{v?.vehicle_no}</b></Link> : <b>{v?.vehicle_no}</b>}<div className="muted" style={{ fontSize: 11.5 }}>{j?.job_no}</div></td>
                  <td>{s.part_name}
                    {can.procure
                      ? <CostCell s={s} run={run} />
                      : s.unit_cost ? <div className="muted" style={{ fontSize: 12 }}>{fmtRs(spareCost(s))}</div> : null}
                  </td>
                  <td className="mono">{s.part_no || '—'}</td>
                  <td className="num">{fmtNum(s.qty)}</td>
                  <td>{s.source}</td>
                  <td>{fmtDate(s.demanded_on, false)}</td>
                  <SpareRowCells s={s} editable={editable} run={run} />
                  <td className={`days-cell ${cls}`}>{days == null ? '—' : `${days}d`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
