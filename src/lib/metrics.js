import { daysBetween, toDate, startOfYear } from './format.js';
import { REPEAT_WINDOW_DAYS } from './config.js';

export const STATUS = {
  received:         { label: 'Received',         chip: 'received', color: '#52525B', stage: 2 },
  inspected:        { label: 'Inspected',        chip: 'inspected', color: '#1D4ED8', stage: 3 },
  awaiting_spares:  { label: 'Awaiting Spares',  chip: 'awaiting', color: '#8A5B07', stage: 3 },
  under_repair:     { label: 'Under Repair',     chip: 'repair', color: '#C2410C', stage: 4 },
  final_inspection: { label: 'Final Inspection', chip: 'final', color: '#6D28D9', stage: 5 },
  ready:            { label: 'Ready for Release', chip: 'ready', color: '#6D28D9', stage: 6 },
  released:         { label: 'Released',         chip: 'released', color: '#15803D', stage: 7 },
  ber:              { label: 'BER',              chip: 'ber', color: '#B91C1C', stage: 7 },
};
export const VEHICLE_FIT = { label: 'Fit', chip: 'released' };
export const VEHICLE_BER = { label: 'BER', chip: 'ber' };

export const OPEN_STATUSES = ['received', 'inspected', 'awaiting_spares', 'under_repair', 'final_inspection', 'ready'];
export const isOpen = (job) => OPEN_STATUSES.includes(job.status);

export function spareStatus(s) {
  if (s.received_on) return 'received';
  if (s.approved_on) return 'approved';
  return 'demanded';
}
export const SPARE_LABEL = { demanded: 'Demanded', approved: 'Approved', received: 'Received' };

export function sparePendingDays(s, now = new Date()) {
  if (s.received_on) return null;
  return Math.floor(daysBetween(s.demanded_on, now));
}

export function spareCost(s) {
  if (s.unit_cost == null || s.unit_cost === '') return 0;
  return Number(s.unit_cost) * Number(s.qty || 1);
}

/** Build lookup indexes once per data load. */
export function buildIndex(data) {
  const vehicleById = new Map(data.vehicles.map((v) => [v.id, v]));
  const jobsByVehicle = new Map();
  const sparesByJob = new Map();
  const eventsByJob = new Map();
  const jobById = new Map();
  for (const j of data.job_cards) {
    jobById.set(j.id, j);
    if (!jobsByVehicle.has(j.vehicle_id)) jobsByVehicle.set(j.vehicle_id, []);
    jobsByVehicle.get(j.vehicle_id).push(j);
  }
  for (const list of jobsByVehicle.values()) list.sort((a, b) => toDate(a.received_at) - toDate(b.received_at));
  for (const s of data.spares) {
    if (!sparesByJob.has(s.job_card_id)) sparesByJob.set(s.job_card_id, []);
    sparesByJob.get(s.job_card_id).push(s);
  }
  for (const list of sparesByJob.values()) list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const e of data.job_events) {
    if (!eventsByJob.has(e.job_card_id)) eventsByJob.set(e.job_card_id, []);
    eventsByJob.get(e.job_card_id).push(e);
  }
  // insertion order = the order stages actually happened
  for (const list of eventsByJob.values()) list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || toDate(a.at) - toDate(b.at));
  return { vehicleById, jobsByVehicle, sparesByJob, eventsByJob, jobById };
}

export function openJobFor(idx, vehicleId) {
  return (idx.jobsByVehicle.get(vehicleId) || []).find(isOpen) || null;
}

export function vehicleState(idx, v) {
  const open = openJobFor(idx, v.id);
  if (open) return { ...STATUS[open.status], job: open };
  if (v.is_ber) return VEHICLE_BER;
  return VEHICLE_FIT;
}

export function jobEnd(job) {
  if (job.status === 'released') return toDate(job.released_at) || new Date();
  if (job.status === 'ber') return toDate(job.inspected_at) || toDate(job.updated_at) || new Date();
  return new Date();
}

export function jobDays(job) {
  return daysBetween(job.received_at, jobEnd(job));
}

/** Time spent in each status, in days, from the stage history. */
export function timeInStatus(job, events = []) {
  const out = {};
  let cur = 'received';
  let since = toDate(job.received_at);
  for (const e of events) {
    if (!e.to_status || e.to_status === 'received') continue;
    const at = toDate(e.at);
    if (at && since && at >= since) {
      out[cur] = (out[cur] || 0) + (at - since) / 86400000;
      since = at;
    }
    cur = e.to_status;
  }
  if (cur !== 'released' && cur !== 'ber' && since) {
    out[cur] = (out[cur] || 0) + Math.max(0, (new Date() - since) / 86400000);
  }
  return out;
}

export function jobCost(job, spares = []) {
  return spares.reduce((s, x) => s + spareCost(x), 0) + (Number(job.external_cost) || 0);
}

export function faultText(job) {
  if (!job) return '';
  if (job.fault_category && job.fault_category !== 'Other') {
    return job.fault_detail ? `${job.fault_category} (${job.fault_detail})` : job.fault_category;
  }
  return job.fault_detail || job.fault_category || '';
}

/** Repeat faults: same fault category back within the window after the previous release. */
export function repeatFlags(jobs) {
  const flags = new Map();
  for (let i = 1; i < jobs.length; i++) {
    const prev = jobs[i - 1], cur = jobs[i];
    if (!prev.released_at || !cur.fault_category) continue;
    const gap = daysBetween(prev.released_at, cur.received_at);
    if (gap <= REPEAT_WINDOW_DAYS) {
      flags.set(cur.id, { gap: Math.round(gap), same: prev.fault_category === cur.fault_category });
    }
  }
  return flags;
}

export function vehicleStats(idx, v) {
  const jobs = idx.jobsByVehicle.get(v.id) || [];
  const yStart = startOfYear();
  const thisYear = jobs.filter((j) => toDate(j.received_at) >= yStart);
  let daysOff = 0;
  for (const j of thisYear) daysOff += jobDays(j);
  let costYear = 0, costLife = 0;
  for (const j of jobs) {
    const c = jobCost(j, idx.sparesByJob.get(j.id));
    costLife += c;
    if (toDate(j.received_at) >= yStart) costYear += c;
  }
  let mdbf = null;
  if (jobs.length >= 2) {
    let gaps = 0;
    for (let i = 1; i < jobs.length; i++) gaps += daysBetween(jobs[i - 1].received_at, jobs[i].received_at);
    mdbf = gaps / (jobs.length - 1);
  }
  const repeats = repeatFlags(jobs);
  const repeatCount = [...repeats.values()].filter((r) => r.same).length;
  return {
    jobs, breakdownsYear: thisYear.length, breakdownsTotal: jobs.length,
    daysOffYear: daysOff, costYear, costLife, mdbf, repeats, repeatCount,
  };
}

export function breakdownsThisYear(idx, vehicleId) {
  const yStart = startOfYear();
  return (idx.jobsByVehicle.get(vehicleId) || []).filter((j) => toDate(j.received_at) >= yStart).length;
}
