// Logins and what each one can do. Role keys must match the `role` column in Supabase `profiles`.
export const ROLES = {
  ad_wksp:    { label: 'AD Wksp',            group: 'Admin' },
  am_wksp:    { label: 'AM Wksp',            group: 'Admin' },
  mt_clerk:   { label: 'MT Clerk',           group: 'Clerk' },
  proc_clerk: { label: 'Procurement Clerk',  group: 'Clerk' },
  ceo:        { label: 'CEO',                group: 'View only' },
};

const ADMINS = ['ad_wksp', 'am_wksp'];

export function permsFor(role) {
  const r = role || '';
  const admin = ADMINS.includes(r);
  return {
    admin,
    receive: admin || r === 'mt_clerk',        // open new job cards at the gate
    stages: admin || r === 'mt_clerk',         // inspection, repair, final inspection, release
    demandSpares: admin || r === 'mt_clerk',   // raise a spares demand
    procure: admin || r === 'proc_clerk',      // approve / receive spares, enter costs
    addVehicle: admin || r === 'mt_clerk',
    editVehicle: admin || r === 'mt_clerk',  // edit details and import the fleet list
    declareBer: admin,                         // mark a vehicle condemned / BER
    correct: admin,                            // correct completed stages
    deleteJob: admin,
    exec: true,                                // everyone can see the Overview
    viewUsers: admin,                          // see the Users page
    manageUsers: r === 'ad_wksp',              // create logins, change roles, reset passwords, disable
  };
}

// ---------------------------------------------------------------
// Workspaces: which tabs each login sees and which pages it may open.
// Deny by default: a page not listed for a role is blocked, and a role
// not listed here sees nothing.
// ---------------------------------------------------------------
const NAV_ALL = [
  { to: '/overview', label: 'Overview' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/jobs', label: 'Job Board', match: /^\/(jobs|new)/ },
  { to: '/vehicles', label: 'Vehicle Master List', match: /^\/vehicles/ },
  { to: '/spares', label: 'Spares Register' },
];
const NAV_ADMIN = [...NAV_ALL, { to: '/users', label: 'Users' }];
const ALL_PAGES = [/^\/$/, /^\/overview$/, /^\/dashboard$/, /^\/jobs(\/[^/]+)?$/, /^\/new$/, /^\/vehicles(\/[^/]+)?$/, /^\/spares$/, /^\/print\/(job|release)\/[^/]+$/];

export const WORKSPACE = {
  ad_wksp: { home: '/dashboard', nav: NAV_ADMIN, pages: [...ALL_PAGES, /^\/users$/] },
  am_wksp: { home: '/dashboard', nav: NAV_ADMIN, pages: [...ALL_PAGES, /^\/users$/] },
  ceo:     { home: '/overview',  nav: NAV_ALL, pages: ALL_PAGES.filter((re) => !re.test('/new')) },
  mt_clerk: {
    home: '/jobs',
    nav: [
      { to: '/jobs', label: 'Job Board', match: /^\/jobs/ },
      { to: '/new', label: '+ New Job Card' },
      { to: '/vehicles', label: 'Vehicle Master List', match: /^\/vehicles/ },
      { to: '/spares', label: 'Spares Register' },
    ],
    // Spares Register is view only for MT Clerk (approving / receiving stays with Procurement)
    pages: [/^\/$/, /^\/jobs(\/[^/]+)?$/, /^\/new$/, /^\/vehicles(\/[^/]+)?$/, /^\/spares$/, /^\/print\/(job|release)\/[^/]+$/],
  },
  proc_clerk: {
    home: '/spares',
    nav: [{ to: '/spares', label: 'Spares Register' }],
    pages: [/^\/$/, /^\/spares$/],
  },
};

const NONE = { home: '/', nav: [], pages: [] };
export const workspaceFor = (role) => WORKSPACE[role] || NONE;
export const canOpen = (role, path) => workspaceFor(role).pages.some((re) => re.test(path));
