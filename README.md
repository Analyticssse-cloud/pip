# LRM Performance Improvement Tracker — deployable app

A complete **Next.js (App Router, TypeScript)** app, ready to push to **Vercel**. It renders the
three tracker screens (Watchlist / LRM plan / Trend) from the prototype, with Google login,
role-based access (manager vs LRM), and shared persistence in Postgres.

It runs in **two modes**, controlled entirely by environment variables:

| Mode | When | Behavior |
|---|---|---|
| **Demo** | `AUTH_GOOGLE_ID` unset, `DATABASE_URL` unset | No login. Opens as a TL (manager) with an in-app "Signed in as" switcher to preview the LRM view. Data comes from the bundled sample roster (`lib/sample.ts`); checkbox/note/decision state persists to `localStorage`. Great for a first deploy or a design review. |
| **Full** | all env vars set | Google login locked to the team domains; role resolved from the session; roster + metrics read from Postgres (populated by the nightly sync); checkbox/decision writes shared across the team. |

You do **not** have to configure anything to see it run — `npm run dev` works out of the box in demo mode.

## Run it locally

```bash
npm install
cp .env.example .env          # optional — leave blank for demo mode
npm run dev                   # http://localhost:3000
```

To exercise the full stack locally, fill in `.env` (see `../ARCHITECTURE.md` §4), then:

```bash
npx prisma migrate dev --name init
# seed a cluster settings row (benchmark 4, tenureGuard 60, planModel "sprint")
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/sync   # pull the roster
```

## Deploy to Vercel

1. Push this folder to a Git repo and import it into Vercel.
2. **Demo deploy:** set nothing — it deploys and renders on sample data immediately.
3. **Full deploy:**
   - Create the Google OAuth client (redirect `https://<app>/api/auth/callback/google`), set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `AUTH_SECRET` / `AUTH_URL`.
   - Provision Postgres, set `DATABASE_URL`. `npm run build` runs `prisma generate`; run `prisma migrate deploy` on first release (`db:migrate` script).
   - Create the Google **service account**, share the source Sheet with it, set `GOOGLE_SERVICE_ACCOUNT_KEY` (base64) + `SHEET_LRM_BAND_ID` + `SHEET_LRM_BAND_RANGE` + `CRON_SECRET`.
   - `vercel.json` already registers the nightly cron (`/api/sync`, 02:00 IST). Hit it once manually with the bearer secret to seed.

## File map

```
app/
  layout.tsx                     # html shell + global tokens
  page.tsx                       # session -> role, load cluster, render Shell
  signin/page.tsx                # Google sign-in (full mode)
  actions.ts                     # server actions: savePlanItem / saveCycleDecision (manager-only)
  api/auth/[...nextauth]/route.ts
  api/sync/route.ts              # nightly Vercel Cron: Sheet -> Postgres upsert
  globals.css                    # Industry design-system tokens + component classes
components/
  Shell.tsx                      # top bar, role gating, view switching, write path
  Blueprint.tsx                  # the square + corner-mark frame
  uiHelpers.ts                   # band colors, delta formatting
  views/Watchlist.tsx  views/LrmPlan.tsx  views/Trend.tsx
lib/
  metrics.ts                     # ★ banding + root-cause + measurable-plan engine
  data.ts                        # loadCluster(): Postgres -> LrmMetrics[], falls back to sample
  sample.ts                      # bundled sample roster (ported from the prototype)
  sheets.ts                      # read the LRM band sheet -> per-LRM records
  session.ts                     # email -> role (manager | lrm)
  auth.ts                        # Auth.js Google, locked to the team domains
  db.ts                          # Prisma client (null without DATABASE_URL)
prisma/schema.prisma             # app tables + synced roster/metrics mirror
```

## Access & roles (enforced server-side)
- **Manager** (anyone on the allowed domains *not* in the roster): all three tabs, Switch-LRM picker, and edit controls.
- **LRM** (email matches a roster record): opens straight to *their own* plan, read-only; Watchlist/Trend hidden, picker hidden, checkboxes and decisions disabled.

Write actions re-check the role server-side (`app/actions.ts` → `assertManager`), so a hidden/disabled control is not the only guard.

## The one thing to get right
`lib/metrics.ts` is the faithful port of the prototype's plan engine. The `itemKey` letters
(`a`–`l`) are the stable join key between generated plan items and their persisted checkbox
state — don't renumber them.

## Notes / caveats
- **Weekly MD+DD series (`weeks`)** isn't fully in the band sheet — `lib/data.ts` currently
  flattens the rolling average as a placeholder (marked `TODO(sync)`). Wire a real 4-week series
  from the daily MD+DD report / Metabase for the Trend and phase-gate readings to be exact.
- `bqlToMd` (conversion) isn't on the sheet — derive from the funnel or leave 0; the root-cause
  engine tolerates 0 but confirm before showing a conversion number to leadership.
- `sheets.ts` parses the presentation matrix by anchoring on email cells, never absolute columns.
  Prefer moving to a direct Metabase query (`../DATA_MODEL.md` §2) if the tab layout drifts.
