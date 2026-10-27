import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { vehicleState, breakdownsThisYear, vehicleStats } from '../lib/metrics.js';
import { CATEGORIES } from '../lib/config.js';
import { downloadCSV } from '../lib/csv.js';
import { fmtDays, fmtDate, vehicleTitle } from '../lib/format.js';
import { Chip, Seg } from '../components/ui.jsx';
import VehicleModal from '../components/VehicleModal.jsx';
import ImportVehicles from '../components/ImportVehicles.jsx';

export default function Vehicles() {
  const { data, idx, can } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [stateF, setStateF] = useState('all');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const rows = data.vehicles.map((v) => ({ v, st: vehicleState(idx, v), n: breakdownsThisYear(idx, v.id) }))
    .sort((a, b) => b.n - a.n || a.v.vehicle_no.localeCompare(b.v.vehicle_no));
  const query = q.trim().toLowerCase();
  const shown = rows.filter(({ v, st }) => {
    if (cat !== 'all' && v.category !== cat) return false;
    if (stateF === 'off' && !st.job) return false;
    if (stateF === 'fit' && (st.job || v.is_ber)) return false;
    if (stateF === 'ber' && !v.is_ber) return false;
    if (query && !`${v.vehicle_no} ${vehicleTitle(v)} ${v.section} ${v.chassis_no || ''}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const exportCsv = () => {
    downloadCSV(`vehicle-master-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Vehicle No', 'Category', 'Make', 'Model', 'Year', 'Section', 'Chassis No', 'Engine No', 'Status', 'Breakdowns (this year)', 'Breakdowns (total)', 'Days off road (this year)', 'Repair cost this year (Rs)', 'Lifetime repair cost (Rs)', 'Current value (Rs)', 'Last job date'],
      shown.map(({ v, st, n }) => {
        const s = vehicleStats(idx, v);
        const last = s.jobs[s.jobs.length - 1];
        return [v.vehicle_no, v.category, v.make, v.model, v.year, v.section, v.chassis_no, v.engine_no, st.label, n, s.breakdownsTotal,
          Math.round(s.daysOffYear), Math.round(s.costYear), Math.round(s.costLife), v.current_value, last ? fmtDate(last.received_at) : ''];
      }));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Vehicle Master List</h1>
          <p>Every vehicle on the Phase 6 &amp; 7 fleet strength. Click a row for its full history.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-secondary" onClick={exportCsv}>Export to Excel (CSV)</button>
          {can.editVehicle && <button className="btn btn-secondary" onClick={() => setImporting(true)}>Import from Excel</button>}
          {can.addVehicle && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add Vehicle</button>}
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search"><input type="text" placeholder="Search vehicle no, make, model, section…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Seg options={[{ value: 'all', label: 'All' }, ...CATEGORIES]} value={cat} onChange={setCat} />
        </div>
        <select className="age" value={stateF} onChange={(e) => setStateF(e.target.value)}>
          <option value="all">Any status</option>
          <option value="off">In workshop</option>
          <option value="fit">Fit / on road</option>
          <option value="ber">BER</option>
        </select>
      </div>
      <div className="count-note">Showing {shown.length} of {data.vehicles.length} vehicles</div>

      <div className="card clip table-wrap">
        <table className="stack">
          <thead>
            <tr><th>Vehicle No</th><th>Category</th><th>Make / Model</th><th>Year</th><th>Section</th><th>Current Status</th><th className="num">Breakdowns (yr)</th><th /></tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr className="empty-row"><td colSpan={8}>{data.vehicles.length ? 'No vehicles match this search.' : 'No vehicles yet. Add your fleet with "+ Add Vehicle" or import a CSV in Supabase.'}</td></tr>
            )}
            {shown.map(({ v, st, n }) => (
              <tr key={v.id} className="rowlink" onClick={() => nav(`/vehicles/${v.id}`)}>
                <td className="mono"><b>{v.vehicle_no}</b></td>
                <td><span className="cat-tag">{v.category}</span></td>
                <td>{vehicleTitle(v)}</td>
                <td>{v.year || '—'}</td>
                <td>{v.section || '—'}</td>
                <td>
                  <Chip meta={st} />
                  {st.job && <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{fmtDays((Date.now() - new Date(st.job.received_at)) / 86400000)}</span>}
                </td>
                <td className="num bdcount">{n}</td>
                <td><span className="view">History →</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {importing && <ImportVehicles onClose={() => setImporting(false)} />}
      {adding && <VehicleModal onClose={() => setAdding(false)} onSaved={(v) => nav(`/vehicles/${v.id}`)} />}
    </>
  );
}
