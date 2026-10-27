# DHA MT Workshop

Repair tracking for the Mechanical Transport Workshop, DHA Phase 6 & 7.
Follows the EME-style flow: **Receipt → Technical Inspection → Spares → Repair → Final Inspection → Release**,
with every stage time-stamped so downtime, spares delay and repair time are calculated automatically.

Stack: React (Vite) on **Netlify**, data and logins on **Supabase**.

---

## 1. Set up Supabase (10 minutes, once)

1. Go to https://supabase.com, create a free account and a **New project**
   (Region: closest available, e.g. *Mumbai* or *Singapore*). Save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, click **Run**.
   It should finish with "Success. No rows returned".
3. **Authentication → Sign In / Providers → Email**: turn **off** "Confirm email"
   (clerks log in with a username, not a real mailbox).
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key. You need them in step 2.

### Create user accounts

Users log in with a username. Behind the scenes the username becomes `username@dha-mt.local`.

1. **Authentication → Users → Add user → Create new user**
   - Email: `tariq@dha-mt.local` (username `tariq`)
   - Password: choose one
   - Tick **Auto Confirm User**
2. **Table Editor → profiles**: the user appears automatically with role `mt_clerk`.
   Edit `full_name` (e.g. `M. Tariq`) and set `role` to one of these:

| Role key | Login | Can do |
|---|---|---|
| `ad_wksp` | AD Wksp | Everything: open and progress job cards, spares, add/edit vehicles, correct completed stages, delete a mistaken job card |
| `am_wksp` | AM Wksp | Same as AD Wksp |
| `mt_clerk` | MT Clerk | Open job cards at the gate, record inspection, repair, final inspection and release, raise spares demands, add/edit/import vehicles, follow spares progress (view only) |
| `proc_clerk` | Procurement Clerk | Approve and receive spares, enter spare costs. Lands on the Spares Register. Cannot change job stages |
| `ceo` | CEO | View only. Lands on the Workshop Overview (availability, turnaround, where time goes, spend, vehicles to watch) |

Suggested usernames: `adwksp`, `amwksp`, `mtclerk`, `procclerk`, `ceo` (emails `adwksp@dha-mt.local` etc.).
**Workspaces.** Each login sees only its own tabs:
- AD Wksp, AM Wksp: all tabs (Overview, Dashboard, Job Board, Vehicle Master List, Spares Register)
- CEO: all tabs, view only
- MT Clerk: Job Board, + New Job Card, Vehicle Master List (can add, edit and import vehicles), Spares Register (view only)
- Procurement Clerk: Spares Register only

Typing the address of any other page shows "Not part of your workspace". Tabs and pages are set in `src/lib/roles.js` (`WORKSPACE`).
Who can *change* what is enforced by the database rules in `schema.sql`, so hiding a tab is not the only protection.

The name in `full_name` is printed on job cards as "Received by" / "Released by".

### Load the fleet (78 vehicles)

Fastest way: in the app, **Vehicle Master List → Import from Excel** (AD Wksp, AM Wksp or MT Clerk). It accepts .xlsx or .csv,
shows a preview, adds new vehicle numbers and updates existing ones. **Download template** gives the column layout.
Alternative: fill `supabase/vehicles_template.csv`, then **Table Editor → vehicles → Insert → Import data from CSV**.
Rules: `category` must be exactly `LTV`, `HTV` or `E&P Plant`; `meter_unit` is `km` or `hrs`.
`current_value` (Rs) is optional but needed for the BER indicator.

You can also add vehicles one at a time in the app (Vehicle Master List → + Add Vehicle).

---

## Managing logins (AD Wksp)

After the first setup, logins are managed inside the app from the **Users** tab:

| | AD Wksp | AM Wksp | Everyone else |
|---|---|---|---|
| See the list of logins and recent changes | Yes | Yes | No |
| Create a login, change name or role | Yes | No | No |
| Reset a password | Yes | No | No |
| Disable / enable a login | Yes | No | No |

