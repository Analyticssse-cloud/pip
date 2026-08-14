// lib/metrics.ts — the banding, root-cause and measurable-plan engine.
// A faithful TypeScript port of the prototype's bandOf / causeOf / metricNow / phases.
// Inputs are one LRM's synced numbers + the cluster benchmark; outputs are exactly the
// strings the phase cards render (target / now / measured). Keep this module tested — it is
// the heart of the app.

export type PlanModel = "sprint" | "coach";

export interface LrmMetrics {
  id: string;
  name: string;
  email: string;
  tl: string;
  zsm: string;
  city: string;
  tenureDays: number;
  target: number;      // MD+DD Target
  ach: number;         // MD+DD Achieved (cycle to date)
  cal: number;         // Currently Assigned Leads (live leads)
  oal: number;         // Originally Assigned Leads
  leadScore: number;   // Avg lead Score
  prod: number;        // productive hours / worked day
  conv: number;        // BQL -> MD %  (may be derived; keep 0 if unknown)
  weeks: [number, number, number, number]; // weekly avg MD+DD/day
}

export interface Thresholds {
  benchmark: number;   // MD+DD/day bar (default 4)
  tenureGuard: number; // days (default 60)
  workingDays: number; // cycle working-day count (prototype used 26)
}

// Input benchmarks the four "bars" are measured against.
export const BARS = { CAL: 100, PROD: 7.0, CONV: 35, SCORE: 6.3 } as const;

export type Band = "No action" | "Observe" | "Train" | "PIP / exit" | "Fix allocation";

export function avgPerDay(l: LrmMetrics, t: Thresholds) {
  return l.ach / t.workingDays;
}

export function bandOf(l: LrmMetrics, t: Thresholds): Band {
  const avg = avgPerDay(l, t);
  if (l.cal === 0) return "Fix allocation";
  if (avg >= 10) return "No action";
  if (avg >= 7) return "Observe";
  if (avg >= 4) return "Train";
  if (l.tenureDays < t.tenureGuard) return "Train";
  return "PIP / exit";
}

export type CauseKey = "allocation" | "pipeline" | "hours" | "conversion" | "quality";

export interface Cause {
  key: CauseKey;
  metric: string;
  title: string;
  short: string;
  body: string;
  action: string;
  fixTarget: string;
  fixSource: string;
  drill: string;
  drillTarget: string;
  drillSource: string;
}

export const CAUSES: Record<CauseKey, Cause> = {
  allocation: {
    key: "allocation", metric: "Live leads assigned",
    title: "No leads to work with",
    short: "Zero live leads — allocation is blocked",
    body: "Zero originally-assigned and zero currently-assigned leads for the whole cycle. This is not a performance case: the assignment rule is not reaching them. Unblock allocation first, then judge the output.",
    action: "Unblock assignment in the LRM master and backfill leads from the cluster pool",
    fixTarget: "60 leads assigned by day 5 · 10 fresh leads/day after",
    fixSource: "LRM master · daily assignment report",
    drill: "Verify fresh leads actually land before any output target is set",
    drillTarget: "10 new leads/day on 5 consecutive days",
    drillSource: "LRM master · daily assignment report",
  },
  pipeline: {
    key: "pipeline", metric: "Live leads in hand",
    title: "Pipeline is starved",
    short: "Too few live leads to hit the number",
    body: "The conversion behaviour is fine — the funnel is simply too thin to produce meetings. Fix the input before asking for more output, otherwise the target is arithmetically out of reach.",
    action: "Raise live leads from the cluster pool and clear every untouched aged lead",
    fixTarget: "≥ 100 live leads · 0 leads untouched > 3 days",
    fixSource: "LRM master · CRM aged-lead list",
    drill: "Daily reactivation block on aged leads",
    drillTarget: "30 min/day · 25 aged leads touched/day",
    drillSource: "CRM activity log",
  },
  hours: {
    key: "hours", metric: "Productive hours/day",
    title: "Not enough productive hours",
    short: "Productive hours well under the bar",
    body: "Output tracks hours almost one-to-one here. The leads and the lead quality are workable; the day is not structured, so the calling never reaches volume.",
    action: "Lock three fixed calling blocks a day and review the log with the TL each morning",
    fixTarget: "≥ 7.0h productive/day · 3 blocks/day · 0 missed reviews",
    fixSource: "Timechamp · TL morning review sheet",
    drill: "Two uninterrupted calling blocks with no CRM admin inside them",
    drillTarget: "2 × 90 min/day · ≥ 55 dials/day",
    drillSource: "Timechamp + Ozonetel call log",
  },
  conversion: {
    key: "conversion", metric: "BQL → MD conversion",
    title: "Leads are not turning into meetings",
    short: "BQL to MD conversion far below the bar",
    body: "Enough leads, enough hours — the pitch is where it breaks. Meetings are being asked for and not landing, so the fix is call quality, not call volume.",
    action: "Shadow recorded calls with the TL each week and rebuild the meeting ask",
    fixTarget: "5 calls scored/week · BQL→MD ≥ 35%",
    fixSource: "Call recordings · Metabase funnel",
    drill: "Rehearse the meeting ask on live calls with the TL listening in",
    drillTarget: "3 live calls/day · ask made on 100% of them",
    drillSource: "TL call-scoring sheet",
  },
  quality: {
    key: "quality", metric: "Average lead score",
    title: "Lead quality is working against them",
    short: "Average lead score below the cluster mix",
    body: "The assigned mix skews to low-score leads, so the same effort returns fewer meetings than peers get. Re-route the weakest leads before drawing a performance conclusion.",
    action: "Re-route leads scoring under 5.0 and rebalance the mix to the cluster average",
    fixTarget: "Avg score ≥ 6.30 · < 20% of book under 5.0",
    fixSource: "Lead scoring table",
    drill: "Work the highest-scored leads first, before anything else",
    drillTarget: "Top 20 scored leads touched before 12:00, daily",
    drillSource: "CRM activity log · timestamps",
  },
};

