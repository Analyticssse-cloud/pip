# Handoff: LRM Performance Improvement Tracker

A production build spec for turning the HTML prototype in `design-reference/` into a
deployed internal web app: **Next.js on Vercel, Google login (team-only), Postgres for
shared per-user state, and a scheduled sync from Metabase + Google Sheets.**

Read the three companion docs alongside this one:

- **`ARCHITECTURE.md`** — stack, folder layout, auth, deployment, env vars, the sync job.
- **`DATA_MODEL.md`** — every number on screen mapped to its real source table/column, the Postgres schema, and the sync queries.
- **`design-reference/`** — the working HTML prototype (open `LRM Performance Tracker.dc.html` in a browser after loading its design-system bundle; it is a *reference*, not code to ship).

---

## Overview

The tracker is a **TL/ZSM cockpit for the presales LRM (Lead Relationship Manager) improvement process**. It answers three questions for one cluster's roster:

1. **Who needs attention?** (Watchlist) — everyone below the MD+DD/day benchmark, sorted worst-first, each with the single binding root cause and the standing-rule action band.
2. **What exactly do we do about this one person?** (LRM plan) — a per-LRM coaching plan where **every action carries a numeric target, a live current reading, and the report it is measured from**. Two plan shapes: a 30-day sprint with weekly gates, or a metric-led coaching track.
3. **Is it working?** (Trend) — weekly MD+DD trajectory across the watchlist; direction over level.

"MD+DD" = **Meetings Done + DEV Done** per working day — the LRM's core output metric.

## About the design files

The files in `design-reference/` are **design references built in HTML** — a prototype showing the intended look, layout, and interaction. They are **not** production code to copy. The prototype is written as a "Design Component" (a custom `<x-dc>` runtime) and styled entirely with the **Industry** design system's CSS variables. Your job is to **recreate this UI in a real Next.js/React codebase** using the design tokens listed below, and to wire it to real data and real persistence per `DATA_MODEL.md`.

`design-reference/industry-styles.css` is the design-system stylesheet — you can lift the `:root` token block from it verbatim into the new app (see **Design tokens** below).

## Fidelity

**High-fidelity.** Final colors, typography, spacing, layout, copy, and interaction states are all settled. Recreate the three screens pixel-faithfully using the tokens below. The one thing that is *sample* data is the ten-LRM `DATA` array baked into the prototype — replace it with the live query results from `DATA_MODEL.md`.

---

## Screens / views

The app is a single authenticated page with a top bar (title + cluster context + three tab buttons + cycle-day readout) and three switchable views. State is `view` ∈ {`roster`, `plan`, `trend`}.

### 1. Watchlist (`roster`)
**Purpose:** the TL's morning triage — who is on the tracker and why.

**Layout (top → bottom):**
- **4 KPI cards** in a `repeat(4, 1fr)` grid, 20px gap: *On the tracker* (count below benchmark), *Team average* (MD+DD/day), *Moving up* (count improving week-on-week), *Needs a decision* (count at cycle end).
- **"Where the team sits"** — 6 band buckets in a `repeat(6, 1fr)` grid: `≥10`, `7–10`, `4–7`, `2–4`, `0–2`, `0` MD+DD. Each shows the LRM count, a proportional bar, and the standing-rule action tag (No action / Observe / Train / PIP-exit / Fix allocation).
- **Roster table** with a segmented filter (*On the tracker* vs *Full team*). Columns: LRM (name + email), Tenure, Target, Achieved (+ % of target), **MD+DD/day** (bold), Wk-on-wk delta (▲/▼), Live leads, BQL>MD, Prod. hrs, "What is holding them back" (root-cause short text), Action band tag, and an **Open plan** button per row.
- Footnote restating the banding rule.

**Banding rule (drives the Action tag and bucket color):**
- `≥10` MD+DD/day → **No action**
- `7–10` → **Observe**
- `4–7` and `2–4` → **Train**
- `<2` → **PIP / exit** *unless* tenure < the tenure-guard (default 60 days), in which case **Train**
- `live leads == 0` → **Fix allocation** (an allocation bug, not a performance case — overrides everything)

### 2. LRM plan (`plan`)
**Purpose:** the actual improvement plan for one selected LRM.

**Layout:** two columns — `340px` sidebar + fluid main, 28px gap, `align-items: start`.

**Sidebar:**
- Identity card: name, email, band tag, trajectory tag, and a City/TL/ZSM/Tenure/Cycle detail grid.
- "Switch LRM" list — one button per watchlisted LRM (selected one filled accent), showing their MD+DD/day.

**Main column (top → bottom):**
- **"The one thing to fix"** — a full accent-900 (`#1d2d3d`) card, paper-colored text: the binding root-cause title + explanation. The root cause is computed as the *lowest* of the four input ratios (live leads / hours / conversion / lead score vs their bars); zero live leads short-circuits to "allocation".
- **"Where they stand against the bar"** — 4 metric cards (MD+DD/day, Live leads, Productive hours, BQL→MD) each with value, bar vs benchmark, and a short/at-bar status.
- **"Four weeks of daily output"** — a 4-bar column chart of weekly MD+DD averages with a dashed benchmark line.
- **"The plan"** — a segmented toggle between **30-day sprint · weekly gates** and **Coaching track · metric-led**, a progress bar (`n of m done`), a one-line blurb, then **4 phase cards** in a `repeat(2, 1fr)` grid. **This is the core of the recent work — see "The measurable plan" below.**
- **"Close the cycle"** — a coaching-note textarea and four decision buttons (Exit the watchlist / Run one more cycle / Change lead allocation / Escalate to formal PIP); the chosen decision is echoed as a timestamped label.

