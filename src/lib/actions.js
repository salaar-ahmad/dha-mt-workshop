import { backend } from './backend.js';

// Every stage change goes through here so the stage history (job_events) is always written.
async function move(job, to, user, at, note, patch = {}) {
  const updated = await backend.update('job_cards', job.id, { ...patch, status: to });
  await backend.insert('job_events', {
    job_card_id: job.id, at: at || new Date().toISOString(),
    from_status: job.status, to_status: to, by_name: user?.name || null, note: note || null,
  });
  return updated;
}

export async function createJob(user, f) {
  const job = await backend.insert('job_cards', {
    vehicle_id: f.vehicle_id,
    status: 'received',
    received_at: f.received_at,
    meter_in: f.meter_in,
    meter_unit: f.meter_unit,
    fuel_in: f.fuel_in,
    fault_category: f.fault_category,
    fault_detail: f.fault_detail || null,
    brought_by: f.brought_by,
    section: f.section,
    kit: f.kit,
    remarks: f.remarks || null,
    received_by: user?.name || null,
  });
  await backend.insert('job_events', {
    job_card_id: job.id, at: f.received_at, from_status: null, to_status: 'received', by_name: user?.name || null,
  });
  return job;
}

export async function saveInspection(user, job, f) {
  const patch = {
    inspected_at: f.inspected_at, diagnosis: f.diagnosis, repair_class: f.repair_class,
    repair_by: f.repair_by, est_hours: f.est_hours, inspected_by: f.inspected_by,
  };
  if (f.repair_by === 'Recommend BER') {
    const j = await move(job, 'ber', user, f.inspected_at, 'Recommended Beyond Economical Repair', patch);
    await backend.update('vehicles', job.vehicle_id, { is_ber: true });
    return j;
  }
  return move(job, 'inspected', user, f.inspected_at, null, patch);
}

export async function addSpare(job, f) {
  return backend.insert('spares', {
    job_card_id: job.id, part_name: f.part_name, part_no: f.part_no || null, qty: f.qty || 1,
    source: f.source, unit_cost: f.unit_cost === '' || f.unit_cost == null ? null : Number(f.unit_cost),
    demanded_on: f.demanded_on,
  });
}

export const updateSpare = (id, patch) => backend.update('spares', id, patch);
export const deleteSpare = (id) => backend.remove('spares', id);

export const markAwaitingSpares = (user, job) => move(job, 'awaiting_spares', user, null, null);

export const startRepair = (user, job, at, note) =>
  move(job, 'under_repair', user, at, note, job.repair_started_at ? {} : { repair_started_at: at });

export const saveRepairProgress = (job, f) => backend.update('job_cards', job.id, {
  mechanics: f.mechanics, work_done: f.work_done, man_hours: f.man_hours, external_cost: f.external_cost,
});

export const completeRepair = (user, job, f) => move(job, 'final_inspection', user, f.repair_completed_at, null, {
  mechanics: f.mechanics, work_done: f.work_done, man_hours: f.man_hours,
  external_cost: f.external_cost, repair_completed_at: f.repair_completed_at,
});

export const moreSparesNeeded = (user, job) => move(job, 'awaiting_spares', user, null, 'Additional spares demanded during repair');

export function finalInspection(user, job, f, pass) {
  const patch = {
    final_inspected_at: f.final_inspected_at, final_inspector: f.final_inspector,
    final_remarks: f.final_remarks || null, road_test: pass ? 'pass' : 'fail',
  };
  if (pass) return move(job, 'ready', user, f.final_inspected_at, 'Road test passed', patch);
  return move(job, 'under_repair', user, f.final_inspected_at,
    'Road test failed' + (f.final_remarks ? ': ' + f.final_remarks : ''),
    { ...patch, fail_count: (job.fail_count || 0) + 1, repair_completed_at: null });
}

export const releaseVehicle = (user, job, f) => move(job, 'released', user, f.released_at, f.release_remarks || null, {
  released_at: f.released_at, meter_out: f.meter_out, fuel_out: f.fuel_out, handed_to: f.handed_to,
  release_checks: f.release_checks, release_remarks: f.release_remarks || null, released_by: user?.name || null,
});

// Corrections by incharge/admin: edit fields without changing the stage
export const correctJob = (job, patch) => backend.update('job_cards', job.id, patch);

export async function deleteJob(job) {
  await backend.remove('job_cards', job.id);
}

export async function saveVehicle(v) {
  const row = {
    vehicle_no: v.vehicle_no.trim().toUpperCase(), category: v.category, make: v.make.trim(), model: v.model.trim(),
    year: v.year ? Number(v.year) : null, section: v.section, chassis_no: v.chassis_no || null,
    engine_no: v.engine_no || null, meter_unit: v.meter_unit,
    current_value: v.current_value === '' || v.current_value == null ? null : Number(v.current_value),
    is_ber: !!v.is_ber, notes: v.notes || null,
  };
  if (v.id) return backend.update('vehicles', v.id, row);
  return backend.insert('vehicles', row);
}
