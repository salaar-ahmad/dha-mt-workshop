import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { vehicleState, vehicleStats, jobDays, jobCost, faultText, isOpen, STATUS } from '../lib/metrics.js';
import { BER_THRESHOLD_PCT, OVERDUE_DAYS } from '../lib/config.js';
import { fmtDate, fmtDays, fmtRs, fmtNum, vehicleTitle, fmtMeter } from '../lib/format.js';
import { downloadCSV } from '../lib/csv.js';
import { Chip, Shield } from '../components/ui.jsx';
import VehicleModal from '../components/VehicleModal.jsx';

export default function VehicleHistory() {
  const { id } = useParams();
  const { idx, can } = useStore();
  const [editing, setEditing] = useState(false);
  const v = idx.vehicleById.get(id);
  if (!v) return <div className="alert warn">Vehicle not found. <Link to="/vehicles">Back to master list</Link></div>;

  const st = vehicleState(idx, v);
  const s = vehicleStats(idx, v);
  const jobs = s.jobs.slice().reverse();
  const value = Number(v.current_value) || 0;
  const ratio = value ? (s.costLife / value) * 100 : null;
  const lastMeter = s.jobs.length ? (s.jobs[s.jobs.length - 1].meter_out ?? s.jobs[s.jobs.length - 1].meter_in) : null;

  const exportCsv = () => downloadCSV(`${v.vehicle_no}-history.csv`,
    ['Job No', 'Received', 'Released', 'Status', 'Fault', 'Diagnosis', 'Repair class', 'Repair by', 'Days in workshop', 'Mechanics', 'Man-hours', 'Spares', 'Cost (Rs)'],
    s.jobs.map((j) => {
      const sp = idx.sparesByJob.get(j.id) || [];
      return [j.job_no, fmtDate(j.received_at), j.released_at ? fmtDate(j.released_at) : '', STATUS[j.status].label, faultText(j), j.diagnosis,
        j.repair_class, j.repair_by, Math.round(jobDays(j) * 10) / 10, j.mechanics, j.man_hours,
        sp.map((x) => `${x.part_name} x${x.qty}`).join('; '), Math.round(jobCost(j, sp))];
    }));

  return (
    <>
      <Link className="back-link" to="/vehicles">← Back to Vehicle Master List</Link>

      <div className="profile">
        <div className="profile-left">
          <div className="vicon"><Shield /></div>
          <div>
            <h1>{v.vehicle_no}</h1>
            <div className="meta">
              {[vehicleTitle(v), v.category, v.year, v.section].filter(Boolean).join(' · ')}
              {v.chassis_no ? ` · Chassis ${v.chassis_no}` : ''}
              {lastMeter != null ? ` · Last reading ${fmtMeter(lastMeter, v.meter_unit)}` : ''}
            </div>
          </div>
        </div>
        <div className="profile-right">
          <Chip meta={st} lg />
          {st.job && <Link className="btn btn-secondary btn-sm" to={`/jobs/${st.job.id}`}>Open job card</Link>}
          {!st.job && can.receive && !v.is_ber && <Link className="btn btn-primary btn-sm" to={`/new?vehicle=${v.id}`}>+ New Job Card</Link>}
          {can.editVehicle && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit Vehicle</button>}
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="kpi-grid tight">
        <div className="kpi"><div className="label">Breakdowns (this yr)</div><div className="value sm">{s.breakdownsYear}</div><div className="sub">{s.breakdownsTotal} on record</div></div>
        <div className="kpi"><div className="label">Days Off-Road (this yr)</div><div className="value sm">{Math.round(s.daysOffYear)}</div></div>
        <div className="kpi"><div className="label">Repair Cost (this yr)</div><div className="value sm">{fmtRs(s.costYear, true)}</div></div>
        <div className="kpi"><div className="label">Mean Days Between Breakdowns</div><div className="value sm">{s.mdbf != null ? Math.round(s.mdbf) : '—'}</div></div>
        <div className="kpi" style={s.repeatCount ? { borderTopColor: 'var(--amber)' } : null}><div className="label">Repeat Faults within 30 Days</div><div className="value sm">{s.repeatCount}</div></div>
      </div>

      <div className="section">
        <h2 className="section-title">Beyond Economical Repair (BER) Indicator</h2>
        <div className="card pad">
          {value ? (
            <>
              <div className="ber-row">
                <span>Vehicle current value: <b>{fmtRs(value)}</b></span>
                <span>Cumulative repair cost (on record): <b>{fmtRs(s.costLife)}</b></span>
                <span>Ratio: <b>{Math.round(ratio)}%</b></span>
              </div>
              <div className="ber-track">
                <div className={`ber-fill${ratio >= BER_THRESHOLD_PCT ? ' over' : ratio >= BER_THRESHOLD_PCT * 0.75 ? ' warn' : ''}`} style={{ width: `${Math.min(100, ratio)}%` }} />
                <div className="ber-threshold" style={{ left: `${BER_THRESHOLD_PCT}%` }} />
                <div className="ber-threshold-label" style={{ left: `${BER_THRESHOLD_PCT}%` }}>BER threshold {BER_THRESHOLD_PCT}%</div>
              </div>
              <p className="ber-note">
                {ratio >= BER_THRESHOLD_PCT
                  ? 'Repair spend has crossed the BER threshold. Consider putting this vehicle up to the condemnation board.'
                  : ratio >= BER_THRESHOLD_PCT * 0.75
                    ? 'Repair spend is approaching the BER threshold. Watch the next few repairs closely.'
                    : 'Repair spend is well below the BER threshold. Continued repair is economical.'}
              </p>
            </>
          ) : (
            <p className="ber-note" style={{ marginTop: 0 }}>
              Add this vehicle's current value to see how close it is to BER.{' '}
              {can.editVehicle && <button className="linkbtn" onClick={() => setEditing(true)}>Set value</button>}
            </p>
          )}
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">Job Card History</h2>
        <div className="card pad">
          {jobs.length === 0 && <div className="empty-note">No workshop visits recorded for this vehicle yet.</div>}
          <div className="timeline">
            {jobs.map((j) => {
              const sp = idx.sparesByJob.get(j.id) || [];
              const cost = jobCost(j, sp);
              const d = jobDays(j);
              const rep = s.repeats.get(j.id);
              return (
                <Link key={j.id} className="tl-item" to={`/jobs/${j.id}`}>
                  <div className={`tl-dot${isOpen(j) ? ' open' : j.status === 'ber' ? ' ber' : ''}`} />
                  <div className="tl-body">
                    <div className="tl-top">
                      <span className="tl-job">Job #{j.job_no}</span>
                      <span className="tl-dates">{fmtDate(j.received_at)} – {isOpen(j) ? 'ongoing' : fmtDate(j.released_at || j.inspected_at)}</span>
                    </div>
                    <div className="tl-fault">{faultText(j)}</div>
                    <div className="tl-meta">
                      {[j.repair_class && `${j.repair_class} repair`, `${fmtDays(d)}${isOpen(j) ? ' so far' : ''}`, STATUS[j.status].label,
                        sp.length ? `${sp.length} spare${sp.length > 1 ? 's' : ''}` : null, j.man_hours ? `${fmtNum(j.man_hours)} man-hrs` : null,
                        j.fail_count ? `${j.fail_count} road-test fail` : null].filter(Boolean).join(' · ')}
                    </div>
                    {rep?.same && <span className="tl-flag">⚠ Returned within {rep.gap} days with the same fault</span>}
                    {isOpen(j) && d >= OVERDUE_DAYS && <span className="tl-flag" style={{ marginLeft: rep?.same ? 6 : 0 }}>Off road {Math.floor(d)} days</span>}
                  </div>
                  <div className="tl-cost">{cost ? fmtRs(cost) : '—'}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {editing && <VehicleModal vehicle={v} onClose={() => setEditing(false)} />}
    </>
  );
}
