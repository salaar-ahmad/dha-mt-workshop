import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import {
  STATUS, timeInStatus, jobDays, faultText, spareStatus, SPARE_LABEL, sparePendingDays, spareCost,
} from '../lib/metrics.js';
import {
  fmtDateTime, fmtDate, fmtDur, fmtMeter, fmtRs, fmtNum, toLocalInput, fromLocalInput, todayISO, vehicleTitle,
} from '../lib/format.js';
import { FAULTS, REPAIR_BY, REPAIR_CLASSES, SPARE_SOURCES, RELEASE_CHECKS, OVERDUE_DAYS } from '../lib/config.js';
import * as A from '../lib/actions.js';
import { Checklist, FuelPicker, Seg, StatusChip, SuggestInput, useAction, askConfirm } from '../components/ui.jsx';

const STAGES = ['Received', 'Technical Inspection', 'Spares', 'Repair', 'Final Inspection', 'Release'];

export default function JobDetail() {
  const { id } = useParams();
  const { idx, data, user, can, canWrite, canCorrect, canOpen } = useStore();
  const nav = useNavigate();
  const [editing, setEditing] = useState(null);
  const [busy, run] = useAction();

  const job = idx.jobById.get(id);
  if (!job) return <div className="alert warn">Job card not found. It may have been deleted. <Link to="/jobs">Back to Job Board</Link></div>;
  const v = idx.vehicleById.get(job.vehicle_id);
  const spares = idx.sparesByJob.get(job.id) || [];
  const events = idx.eventsByJob.get(job.id) || [];
  const tis = timeInStatus(job, events);
  const total = jobDays(job);
  const isBer = job.status === 'ber';
  const cur = STATUS[job.status].stage;

  const names = (k) => data.job_cards.map((j) => j[k]);
  const mechanicNames = data.job_cards.flatMap((j) => String(j.mechanics || '').split(',').map((s) => s.trim()));
  const inspectorNames = [...names('inspected_by'), ...names('final_inspector')];

  const state = (n) => {
    if (n === 1) return 'done';
    if (isBer) return n === 2 ? 'ber' : 'skipped';
    if (n < cur) return 'done';
    if (n === cur) return 'current';
    return 'pending';
  };

  const stageMeta = {
    1: [job.received_at, job.received_by && `Clerk ${job.received_by}`],
    2: [job.inspected_at, job.inspected_by],
    3: [spares.length ? spares[spares.length - 1].created_at : null, spares.length ? `${spares.length} item${spares.length > 1 ? 's' : ''}` : 'No spares'],
    4: [job.repair_completed_at || job.repair_started_at, job.mechanics],
    5: [job.final_inspected_at, job.final_inspector],
    6: [job.released_at, job.released_by && `Released by ${job.released_by}`],
  };

  const editLink = (n) => canCorrect && state(n) === 'done' && n !== 3 && editing !== n
    ? <button className="linkbtn" onClick={() => setEditing(n)}>Correct</button> : null;
  const done = () => setEditing(null);

  const body = (n) => {
    const s = state(n);
    if (s === 'skipped') return <div className="locked-box">Not applicable: vehicle recommended Beyond Economical Repair.</div>;
    if (s === 'pending') return <div className="locked-box">Locked. Complete {STAGES[n - 2]} first.</div>;
    const canAct = canWrite && s === 'current';
    switch (n) {
      case 1:
        return editing === 1
          ? <ReceiptForm job={job} busy={busy} onCancel={done} onSave={(p) => run(() => A.correctJob(job, p), 'Receipt corrected').then(done)} drivers={names('brought_by')} />
          : <ReceiptSummary job={job} />;
      case 2:
        if (editing === 2 || canAct) {
          return <InspectionForm job={job} busy={busy} inspectors={inspectorNames} correcting={editing === 2} onCancel={done}
            onSave={(f) => editing === 2
              ? run(() => A.correctJob(job, f), 'Inspection corrected').then(done)
              : run(() => A.saveInspection(user, job, f), f.repair_by === 'Recommend BER' ? 'Job closed as BER recommendation' : 'Inspection saved. Now record spares.')} />;
        }
        if (s === 'current') return <div className="locked-box">Waiting for technical inspection.</div>;
        return <InspectionSummary job={job} />;
      case 3:
        return <SparesStage job={job} spares={spares} current={canAct} canDemand={can.demandSpares} canProcure={can.procure} canRemoveAny={can.correct} busy={busy} run={run} user={user} />;
      case 4:
        if (editing === 4 || canAct) {
          return <RepairForm job={job} busy={busy} mechanics={mechanicNames} correcting={editing === 4} onCancel={done}
            onProgress={(f) => run(() => A.saveRepairProgress(job, f), 'Progress saved')}
            onMoreSpares={() => run(() => A.moreSparesNeeded(user, job), 'Moved back to Awaiting Spares')}
            onSave={(f) => editing === 4
              ? run(() => A.correctJob(job, f), 'Repair record corrected').then(done)
              : run(() => A.completeRepair(user, job, f), 'Sent for final inspection')} />;
        }
        if (s === 'current') return <div className="locked-box">Repair in progress.</div>;
        return <RepairSummary job={job} />;
      case 5:
        if (editing === 5 || canAct) {
          return <FinalForm job={job} busy={busy} inspectors={inspectorNames} correcting={editing === 5} onCancel={done}
            onSave={(f) => run(() => A.correctJob(job, f), 'Final inspection corrected').then(done)}
            onResult={(f, pass) => run(() => A.finalInspection(user, job, f, pass), pass ? 'Passed. Ready for release.' : 'Failed. Sent back to repair.')} />;
        }
        if (s === 'current') return <div className="locked-box">Awaiting final inspection.</div>;
        return <FinalSummary job={job} />;
      case 6:
        if (editing === 6 || canAct) {
          return <ReleaseForm job={job} busy={busy} correcting={editing === 6} onCancel={done}
            onSave={(f) => editing === 6
              ? run(() => A.correctJob(job, f), 'Release corrected').then(done)
              : run(() => A.releaseVehicle(user, job, f), `${v?.vehicle_no} released`)} />;
        }
        if (s === 'current') return <div className="locked-box">Ready for release.</div>;
        return <ReleaseSummary job={job} />;
      default: return null;
    }
  };

  const delJob = async () => {
    if (!(await askConfirm(`Delete job card ${job.job_no}? This removes its spares and history too. Use only for cards opened by mistake.`, 'Delete job card', true))) return;
    await run(() => A.deleteJob(job), 'Job card deleted');
    nav('/jobs');
  };

  const sparesTotal = spares.reduce((s, x) => s + spareCost(x), 0);
  const failedBack = job.status === 'under_repair' && job.road_test === 'fail';

  return (
    <>
      <Link className="back-link" to="/jobs">← Back to Job Board</Link>
      <div className="job-head">
        <div>
          <h1>{v?.vehicle_no}</h1>
          <div className="sub">{vehicleTitle(v)} · {v?.category} · {job.section || v?.section}</div>
          <div className="jobno">Job Card {job.job_no}</div>
        </div>
        <StatusChip status={job.status} lg />
      </div>

      <div className="layout">
        <div className="card stepper">
          {failedBack && (
            <div className="alert err">Returned from Final Inspection: road test failed{job.final_remarks ? ` (${job.final_remarks})` : ''}. Recheck the repair before resubmitting.</div>
          )}
          {isBer && <div className="alert err">Inspection recommended Beyond Economical Repair. This job card is closed and the vehicle is marked BER in the master list.</div>}
          {STAGES.map((title, i) => {
            const n = i + 1;
            const s = state(n);
            const [at, who] = stageMeta[n];
            const last = n === STAGES.length;
            const filled = s === 'done' && (state(n + 1) === 'done' || state(n + 1) === 'current');
            return (
              <div className="step" key={n}>
                <div className="step-rail">
                  <div className={`step-dot ${s === 'skipped' ? 'pending' : s}`}>{s === 'done' ? '✓' : s === 'ber' ? '!' : n}</div>
                  {!last && <div className={`step-line${filled ? ' filled' : ''}`} />}
                </div>
                <div className="step-content">
                  <div className="step-title-row">
                    <span className={`step-title${s === 'pending' || s === 'skipped' ? ' pending-title' : ''}`}>{n} · {title}</span>
                    <span className="step-meta">
                      {s === 'done' || s === 'ber' ? <>{fmtDateTime(at)}{who ? ` · ${who}` : ''}</> : s === 'current' ? 'In progress' : 'Not started'}
                      {editLink(n)}
                    </span>
                  </div>
                  <div className="step-body">{body(n)}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card side-card">
          <h2 className="side-title">Time in Workshop</h2>
          <div className="stat-row"><span className="l">Total days in workshop</span><span className={`v${total >= OVERDUE_DAYS && !['released', 'ber'].includes(job.status) ? ' hot' : ''}`}>{fmtDur(total)}</span></div>
          <div className="stat-row"><span className="l">Waiting for inspection</span><span className="v">{fmtDur(tis.received || 0)}</span></div>
          <div className="stat-row"><span className="l">Awaiting spares</span><span className={`v${(tis.awaiting_spares || 0) + (tis.inspected || 0) > 3 ? ' flag' : ''}`}>{fmtDur((tis.awaiting_spares || 0) + (tis.inspected || 0))}</span></div>
          <div className="stat-row"><span className="l">Under repair</span><span className="v">{fmtDur(tis.under_repair || 0)}</span></div>
          <div className="stat-row"><span className="l">Final inspection &amp; release</span><span className="v">{fmtDur((tis.final_inspection || 0) + (tis.ready || 0))}</span></div>
          <div className="divider" />
          <h2 className="side-title">Work &amp; Cost</h2>
          <div className="stat-row"><span className="l">Man-hours</span><span className="v">{job.man_hours != null ? `${fmtNum(job.man_hours)}${job.est_hours ? ` / ${fmtNum(job.est_hours)}` : ''}` : '—'}</span></div>
          <div className="stat-row"><span className="l">Spares cost</span><span className="v">{sparesTotal ? fmtRs(sparesTotal) : '—'}</span></div>
          <div className="stat-row"><span className="l">Outsourced / labour</span><span className="v">{job.external_cost ? fmtRs(job.external_cost) : '—'}</span></div>
          <div className="stat-row"><span className="l">Road test failures</span><span className={`v${job.fail_count ? ' hot' : ''}`}>{job.fail_count || 0}</span></div>
          <div className="divider" />
          <Link className="side-btn" to={`/print/job/${job.id}`}>🖶 Print Job Card</Link>
          {job.status === 'released' && <Link className="side-btn" to={`/print/release/${job.id}`}>🖶 Print Release Note</Link>}
          {canOpen(`/vehicles/${job.vehicle_id}`) && <Link className="side-btn" to={`/vehicles/${job.vehicle_id}`}>Vehicle History →</Link>}

          <div className="divider" />
          <h2 className="side-title">Stage History</h2>
          <ul className="events">
            {events.slice().reverse().map((e) => (
              <li key={e.id}>
                <b>{STATUS[e.to_status]?.label || e.to_status}</b> · {fmtDateTime(e.at)}{e.by_name ? ` · ${e.by_name}` : ''}
                {e.note && <div>{e.note}</div>}
              </li>
            ))}
          </ul>
          {can.deleteJob && (
            <>
              <div className="divider" />
              <button className="linkbtn danger" onClick={delJob} disabled={busy}>Delete this job card (opened by mistake)</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Summary({ items }) {
  return (
    <div className="summary-grid">
      {items.filter(Boolean).map(([k, val]) => <div key={k}><b>{k}</b><span>{val || '—'}</span></div>)}
    </div>
  );
}

function ReceiptSummary({ job }) {
  return (
    <>
      <Summary items={[
        ['Odometer / Hours', fmtMeter(job.meter_in, job.meter_unit)],
        ['Fuel Level', job.fuel_in],
        ['Fault Reported', faultText(job)],
        ['Brought By', job.brought_by],
        (job.kit || []).length ? ['Kit Received', job.kit.join(', ')] : null,
      ]} />
      {job.remarks && <div className="diagnosis-box" style={{ marginTop: 12, marginBottom: 0 }}>Remarks: {job.remarks}</div>}
    </>
  );
}

function ReceiptForm({ job, busy, onSave, onCancel, drivers }) {
  const [f, setF] = useState({
    received_at: toLocalInput(job.received_at), meter_in: job.meter_in ?? '', meter_unit: job.meter_unit, fuel_in: job.fuel_in,
    fault_category: job.fault_category || '', fault_detail: job.fault_detail || '', brought_by: job.brought_by || '', remarks: job.remarks || '',
  });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  return (
    <div className="sub-form">
      <div className="grid-2">
        <div className="field"><label>Date &amp; Time Received</label><input type="datetime-local" value={f.received_at} onChange={set('received_at')} /></div>
        <div className="field"><label>Odometer / Hours</label>
          <div className="unit-input"><input type="number" value={f.meter_in} onChange={set('meter_in')} />
            <Seg options={[{ value: 'km', label: 'KM' }, { value: 'hrs', label: 'Hrs' }]} value={f.meter_unit} onChange={set('meter_unit')} /></div>
        </div>
      </div>
      <div className="field"><label>Fuel Level</label><FuelPicker value={f.fuel_in} onChange={set('fuel_in')} /></div>
      <div className="grid-2">
        <div className="field"><label>Fault</label>
          <select value={f.fault_category} onChange={set('fault_category')}>
            {FAULTS.map((x) => <option key={x}>{x}</option>)}<option value="Other">Other</option>
          </select>
          <input type="text" style={{ marginTop: 8 }} value={f.fault_detail} onChange={set('fault_detail')} placeholder="Detail" />
        </div>
        <div className="field"><label>Brought By</label><SuggestInput value={f.brought_by} onChange={set('brought_by')} suggestions={drivers} /></div>
      </div>
      <div className="field"><label>Remarks</label><textarea value={f.remarks} onChange={set('remarks')} /></div>
      <div className="step-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => onSave({
          ...f, received_at: fromLocalInput(f.received_at), meter_in: f.meter_in === '' ? null : Number(f.meter_in),
        })}>Save Correction</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function InspectionSummary({ job }) {
  return (
    <>
      {job.diagnosis && <div className="diagnosis-box">{job.diagnosis}</div>}
      <Summary items={[
        ['Repair Class', job.repair_class], ['Repair By', job.repair_by],
        ['Estimated Hours', job.est_hours != null ? `${fmtNum(job.est_hours)} hrs` : '—'],
      ]} />
    </>
  );
}

function InspectionForm({ job, busy, onSave, inspectors, correcting, onCancel }) {
  const [f, setF] = useState({
    inspected_at: toLocalInput(job.inspected_at || new Date()), diagnosis: job.diagnosis || '',
    repair_class: job.repair_class || '', repair_by: job.repair_by || 'In-house', est_hours: job.est_hours ?? '',
    inspected_by: job.inspected_by || '',
  });
  const [err, setErr] = useState('');
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const ber = f.repair_by === 'Recommend BER';
  const submit = async () => {
    if (!f.diagnosis.trim()) return setErr('Write what the inspector found.');
    if (!f.repair_class) return setErr('Select the repair class.');
    if (!f.inspected_by.trim()) return setErr("Enter the inspector's name.");
    if (ber && !correcting && !(await askConfirm('Recommend this vehicle as Beyond Economical Repair? The job card will close and the vehicle will be marked BER.', 'Recommend BER', true))) return;
    setErr('');
    onSave({ ...f, inspected_at: fromLocalInput(f.inspected_at), est_hours: f.est_hours === '' ? null : Number(f.est_hours), inspected_by: f.inspected_by.trim() });
  };
  return (
    <div className={correcting ? 'sub-form' : ''}>
      {err && <div className="alert err">{err}</div>}
      <div className="field"><label>Diagnosis / Inspector's Findings<span className="req">*</span></label>
        <textarea value={f.diagnosis} onChange={set('diagnosis')} placeholder="What is wrong and what needs to be done" /></div>
      <div className="field"><label>Repair Class<span className="req">*</span></label>
        <Seg block options={REPAIR_CLASSES} value={f.repair_class} onChange={set('repair_class')} /></div>
      <div className="field"><label>Repair By</label>
        <Seg block danger={ber} options={REPAIR_BY} value={f.repair_by} onChange={set('repair_by')} />
        {ber && <div className="hint err">This will close the job card and mark the vehicle BER for the condemnation board.</div>}
      </div>
      <div className="grid-3">
        <div className="field"><label>Estimated Hours</label><input type="number" value={f.est_hours} onChange={set('est_hours')} placeholder="e.g. 8" /></div>
        <div className="field"><label>Inspected By<span className="req">*</span></label><SuggestInput value={f.inspected_by} onChange={set('inspected_by')} suggestions={inspectors} placeholder="Inspector name" /></div>
        <div className="field"><label>Date &amp; Time</label><input type="datetime-local" value={f.inspected_at} onChange={set('inspected_at')} /></div>
      </div>
      <div className="step-actions">
        <button className={`btn ${ber && !correcting ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={submit}>
          {correcting ? 'Save Correction' : ber ? 'Recommend BER & Close Job' : 'Save Inspection → Spares'}
        </button>
        {correcting && <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

/* ---------- Spares ---------- */

function DateCell({ value, editable, onSet, label }) {
  const [edit, setEdit] = useState(false);
  if (!editable) return <>{value ? fmtDate(value, false) : '—'}</>;
  if (!value) {
    return (
      <div className="date-cell">
        <button className="btn btn-secondary btn-sm" onClick={() => onSet(todayISO())}>{label} today</button>
        <button className="linkbtn" title="Pick another date" onClick={() => setEdit(true)}>other</button>
        {edit && <input type="date" autoFocus onChange={(e) => { if (e.target.value) { onSet(e.target.value); setEdit(false); } }} onBlur={() => setEdit(false)} />}
      </div>
    );
  }
  if (edit) {
    return (
      <div className="date-cell">
        <input type="date" autoFocus defaultValue={value} onBlur={(e) => { setEdit(false); if (e.target.value !== value) onSet(e.target.value || null); }} />
      </div>
    );
  }
  return (
    <div className="date-cell">
      <span className="dtxt">{fmtDate(value, false)}</span>
      <button className="linkbtn" title="Change date" onClick={() => setEdit(true)} style={{ fontSize: 12 }}>✎</button>
    </div>
  );
}

export function SpareRowCells({ s, editable, run }) {
  const st = spareStatus(s);
  return (
    <>
      <td><DateCell value={s.approved_on} editable={editable} label="Approved" onSet={(d) => run(() => A.updateSpare(s.id, { approved_on: d }))} /></td>
      <td><DateCell value={s.received_on} editable={editable} label="Received" onSet={(d) => run(() => A.updateSpare(s.id, { received_on: d, approved_on: s.approved_on || d }))} /></td>
      <td><span className={`chip chip-sp-${st}`}>{SPARE_LABEL[st]}</span></td>
    </>
  );
}

function SparesStage({ job, spares, current, canDemand, canProcure, canRemoveAny, busy, run, user }) {
  const { data } = useStore();
  const [adding, setAdding] = useState(false);
  const pending = spares.filter((s) => !s.received_on);
  const open = !['released', 'ber'].includes(job.status);
  const editable = canDemand && open;
  const procurable = canProcure && open;
  const canRemove = (s) => editable && (canRemoveAny || (!s.approved_on && !s.received_on));
  const partNames = data.spares.map((s) => s.part_name);

  return (
    <>
      {spares.length > 0 ? (
        <div className="table-wrap">
          <table className="spares-table stack">
            <thead><tr><th>Part</th><th>Part No.</th><th className="num">Qty</th><th>Source</th><th>Demanded</th><th>Approved</th><th>Received</th><th>Status</th>{editable && <th />}</tr></thead>
            <tbody>
              {spares.map((s) => (
                <tr key={s.id}>
                  <td>{s.part_name}{s.unit_cost ? <div className="muted" style={{ fontSize: 12 }}>{fmtRs(spareCost(s))}</div> : null}</td>
                  <td className="mono">{s.part_no || '—'}</td>
                  <td className="num">{fmtNum(s.qty)}</td>
                  <td>{s.source}</td>
                  <td>{fmtDate(s.demanded_on, false)}{!s.received_on && <div className="muted" style={{ fontSize: 12 }}>{sparePendingDays(s)}d pending</div>}</td>
                  <SpareRowCells s={s} editable={procurable} run={run} />
                  {editable && <td>{canRemove(s) && <button className="linkbtn danger" title="Remove" onClick={async () => (await askConfirm(`Remove ${s.part_name} from this job?`, 'Remove spare', true)) && run(() => A.deleteSpare(s.id), 'Spare removed')}>✕</button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !current && <div className="locked-box">No spares were demanded for this job.</div>
      )}

      {editable && (adding || (current && spares.length === 0)) && (
        <AddSpareForm busy={busy} partNames={partNames} first={spares.length === 0}
          onCancel={spares.length ? () => setAdding(false) : null}
          onAdd={(f) => run(() => A.addSpare(job, f), `${f.part_name} demanded`).then(() => setAdding(false))} />
      )}
      {editable && !adding && spares.length > 0 && (
        <div style={{ marginTop: 12 }}><button className="linkbtn" onClick={() => setAdding(true)}>+ Demand another spare</button></div>
      )}

      {current && (
        <div className="step-actions">
          {job.status === 'inspected' && spares.length === 0 && (
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => A.startRepair(user, job, new Date().toISOString(), 'No spares required'), 'Repair started')}>No Spares Needed → Start Repair</button>
          )}
          {job.status === 'inspected' && spares.length > 0 && pending.length > 0 && (
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => A.markAwaitingSpares(user, job), 'Marked as Awaiting Spares')}>Demand Raised → Awaiting Spares</button>
          )}
          {spares.length > 0 && pending.length === 0 && (
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => A.startRepair(user, job, new Date().toISOString()), 'All spares received. Repair started.')}>All Spares Received → Start Repair</button>
          )}
          {job.status === 'awaiting_spares' && pending.length > 0 && (
            <>
              <span className="hint" style={{ margin: 0 }}>{pending.length} spare{pending.length > 1 ? 's' : ''} still pending.</span>
              <button className="linkbtn" disabled={busy} onClick={async () => (await askConfirm('Start repair while some spares are still pending?', 'Start repair')) && run(() => A.startRepair(user, job, new Date().toISOString(), `Started with ${pending.length} spare(s) pending`), 'Repair started')}>Start repair anyway</button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function AddSpareForm({ onAdd, onCancel, busy, partNames, first }) {
  const blank = { part_name: '', part_no: '', qty: 1, source: 'Store', unit_cost: '', demanded_on: todayISO() };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const submit = () => {
    if (!f.part_name.trim()) return setErr('Enter the part name.');
    if (!(Number(f.qty) > 0)) return setErr('Quantity must be at least 1.');
    setErr('');
    onAdd({ ...f, part_name: f.part_name.trim(), qty: Number(f.qty) });
    setF(blank);
  };
  return (
    <div className="sub-form">
      <div className="sub-form-title">{first ? 'Demand a spare (skip if none needed)' : 'Demand another spare'}</div>
      {err && <div className="alert err">{err}</div>}
      <div className="grid-2">
        <div className="field"><label>Part Name<span className="req">*</span></label><SuggestInput value={f.part_name} onChange={set('part_name')} suggestions={partNames} placeholder="e.g. Clutch plate" /></div>
        <div className="field"><label>Part No.</label><input type="text" value={f.part_no} onChange={set('part_no')} placeholder="optional" /></div>
      </div>
      <div className="field"><label>Source</label><Seg block options={SPARE_SOURCES} value={f.source} onChange={set('source')} /></div>
      <div className="grid-3">
        <div className="field"><label>Qty</label><input type="number" min="1" value={f.qty} onChange={set('qty')} /></div>
        <div className="field"><label>Unit Cost (Rs)</label><input type="number" value={f.unit_cost} onChange={set('unit_cost')} placeholder="optional" /></div>
        <div className="field"><label>Demand Date</label><input type="date" value={f.demanded_on} onChange={set('demanded_on')} /></div>
      </div>
      <div className="step-actions" style={{ marginTop: 6 }}>
        <button className="btn btn-secondary" disabled={busy} onClick={submit}>+ Add Spare Demand</button>
        {onCancel && <button className="linkbtn" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

/* ---------- Repair ---------- */

function RepairSummary({ job }) {
  return (
    <>
      {job.work_done && <div className="diagnosis-box">{job.work_done}</div>}
      <Summary items={[
        ['Mechanic(s)', job.mechanics], ['Man-Hours', job.man_hours != null ? `${fmtNum(job.man_hours)} hrs` : '—'],
        job.external_cost ? ['Outsourced Cost', fmtRs(job.external_cost)] : null,
        ['Started', fmtDateTime(job.repair_started_at)],
      ]} />
    </>
  );
}

function RepairForm({ job, busy, onSave, onProgress, onMoreSpares, mechanics, correcting, onCancel }) {
  const [f, setF] = useState({
    mechanics: job.mechanics || '', work_done: job.work_done || '', man_hours: job.man_hours ?? '',
    external_cost: job.external_cost ?? '', repair_completed_at: toLocalInput(job.repair_completed_at || new Date()),
  });
  const [err, setErr] = useState('');
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const clean = () => ({
    mechanics: f.mechanics.trim(), work_done: f.work_done.trim(),
    man_hours: f.man_hours === '' ? null : Number(f.man_hours),
    external_cost: f.external_cost === '' ? null : Number(f.external_cost),
    repair_completed_at: fromLocalInput(f.repair_completed_at),
  });
  const submit = () => {
    if (!f.mechanics.trim()) return setErr('Enter the mechanic(s) who did the work.');
    if (!f.work_done.trim()) return setErr('Describe the work done.');
    setErr('');
    onSave(clean());
  };
  const outsourced = job.repair_by === 'Outsourced';
  return (
    <div className={correcting ? 'sub-form' : ''}>
      {err && <div className="alert err">{err}</div>}
      <div className="field"><label>Mechanic(s) Assigned<span className="req">*</span></label>
        <SuggestInput value={f.mechanics} onChange={set('mechanics')} suggestions={mechanics} placeholder="Separate names with commas" /></div>
      <div className="field"><label>Work Done<span className="req">*</span></label><textarea value={f.work_done} onChange={set('work_done')} /></div>
      <div className="grid-3">
        <div className="field"><label>Man-Hours</label><input type="number" value={f.man_hours} onChange={set('man_hours')} />
          {job.est_hours ? <div className="hint">of {fmtNum(job.est_hours)} hrs estimated</div> : null}</div>
        <div className="field"><label>{outsourced ? 'Outsourced Cost (Rs)' : 'Labour / Other Cost (Rs)'}</label><input type="number" value={f.external_cost} onChange={set('external_cost')} placeholder="optional" /></div>
        <div className="field"><label>Completed On</label><input type="datetime-local" value={f.repair_completed_at} onChange={set('repair_completed_at')} /></div>
      </div>
      <div className="step-actions">
        <button className="btn btn-primary" disabled={busy} onClick={submit}>{correcting ? 'Save Correction' : 'Mark Repair Complete → Final Inspection'}</button>
        {correcting
          ? <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          : <>
            <button className="btn btn-secondary" disabled={busy} onClick={() => onProgress(clean())}>Save Progress</button>
            <button className="linkbtn" disabled={busy} onClick={async () => (await askConfirm('Move this job back to Awaiting Spares to demand more parts?', 'Move back')) && onMoreSpares()}>Need more spares?</button>
          </>}
      </div>
    </div>
  );
}

/* ---------- Final inspection ---------- */

function FinalSummary({ job }) {
  return <Summary items={[
    ['Inspector', job.final_inspector], ['Road Test', job.road_test === 'pass' ? 'Pass' : job.road_test === 'fail' ? 'Fail' : '—'],
    job.final_remarks ? ['Remarks', job.final_remarks] : null,
    job.fail_count ? ['Earlier failures', job.fail_count] : null,
  ]} />;
}

function FinalForm({ job, busy, onResult, onSave, inspectors, correcting, onCancel }) {
  const [f, setF] = useState({
    final_inspector: correcting ? job.final_inspector || '' : '', final_remarks: correcting ? job.final_remarks || '' : '',
    final_inspected_at: toLocalInput(correcting ? job.final_inspected_at : new Date()),
  });
  const [err, setErr] = useState('');
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const mechs = String(job.mechanics || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const clash = f.final_inspector.trim() && mechs.includes(f.final_inspector.trim().toLowerCase());
  const go = (pass) => {
    if (!f.final_inspector.trim()) return setErr("Enter the inspector's name.");
    if (clash) return setErr('The inspector must be a different person from the mechanic who did the repair.');
    if (!pass && !f.final_remarks.trim()) return setErr('Write why it failed so the mechanic knows what to fix.');
    setErr('');
    const out = { ...f, final_inspector: f.final_inspector.trim(), final_inspected_at: fromLocalInput(f.final_inspected_at) };
    correcting ? onSave(out) : onResult(out, pass);
  };
  return (
    <div className={correcting ? 'sub-form' : ''}>
      {err && <div className="alert err">{err}</div>}
      <div className="grid-2">
        <div className="field"><label>Inspector Name<span className="req">*</span></label>
          <SuggestInput value={f.final_inspector} onChange={set('final_inspector')} suggestions={inspectors} className={clash ? 'invalid' : ''} />
          <div className={`hint${clash ? ' err' : ''}`}>Must be different from the mechanic(s): {job.mechanics || '—'}</div></div>
        <div className="field"><label>Date &amp; Time</label><input type="datetime-local" value={f.final_inspected_at} onChange={set('final_inspected_at')} /></div>
      </div>
      <div className="field"><label>Remarks</label><input type="text" value={f.final_remarks} onChange={set('final_remarks')} placeholder="Required if the road test fails" /></div>
      {correcting ? (
        <div className="step-actions">
          <button className="btn btn-primary" disabled={busy} onClick={() => go(true)}>Save Correction</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      ) : (
        <div className="field"><label>Road Test Result</label>
          <div className="grid-2">
            <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => go(true)}>✓ Pass → Ready for Release</button>
            <button className="btn btn-ghost-danger btn-lg" disabled={busy} onClick={() => go(false)}>✕ Fail → Back to Repair</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Release ---------- */

function ReleaseSummary({ job }) {
  return (
    <>
      <Summary items={[
        ['Odometer Out', fmtMeter(job.meter_out, job.meter_unit)], ['Fuel Out', job.fuel_out],
        ['Handed To', job.handed_to], ['Checks', `${(job.release_checks || []).length} of ${RELEASE_CHECKS.length}`],
      ]} />
      {job.release_remarks && <div className="diagnosis-box" style={{ marginTop: 12, marginBottom: 0 }}>{job.release_remarks}</div>}
    </>
  );
}

function ReleaseForm({ job, busy, onSave, correcting, onCancel }) {
  const [f, setF] = useState({
    meter_out: job.meter_out ?? '', fuel_out: job.fuel_out || job.fuel_in || '', handed_to: job.handed_to || job.brought_by || '',
    release_checks: correcting ? job.release_checks || [] : [], release_remarks: job.release_remarks || '',
    released_at: toLocalInput(job.released_at || new Date()),
  });
  const [err, setErr] = useState('');
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  const submit = async () => {
    if (f.meter_out === '') return setErr('Enter the odometer / hours reading at release.');
    if (job.meter_in != null && Number(f.meter_out) < Number(job.meter_in)) return setErr(`Reading out is lower than reading in (${fmtMeter(job.meter_in, job.meter_unit)}).`);
    if (!f.handed_to.trim()) return setErr('Enter who the vehicle is handed to.');
    if (f.release_checks.length < RELEASE_CHECKS.length && !(await askConfirm('Not all joint inspection checks are ticked. Release anyway?', 'Release anyway'))) return;
    setErr('');
    onSave({ ...f, meter_out: Number(f.meter_out), handed_to: f.handed_to.trim(), released_at: fromLocalInput(f.released_at) });
  };
  return (
    <div className={correcting ? 'sub-form' : ''}>
      {err && <div className="alert err">{err}</div>}
      <div className="grid-3">
        <div className="field"><label>Odometer / Hours Out<span className="req">*</span></label><input type="number" value={f.meter_out} onChange={set('meter_out')} />
          <div className="hint">In: {fmtMeter(job.meter_in, job.meter_unit)}</div></div>
        <div className="field"><label>Handed To<span className="req">*</span></label><input type="text" value={f.handed_to} onChange={set('handed_to')} /></div>
        <div className="field"><label>Date &amp; Time</label><input type="datetime-local" value={f.released_at} onChange={set('released_at')} /></div>
      </div>
      <div className="field"><label>Fuel Level at Release</label><FuelPicker value={f.fuel_out} onChange={set('fuel_out')} />
        <div className="hint">At receipt: {job.fuel_in || '—'}</div></div>
      <div className="field"><label>Joint Inspection</label><Checklist two items={RELEASE_CHECKS} value={f.release_checks} onChange={set('release_checks')} /></div>
      <div className="field"><label>Remarks</label><input type="text" value={f.release_remarks} onChange={set('release_remarks')} placeholder="e.g. Recommend track tension check at next service" /></div>
      <div className="step-actions">
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={submit}>{correcting ? 'Save Correction' : 'Release Vehicle'}</button>
        {correcting && <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
