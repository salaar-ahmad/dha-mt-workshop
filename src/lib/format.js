import { TIMEZONE } from './config.js';

const DAY = 86400000;

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  // plain date "YYYY-MM-DD" -> local midnight in Pakistan
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00+05:00');
  return new Date(v);
}

export function daysBetween(a, b = new Date()) {
  const x = toDate(a), y = toDate(b);
  if (!x || !y) return 0;
  return Math.max(0, (y - x) / DAY);
}

export function fmtDate(v, withYear = true) {
  const d = toDate(v);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: TIMEZONE });
}

export function fmtDateTime(v) {
  const d = toDate(v);
  if (!d) return '—';
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TIMEZONE });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE });
  return `${date} · ${time}`;
}

export function fmtDays(days) {
  if (days == null) return '—';
  const n = Math.floor(days);
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

export function fmtDur(days) {
  if (days == null) return '—';
  if (days < 1) return `${Math.round(days * 24)} hrs`;
  return `${days.toFixed(1)} d`;
}

export function fmtNum(n) {
  if (n == null || n === '' || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-PK');
}

export function fmtRs(n, compact = false) {
  if (n == null || isNaN(n)) return '—';
  const v = Number(n);
  if (compact && v >= 10000000) return 'Rs ' + (v / 10000000).toFixed(2) + ' crore';
  if (compact && v >= 100000) return 'Rs ' + (v / 100000).toFixed(1) + ' lakh';
  return 'Rs ' + Math.round(v).toLocaleString('en-PK');
}

export function fmtMeter(v, unit) {
  if (v == null || v === '') return '—';
  return `${fmtNum(v)} ${unit === 'hrs' ? 'hrs' : 'km'}`;
}

// value for <input type="datetime-local"> in Pakistan time
export function toLocalInput(v = new Date()) {
  const d = toDate(v);
  if (!d) return '';
  const pk = new Date(d.getTime() + 5 * 3600000);
  return pk.toISOString().slice(0, 16);
}

export function fromLocalInput(s) {
  if (!s) return null;
  // left at the default "now"? keep the exact time so stage order stays correct
  if (s === toLocalInput(new Date())) return new Date().toISOString();
  return new Date(s + ':00+05:00').toISOString();
}

export function todayISO() {
  return new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
}

export function startOfYear(d = new Date()) {
  const y = new Date(d.getTime() + 5 * 3600000).getUTCFullYear();
  return new Date(`${y}-01-01T00:00:00+05:00`);
}

export function initials(name = '') {
  const ranks = /^(maj|capt|col|lt|gen|brig|hav|nk|sep|sub|dvr|insp|mr|ms|r)$/i;
  const words = name.replace(/\([^)]*\)/g, ' ').split(/[\s.]+/).filter((w) => /^[A-Za-z]/.test(w));
  const core = words.filter((w) => !ranks.test(w));
  return (core.length ? core : words).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'U';
}

export function vehicleTitle(v) {
  if (!v) return '';
  return [v.make, v.model].filter(Boolean).join(' ');
}
