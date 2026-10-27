import { useState } from 'react';
import { Modal } from './ui.jsx';
import { useStore } from '../lib/store.jsx';
import { backend } from '../lib/backend.js';
import { CATEGORIES, SECTIONS } from '../lib/config.js';
import { downloadCSV } from '../lib/csv.js';

const TEMPLATE_HEADERS = ['Vehicle No', 'Category', 'Make', 'Model', 'Year', 'Section', 'Chassis No', 'Engine No', 'Meter (km/hrs)', 'Current Value (Rs)'];

// Column names people actually use -> our fields
const COLS = {
  vehicle_no: ['vehicleno', 'vehicle', 'vehno', 'regno', 'registrationno', 'dhano', 'no', 'number'],
  category: ['category', 'cat', 'type', 'class'],
  make: ['make', 'manufacturer', 'brand'],
  model: ['model', 'description', 'vehicledescription'],
  year: ['year', 'model year', 'modelyear', 'yom', 'yearofmanufacture'],
  section: ['section', 'phase', 'sectionphase', 'unit', 'location'],
  chassis_no: ['chassisno', 'chassis', 'chasisno', 'vin'],
  engine_no: ['engineno', 'engine'],
  meter_unit: ['meter', 'meterunit', 'meterkmhrs', 'unit_meter', 'odometerunit', 'reads'],
  current_value: ['currentvalue', 'currentvaluers', 'value', 'valuers', 'bookvalue'],
};
const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function mapHeader(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [field, names] of Object.entries(COLS)) {
      if (map[field] == null && names.map(norm).includes(n)) { map[field] = i; break; }
    }
  });
  return map;
}

function normCategory(v) {
  const s = norm(v);
  if (!s) return null;
  if (s.startsWith('ltv') || s.includes('light')) return 'LTV';
  if (s.startsWith('htv') || s.includes('heavy')) return 'HTV';
  if (s.includes('ep') || s.includes('plant') || s.includes('engineer')) return 'E&P Plant';
  return CATEGORIES.find((c) => norm(c) === s) || undefined;
}
function normMeter(v, category) {
  const s = norm(v);
  if (s.startsWith('h')) return 'hrs';
  if (s.startsWith('k')) return 'km';
  return category === 'E&P Plant' ? 'hrs' : 'km';
}

