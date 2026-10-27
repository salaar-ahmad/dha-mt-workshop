import dhaLogo from '../assets/dha-logo.jpg?inline';
import { useEffect, useId, useState } from 'react';
import { STATUS } from '../lib/metrics.js';
import { FUEL_LEVELS } from '../lib/config.js';
import { useStore } from '../lib/store.jsx';

export function Logo({ size = 34 }) {
  return <img src={dhaLogo} width={size} height={size} alt="DHA Islamabad-Rawalpindi" className="dha-logo" />;
}

export function Shield({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <path d="M17 7l8 3.5v6c0 6-4 9.5-8 10.5-4-1-8-4.5-8-10.5v-6L17 7z" fill="#1B5E3F" />
      <path d="M17 11l4.5 2v3.2c0 3.3-2.2 5.3-4.5 6-2.3-.7-4.5-2.7-4.5-6V13L17 11z" fill="#fff" />
    </svg>
  );
}

export function StatusChip({ status, lg }) {
  const s = STATUS[status];
  if (!s) return null;
  return <span className={`chip chip-${s.chip}${lg ? ' lg' : ''}`}>{s.label}</span>;
}

export function Chip({ meta, lg }) {
  return <span className={`chip chip-${meta.chip}${lg ? ' lg' : ''}`}>{meta.label}</span>;
}

export function Seg({ options, value, onChange, block, danger, disabled }) {
  return (
    <div className={`seg${block ? ' block' : ''}${danger ? ' danger-on' : ''}`} role="radiogroup">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return (
          <button type="button" key={v} className={value === v ? 'on' : ''} disabled={disabled}
            role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{l}</button>
        );
      })}
    </div>
  );
}

export function FuelPicker({ value, onChange }) {
  return (
    <div className="fuel-row">
      {FUEL_LEVELS.map((f) => (
        <button type="button" key={f} className={`fuel-btn${value === f ? ' on' : ''}`} onClick={() => onChange(f)}>{f}</button>
      ))}
    </div>
  );
}

export function Checklist({ items, value, onChange, two }) {
  const toggle = (it) => onChange(value.includes(it) ? value.filter((x) => x !== it) : [...value, it]);
  return (
    <div className={`checklist${two ? ' two' : ''}`}>
      {items.map((it) => (
        <label key={it} className={`tick${value.includes(it) ? ' on' : ''}`}>
          <input type="checkbox" checked={value.includes(it)} onChange={() => toggle(it)} />{it}
        </label>
      ))}
    </div>
  );
}

/** Text input with suggestions from names already used (mechanics, inspectors, drivers). */
export function SuggestInput({ value, onChange, suggestions = [], ...rest }) {
  const id = useId();
  const uniq = [...new Set(suggestions.filter(Boolean).map((s) => String(s).trim()))].sort();
  return (
    <>
      <input type="text" list={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} autoComplete="off" {...rest} />
      <datalist id={id}>{uniq.map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}

export function Toast() {
  const { toast } = useStore();
  const [show, setShow] = useState(null);
  useEffect(() => {
    if (!toast) return;
    setShow(toast);
    const t = setTimeout(() => setShow(null), toast.kind === 'err' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!show) return null;
  return <div className={`toast${show.kind === 'err' ? ' err' : ''}`} role="status">{show.msg}</div>;
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Wraps an async action with busy state + error toast. */
export function useAction() {
  const { notify, reload } = useStore();
  const [busy, setBusy] = useState(false);
  const run = async (fn, okMsg) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      await reload();
      if (okMsg) notify(okMsg);
      return r;
    } catch (e) {
      notify(e.message || 'Something went wrong', 'err');
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

/* In-page confirmation dialog (native confirm() is blocked in some embedded viewers). */
let pushConfirm = null;
export function askConfirm(message, okLabel = 'Yes, continue', danger = false) {
  if (!pushConfirm) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => pushConfirm({ message, okLabel, danger, resolve }));
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  useEffect(() => { pushConfirm = setReq; return () => { pushConfirm = null; }; }, []);
  if (!req) return null;
  const close = (v) => { req.resolve(v); setReq(null); };
  return (
    <Modal title="Please confirm" onClose={() => close(false)}>
      <p style={{ margin: '0 0 8px', fontSize: 15, lineHeight: 1.5 }}>{req.message}</p>
      <div className="actions">
        <button className="btn btn-secondary" onClick={() => close(false)}>Cancel</button>
        <button className={`btn ${req.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus onClick={() => close(true)}>{req.okLabel}</button>
      </div>
    </Modal>
  );
}
