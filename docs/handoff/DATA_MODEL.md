# Data model — LRM Performance Improvement Tracker

Two kinds of data:

- **Synced / derived** — every metric on screen. Read-only in the app, refreshed nightly by the
  sync job. **The primary source is now confirmed: the "Today's Plan" LRM band sheet**
  (`18-CHBpyH6pTPwp2LmFnhwTy8t78_PbCjc0mraNX5w_E`), which carries every per-LRM number the
  tracker needs. Metabase is the alternative/back-fill for the few fields the sheet pre-aggregates
  (per-day MD+DD, weekly averages, BQL→MD). Nobody types these.
- **App-owned** — the coaching-plan checkboxes, the cycle decision + note, and the cluster
  thresholds. Written by authenticated TLs, shared across the team.

> **Both earlier ⚠ flags are resolved** by the band sheet: `target` = its **MD+DD Target**
> column and `score` = its **Avg lead Score** column. What still needs deriving (not on the
> sheet) is per-day MD+DD, the four weekly averages, and BQL→MD conversion — get those from the
> daily MD+DD report or Metabase. When you do touch Metabase, apply the `solarsquare-sql`
> conventions: regex-guard text-date casts, filter to IST windows, normalize phone/email on
> joins, and bound every replica scan.

## 0. The band sheet is the contract (confirmed)