export default function ImportVehicles({ onClose }) {
  const { data, reload, notify } = useStore();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const existing = new Map(data.vehicles.map((v) => [v.vehicle_no.toUpperCase(), v]));

  const readFile = async (file) => {
    setErr(''); setRows(null); setFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
      // header = first row that has a vehicle number column
      let hi = grid.findIndex((r) => mapHeader(r).vehicle_no != null);
      if (hi < 0) return setErr('Could not find a "Vehicle No" column. Use the template, or name the column "Vehicle No".');
      const map = mapHeader(grid[hi]);
      const out = [];
      const seen = new Set();
      for (const r of grid.slice(hi + 1)) {
        const get = (f) => (map[f] == null ? '' : String(r[map[f]] ?? '').trim());
        const vehicle_no = get('vehicle_no').toUpperCase();
        if (!vehicle_no) continue;
        const problems = [];
        const catRaw = get('category');
        const category = normCategory(catRaw);
        if (catRaw && category === undefined) problems.push(`category "${catRaw}" not LTV / HTV / E&P Plant`);
        const yearRaw = get('year');
        const year = yearRaw ? parseInt(yearRaw, 10) : null;
        if (yearRaw && (!year || year < 1950 || year > 2100)) problems.push(`year "${yearRaw}"`);
        const valRaw = get('current_value').replace(/[^0-9.]/g, '');
        if (seen.has(vehicle_no)) problems.push('listed twice in the file');
        seen.add(vehicle_no);
        const old = existing.get(vehicle_no);
        out.push({
          vehicle_no, old, problems,
          fields: {
            category: category || old?.category || (catRaw ? null : 'LTV'),
            make: get('make'), model: get('model'), year,
            section: get('section'), chassis_no: get('chassis_no'), engine_no: get('engine_no'),
            meter_unit: normMeter(get('meter_unit'), category || old?.category),
            current_value: valRaw ? Number(valRaw) : null,
            _meterGiven: !!get('meter_unit'),
          },
        });
      }
      if (!out.length) return setErr('No vehicle rows found under the header row.');
      setRows(out);
    } catch (e) {
      setErr('Could not read this file. Save it as .xlsx or .csv and try again.');
    }
  };

  const good = rows ? rows.filter((r) => !r.problems.length) : [];
  const bad = rows ? rows.filter((r) => r.problems.length) : [];
  const adds = good.filter((r) => !r.old).length;
  const updates = good.length - adds;

  const runImport = async () => {
    setBusy(true); setProgress(0);
    let ok = 0, failed = 0;
    for (const r of good) {
      const f = r.fields;
      try {
        if (r.old) {
          // only overwrite cells that have a value in the file
          const patch = {};
          for (const k of ['category', 'make', 'model', 'year', 'section', 'chassis_no', 'engine_no', 'current_value']) {
            if (f[k] !== '' && f[k] != null) patch[k] = f[k];
          }
          if (f._meterGiven) patch.meter_unit = f.meter_unit;
          if (Object.keys(patch).length) await backend.update('vehicles', r.old.id, patch);
        } else {
          await backend.insert('vehicles', {
            vehicle_no: r.vehicle_no, category: f.category || 'LTV', make: f.make, model: f.model, year: f.year,
            section: f.section || SECTIONS[0], chassis_no: f.chassis_no || null, engine_no: f.engine_no || null,
            meter_unit: f.meter_unit, current_value: f.current_value, is_ber: false,
          });
        }
        ok++;
      } catch { failed++; }
      setProgress(ok + failed);
    }
    await reload();
    setBusy(false);
    notify(failed ? `Imported ${ok}. ${failed} could not be saved.` : `Imported ${ok} vehicles (${adds} new, ${updates} updated)`, failed ? 'err' : 'ok');
    if (!failed) onClose();
  };

  return (
    <Modal title="Import Vehicles from Excel" onClose={() => !busy && onClose()}>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
        Upload an Excel (.xlsx) or CSV file with one vehicle per row. New vehicle numbers are added; numbers already on the list are updated with any filled-in cells.
      </p>
      <div className="step-actions" style={{ marginTop: 0, marginBottom: 16 }}>
        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          Choose file
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} disabled={busy}
            onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} />
        </label>
        <button className="btn btn-secondary" type="button" onClick={() => downloadCSV('vehicle-import-template.csv', TEMPLATE_HEADERS,
          [['DHA-614', 'E&P Plant', 'Komatsu', 'D65 Dozer', 2014, 'Phase 6 Workshop', '', '', 'hrs', 4200000],
           ['DHA-722', 'LTV', 'Toyota', 'Hilux', 2019, 'Phase 7 HQ', '', '', 'km', 6500000]])}>
          Download template
        </button>
        {fileName && <span className="muted" style={{ fontSize: 13 }}>{fileName}</span>}
      </div>

      {err && <div className="alert err">{err}</div>}

      {rows && (
        <>
          <div className="summary-row" style={{ marginBottom: 14 }}>
            <div className="sum-chip"><b>{adds}</b> new</div>
            <div className="sum-chip"><b>{updates}</b> to update</div>
            <div className={`sum-chip${bad.length ? ' hot' : ''}`}><b>{bad.length}</b> with problems (skipped)</div>
          </div>
          <div className="card clip table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
            <table className="spares-table">
              <thead><tr><th>Vehicle No</th><th>Category</th><th>Make / Model</th><th>Section</th><th>Action</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.vehicle_no + r.problems.join()}>
                    <td className="mono"><b>{r.vehicle_no}</b></td>
                    <td>{r.fields.category || '—'}</td>
                    <td>{[r.fields.make, r.fields.model].filter(Boolean).join(' ') || '—'}</td>
                    <td>{r.fields.section || '—'}</td>
                    <td>{r.problems.length
                      ? <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: 12.5 }}>Skip: {r.problems.join('; ')}</span>
                      : r.old ? <span className="chip chip-sp-approved">Update</span> : <span className="chip chip-sp-received">New</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="actions">
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" type="button" disabled={busy || !good.length} onClick={runImport}>
          {busy ? `Importing ${progress} of ${good.length}…` : `Import ${good.length} vehicle${good.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  );
}