#### The measurable plan (important)
Each phase card renders:
- **Header:** phase label + a **gate** tag (e.g. `≥ 2.4/day`).
- **Exit** row — the numeric condition to leave the phase (e.g. "Average ≥ 2.4 MD+DD/day across 5 working days").
- **Now** row — the LRM's current reading against that gate, colored green (`--color-accent-700`) if met, deep (`--color-accent-900`) if not.
- **A list of check items.** Every item has four parts:
  - a checkbox + action text (strikes through when done),
  - **Target** — the quantified goal (e.g. "≥ 100 live leads · 0 leads untouched > 3 days"),
  - **Now** — the live measured value with a "% short" / "at the bar" verdict,
  - **Measured** — the exact report the number comes from (e.g. "Timechamp · TL morning review sheet", "Metabase funnel", "LRM master").
- **Footer:** Owner + Evidence source.

The sprint's four gates are benchmark-relative: `0.4×`, `0.6×`, `0.85×`, `1.0×` of the benchmark. The coaching track's four stages exit on: baseline recorded → **+25% on the binding input** → **≥80% of the bar** → benchmark held solo for 5 days. All target/now strings are generated from the LRM's data and the binding root cause — see `CAUSES` and `phases()` in the reference JS, and reproduce that logic in `DATA_MODEL.md`'s terms.

### 3. Trend (`trend`)
**Purpose:** is the intervention landing across the watchlist.
- 3 KPI cards: Improving / Flat / Sliding counts.
- A table: LRM, 4 weekly MD+DD mini-bars (Week 1–4), Change (Δ week4−week1), and a trajectory tag. Improving = Δ ≥ +0.5, Sliding = Δ ≤ −0.5, else Flat; zero-lead LRMs are "Blocked".

---

## Interactions & behavior
- **Tab switch** — top-bar buttons set `view`; active tab is accent-filled, paper text.
- **Open plan** — row/sidebar buttons set `view='plan'` and `selId`.
- **Plan model toggle** — swaps sprint ⇄ coaching; regenerates all phases and the progress count. Default comes from the `planModel` setting.
- **Checkbox toggle** — flips one plan item's done state, keyed by `lrm : model : itemId`. **In production this must persist to Postgres, shared across the team** (see `DATA_MODEL.md` → `plan_item_state`). In the prototype it is in-memory only.
- **Decision buttons / note** — record the cycle outcome; **persist to `cycle_decision`**.
- **Configurable thresholds** (prototype exposes these as tweak props; make them cluster-level settings in the app):
  - `benchmark` — MD+DD/day bar (default **4**, range 2–8).
  - `tenureGuard` — grace-period days before PIP eligibility (default **60**).
  - `planModel` — default plan shape (`sprint` | `coach`).

## State management
- **Ephemeral UI state:** `view`, `filter` (watch/all), `selId`, `model` override.
- **Persisted, shared (Postgres):** plan-item checkbox state, cycle decision + note, and the cluster thresholds. Keyed by the authenticated user for the "done_by" audit trail but visible to the whole team.
- **Derived server-side (synced):** every metric on screen (`ach`, `cal`, `score`, `prod`, `conv`, `weeks`, `tenure`, `target`, `tl`, `zsm`, `city`). None of these are entered by hand — they come from the sync job.

## Design tokens

Lift these from `design-reference/industry-styles.css` (`:root`). Typography is **Barlow Condensed** for headings, **Barlow** for body (Google Fonts).

**Core roles**
| Token | Value |
|---|---|
| `--color-bg` | `#f2f2f3` |
| `--color-surface` | `#e9e9ea` |
| `--color-text` | `#1d1f20` |
| `--color-accent` | `#5980a6` |
| `--color-divider` | `color-mix(in srgb, #1d1f20 16%, transparent)` |

**Accent ramp** `100 #eef6ff · 200 #d6ebff · 300 #b5d9fd · 400 #94bce3 · 500 #749dc4 · 600 #597ea3 · 700 #416180 · 800 #2c455d · 900 #1d2d3d`

**Neutral ramp** `100 #f5f5f8 · 200 #e7e7ea · 300 #d4d4d7 · 400 #b7b7ba · 500 #98989b · 600 #7a7a7d · 700 #5d5d60 · 800 #424244 · 900 #2b2b2d`

**The blueprint frame.** Cards, figures, and the primary button are square-cornered, hairline-bordered line drawings (no surface fill) with a `+` registration mark in each corner (the `.blueprint` class + four `.corner` marks in the reference CSS). Reproduce this as a small React `<Blueprint>` wrapper. The one deliberate exception is the solid accent primary button and the accent-900 "one thing to fix" card. Do **not** round corners or add drop shadows beyond the system's `--shadow-*`.

## Assets
No images or icons are required by the design. Where icons help (tabs, buttons), the system specifies **Lucide at stroke-width 1.5**. Fonts: Barlow + Barlow Condensed (Google Fonts).

## Files in this bundle
- `README.md` — this file.
- `ARCHITECTURE.md` — how to build & deploy it.
- `DATA_MODEL.md` — data sources, DB schema, sync queries.
- `design-reference/LRM Performance Tracker.dc.html` — the hi-fi prototype.
- `design-reference/support.js` — the prototype's runtime (reference only; not needed in the new app).
- `design-reference/industry-styles.css` — the Industry design-system stylesheet (source of the tokens).