export function causeOf(l: LrmMetrics): Cause {
  if (l.cal === 0) return CAUSES.allocation;
  const ranked: [CauseKey, number][] = [
    ["pipeline", l.cal / BARS.CAL],
    ["hours", l.prod / BARS.PROD],
    ["conversion", l.conv / BARS.CONV],
    ["quality", l.leadScore / BARS.SCORE],
  ].sort((a, b) => a[1] - b[1]) as [CauseKey, number][];
  return CAUSES[ranked[0][0]];
}

export function trajectoryOf(l: LrmMetrics): "Improving" | "Sliding" | "Flat" | "Blocked" {
  if (l.cal === 0) return "Blocked";
  const d = l.weeks[3] - l.weeks[0];
  if (d >= 0.5) return "Improving";
  if (d <= -0.5) return "Sliding";
  return "Flat";
}

interface MetricNow { text: string; ok: boolean; }

export function metricNow(l: LrmMetrics, key: CauseKey): MetricNow {
  const map: Record<CauseKey, [number, number, string]> = {
    allocation: [l.cal, 60, `${l.cal} live leads`],
    pipeline: [l.cal, BARS.CAL, `${l.cal} live leads`],
    hours: [l.prod, BARS.PROD, `${l.prod.toFixed(1)}h/day`],
    conversion: [l.conv, BARS.CONV, `${l.conv}%`],
    quality: [l.leadScore, BARS.SCORE, `${l.leadScore.toFixed(2)} avg score`],
  };
  const [val, bar, label] = map[key];
  const short = bar ? Math.round((1 - val / bar) * 100) : 0;
  return { text: label + (val >= bar ? " · at the bar" : ` · ${short}% short`), ok: val >= bar };
}

export interface PlanItem {
  itemKey: string; text: string;
  target: string; now: string; nowOk: boolean | null; source: string;
}
export interface Phase {
  label: string; gate: string; exit: string;
  gateNow: string; gateOk: boolean | null;
  owner: string; evidence: string; items: PlanItem[];
}

