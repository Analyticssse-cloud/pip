# Architecture — LRM Performance Improvement Tracker

Target: a small internal web app, deployed to **Vercel**, logged in with **Google (team domain only)**,
backed by **Postgres**, refreshed nightly from **Metabase + Google Sheets**.

This is deliberately a thin app: three read-mostly screens plus a little shared write state
(checkboxes, decisions). Don't over-build it.

---

## 1. Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router)** on Vercel | Server Components for the read views; a few Route Handlers / Server Actions for writes. |
| Auth | **Auth.js (NextAuth v5)** Google provider | Restrict to the two company domains; see §3. |
| DB | **Postgres** (Vercel Postgres / Neon / Supabase) | Accessed via **Prisma** or Drizzle. Schema in `DATA_MODEL.md`. |
| Data sync | **Vercel Cron** → a serverless route | Pulls from Metabase read replica and/or Google Sheets nightly; upserts into Postgres. §5. |
| Styling | Plain CSS variables + CSS Modules (or Tailwind with the tokens mapped in) | Tokens come from `design-reference/industry-styles.css`. Recreate the `.blueprint` frame as a component. |
| Charts | Hand-rolled divs (as the prototype does) or a tiny lib | The bar/trend charts are simple; SVG/flex divs are fine. |

Keep the data layer server-side. The browser should never hold Metabase credentials or the
service-account key.

## 2. Folder layout (suggested)

```
app/
  layout.tsx                 # fonts (Barlow / Barlow Condensed), token CSS, auth guard
  page.tsx                   # the tracker shell: tabs + active view (Server Component)
  api/
    auth/[...nextauth]/route.ts
    sync/route.ts            # cron target — pulls + upserts (protected, §5)
    plan-item/route.ts       # POST toggle checkbox  (Server Action is fine instead)
    decision/route.ts        # POST cycle decision + note
  views/
    Watchlist.tsx
    LrmPlan.tsx
    Trend.tsx
components/
  Blueprint.tsx              # square frame + 4 corner marks
  KpiCard.tsx  Tag.tsx  SegControl.tsx  BarChart.tsx
lib/
  db.ts                      # Prisma client
  metrics.ts                 # banding, root-cause, phase-generation logic (port from the prototype)
  metabase.ts                # read-replica query client (service login + CSV/JSON)
  sheets.ts                  # Google Sheets read (service account)
  auth.ts                    # Auth.js config
prisma/
  schema.prisma
styles/
  tokens.css                 # lifted :root block from industry-styles.css
```

## 3. Auth — team only

Use Auth.js with the Google provider and **reject anyone outside the company domains**. The
roster identifiers in the data are `@solarsquare.in`; some staff sign in as
`@homes.solarsquare.in` (the user who commissioned this is on `homes.solarsquare.in`). **Allow both.**

```ts
// lib/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED = new Set(["solarsquare.in", "homes.solarsquare.in"]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    async signIn({ profile }) {
      const domain = (profile?.email ?? "").split("@")[1]?.toLowerCase();
      // Optionally also require profile.email_verified and hd === domain
      return !!domain && ALLOWED.has(domain);
    },
  },
});
```

Add `hd=solarsquare.in` as an authorization hint if you want Google to pre-filter the account
chooser, but still enforce the domain check server-side (the `hd` param is not a security boundary).

Wrap the whole app in the auth guard in `app/layout.tsx` (redirect unauthenticated users to
`signIn`). Everyone who can log in can see the whole cluster — there is no per-row visibility
requirement. If you later want ZSMs to see only their clusters, add a `cluster` claim and filter
the roster query; the schema already carries `tl`/`zsm`/`city`.

> **Normalize emails when joining app-auth identity to roster/Metabase identity.** Follow the
> SolarSquare convention: `LOWER(TRIM(REPLACE(email,'@homes.solarsquare.in','@solarsquare.in')))`
> so `homes.` and bare addresses match the same person. `DATA_MODEL.md` repeats this.

## 4. Environment variables

