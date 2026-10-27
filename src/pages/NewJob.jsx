import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { openJobFor } from '../lib/metrics.js';
import { FAULTS, KIT_ITEMS, SECTIONS } from '../lib/config.js';
import { fromLocalInput, toLocalInput, vehicleTitle, fmtMeter } from '../lib/format.js';
import { createJob } from '../lib/actions.js';
import { Checklist, FuelPicker, Seg, SuggestInput, useAction } from '../components/ui.jsx';
import VehicleModal from '../components/VehicleModal.jsx';

export default function NewJob() {
  const { data, idx, user, can } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get('vehicle') ? idx.vehicleById.get(params.get('vehicle')) : null;

  const [vq, setVq] = useState(preset?.vehicle_no || '');
  const [vehicle, setVehicle] = useState(preset || null);
  const [showSug, setShowSug] = useState(false);
  const [hl, setHl] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [f, setF] = useState({
    received_at: toLocalInput(), meter_in: '', meter_unit: preset?.meter_unit || 'km', fuel_in: '',
    fault_category: '', fault_detail: '', brought_by: '', section: preset?.section || SECTIONS[0], kit: [], remarks: '',
  });
  const [errs, setErrs] = useState({});
  const [busy, run] = useAction();
  const meterRef = useRef(null);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));

  const matches = useMemo(() => {
    const q = vq.trim().toLowerCase().replace(/\s+/g, '');
    if (!q || (vehicle && vehicle.vehicle_no.toLowerCase() === vq.trim().toLowerCase())) return [];
    return data.vehicles
      .filter((v) => (v.vehicle_no + vehicleTitle(v)).toLowerCase().replace(/\s+/g, '').includes(q))
      .sort((a, b) => a.vehicle_no.localeCompare(b.vehicle_no))
      .slice(0, 6);
  }, [vq, data.vehicles, vehicle]);

  const pick = (v) => {
    setVehicle(v); setVq(v.vehicle_no); setShowSug(false);
    setF((p) => ({ ...p, meter_unit: v.meter_unit || 'km', section: v.section || p.section }));
    setErrs((e) => ({ ...e, vehicle: null }));
    setTimeout(() => meterRef.current?.focus(), 50);
  };

  const existing = vehicle ? openJobFor(idx, vehicle.id) : null;
  const lastJob = vehicle ? (idx.jobsByVehicle.get(vehicle.id) || []).slice(-1)[0] : null;
  const drivers = data.job_cards.map((j) => j.brought_by);

  if (!can.receive) return <div className="alert info">Only the MT Clerk or workshop admins can open job cards.</div>;

  const submit = async () => {
    const e = {};
    if (!vehicle) e.vehicle = 'Pick a vehicle from the list.';
    if (f.meter_in === '' || isNaN(Number(f.meter_in))) e.meter_in = 'Enter the odometer or hours reading.';
    else if (lastJob?.meter_out && Number(f.meter_in) < Number(lastJob.meter_out)) e.meter_in = `Lower than last release reading (${fmtMeter(lastJob.meter_out, lastJob.meter_unit)}). Check the number.`;
    if (!f.fuel_in) e.fuel_in = 'Tap the fuel level.';
    if (!f.fault_category) e.fault_category = 'Select the fault.';
    if (f.fault_category === 'Other' && !f.fault_detail.trim()) e.fault_detail = 'Describe the fault.';
    if (!f.brought_by.trim()) e.brought_by = "Enter the driver's name.";
    if (!f.received_at) e.received_at = 'Enter the date and time.';
    setErrs(e);
    if (Object.keys(e).length || existing) return;
    const job = await run(() => createJob(user, {
      ...f, vehicle_id: vehicle.id, meter_in: Number(f.meter_in), received_at: fromLocalInput(f.received_at),
      brought_by: f.brought_by.trim(),
    }), `${vehicle.vehicle_no} received into workshop`);
    if (job) nav(`/jobs/${job.id}`);
  };

  const onKey = (e) => {
    if (!matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, matches.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); pick(matches[hl]); }
  };

  return (
    <div className="form-wrap">
      <div className="page-head" style={{ display: 'block' }}>
        <h1>New Job Card: Vehicle Receipt</h1>
        <p>Fill this in once, at the gate. Most fields are tap &amp; select.</p>
      </div>

      <div className="form-card">
        <div className="group">
          <label className="flabel">Vehicle No<span className="req">*</span></label>
          <div className="typeahead">
            <input type="text" value={vq} placeholder="Start typing e.g. DHA-6…" autoComplete="off" autoFocus={!preset}
              className={errs.vehicle ? 'invalid' : ''}
              onChange={(e) => { setVq(e.target.value); setVehicle(null); setShowSug(true); setHl(0); }}
              onFocus={() => setShowSug(true)} onBlur={() => setTimeout(() => setShowSug(false), 150)} onKeyDown={onKey} />
            {showSug && vq.trim() && !vehicle && (
              <div className="suggest">
                {matches.map((v, i) => (
                  <button type="button" key={v.id} className={i === hl ? 'hl' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(v)}>
                    <span className="n">{v.vehicle_no}</span>
                    <span className="m">{vehicleTitle(v)} · {v.category}</span>
                  </button>
                ))}
                {matches.length === 0 && (
                  <div className="none">
                    Not on the master list.{' '}
                    <button type="button" className="linkbtn" style={{ display: 'inline', padding: 0, width: 'auto', border: 'none' }}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => setAddOpen(true)}>+ Add {vq.trim().toUpperCase()} as a new vehicle</button>
                  </div>
                )}
              </div>
            )}
          </div>
          {errs.vehicle && <div className="hint err">{errs.vehicle}</div>}
          {vehicle ? (
            <div className="autofill">
              <div><b>Make / Model</b><span>{vehicleTitle(vehicle) || '—'}</span></div>
              <div><b>Category</b><span>{vehicle.category}</span></div>
              <div><b>Section</b><span>{vehicle.section || '—'}</span></div>
              {lastJob && <div><b>Last in workshop</b><span>{lastJob.job_no}</span></div>}
            </div>
          ) : (
            <div className="autofill empty">Vehicle details will autofill here once you pick a number above.</div>
          )}
          {existing && (
            <div className="alert warn" style={{ marginTop: 12, marginBottom: 0 }}>
              {vehicle.vehicle_no} is already in the workshop on job card {existing.job_no}.{' '}
              <Link to={`/jobs/${existing.id}`}>Open that job card →</Link>
            </div>
          )}
        </div>

        <div className="group grid-2">
          <div>
            <label className="flabel">Date &amp; Time Received<span className="req">*</span></label>
            <input type="datetime-local" value={f.received_at} onChange={set('received_at')} className={errs.received_at ? 'invalid' : ''} />
            <div className="hint">Auto-filled with now. Change only if entering late.</div>
          </div>
          <div>
            <label className="flabel">Odometer / Engine Hours<span className="req">*</span></label>
            <div className="unit-input">
              <input ref={meterRef} type="number" inputMode="numeric" placeholder="e.g. 48210" value={f.meter_in} onChange={set('meter_in')} className={errs.meter_in ? 'invalid' : ''} />
              <Seg options={[{ value: 'km', label: 'KM' }, { value: 'hrs', label: 'Hrs' }]} value={f.meter_unit} onChange={set('meter_unit')} />
            </div>
            {errs.meter_in && <div className="hint err">{errs.meter_in}</div>}
          </div>
        </div>

        <div className="group">
          <label className="flabel">Fuel Level<span className="req">*</span></label>
          <FuelPicker value={f.fuel_in} onChange={set('fuel_in')} />
          {errs.fuel_in && <div className="hint err">{errs.fuel_in}</div>}
        </div>

        <div className="group grid-2">
          <div>
            <label className="flabel">Fault Reported<span className="req">*</span></label>
            <select value={f.fault_category} onChange={set('fault_category')} className={errs.fault_category ? 'invalid' : ''}>
              <option value="">Select a fault…</option>
              {FAULTS.map((x) => <option key={x}>{x}</option>)}
              <option value="Other">Other</option>
            </select>
            <input type="text" style={{ marginTop: 10 }} value={f.fault_detail} onChange={set('fault_detail')}
              className={errs.fault_detail ? 'invalid' : ''}
              placeholder={f.fault_category === 'Other' ? 'Describe the fault (required)' : 'Extra detail (optional)'} />
            {(errs.fault_category || errs.fault_detail) && <div className="hint err">{errs.fault_category || errs.fault_detail}</div>}
          </div>
          <div>
            <label className="flabel">Brought By (Driver)<span className="req">*</span></label>
            <SuggestInput value={f.brought_by} onChange={set('brought_by')} suggestions={drivers} placeholder="Driver's name" className={errs.brought_by ? 'invalid' : ''} />
            {errs.brought_by && <div className="hint err">{errs.brought_by}</div>}
          </div>
        </div>

        <div className="group">
          <label className="flabel">Section / Phase</label>
          <select value={f.section} onChange={set('section')}>
            {[...new Set([...SECTIONS, f.section].filter(Boolean))].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="group">
          <label className="flabel">Tools &amp; Kit Received with Vehicle</label>
          <Checklist items={KIT_ITEMS} value={f.kit} onChange={set('kit')} />
        </div>

        <div className="group">
          <label className="flabel">Remarks</label>
          <textarea placeholder="Any additional notes for the workshop incharge" value={f.remarks} onChange={set('remarks')} />
        </div>

        {Object.values(errs).some(Boolean) && <div className="alert err" style={{ marginTop: 20, marginBottom: 0 }}>Some required fields are missing. Check the red boxes above.</div>}
        <div className="actions">
          <Link className="btn btn-secondary btn-lg" to="/jobs">Cancel</Link>
          <button type="button" className="btn btn-primary btn-lg" disabled={busy || !!existing} onClick={submit}>
            {busy ? 'Saving…' : 'Receive Vehicle'}
          </button>
        </div>
      </div>

      {addOpen && <VehicleModal initialNo={vq.trim()} onClose={() => setAddOpen(false)} onSaved={(v) => pick(v)} />}
    </div>
  );
}