Safety rules (enforced on the server, not just the screen):
- AD Wksp cannot change his own role or disable his own login.
- The last active AD Wksp cannot be demoted or disabled, so the system is never left without an admin.
- Nobody can change roles from the browser directly: the `profiles` table has no edit permission; changes go only through the server function.
- A disabled login is signed out and cannot sign in again; its past entries stay on the records.
- Every create, role change, password reset and disable is recorded with who did it and when.

**One-time setup for the Users tab:** in Netlify, add one more environment variable:
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase > Project Settings > API > **service_role** key.
  This key is powerful: put it only in Netlify, never in `.env` files you share or in the code.

**The very first AD Wksp** still has to be created in Supabase (Authentication > Users > Add user, then set
`role` = `ad_wksp` in Table Editor > profiles). After that, AD Wksp creates everyone else from the app.

What each role is *allowed to do* is fixed in the code (`src/lib/roles.js`, `supabase/schema.sql`).
Changing that needs a developer and a redeploy, on purpose.

---

## 2. Deploy on Netlify

**Option A: from GitHub (recommended, auto-deploys on every change)**
1. Push this folder to a GitHub repository.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
   Build settings are read from `netlify.toml` (build `npm run build`, publish `dist`).
3. **Site configuration → Environment variables**, add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
4. **Deploys → Trigger deploy**. Rename the site (e.g. `dha-mt-workshop.netlify.app`) under Site configuration.

**Option B: drag and drop**
1. On your PC: create a `.env` file from `.env.example` with your two keys.
2. Run `npm install` then `npm run build`.
3. Drag the `dist` folder onto https://app.netlify.com/drop.

If the keys are missing the app runs in **demo mode** (yellow banner, sample data, nothing shared).

---

## 3. Run locally

```bash
npm install
npm run dev          # http://localhost:5173 (demo mode if no .env)
npm run build:demo   # single-file demo in dist-demo/index.html
```

---

## How the workflow maps to the screens

| Stage | Who | Screen | What gets recorded |
|---|---|---|---|
| 1. Receipt | Clerk at gate | **+ New Job Card** | Vehicle, date/time, odometer/hours, fuel, fault, driver, kit received |
| 2. Technical Inspection | Inspector (clerk enters) | Job card, stage 2 | Diagnosis, repair class (Minor/Medium/Major), In-house / Outsourced / Recommend BER, est. hours |
| 3. Spares | Clerk / store | Job card stage 3 or **Spares Register** | Part, part no, qty, source (Store/Local Purchase/OEM), cost, demanded → approved → received dates |
| 4. Repair | Mechanics | Job card, stage 4 | Mechanics, work done, man-hours, outsourced cost |
| 5. Final Inspection | Inspector (must differ from mechanic) | Job card, stage 5 | Road test Pass → ready, Fail → back to repair (counted) |
| 6. Release | Clerk + receiving driver | Job card, stage 6 | Odometer out, fuel, handed to, joint inspection checklist. Print Release Note |

**Automatic figures**
- Days in workshop, days waiting for inspection, awaiting spares, under repair (from the stage history)
- Fleet availability % = vehicles not in workshop ÷ vehicles on strength (BER vehicles excluded)
- Per vehicle: breakdowns this year, days off road, repair cost, mean days between breakdowns,
  repeat faults (same fault back within 30 days of release), BER ratio (lifetime repair cost ÷ current value, threshold 60%)

**Edit lists and thresholds** in `src/lib/config.js`: sections, fault list, kit checklist, release checks,
overdue days (7), repeat window (30 days), BER threshold (60%).

## Backups
Supabase free tier keeps daily backups for 7 days only. Once a month, use **Export to Excel (CSV)** on the
Vehicle Master List and Spares Register, or Supabase **Database → Backups** on a paid plan.
