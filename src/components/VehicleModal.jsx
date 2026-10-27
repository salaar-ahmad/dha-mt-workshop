import { useState } from 'react';
import { Modal, Seg, useAction } from './ui.jsx';
import { CATEGORIES, SECTIONS } from '../lib/config.js';
import { saveVehicle } from '../lib/actions.js';
import { useStore } from '../lib/store.jsx';

export default function VehicleModal({ vehicle, initialNo = '', onClose, onSaved }) {
  const { can } = useStore();
  const [f, setF] = useState(() => vehicle ? { ...vehicle, year: vehicle.year ?? '', current_value: vehicle.current_value ?? '' } : {
    vehicle_no: initialNo.toUpperCase(), category: 'LTV', make: '', model: '', year: '', section: SECTIONS[0],
    chassis_no: '', engine_no: '', meter_unit: 'km', current_value: '', is_ber: false, notes: '',
  });
  const [err, setErr] = useState('');
  const [busy, run] = useAction();
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.vehicle_no.trim()) return setErr('Vehicle number is required.');
    if (!f.make.trim() && !f.model.trim()) return setErr('Enter the make or model.');
    setErr('');
    const saved = await run(() => saveVehicle(f), vehicle ? 'Vehicle updated' : `${f.vehicle_no.toUpperCase()} added to the fleet`);
    if (saved) { onSaved?.(saved); onClose(); }
  };

  return (
    <Modal title={vehicle ? `Edit ${vehicle.vehicle_no}` : 'Add Vehicle'} onClose={onClose}>
      <form onSubmit={submit}>
        {err && <div className="alert err">{err}</div>}
        <div className="grid-2 group">
          <div>
            <label className="flabel">Vehicle No<span className="req">*</span></label>
            <input type="text" value={f.vehicle_no} onChange={set('vehicle_no')} placeholder="e.g. DHA-614" autoFocus />
          </div>
          <div>
            <label className="flabel">Category</label>
            <Seg block options={CATEGORIES} value={f.category} onChange={set('category')} />
          </div>
        </div>
        <div className="grid-3 group">
          <div><label className="flabel">Make</label><input type="text" value={f.make} onChange={set('make')} placeholder="Toyota" /></div>
          <div><label className="flabel">Model</label><input type="text" value={f.model} onChange={set('model')} placeholder="Hilux" /></div>
          <div><label className="flabel">Year</label><input type="number" value={f.year} onChange={set('year')} placeholder="2019" /></div>
        </div>
        <div className="grid-2 group">
          <div>
            <label className="flabel">Section / Phase</label>
            <select value={f.section} onChange={set('section')}>
              {[...new Set([...SECTIONS, f.section].filter(Boolean))].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="flabel">Meter reads in</label>
            <Seg block options={[{ value: 'km', label: 'KM' }, { value: 'hrs', label: 'Engine Hrs' }]} value={f.meter_unit} onChange={set('meter_unit')} />
          </div>
        </div>
        <div className="grid-3 group">
          <div><label className="flabel">Chassis No</label><input type="text" value={f.chassis_no || ''} onChange={set('chassis_no')} /></div>
          <div><label className="flabel">Engine No</label><input type="text" value={f.engine_no || ''} onChange={set('engine_no')} /></div>
          <div>
            <label className="flabel">Current Value (Rs)</label>
            <input type="number" value={f.current_value} onChange={set('current_value')} placeholder="for BER check" />
          </div>
        </div>
        <div className="group">
          <label className="flabel">Notes</label>
          <textarea value={f.notes || ''} onChange={set('notes')} style={{ minHeight: 60 }} />
        </div>
        {vehicle && can.declareBer && (
          <label className={`tick${f.is_ber ? ' on' : ''}`} style={{ maxWidth: 360 }}>
            <input type="checkbox" checked={!!f.is_ber} onChange={(e) => set('is_ber')(e.target.checked)} />
            Declared BER / condemned (off fleet strength)
          </label>
        )}
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : vehicle ? 'Save Changes' : 'Add Vehicle'}</button>
        </div>
      </form>
    </Modal>
  );
}
