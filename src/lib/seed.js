// Sample data for demo mode only. Dates are relative to "now" so the demo always looks current.

const DAY = 86400000;

export function buildSeed() {
  let n = 0;
  const id = (p) => `${p}-${++n}`;
  const now = Date.now();
  const ago = (d, h = 9) => {
    const t = new Date(now - d * DAY);
    t.setUTCHours(h - 5, (n * 7) % 60, 0, 0);
    return new Date(Math.min(t.getTime(), now - 60000 * (1 + (n % 50)))).toISOString();
  };
  const dateAgo = (d) => new Date(now - d * DAY + 5 * 3600000).toISOString().slice(0, 10);

  const vehicles = [
    ['DHA-614', 'E&P Plant', 'Komatsu', 'D65 Dozer', 2014, 'Phase 6 Workshop', 'hrs', 4200000],
    ['DHA-722', 'LTV', 'Toyota', 'Hilux', 2019, 'Phase 7 HQ', 'km', 6500000],
    ['DHA-350', 'E&P Plant', 'JCB', '3CX Backhoe', 2016, 'Phase 6 Workshop', 'hrs', 9000000],
    ['DHA-981', 'HTV', 'Hino', 'Dump Truck', 2017, 'Phase 6 Workshop', 'km', 7800000],
    ['DHA-205', 'LTV', 'Suzuki', 'Bolan', 2021, 'Phase 6 HQ', 'km', 1500000],
    ['DHA-742', 'HTV', 'Hino', 'Water Bowser', 2015, 'Phase 7 HQ', 'km', 5200000],
    ['DHA-477', 'E&P Plant', 'Massey Ferguson', '385 Tractor', 2013, 'Phase 7 HQ', 'hrs', 2600000],
    ['DHA-890', 'LTV', 'Suzuki', 'Bolan', 2022, 'Phase 6 HQ', 'km', 1700000],
    ['DHA-233', 'LTV', 'Toyota', 'Hilux', 2020, 'Phase 7 Workshop', 'km', 6800000],
    ['DHA-118', 'HTV', 'Hino', 'Water Bowser', 2018, 'Phase 6 HQ', 'km', 5600000],
    ['DHA-399', 'LTV', 'Suzuki', 'Bolan', 2020, 'Phase 7 HQ', 'km', 1400000],
    ['DHA-601', 'LTV', 'Toyota', 'Hilux', 2018, 'Phase 6 Workshop', 'km', 5900000],
    ['DHA-275', 'LTV', 'Toyota', 'Hilux', 2017, 'Phase 6 HQ', 'km', 5400000],
    ['DHA-512', 'E&P Plant', 'Massey Ferguson', '240 Tractor', 2012, 'Phase 7 Workshop', 'hrs', 1900000],
    ['DHA-130', 'HTV', 'Isuzu', 'FVR Truck', 2016, 'Phase 7 HQ', 'km', 6100000],
    ['DHA-455', 'E&P Plant', 'Caterpillar', '140K Grader', 2015, 'Phase 6 Workshop', 'hrs', 18000000],
    ['DHA-808', 'LTV', 'Honda', 'CD-70 Motorcycle', 2023, 'Phase 7 HQ', 'km', 160000],
    ['DHA-062', 'HTV', 'Nissan', 'Diesel Bus', 2011, 'Phase 6 HQ', 'km', 3200000],
    ...[
      ['LTV', 'Toyota', 'Hilux'], ['LTV', 'Suzuki', 'Bolan'], ['LTV', 'Toyota', 'Corolla'], ['LTV', 'Suzuki', 'Cultus'],
      ['HTV', 'Hino', 'Dump Truck'], ['HTV', 'Isuzu', 'NPR Truck'], ['HTV', 'Hino', 'Water Bowser'], ['E&P Plant', 'JCB', '3CX Backhoe'],
      ['E&P Plant', 'Massey Ferguson', '385 Tractor'], ['E&P Plant', 'Komatsu', 'D65 Dozer'], ['LTV', 'Honda', 'CD-70 Motorcycle'],
    ].flatMap(([c, mk, md], i) => [0, 1, 2].map((k) => [
      `DHA-${String(700 + i * 13 + k * 101).padStart(3, '0')}`, c, mk, md, 2012 + ((i + k) % 12),
      ['Phase 6 HQ', 'Phase 6 Workshop', 'Phase 7 HQ', 'Phase 7 Workshop'][(i + k) % 4], c === 'E&P Plant' ? 'hrs' : 'km', null,
    ])),
  ].filter((r, i, arr) => arr.findIndex((x) => x[0] === r[0]) === i).map(([vehicle_no, category, make, model, year, section, meter_unit, current_value]) => ({
    id: id('v'), vehicle_no, category, make, model, year, section, meter_unit, current_value,
    chassis_no: null, engine_no: null, is_ber: false, notes: null,
    created_at: ago(400), updated_at: ago(400),
  }));
  const V = Object.fromEntries(vehicles.map((v) => [v.vehicle_no, v]));

  const job_cards = [], spares = [], job_events = [];
  const seqs = {};

  function job(vno, o) {
    const v = V[vno];
    const yr = new Date(new Date(o.received_at).getTime() + 5 * 3600000).getUTCFullYear();
    const k = vno + yr;
    seqs[k] = (seqs[k] || 0) + 1;
    const digits = vno.replace(/\D/g, '').padStart(4, '0');
    const j = {
      id: id('j'), job_no: `${yr}-${digits}-${String(seqs[k]).padStart(2, '0')}`,
      vehicle_id: v.id, meter_unit: v.meter_unit, section: v.section,
      fuel_in: '1/2', kit: ['Jack', 'Tool Kit', 'Vehicle Documents'], remarks: null,
      received_by: 'Zubair Khan', fail_count: 0, release_checks: [], external_cost: null,
      created_at: o.received_at, updated_at: o.received_at,
      ...o,
    };
    job_cards.push(j);
    return j;
  }
  const ev = (j, at, from, to, by, note) => job_events.push({ id: id('e'), job_card_id: j.id, at, from_status: from, to_status: to, by_name: by, note: note || null, created_at: at });
  const spare = (j, o) => spares.push({ id: id('s'), job_card_id: j.id, qty: 1, unit_cost: null, remarks: null, created_at: o.demanded_on + 'T10:00:00+05:00', updated_at: o.demanded_on + 'T10:00:00+05:00', approved_on: null, received_on: null, ...o });

  // A fully completed job: receipt -> inspection -> spares -> repair -> final -> release
  function closedJob(vno, start, length, fault, opts = {}) {
    const recv = ago(start, 8);
    const insp = ago(start - 0.3, 14);
    const repStart = ago(start - Math.max(1, Math.floor(length * 0.4)), 9);
    const repDone = ago(start - length + 1, 15);
    const fin = ago(start - length + 1, 16);
    const rel = ago(start - length, 10);
    const j = job(vno, {
      status: 'released', received_at: recv, meter_in: opts.meter || 20000, fault_category: fault,
      fault_detail: null, brought_by: opts.driver || 'Dvr. Shahid Mehmood',
      inspected_at: insp, diagnosis: opts.diag || `${fault} confirmed on inspection.`, repair_class: opts.cls || 'Medium',
      repair_by: opts.by || 'In-house', est_hours: opts.est || 12, inspected_by: 'Insp. Rashid Iqbal',
      repair_started_at: repStart, mechanics: opts.mech || 'Hav. Naeem Ahmed', work_done: opts.work || 'Fault rectified and tested.',
      man_hours: opts.hrs || 10, repair_completed_at: repDone, external_cost: opts.ext || null,
      final_inspected_at: fin, final_inspector: 'Insp. Rashid Iqbal', road_test: 'pass',
      released_at: rel, meter_out: (opts.meter || 20000) + 12, fuel_out: '1/2', handed_to: opts.driver || 'Dvr. Shahid Mehmood',
      release_checks: ['Fuel level matches receipt', 'Tools & kit returned', 'Documents returned', 'No new visible damage'],
      released_by: 'Maj (R) Imran Sheikh', release_remarks: null, updated_at: rel,
    });
    ev(j, recv, null, 'received', 'Zubair Khan');
    ev(j, insp, 'received', 'inspected', 'Zubair Khan');
    if (opts.parts) {
      ev(j, insp, 'inspected', 'awaiting_spares', 'Zubair Khan');
      for (const p of opts.parts) {
        spare(j, { part_name: p[0], part_no: p[1], source: p[2], unit_cost: p[3], qty: p[4] || 1,
          demanded_on: dateAgo(start), approved_on: dateAgo(start - 1), received_on: dateAgo(start - Math.max(1, Math.floor(length * 0.4))) });
      }
    }
    ev(j, repStart, opts.parts ? 'awaiting_spares' : 'inspected', 'under_repair', 'Zubair Khan');
    ev(j, repDone, 'under_repair', 'final_inspection', 'Zubair Khan');
    ev(j, fin, 'final_inspection', 'ready', 'Zubair Khan', 'Road test passed');
    ev(j, rel, 'ready', 'released', 'Zubair Khan');
    return j;
  }

  // ---- history (released jobs) ----
  closedJob('DHA-614', 270, 7, 'Clutch slipping', { meter: 2800, hrs: 14, parts: [['Clutch plate', 'CP-D65', 'OEM', 24000]] });
  closedJob('DHA-614', 213, 7, 'Track / undercarriage wear', { cls: 'Major', meter: 2900, hrs: 36, parts: [['Track roller', 'TR-D65-12', 'OEM', 58000]] });
  closedJob('DHA-614', 186, 7, 'Engine overheating', { meter: 2980, parts: [['Radiator core', 'RC-D65', 'Local Purchase', 35000]] });
  closedJob('DHA-614', 144, 6, 'Battery / electrical', { cls: 'Minor', meter: 3050, parts: [['Battery 24V', 'BAT-24', 'Store', 8500]] });
  closedJob('DHA-614', 95, 13, 'Hydraulic leak', { meter: 3140, parts: [['Hydraulic hose set', 'HH-D65', 'Store', 42000]] });
  closedJob('DHA-722', 240, 5, 'Brake failure', { meter: 61000, parts: [['Brake pads (set)', 'BP-HLX', 'Store', 9500]] });
  closedJob('DHA-722', 160, 4, 'Engine overheating', { meter: 66200, parts: [['Thermostat', 'TH-1KD', 'Store', 4500]] });
  closedJob('DHA-722', 136, 3, 'Engine overheating', { meter: 67100, parts: [['Water pump', 'WP-1KD', 'Local Purchase', 16000]] });
  closedJob('DHA-722', 60, 6, 'Suspension / steering', { meter: 70300, parts: [['Shock absorber', 'SA-HLX', 'Local Purchase', 14000, 2]] });
  closedJob('DHA-350', 220, 8, 'Hydraulic leak', { meter: 5100, parts: [['Seal kit', 'SK-3CX', 'OEM', 28000]] });
  closedJob('DHA-350', 120, 5, 'Tyre / wheel', { cls: 'Minor', meter: 5400 });
  closedJob('DHA-350', 75, 9, 'Gearbox / transmission', { cls: 'Major', by: 'Outsourced', ext: 85000, meter: 5600 });
  closedJob('DHA-981', 200, 6, 'Brake failure', { meter: 140000, parts: [['Brake chamber', 'BC-HINO', 'Store', 18000]] });
  closedJob('DHA-981', 110, 10, 'Hydraulic leak', { meter: 146000, parts: [['Tipper cylinder seal', 'TCS-500', 'Local Purchase', 22000]] });
  closedJob('DHA-981', 40, 4, 'Battery / electrical', { cls: 'Minor', meter: 149500 });
  closedJob('DHA-205', 180, 3, 'Clutch slipping', { meter: 30100, parts: [['Clutch plate', 'CP-118', 'Store', 7000]] });
  closedJob('DHA-205', 90, 2, 'Battery / electrical', { cls: 'Minor', meter: 33500 });
  closedJob('DHA-477', 150, 6, 'Engine overheating', { meter: 4100, parts: [['Fan belt', 'FB-385', 'Store', 2500]] });
  closedJob('DHA-477', 70, 5, 'Hydraulic leak', { meter: 4300 });
  closedJob('DHA-512', 250, 9, 'Engine not starting', { meter: 6100, parts: [['Starter motor', 'SM-240', 'Local Purchase', 26000]] });
  closedJob('DHA-512', 190, 6, 'Engine overheating', { meter: 6250 });
  closedJob('DHA-512', 130, 8, 'Engine overheating', { meter: 6400, parts: [['Radiator', 'RAD-240', 'Local Purchase', 31000]] });
  closedJob('DHA-512', 45, 5, 'Gearbox / transmission', { meter: 6600, by: 'Outsourced', ext: 40000 });
  closedJob('DHA-275', 200, 4, 'Brake failure', { meter: 98000 });
  closedJob('DHA-275', 100, 5, 'Battery / electrical', { meter: 102000 });
  closedJob('DHA-130', 160, 7, 'Tyre / wheel', { meter: 210000, parts: [['Tyre 10.00-20', 'TY-1000', 'Store', 48000, 2]] });
  closedJob('DHA-455', 140, 12, 'Hydraulic leak', { cls: 'Major', meter: 7800, parts: [['Main pump seal', 'MPS-140K', 'OEM', 95000]] });
  closedJob('DHA-062', 230, 9, 'Engine not starting', { cls: 'Major', meter: 412000, parts: [['Injector pump', 'IP-NIS', 'Local Purchase', 120000]] });
  closedJob('DHA-062', 80, 6, 'Body / accident damage', { meter: 418000, by: 'Outsourced', ext: 65000 });
  closedJob('DHA-601', 115, 3, 'Scheduled service', { cls: 'Minor', meter: 81000 });

  // ---- released today ----
  closedJob('DHA-275', 5, 5, 'Battery / electrical', { cls: 'Minor', meter: 104500, parts: [['Alternator', 'ALT-HLX', 'Local Purchase', 18500]] });
  closedJob('DHA-399', 3, 3, 'Clutch slipping', { meter: 52000, parts: [['Clutch cable', 'CC-BOL', 'Store', 1200]] });

  // ---- open jobs ----
  // Received
  let j = job('DHA-890', { status: 'received', received_at: ago(0.2, 8), meter_in: 18420, fault_category: 'Battery / electrical', fault_detail: 'Self not engaging', brought_by: 'Dvr. Akram' });
  ev(j, j.received_at, null, 'received', 'Zubair Khan');
  j = job('DHA-233', { status: 'received', received_at: ago(1, 10), meter_in: 54210, fault_category: 'Brake failure', brought_by: 'Dvr. Imtiaz', fuel_in: '3/4' });
  ev(j, j.received_at, null, 'received', 'Zubair Khan');

  // Inspected (spares not yet decided)
  j = job('DHA-205', { status: 'inspected', received_at: ago(4, 9), meter_in: 36810, fault_category: 'Clutch slipping', brought_by: 'Dvr. Nadeem',
    inspected_at: ago(3.6, 14), diagnosis: 'Clutch plate worn; pressure plate springs weak.', repair_class: 'Medium', repair_by: 'In-house', est_hours: 6, inspected_by: 'Insp. Rashid Iqbal' });
  ev(j, j.received_at, null, 'received', 'Zubair Khan'); ev(j, j.inspected_at, 'received', 'inspected', 'Zubair Khan');

  // Awaiting spares
  j = job('DHA-981', { status: 'awaiting_spares', received_at: ago(11, 8), meter_in: 151200, fault_category: 'Hydraulic leak', fault_detail: 'Tipper cylinder', brought_by: 'Dvr. Gul Khan',
    inspected_at: ago(10.7, 13), diagnosis: 'Hydraulic pump seal failed; oil leaking at pump flange.', repair_class: 'Medium', repair_by: 'In-house', est_hours: 10, inspected_by: 'Insp. Rashid Iqbal' });
  ev(j, j.received_at, null, 'received', 'Zubair Khan'); ev(j, j.inspected_at, 'received', 'inspected', 'Zubair Khan'); ev(j, j.inspected_at, 'inspected', 'awaiting_spares', 'Zubair Khan');
  spare(j, { part_name: 'Hydraulic pump seal kit', part_no: 'HP-SK-55', source: 'Local Purchase', unit_cost: 26000, demanded_on: dateAgo(11) });

  j = job('DHA-722', { status: 'awaiting_spares', received_at: ago(9, 9), meter_in: 72450, fault_category: 'Engine overheating', brought_by: 'Dvr. Shahid Mehmood',
    inspected_at: ago(8.8, 12), diagnosis: 'Radiator core blocked and cracked at top tank.', repair_class: 'Medium', repair_by: 'In-house', est_hours: 5, inspected_by: 'Insp. Rashid Iqbal' });
  ev(j, j.received_at, null, 'received', 'Zubair Khan'); ev(j, j.inspected_at, 'received', 'inspected', 'Zubair Khan'); ev(j, j.inspected_at, 'inspected', 'awaiting_spares', 'Zubair Khan');
  spare(j, { part_name: 'Radiator', part_no: 'RAD-722', source: 'OEM', unit_cost: 38000, demanded_on: dateAgo(9), approved_on: dateAgo(7) });
  spare(j, { part_name: 'Radiator hose kit', part_no: 'RH-410', source: 'Store', unit_cost: 3500, demanded_on: dateAgo(9), approved_on: dateAgo(9), received_on: dateAgo(8) });

  j = job('DHA-742', { status: 'awaiting_spares', received_at: ago(3, 11), meter_in: 98800, fault_category: 'Battery / electrical', fault_detail: 'Not charging', brought_by: 'Dvr. Rafiq',
    inspected_at: ago(2.9, 15), diagnosis: 'Alternator diode bridge failed.', repair_class: 'Minor', repair_by: 'In-house', est_hours: 3, inspected_by: 'Insp. Rashid Iqbal' });
  ev(j, j.received_at, null, 'received', 'Zubair Khan'); ev(j, j.inspected_at, 'received', 'inspected', 'Zubair Khan'); ev(j, j.inspected_at, 'inspected', 'awaiting_spares', 'Zubair Khan');
  spare(j, { part_name: 'Alternator', part_no: 'ALT-77', source: 'Local Purchase', unit_cost: 21000, demanded_on: dateAgo(3) });

  // Under repair
  j = job('DHA-614', { status: 'under_repair', received_at: ago(14, 8), meter_in: 3210, fault_category: 'Track / undercarriage wear', brought_by: 'Dvr. Shahid Mehmood',
    inspected_at: ago(13.8, 14), diagnosis: 'Left-side track shoes worn beyond serviceable limit; 3 links need replacement. Idler bearing play detected, replace during same strip-down.',
    repair_class: 'Major', repair_by: 'In-house', est_hours: 40, inspected_by: 'Insp. Rashid Iqbal',
    repair_started_at: ago(3, 9), mechanics: 'Hav. Naeem Ahmed, Sep. Waqas Ali', work_done: 'Removed left track, replaced worn shoes. Idler bearing in progress.', man_hours: 18 });
  ev(j, j.received_at, null, 'received', 'Zubair Khan'); ev(j, j.inspected_at, 'received', 'inspected', 'Zubair Khan'); ev(j, j.inspected_at, 'inspected', 'awaiting_spares', 'Zubair Khan'); ev(j, j.repair_started_at, 'awaiting_spares', 'under_repair', 'Zubair Khan');
  spare(j, { part_name: 'Track shoe set (36 links)', part_no: 'TS-D65-221', source: 'OEM', unit_cost: 145000, demanded_on: dateAgo(13), approved_on: dateAgo(12), received_on: dateAgo(3) });
  spare(j, { part_name: 'Idler bearing', part_no: 'IB-4471', source: 'Store', unit_cost: 9500, qty: 2, demanded_on: dateAgo(13), approved_on: dateAgo(13), received_on: dateAgo(10) });
  spare(j, { part_name: 'Track bolt set', part_no: 'TB-990', source: 'Local Purchase', unit_cost: 12400, demanded_on: dateAgo(13), approved_on: dateAgo(11), received_on: dateAgo(10) });

  j = job('DHA-350', { status: 'under_repair', received_at: ago(6, 9), meter_in: 5820, fault_category: 'Hydraulic leak', fault_detail: 'Boom cylinder', brought_by: 'Dvr. Sajid',
    inspected_at: ago(5.8, 13), diagnosis: 'Boom cylinder rod seal leaking; hose chafed.', repair_class: 'Medium', repair_by: 'In-house', est_hours: 12, inspected_by: 'Insp. Rashid Iqbal',
    repair_started_at: ago(4, 9), mechanics: 'Nk. Asif Iqbal', man_hours: 6 });
  ev(j, j.received_at, null, 'received', 'Zubair Khan'); ev(j, j.inspected_at, 'received', 'inspected', 'Zubair Khan'); ev(j, j.inspected_at, 'inspected', 'awaiting_spares', 'Zubair Khan'); ev(j, j.repair_started_at, 'awaiting_spares', 'under_repair', 'Zubair Khan');
  spare(j, { part_name: 'Hydraulic hose', part_no: 'HH-220', source: 'Store', unit_cost: 6500, qty: 2, demanded_on: dateAgo(6), approved_on: dateAgo(6), received_on: dateAgo(4) });

  j = job('DHA-601', { status: 'under_repair', received_at: ago(5, 10), meter_in: 84210, fault_category: 'Brake failure', brought_by: 'Dvr. Imtiaz',
    inspected_at: ago(4.8, 15), diagnosis: 'Front pads finished, disc scored.', repair_class: 'Minor', repair_by: 'In-house', est_hours: 4, inspected_by: 'Insp. Rashid Iqbal',
    repair_started_at: ago(2, 9), mechanics: 'Hav. Naeem Ahmed', man_hours: 2, fail_count: 1, road_test: 'fail', final_inspector: 'Insp. Rashid Iqbal', final_inspected_at: ago(1, 12), final_remarks: 'Pulling left under braking.' });
  ev(j, j.received_at, null, 'received', 'Zubair Khan'); ev(j, j.inspected_at, 'received', 'inspected', 'Zubair Khan'); ev(j, j.inspected_at, 'inspected', 'awaiting_spares', 'Zubair Khan');
  ev(j, j.repair_started_at, 'awaiting_spares', 'under_repair', 'Zubair Khan'); ev(j, ago(1.5, 15), 'under_repair', 'final_inspection', 'Zubair Khan');
  ev(j, ago(1, 12), 'final_inspection', 'under_repair', 'Zubair Khan', 'Road test failed: Pulling left under braking.');
  spare(j, { part_name: 'Brake pads (set)', part_no: 'BP-601', source: 'Store', unit_cost: 9500, qty: 2, demanded_on: dateAgo(5), approved_on: dateAgo(4), received_on: dateAgo(2) });

  // Final inspection
  j = job('DHA-118', { status: 'final_inspection', received_at: ago(2, 9), meter_in: 121400, fault_category: 'Brake failure', brought_by: 'Dvr. Rafiq',
    inspected_at: ago(1.9, 12), diagnosis: 'Brake master cylinder leaking internally.', repair_class: 'Medium', repair_by: 'In-house', est_hours: 5, inspected_by: 'Insp. Rashid Iqbal',
    repair_started_at: ago(1.5, 9), mechanics: 'Nk. Asif Iqbal', work_done: 'Master cylinder replaced, system bled.', man_hours: 5, repair_completed_at: ago(0.3, 8) });
  ev(j, j.received_at, null, 'received', 'Zubair Khan'); ev(j, j.inspected_at, 'received', 'inspected', 'Zubair Khan'); ev(j, j.inspected_at, 'inspected', 'awaiting_spares', 'Zubair Khan');
  ev(j, j.repair_started_at, 'awaiting_spares', 'under_repair', 'Zubair Khan'); ev(j, j.repair_completed_at, 'under_repair', 'final_inspection', 'Zubair Khan');
  spare(j, { part_name: 'Brake master cylinder', part_no: 'BM-300', source: 'Store', unit_cost: 14500, demanded_on: dateAgo(2), approved_on: dateAgo(2), received_on: dateAgo(2) });

  // Ready for release
  j = job('DHA-477', { status: 'ready', received_at: ago(3, 10), meter_in: 4480, fault_category: 'Engine overheating', brought_by: 'Dvr. Bashir',
    inspected_at: ago(2.9, 14), diagnosis: 'Radiator hoses perished, coolant loss.', repair_class: 'Minor', repair_by: 'In-house', est_hours: 3, inspected_by: 'Insp. Rashid Iqbal',
    repair_started_at: ago(1.9, 9), mechanics: 'Sep. Waqas Ali', work_done: 'Hoses replaced, coolant topped up.', man_hours: 3, repair_completed_at: ago(1, 12),
    final_inspected_at: ago(0.5, 10), final_inspector: 'Insp. Rashid Iqbal', road_test: 'pass' });
  ev(j, j.received_at, null, 'received', 'Zubair Khan'); ev(j, j.inspected_at, 'received', 'inspected', 'Zubair Khan'); ev(j, j.inspected_at, 'inspected', 'awaiting_spares', 'Zubair Khan');
  ev(j, j.repair_started_at, 'awaiting_spares', 'under_repair', 'Zubair Khan'); ev(j, j.repair_completed_at, 'under_repair', 'final_inspection', 'Zubair Khan'); ev(j, j.final_inspected_at, 'final_inspection', 'ready', 'Zubair Khan', 'Road test passed');
  spare(j, { part_name: 'Radiator hose kit', part_no: 'RH-410', source: 'Store', unit_cost: 3500, demanded_on: dateAgo(3), approved_on: dateAgo(3), received_on: dateAgo(2) });

  return { vehicles, job_cards, spares, job_events };
}
