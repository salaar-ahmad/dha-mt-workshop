import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { faultText, jobDays, spareStatus, SPARE_LABEL, spareCost } from '../lib/metrics.js';
import { fmtDate, fmtDateTime, fmtMeter, fmtNum, fmtRs, vehicleTitle } from '../lib/format.js';
import { RELEASE_CHECKS } from '../lib/config.js';
import { Logo } from '../components/ui.jsx';
import { backend } from '../lib/backend.js';

function Frame({ title, docNo, date, job, children }) {
  useEffect(() => {
    const t = document.title;
    document.title = `${title} ${docNo}`;
    return () => { document.title = t; };
  }, [title, docNo]);
  return (
    <div className="print-body">
      <div className="print-bar">
        <Link to={`/jobs/${job.id}`}>← Back to job card</Link>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {backend.demo && <span style={{ fontSize: 12, color: '#4C564F' }}>Printing may be blocked in the preview. It works on the deployed site.</span>}
          <button className="primary" onClick={() => window.print()}>Print / Save as PDF</button>
        </span>
      </div>
      <div className="page">
        <div className="ph">
          <div className="ph-left">
            <Logo size={52} />
            <div>
              <b>DEFENCE HOUSING AUTHORITY</b>
              <span>Mechanical Transport Workshop, Phase 6 &amp; 7, Islamabad</span>
            </div>
          </div>
          <div className="ph-right">
            <div className="doctitle">{title}</div>
            <div className="docmeta mono">No. {docNo} · {date}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

const F = ({ l, children, wide, mono }) => (
  <div className={`f${wide ? ' wide' : ''}`}><label>{l}</label><div className={mono ? 'mono' : ''}>{children || '—'}</div></div>
);

const Sigs = () => (
  <div className="sig-row">
    {['Clerk', 'Workshop Incharge', 'Inspector', 'Receiving Driver'].map((s) => (
      <div className="sig" key={s}><div className="line" /><span>{s}</span></div>
    ))}
  </div>
);

function useJob() {
  const { id } = useParams();
  const { idx, loading } = useStore();
  const job = idx.jobById.get(id);
  return { job, v: job && idx.vehicleById.get(job.vehicle_id), spares: (job && idx.sparesByJob.get(job.id)) || [], loading };
}

export function PrintJobCard() {
  const { job, v, spares, loading } = useJob();
  if (loading) return <div className="loading">Loading…</div>;
  if (!job) return <div className="loading">Job card not found.</div>;
  const total = spares.reduce((s, x) => s + spareCost(x), 0);
  return (
    <Frame title="JOB CARD" docNo={job.job_no} date={fmtDate(job.received_at)} job={job}>
      <div className="pf-section">
        <div className="pf-title">Vehicle &amp; Receipt Details</div>
        <div className="fgrid">
          <F l="Vehicle No" mono>{v?.vehicle_no}</F>
          <F l="Make / Model">{vehicleTitle(v)}</F>
          <F l="Category">{v?.category}</F>
          <F l="Odometer / Hours">{fmtMeter(job.meter_in, job.meter_unit)}</F>
          <F l="Fuel Level">{job.fuel_in}</F>
          <F l="Section / Phase">{job.section}</F>
          <F l="Fault Reported" wide>{faultText(job)}</F>
          <F l="Brought By">{job.brought_by}</F>
          <F l="Date & Time Received">{fmtDateTime(job.received_at)}</F>
          <F l="Received By">{job.received_by}</F>
          {(job.kit || []).length > 0 && <F l="Kit Received" wide>{job.kit.join(', ')}</F>}
          {job.remarks && <F l="Remarks" wide>{job.remarks}</F>}
        </div>
      </div>

      <div className="pf-section">
        <div className="pf-title">Technical Inspection</div>
        <p className="diag">{job.diagnosis || ' '}</p>
        <div className="fgrid">
          <F l="Repair Class">{job.repair_class}</F>
          <F l="Repair By">{job.repair_by}</F>
          <F l="Est. Hours">{job.est_hours != null ? `${fmtNum(job.est_hours)} hrs` : null}</F>
          <F l="Inspected By" wide>{job.inspected_by ? `${job.inspected_by} · ${fmtDateTime(job.inspected_at)}` : null}</F>
        </div>
      </div>

      <div className="pf-section">
        <div className="pf-title">Spares Demanded</div>
        <table>
          <thead><tr><th>Part</th><th>Part No.</th><th className="num">Qty</th><th>Source</th><th>Demanded</th><th>Received</th><th>Status</th><th className="num">Cost</th></tr></thead>
          <tbody>
            {spares.length === 0 && <tr><td colSpan={8} style={{ color: '#4C564F' }}>No spares demanded</td></tr>}
            {spares.map((s) => (
              <tr key={s.id}>
                <td>{s.part_name}</td><td className="mono">{s.part_no || '—'}</td><td className="num">{fmtNum(s.qty)}</td><td>{s.source}</td>
                <td>{fmtDate(s.demanded_on)}</td><td>{s.received_on ? fmtDate(s.received_on) : '—'}</td><td>{SPARE_LABEL[spareStatus(s)]}</td>
                <td className="num">{spareCost(s) ? fmtRs(spareCost(s)) : '—'}</td>
              </tr>
            ))}
            {total > 0 && <tr><td colSpan={7} style={{ fontWeight: 700 }}>Total</td><td className="num" style={{ fontWeight: 700 }}>{fmtRs(total)}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="pf-section">
        <div className="pf-title">Repair</div>
        <div className="fgrid">
          <F l="Mechanic(s) Assigned" wide>{job.mechanics}</F>
          <F l="Work Done" wide>{job.work_done}</F>
          <F l="Man-Hours">{job.man_hours != null ? `${fmtNum(job.man_hours)}${job.est_hours ? ` of ${fmtNum(job.est_hours)}` : ''} hrs` : null}</F>
          <F l="Started">{job.repair_started_at ? fmtDateTime(job.repair_started_at) : null}</F>
          <F l="Completed">{job.repair_completed_at ? fmtDateTime(job.repair_completed_at) : null}</F>
          {job.external_cost ? <F l="Outsourced / Labour Cost">{fmtRs(job.external_cost)}</F> : null}
        </div>
      </div>

      <div className="pf-section">
        <div className="pf-title">Final Inspection</div>
        <div className="fgrid">
          <F l="Inspector">{job.final_inspector}</F>
          <F l="Road Test">{job.road_test === 'pass' ? 'Pass' : job.road_test === 'fail' ? 'Fail' : 'Pending'}</F>
          <F l="Date">{job.final_inspected_at ? fmtDateTime(job.final_inspected_at) : null}</F>
          {job.final_remarks && <F l="Remarks" wide>{job.final_remarks}</F>}
        </div>
      </div>
      <Sigs />
    </Frame>
  );
}

export function PrintRelease() {
  const { job, v, loading } = useJob();
  if (loading) return <div className="loading">Loading…</div>;
  if (!job) return <div className="loading">Job card not found.</div>;
  const checks = job.release_checks || [];
  return (
    <Frame title="VEHICLE RELEASE NOTE" docNo={`${job.job_no}-R`} date={fmtDate(job.released_at)} job={job}>
      <div className="pf-section">
        <div className="pf-title">Vehicle &amp; Job Reference</div>
        <div className="fgrid">
          <F l="Vehicle No" mono>{v?.vehicle_no}</F>
          <F l="Make / Model">{vehicleTitle(v)}</F>
          <F l="Section / Phase">{job.section}</F>
          <F l="Job Card No." mono>{job.job_no}</F>
          <F l="Date Received">{fmtDateTime(job.received_at)}</F>
          <F l="Date Released">{fmtDateTime(job.released_at)}</F>
          <F l="Fault Reported">{faultText(job)}</F>
          <F l="Total Days in Workshop">{`${jobDays(job).toFixed(1)} days`}</F>
          <F l="Repair Class">{job.repair_class}</F>
          <F l="Work Done" wide>{job.work_done}</F>
        </div>
      </div>

      <div className="pf-section">
        <div className="pf-title">Release Details</div>
        <div className="fgrid">
          <F l="Odometer / Hours In">{fmtMeter(job.meter_in, job.meter_unit)}</F>
          <F l="Odometer / Hours Out">{fmtMeter(job.meter_out, job.meter_unit)}</F>
          <F l="Fuel In / Out">{`${job.fuel_in || '—'} / ${job.fuel_out || '—'}`}</F>
          <F l="Handed To">{job.handed_to}</F>
          <F l="Final Inspector">{job.final_inspector}</F>
          <F l="Released By">{job.released_by}</F>
        </div>
      </div>

      <div className="pf-section">
        <div className="pf-title">Joint Inspection Checklist</div>
        <div className="p-checklist">
          {RELEASE_CHECKS.map((c) => (
            <div className="check-item" key={c}><span className="box">{checks.includes(c) ? '✓' : ''}</span>{c}</div>
          ))}
        </div>
      </div>

      <div className="pf-section">
        <div className="pf-title">Remarks</div>
        <div className="remarks-box">{job.release_remarks || ''}</div>
      </div>

      <p className="declare">This note certifies that the above vehicle has been repaired, inspected and jointly handed over in the condition recorded above. All parties below confirm agreement with these details.</p>
      <Sigs />
    </Frame>
  );
}