```
# Auth
AUTH_SECRET=                     # openssl rand
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_URL=https://<app>.vercel.app

# Postgres
DATABASE_URL=

# Metabase read replica (service login)
METABASE_URL=
METABASE_USER=
METABASE_PASSWORD=
METABASE_LRM_METRICS_CARD=       # saved-question id, if you sync via a Metabase card
# ...or direct replica creds if you query Postgres straight (bound scans! see DATA_MODEL §sync)

# Google Sheets (service account, for Timechamp/attendance tabs)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_KEY=      # base64 the JSON key
SHEET_PRODUCTIVE_TIME_ID=1edfGwxoz4CxVWbEUsTZt1b1v5ryV287O03qrGzHgrEA
SHEET_ATTENDANCE_ID=1D8DrcQhACIiArnEk5uv1Ee_GQamM_tRS_fbzy7tqXL8

# Cron protection
CRON_SECRET=
```

## 5. The sync job

**Trigger:** Vercel Cron, nightly (the top bar says "D-1 data", so a once-a-day refresh after
midnight IST is the intent). `vercel.json`:

```json
{ "crons": [ { "path": "/api/sync", "schedule": "30 20 * * *" } ] }
```
(`20:30 UTC` = `02:00 IST`.)

**Protect the route** — require `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it) and
reject otherwise, so it can't be triggered by the public.

**What it does (idempotent upsert):**
1. Pull LRM roster + identity (name, email, TL, ZSM, city, tenure, target) — see `DATA_MODEL.md`.
2. Pull the four input metrics + weekly MD+DD per LRM from Metabase.
3. Pull productive hours from the Timechamp sheet and attendance/DOJ from the attendance sheet.
4. `UPSERT` into `lrm` and `lrm_daily_metrics` (keyed by `lrm_id` + `date`).
5. Never touch `plan_item_state` / `cycle_decision` — those are app-owned human state.

**Replica safety (critical):** the Metabase source is a **hot-standby read replica** that
throws "canceling statement due to conflict with recovery" on long scans. Bound every query
(filter to the current cycle window and the cluster's LRMs first; join big tables only against
that pre-filtered set) and wrap the fetch in **retry-with-backoff**. `DATA_MODEL.md` gives the
query shapes and the specific SolarSquare gotchas (text-typed dates, phone/email normalization,
the "meeting done" rule, Manual-only call filter).

**Sheets vs Metabase:** productive-time and attendance currently live in Google Sheets that are
themselves generated from source systems. Reading the sheets is the fast path to parity with
today's numbers; moving those to direct Metabase/Timechamp queries later is a clean follow-up.
Map sheet columns **by header name, not position** (headers drift).

## 6. Rendering the views

- `page.tsx` (Server Component) reads the session, loads the roster + metrics + this cluster's
  thresholds from Postgres, computes banding / root-cause / phases in `lib/metrics.ts` (a direct
  port of the prototype's `bandOf` / `causeOf` / `phases` / `metricNow`), and passes plain data
  to the three view components.
- Checkbox toggles and decisions are **Server Actions** (or POST route handlers) that write to
  Postgres and revalidate. Because state is shared, use `revalidatePath('/')` or optimistic UI +
  refetch so a second TL sees the tick.
- The plan-generation logic is the valuable part — keep it in one tested module. Its inputs are
  the LRM's synced metrics + the cluster benchmark; its outputs are the exact target/now/measured
  strings shown on the phase cards.

## 7. Deploy checklist
1. Create the Google OAuth client (authorized redirect `https://<app>/api/auth/callback/google`).
2. Provision Postgres, `prisma migrate deploy`.
3. Create the Google **service account**, share the two source Sheets with its email (read-only).
4. Set all env vars in Vercel (Production + Preview).
5. Set the Metabase service login (or read-replica creds).
6. Deploy; hit `/api/sync` once manually (with the bearer secret) to seed; confirm the roster
   populates; then let cron take over.
7. Seed the cluster thresholds row (benchmark 4, tenureGuard 60, planModel sprint).
