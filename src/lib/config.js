// Workshop-specific lists. Edit these to match your own forms.

export const SECTIONS = ['Phase 6 HQ', 'Phase 6 Workshop', 'Phase 7 HQ', 'Phase 7 Workshop'];

export const CATEGORIES = ['LTV', 'HTV', 'E&P Plant'];

export const FAULTS = [
  'Engine overheating',
  'Engine not starting',
  'Brake failure',
  'Hydraulic leak',
  'Clutch slipping',
  'Gearbox / transmission',
  'Battery / electrical',
  'Suspension / steering',
  'Tyre / wheel',
  'Track / undercarriage wear',
  'Body / accident damage',
  'Scheduled service',
];

export const KIT_ITEMS = ['Jack', 'Spare Wheel', 'Tool Kit', 'Fire Extinguisher', 'Vehicle Documents', 'Fuel Card'];

export const RELEASE_CHECKS = [
  'Fuel level matches receipt',
  'Tools & kit returned',
  'Documents returned',
  'No new visible damage',
];

export const FUEL_LEVELS = ['E', '1/4', '1/2', '3/4', 'F'];
export const REPAIR_CLASSES = ['Minor', 'Medium', 'Major'];
export const REPAIR_BY = ['In-house', 'Outsourced', 'Recommend BER'];
export const SPARE_SOURCES = ['Store', 'Local Purchase', 'OEM'];

// Vehicles off road longer than this are flagged red
export const OVERDUE_DAYS = 7;
// Repeat fault window (same fault returning within N days of release)
export const REPEAT_WINDOW_DAYS = 30;
// Beyond Economical Repair threshold: lifetime repair cost as % of vehicle value
export const BER_THRESHOLD_PCT = 60;

export const TIMEZONE = 'Asia/Karachi';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const LOGIN_DOMAIN = import.meta.env.VITE_LOGIN_DOMAIN || 'dha-mt.local';
export const DEMO_MODE = import.meta.env.MODE === 'demo' || !SUPABASE_URL || !SUPABASE_ANON_KEY;
