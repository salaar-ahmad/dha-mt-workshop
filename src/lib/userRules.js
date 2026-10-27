// Rules for managing logins. Shared by the server function (live site) and the demo,
// so both behave exactly the same.

export const USER_ROLES = ['ad_wksp', 'am_wksp', 'mt_clerk', 'proc_clerk', 'ceo'];
export const CAN_VIEW_USERS = ['ad_wksp', 'am_wksp'];
export const CAN_MANAGE_USERS = ['ad_wksp'];
export const USERNAME_RE = /^[a-z][a-z0-9._]{2,29}$/;
export const MIN_PASSWORD = 8;

class RuleError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

/**
 * Throws a RuleError if `actor` may not do `action`.
 * users: current list [{ id, username, full_name, role, active }]
 */
export function checkUserAction(actor, action, p = {}, users = []) {
  if (!actor || !CAN_VIEW_USERS.includes(actor.role)) throw new RuleError('Only AD Wksp or AM Wksp can open user management.', 403);
  if (!['list', 'create', 'update', 'reset_password', 'set_active'].includes(action)) throw new RuleError('Unknown action.');
  if (action === 'list') return;
  if (!CAN_MANAGE_USERS.includes(actor.role)) throw new RuleError('Only AD Wksp can create or change logins.', 403);

  const activeAds = users.filter((u) => u.role === 'ad_wksp' && u.active !== false);
  const target = p.id ? users.find((u) => u.id === p.id) : null;
  if (action !== 'create' && !target) throw new RuleError('That login no longer exists.', 404);
  const lastAd = target && target.role === 'ad_wksp' && target.active !== false && activeAds.length <= 1;

  switch (action) {
    case 'create': {
      const username = String(p.username || '').trim().toLowerCase();
      if (!USERNAME_RE.test(username)) throw new RuleError('Username must be 3 to 30 characters: lowercase letters, numbers, dot or underscore, starting with a letter.');
      if (users.some((u) => u.username === username)) throw new RuleError(`The username "${username}" is already taken.`);
      if (!String(p.full_name || '').trim()) throw new RuleError('Enter the person\'s name.');
      if (!USER_ROLES.includes(p.role)) throw new RuleError('Pick a role.');
      if (String(p.password || '').length < MIN_PASSWORD) throw new RuleError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    case 'update': {
      if (p.role != null && !USER_ROLES.includes(p.role)) throw new RuleError('Pick a valid role.');
      if (p.full_name != null && !String(p.full_name).trim()) throw new RuleError('Name cannot be empty.');
      if (p.role && p.role !== target.role) {
        if (target.id === actor.id) throw new RuleError('You cannot change your own role. Ask another AD Wksp.');
        if (lastAd) throw new RuleError('This is the only active AD Wksp. Make someone else AD Wksp first.');
      }
      return;
    }
    case 'reset_password':
      if (String(p.password || '').length < MIN_PASSWORD) throw new RuleError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    case 'set_active':
      if (!p.active) {
        if (target.id === actor.id) throw new RuleError('You cannot disable your own login.');
        if (lastAd) throw new RuleError('This is the only active AD Wksp and cannot be disabled.');
      }
      return;
    default:
      throw new RuleError('Unknown action.');
  }
}

export function suggestPassword() {
  const words = ['Jeep', 'Track', 'Gear', 'Piston', 'Bolt', 'Clutch', 'Diesel', 'Axle', 'Rotor', 'Valve', 'Tyre', 'Wrench'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(100 + Math.random() * 900)}`;
}