// Faithful port of the prototype's phases(). `done` state is NOT included here —
// merge it in from PlanItemState by (model, phase, itemKey) at render time.
export function phases(l: LrmMetrics, t: Thresholds, model: PlanModel): Phase[] {
  const b = t.benchmark;
  const c = causeOf(l);
  const now = metricNow(l, c.key);
  const convPct = Math.max(l.conv, 10) / 100;
  const bqlPerDay = Math.ceil(b / convPct);
  const leadsCycle = Math.ceil((b * t.workingDays) / convPct);
  const dayFloor = (b * 0.5).toFixed(1);
  const wkNow = (i: number, gate: number): MetricNow => ({
    text: `Week ${i + 1} actual ${l.weeks[i].toFixed(1)}/day`, ok: l.weeks[i] >= gate,
  });
  const item = (itemKey: string, text: string, target: string, nowObj: MetricNow | null, source: string): PlanItem => ({
    itemKey, text, target,
    now: nowObj ? nowObj.text : "not logged yet",
    nowOk: nowObj ? nowObj.ok : null,
    source,
  });
  const phase = (label: string, gate: string, exit: string, nowObj: MetricNow | null, owner: string, evidence: string, items: PlanItem[]): Phase => ({
    label, gate, exit,
    gateNow: nowObj ? nowObj.text : "not measured yet",
    gateOk: nowObj ? nowObj.ok : null,
    owner, evidence, items,
  });

  if (model === "sprint") {
    const g = [b * 0.4, b * 0.6, b * 0.85, b];
    return [
      phase("Week 1 — Reset", `≥ ${g[0].toFixed(1)}/day`, `Average ≥ ${g[0].toFixed(1)} MD+DD/day across 5 working days`, wkNow(0, g[0]), l.tl, "Stand-up log", [
        item("a", `Sign the diagnosis with ${l.tl} — one binding input: ${c.metric.toLowerCase()}`, "1 signed sheet by day 3", null, "Cycle file"),
        item("b", c.action, c.fixTarget, now, c.fixSource),
        item("c", "Post the day plan with the day’s MD+DD number at the 9:30 stand-up", "5 of 5 working days · 0 missed", null, "Stand-up log"),
      ]),
      phase("Week 2 — Build the habit", `≥ ${g[1].toFixed(1)}/day`, `Average ≥ ${g[1].toFixed(1)}/day and no single day under ${dayFloor}`, wkNow(1, g[1]), l.name, "Timechamp + CRM", [
        item("d", c.drill, c.drillTarget, null, c.drillSource),
        item("e", `Book the conversation volume the target needs at the current ${l.conv}% conversion`, `${bqlPerDay} BQL conversations/day → ${b.toFixed(1)} MD+DD/day`, now, "Metabase funnel"),
        item("f", "Peer-shadow an LRM already clearing the bar", "2 sessions/week · 45 min each", null, "TL calendar"),
      ]),
      phase("Week 3 — Push volume", `≥ ${g[2].toFixed(1)}/day`, `Average ≥ ${g[2].toFixed(1)}/day on 4 of 5 working days`, wkNow(2, g[2]), l.name, "Daily MD+DD report", [
        item("g", "Hold the fixed calling blocks without TL prompting", `3 blocks/day · ≥ ${BARS.PROD.toFixed(1)}h productive`, metricNow(l, "hours"), "Timechamp"),
        item("h", "Mid-sprint check: has the binding input actually moved?", `+25% vs day 1 on ${c.metric.toLowerCase()}`, now, "Metabase · week-on-week"),
        item("i", "Top up the book so the target is arithmetically reachable", `≥ ${BARS.CAL} live leads · ${leadsCycle} worked in the cycle`, metricNow(l, "pipeline"), "LRM master"),
      ]),
      phase("Week 4 — Hold it", `≥ ${g[3].toFixed(1)}/day`, `Clear ${g[3].toFixed(1)} MD+DD/day on 4 of 5 days, unsupervised`, wkNow(3, g[3]), l.tl, "Cycle close note", [
        item("j", "Clear the benchmark without TL intervention", `${g[3].toFixed(1)} MD+DD/day on 4 of 5 days`, wkNow(3, g[3]), "Daily MD+DD report"),
        item("k", "LRM writes their own read: week 1 vs week 4 on the fixed input", "1 note · 2 numbers · by day 26", null, "Cycle file"),
        item("l", "Record the decision", "1 of 4 outcomes logged by day 26", null, "This tracker"),
      ]),
    ];
  }

  return [
    phase("Diagnose", "Days 1–3", "One binding input named, with its baseline number written down", now, l.tl, "Signed diagnosis", [
      item("a", "Pull the four inputs and rank them against the bar", "4 of 4 inputs baselined by day 3", null, "Metabase · LRM master"),
      item("b", `Name the binding input and its baseline: ${c.metric.toLowerCase()}`, `Baseline recorded · target ${c.fixTarget}`, now, c.fixSource),
      item("c", "Park every other metric for the cycle", "Exactly 1 tracked metric", null, "Cycle file"),
    ]),
    phase("Drill", "Days 4–12", `${c.metric} improved ≥ 25% over the baseline`, now, l.name, "Daily drill log", [
      item("d", c.action, c.fixTarget, now, c.fixSource),
      item("e", c.drill, c.drillTarget, null, c.drillSource),
      item("f", "Log the one number daily — nothing else", "9 of 9 working days logged", null, "Daily drill log"),
    ]),
    phase("Shadow and correct", "Days 13–21", `${c.metric} at ≥ 80% of the bar and MD+DD ≥ ${(b * 0.75).toFixed(1)}/day`, wkNow(2, b * 0.75), l.tl, "Call recordings", [
      item("g", `Calls observed by ${l.tl} with feedback inside the hour`, "3 calls/week · scored 1–5 · avg ≥ 3.5", null, "TL call-scoring sheet"),
      item("h", "Rewrite the weak moment and rehearse it on live calls", "1 rewritten script · used on ≥ 10 calls", null, "Call recordings"),
      item("i", "Escalate to the ZSM if the input has not moved", "Trigger: < +15% by day 18", now, "Metabase"),
    ]),
    phase("Solo and review", "Days 22–30", `Hold ${b.toFixed(1)} MD+DD/day for 5 unsupervised working days`, wkNow(3, b), l.name, "Cycle close note", [
      item("j", "Run the week unsupervised", `${b.toFixed(1)} MD+DD/day · 5 of 5 days`, wkNow(3, b), "Daily MD+DD report"),
      item("k", "Compare week 4 to week 1 on the fixed input only", `Δ ${(l.weeks[3] - l.weeks[0] >= 0 ? "+" : "")}${(l.weeks[3] - l.weeks[0]).toFixed(1)}/day vs target +${b - l.weeks[0] > 0 ? (b - l.weeks[0]).toFixed(1) : "0.0"}`, wkNow(3, b), "Metabase"),
      item("l", "Record the decision with the evidence attached", "1 of 4 outcomes · 2 numbers cited", null, "This tracker"),
    ]),
  ];
}