The linked sheet lays LRMs out in the **same six MD+DD bands and `<60 / 60–120 / >120` tenure
tiers** the prototype uses, repeated per view (MTD, D-1, LMTD, LMTD D-1). Each LRM cell group is,
positionally: **email · MD+DD Target · MD+DD Achieved · OAL · CAL · Avg lead Score · Productive
Hour · owner (TL/ZSM)**. `OAL` = Originally Assigned Leads, `CAL` = Currently Assigned Leads (=
the tracker's **live leads**). Productive Hour is an HTML duration span — parse to decimal hours
(see `starter/lib/sheets.ts`). The band→action map on the sheet is identical:
`≥10 No Action · 7–10 Observe · 4–7 Train · 2–4 Train · 0–2 PIP/exit · 0 PIP/exit`.

Field mapping straight off the sheet: `target←MD+DD Target`, `ach←MD+DD Achieved`,
`cal←CAL`, `oal←OAL`, `score←Avg lead Score`, `prod←Productive Hour`, `tl/zsm←owner column`.
Only `weeks[]` (weekly averages) and `conv` (BQL→MD) come from elsewhere.

---

## 1. What each on-screen field means and where it comes from

The prototype's `DATA` array is the contract. Per LRM per cycle:

| Field | On screen | Meaning | Source |
|---|---|---|---|
| `id` / email | LRM name, email | LRM identity | `users` (Metabase). Email is the join key everywhere. |
| `tl`, `zsm` | Plan sidebar, roster context | Team Lead, Zonal Sales Manager | `users` hierarchy. |
| `city` | Plan sidebar | Cluster/city | `city_state_cluster` via pincode (authoritative), fallback to lead city. |
| `tenure` | Roster "Tenure", banding guard | Days since joining | DOJ from the **attendance sheet** (`DOJ` column) or `users`; `today − DOJ`. |
| `target` | Roster "Target", cycle line | LRM's MD+DD target for the cycle | **Band sheet → `MD+DD Target`.** ✓ |
| `ach` | Roster "Achieved" | MD+DD achieved so far this cycle | **Band sheet → `MD+DD Achieved`** (cycle total); per-day from the daily MD+DD report / Metabase §2. |
| `weeks[4]` | Bar chart, Trend | Weekly **average** MD+DD/day, 4 weeks | Daily MD+DD report / Metabase, bucketed by ISO week ÷ working days (not on the band sheet). |
| `cal` | "Live leads" | Currently Assigned Leads | **Band sheet → `CAL`.** ✓ (`OAL` = Originally Assigned, also on the sheet.) |
| `conv` | "BQL>MD" % | BQL → meeting-done conversion | Metabase funnel §2 (not on the band sheet). |
| `score` | "Avg lead score" | Mean lead score of the LRM's book | **Band sheet → `Avg lead Score`.** ✓ |
| `prod` | "Prod. hrs" | Productive hours per worked day | **Band sheet → `Productive Hour`** (duration span → decimal hrs). ✓ |

`WD = 26` in the prototype is the cycle's working-day count — make it the real count of working
days in the cycle window, not a constant.

The four "bars" the root-cause engine compares are: `cal/100` (live leads), `prod/7.0`
(productive hours), `conv/35` (BQL→MD %), `score/6.3` (lead score). The **lowest** ratio is the
binding constraint; `cal == 0` short-circuits to "allocation". Keep those benchmark constants
(`B_CAL 100`, `B_PROD 7.0`, `B_CONV 35`, `B_SCORE 6.3`) as configurable settings.

## 2. Source queries (Metabase read replica)

Ground rules from `solarsquare-sql` — apply all of them:

- **Meeting done rule:** a meeting counts only if `meeting_done_date >= meeting_schedule_date`.
- **Prefer `lead_stage_status_audit_history`** for typed milestone timestamps (the `lead` table
  stores them as text; regex-guard any cast: `CASE WHEN col ~ '^\d{4}-\d{2}-\d{2}T' THEN col::timestamptz ...`).
- **Meeting join key:** `meeting_metrics_history.lead_id` is business code (e.g. `RMH50584`) =
  `lead.lead_id`, *not* `entityId`. Collapse dupes with `DISTINCT ON`.
- **DEV stage string** is exactly `'DEV Scheduled'`. **Meeting-confirmed stage** is exactly
  `'Meeting Confirmed - Customer Home'`.
- **First/So current LRM:** `lead.assigned_lrm` is the *current* owner — correct for "live leads
  in hand now". For historical credit use the initial-assignment hybrid pattern.
- **IST windows:** `>= timestamptz '2026-08-01 00:00:00 +05:30' AND < ...` — never bare UTC dates.
- **Email normalization on every people-join:**
  `LOWER(TRIM(REPLACE(u.emails,'@homes.solarsquare.in','@solarsquare.in')))`.
- **Bound the scan:** pre-filter to this cluster's LRMs and the cycle window before joining big
  tables; wrap in retry-with-backoff for replica recovery conflicts.

**MD+DD achieved (`ach`, and the weekly buckets for `weeks`)** — per LRM, cycle-to-date:
count meetings done (passing the done rule, per-lead-per-day grain) **plus** DEV-done events,
grouped by assigned LRM; for `weeks`, additionally `GROUP BY date_trunc('week', event_day IST)`
and divide each week by that week's working-day count.

**Live leads (`cal`)** — count of the LRM's currently-assigned leads in an active/live stage
(exclude closed/lost/`isDelete`). `COALESCE(l."isDelete",0)=0`.

**BQL→MD conversion (`conv`)** — of leads that reached BQL (became a qualified/bookable lead) in
the window, the share that reached meeting-done. Confirm the exact BQL stage string against a
stage-value dump before shipping the number.

**Lead score (`score`)** — ⚠ mean of the lead-scoring field across the LRM's book. Confirm the
column (there are scoring-related fields on `lead`); until confirmed, treat as provisional and
keep it out of any automated PIP trigger.

**Productive hours (`prod`)** — from the **LRM Productive-Time sheet**
(`SHEET_PRODUCTIVE_TIME_ID`), the month-wise tab's `Prod Hrs / Worked Day` per employee; map by
the `Employee`/email header. (Longer term this can move to a direct Timechamp/Metabase query.)

**Tenure / attendance** — from the **attendance sheet** (`SHEET_ATTENDANCE_ID`): `DOJ`,
present/half/absent counts if you want to surface attendance later. Map by LRM email header.

## 3. Postgres schema (app database)

```prisma
// prisma/schema.prisma  (Prisma flavor; Drizzle equivalent is fine)

model AppUser {           // populated by Auth.js on first Google login
  id        String   @id @default(cuid())
  email     String   @unique   // store normalized (homes. -> bare)
  name      String?
  role      String   @default("TL")   // TL | ZSM | ADMIN
  createdAt DateTime @default(now())
  planItems PlanItemState[]
  decisions CycleDecision[]
}

model Lrm {               // synced; one row per LRM, upserted nightly
  id         String   @id            // stable LRM id / normalized email
  email      String   @unique
  name       String
  tl         String?
  zsm        String?
  city       String?
  tenureDays Int?
  doj        DateTime?
  cycles     Cycle[]
  metrics    LrmDailyMetric[]
  updatedAt  DateTime @updatedAt
}

model LrmDailyMetric {    // synced; the raw daily numbers the views aggregate
  id            String   @id @default(cuid())
  lrm           Lrm      @relation(fields: [lrmId], references: [id])
  lrmId         String
  date          DateTime @db.Date
  mdDd          Float    @default(0)   // meetings done + dev done that day
  liveLeads     Int?                   // snapshot
  productiveHrs Float?
  bqlToMd       Float?                 // running % or the day's numerator/denominator
  leadScore     Float?
  @@unique([lrmId, date])
}

model Cycle {             // one improvement cycle per LRM
  id          String   @id @default(cuid())
  lrm         Lrm      @relation(fields: [lrmId], references: [id])
  lrmId       String
  startDate   DateTime
  endDate     DateTime
  workingDays Int
  target      Int?
  benchmark   Float    @default(4)     // snapshot of the threshold at cycle start
  tenureGuard Int      @default(60)
  planModel   String   @default("sprint")  // sprint | coach
  status      String   @default("open")    // open | closed
  planItems   PlanItemState[]
  decision    CycleDecision?
}

model PlanItemState {     // app-owned; the measurable-plan checkboxes, shared
  id        String   @id @default(cuid())
  cycle     Cycle    @relation(fields: [cycleId], references: [id])
  cycleId   String
  model     String                 // sprint | coach  (a cycle can show both)
  phase     String                 // e.g. "Week 1 — Reset" / "Diagnose"
  itemKey   String                 // stable id: matches the prototype's a..l keys
  done      Boolean  @default(false)
  doneBy    AppUser? @relation(fields: [doneById], references: [id])
  doneById  String?
  doneAt    DateTime?
  @@unique([cycleId, model, phase, itemKey])
}

model CycleDecision {     // app-owned; the "close the cycle" outcome
  id         String   @id @default(cuid())
  cycle      Cycle    @relation(fields: [cycleId], references: [id])
  cycleId    String   @unique
  outcome    String                // exit | continue | reallocate | pip
  note       String?
  decidedBy  AppUser  @relation(fields: [decidedById], references: [id])
  decidedById String
  decidedAt  DateTime @default(now())
}

model ClusterSetting {   // app-owned thresholds (was tweak props)
  id          String @id @default(cuid())
  cluster     String @unique        // e.g. "Pune"
  benchmark   Float  @default(4)
  tenureGuard Int    @default(60)
  planModel   String @default("sprint")
}
```

**Checkbox key parity.** The prototype keys each item `lrmId : model : itemId` where `itemId` is
a stable letter (`a`–`l`) within the plan. Preserve those letters as `PlanItemState.itemKey` so
the plan-generation code and the persisted state line up regardless of copy changes.

## 4. Sync ↔ app boundary

- The nightly job writes **only** `Lrm`, `LrmDailyMetric`, and (optionally) refreshes `Cycle`
  target/tenure. It must **never** write `PlanItemState`, `CycleDecision`, or `ClusterSetting`.
- Opening a plan for an LRM with no `open` Cycle creates one (start = today, end = +30 days,
  workingDays computed, thresholds copied from `ClusterSetting`).
- All plan target/now strings are computed at read time from `LrmDailyMetric` + the cycle
  benchmark — they are not stored. Port `metricNow()` and `phases()` from the reference JS.

## 5. Known source gotchas (from `solarsquare-sql`, don't relearn the hard way)
- `lead` milestone dates are **text**; audit-history has them typed — join the audit table.
- Ozonetel call logs are **all varchar**; cast durations to numeric, `+91`-strip phones, and use
  **Manual call type only** for agent performance. Real-connect proxy = **≥15s** duration.
- Attribution columns (`created_by`, `updated_by`, `status_stage_updated_by`) are ~12% filled
  and/or role/system sentinels — **do not** build "who did X" splits on them yet.
- Read replica throws recovery-conflict errors on long scans — bound + retry.
- The source Google Sheets are regenerated exports; map by **header name, not column position**.
