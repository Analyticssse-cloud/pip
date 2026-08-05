# pip — LRM Performance Improvement Tracker

A Next.js/Postgres internal web app for SolarSquare's presales TL/ZSM cockpit: who on the
roster needs attention, the measurable coaching plan for each of them, and whether it's working.

Built from the design handoff in `docs/handoff/` — read `docs/handoff/README.md` first, then
`ARCHITECTURE.md` and `DATA_MODEL.md`. The original hi-fi HTML prototype is in
`docs/handoff/design-reference/`.

## Stack

Next.js 15 (App Router) · Auth.js v5 (Google, `solarsquare.in` / `homes.solarsquare.in` only) ·
Postgres via Prisma · Vercel Cron for the nightly sync.

## Screens

- **Watchlist** (`/` default tab) — KPI cards, the six MD+DD bands, the roster table.
- **LRM plan** — one LRM's diagnosis, the four metric bars, the 4-week chart, and the
  measurable plan (30-day sprint or coaching track), with shared checkbox state.
- **Trend** — weekly MD+DD trajectory across everyone on the watchlist.

The plan/banding/root-cause engine lives in `lib/metrics.ts` — a direct port of the prototype's
`bandOf` / `causeOf` / `metricNow` / `phases`, and the one module to keep byte-faithful (the
`a`–`l` item keys are the join key to persisted checkbox state; don't renumber them).

## Local setup

```bash
npm install
cp .env.example .env        # fill in AUTH_*, DATABASE_URL, sheet/service-account env vars
npx prisma migrate dev --name init
npm run dev
```

Seed a roster: share `SHEET_LRM_BAND_ID` with the service account, then
`curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/sync`. Seed a `ClusterSetting`
row for `CLUSTER_NAME` (defaults to `Pune`) if you want thresholds other than the defaults
(benchmark 4, tenure guard 60 days, plan model `sprint`) — `lib/aggregate.ts` creates one with
those defaults on first read otherwise.

## What's wired vs. what's a known follow-up

- **Wired:** roster identity + target/CAL/OAL/lead-score/productive-hours sync from the "Today's
  Plan" band sheet (`lib/sheets.ts`, `app/api/sync/route.ts`), the full plan engine, checkbox +
  decision persistence (`app/api/plan-item`, `app/api/decision`), Google auth restricted to the
  two company domains, the three screens recreated pixel-close to the prototype off the same
  design tokens (`styles/tokens.css`).
- **Follow-up (flagged in `docs/handoff/DATA_MODEL.md` itself, not new scope creep):** per-day
  MD+DD (and the four weekly buckets) and BQL→MD conversion aren't on the band sheet — they need
  a Metabase query per `docs/handoff/DATA_MODEL.md` §2 and `lib/metabase.ts` (stubbed, not
  called from the sync job yet). Productive hours currently take the sheet's latest snapshot
  rather than a per-day series. Until that's wired, `ach`/`weeks[]` read 0 on a fresh sync — that's
  expected, not a bug in `lib/aggregate.ts`.

## Repo layout

```
app/
  page.tsx                 # auth guard + data load (Server Component)
  layout.tsx, globals.css
  signin/page.tsx
  views/                   # Watchlist.tsx, LrmPlan.tsx, Trend.tsx
  api/
    auth/[...nextauth]/route.ts
    sync/route.ts           # nightly Vercel Cron target
    plan-item/route.ts       # POST toggle checkbox
    decision/route.ts        # POST cycle decision + note
components/
  TrackerShell.tsx          # client: view/filter/selId state, wires the 3 views
  Blueprint.tsx  Tag.tsx  KpiCard.tsx  SegControl.tsx  BarChart.tsx
lib/
  metrics.ts                # ★ banding + root-cause + measurable-plan engine
  derive.ts                 # pure view-model builder (client-safe)
  aggregate.ts               # Prisma rows -> LrmMetrics + Thresholds, cycle creation
  sheets.ts  auth.ts  db.ts  cluster.ts  metabase.ts
prisma/schema.prisma
styles/tokens.css           # design tokens, lifted from the prototype's stylesheet
docs/handoff/                # the original design handoff bundle, kept for reference
```
