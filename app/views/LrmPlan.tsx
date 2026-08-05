// app/views/LrmPlan.tsx — screen 2, "plan": the per-LRM coaching plan.
// docs/handoff/README.md § LRM plan (plan) and "The measurable plan".
import BarChart from "@/components/BarChart";
import Blueprint from "@/components/Blueprint";
import SegControl from "@/components/SegControl";
import Tag from "@/components/Tag";
import {
  BAND_STYLE,
  type DecisionInfo,
  type Enriched,
  benchLine,
  metricsOf,
  phasesWithState,
  planTotals,
  weekBarsOf,
} from "@/lib/derive";
import type { PlanModel } from "@/lib/metrics";

type Outcome = "exit" | "continue" | "reallocate" | "pip";

const DECISIONS: { key: Outcome; label: string; primary?: boolean }[] = [
  { key: "exit", label: "Exit the watchlist", primary: true },
  { key: "continue", label: "Run one more cycle" },
  { key: "reallocate", label: "Change lead allocation" },
  { key: "pip", label: "Escalate to formal PIP" },
];

const DECISION_TEXT: Record<Outcome, string> = {
  exit: "cleared the bar, taken off the tracker.",
  continue: "one more cycle scheduled.",
  reallocate: "lead allocation changed, output re-baselined.",
  pip: "escalated to formal PIP with HR.",
};

const nowColor = (ok: boolean | null) =>
  ok === null ? "color-mix(in srgb, var(--color-text) 50%, transparent)" : ok ? "var(--color-accent-700)" : "var(--color-accent-900)";

export default function LrmPlan({
  sel,
  tracked,
  model,
  onSelect,
  onModelChange,
  doneMap,
  onToggleItem,
  note,
  onNoteChange,
  decision,
  onDecide,
}: {
  sel: Enriched;
  tracked: Enriched[];
  model: PlanModel;
  onSelect: (id: string) => void;
  onModelChange: (m: PlanModel) => void;
  doneMap: Record<string, boolean>;
  onToggleItem: (cycleId: string, phase: string, itemKey: string) => void;
  note: string;
  onNoteChange: (n: string) => void;
  decision?: DecisionInfo;
  onDecide: (outcome: Outcome) => void;
}) {
  const bandStyle = BAND_STYLE[sel.band];
  const metrics = metricsOf(sel);
  const weeks = weekBarsOf(sel);
  const phases = phasesWithState(sel, model, doneMap);
  const totals = planTotals(phases);
  const bench = sel.thresholds.benchmark;

  const blurb =
    model === "sprint"
      ? `Every action carries a target, a current reading and the report it is measured from — nothing here is a judgement call. Four weekly gates at ${(bench * 0.4).toFixed(1)}, ${(bench * 0.6).toFixed(1)}, ${(bench * 0.85).toFixed(1)} and ${bench.toFixed(1)} MD+DD/day; miss two in a row and the cycle closes early with a decision.`
      : `No fixed weeks — one input, tracked from baseline to independence. Each stage exits only on a number: baseline recorded, +25% on the input, 80% of the bar, then ${bench.toFixed(1)} MD+DD/day held solo for five days.`;

  return (
    <div style={{ padding: "28px 32px", display: "grid", gridTemplateColumns: "340px 1fr", gap: 28, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Blueprint style={{ padding: 18 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent)" }}>
            On the tracker
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 30, lineHeight: 1.1, marginTop: 6 }}>
            {sel.metrics.name}
          </div>
          <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
            {sel.metrics.email}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Tag bg={bandStyle.bg} fg={bandStyle.fg}>
              {sel.band}
            </Tag>
            <Tag className="tag-neutral">{sel.trajectory}</Tag>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "6px 14px",
              fontSize: 13,
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px solid var(--color-divider)",
            }}
          >
            <div style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>City</div>
            <div>{sel.metrics.city}</div>
            <div style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>TL</div>
            <div>{sel.metrics.tl}</div>
            <div style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>ZSM</div>
            <div>{sel.metrics.zsm}</div>
            <div style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Tenure</div>
            <div>{sel.metrics.tenureDays} days</div>
            <div style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Cycle</div>
            <div>
              {sel.metrics.ach} of {sel.metrics.target || "—"} MD+DD ·{" "}
              {sel.metrics.target ? Math.round((sel.metrics.ach / sel.metrics.target) * 100) + "%" : "—"}
            </div>
          </div>
        </Blueprint>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
            }}
          >
            Switch LRM
          </div>
          {tracked.map((p) => {
            const active = p.metrics.id === sel.metrics.id;
            return (
              <button
                key={p.metrics.id}
                className="btn"
                style={{
                  justifyContent: "space-between",
                  width: "100%",
                  borderColor: active ? "var(--color-accent)" : "var(--color-divider)",
                  background: active ? "var(--color-accent)" : "transparent",
                  color: active ? "var(--color-bg)" : "var(--color-text)",
                  fontSize: 13,
                }}
                onClick={() => onSelect(p.metrics.id)}
              >
                <span>{p.metrics.name}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>{p.avg.toFixed(1)}/day</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <Blueprint
          style={{
            padding: "18px 20px",
            background: "var(--color-accent-900)",
            color: "var(--color-bg)",
            borderColor: "var(--color-accent-900)",
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75 }}>
            The one thing to fix
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 26, lineHeight: 1.15, marginTop: 6 }}>
            {sel.cause.title}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 14, opacity: 0.85, maxWidth: "70ch" }}>{sel.cause.body}</p>
        </Blueprint>

        <div>
          <h4 style={{ margin: "0 0 14px" }}>Where they stand against the bar</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 }}>
            {metrics.map((m) => (
              <Blueprint key={m.label} style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>{m.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 28, lineHeight: 1 }}>
                    {m.value}
                  </div>
                  <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                    vs {m.bench}
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <BarChart width={m.w} color={m.color} height={5} />
                </div>
                <div style={{ fontSize: 11, marginTop: 8, color: m.color }}>{m.status}</div>
              </Blueprint>
            ))}
          </div>
        </div>

        <Blueprint style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h4 style={{ margin: 0 }}>Four weeks of daily output</h4>
            <span style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
              MD+DD per working day · dotted line is the {bench.toFixed(1)} bar
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 24,
              height: 130,
              marginTop: 18,
              position: "relative",
              paddingBottom: 26,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: benchLine(bench),
                borderTop: "1px dashed color-mix(in srgb, var(--color-text) 40%, transparent)",
              }}
            />
            {weeks.map((w) => (
              <div
                key={w.label}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  height: "100%",
                  justifyContent: "flex-end",
                  position: "relative",
                }}
              >
                <div style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{w.val}</div>
                <div style={{ width: "100%", height: w.h, background: w.color }} />
                <div
                  style={{
                    position: "absolute",
                    bottom: -24,
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
                  }}
                >
                  {w.label}
                </div>
              </div>
            ))}
          </div>
        </Blueprint>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>The plan</h4>
            <SegControl
              name="planmodel"
              value={model}
              onChange={onModelChange}
              options={[
                { value: "sprint", label: "30-day sprint · weekly gates" },
                { value: "coach", label: "Coaching track · metric-led" },
              ]}
            />
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 120 }}>
                <BarChart width={totals.pct + "%"} height={5} />
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                  color: "color-mix(in srgb, var(--color-text) 60%, transparent)",
                }}
              >
                {totals.done} of {totals.total} done
              </span>
            </div>
          </div>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", maxWidth: "80ch" }}>
            {blurb}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 20 }}>
            {phases.map((ph) => (
              <Blueprint key={ph.label} style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 19 }}>{ph.label}</div>
                  <Tag className="tag-accent" style={{ marginLeft: "auto" }}>
                    {ph.gate}
                  </Tag>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "3px 10px",
                    marginTop: 12,
                    fontSize: 11,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span style={{ letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                    Exit
                  </span>
                  <span>{ph.exit}</span>
                  <span style={{ letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                    Now
                  </span>
                  <span style={{ color: nowColor(ph.gateOk), fontWeight: 600 }}>{ph.gateNow}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
                  {ph.items.map((it) => (
                    <div key={it.itemKey} style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
                      <label
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          fontSize: 13,
                          cursor: "pointer",
                          lineHeight: 1.45,
                          color: it.done ? "color-mix(in srgb, var(--color-text) 45%, transparent)" : "var(--color-text)",
                          textDecoration: it.done ? "line-through" : "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={it.done}
                          onChange={() => onToggleItem(sel.cycleId, ph.label, it.itemKey)}
                          style={{ marginTop: 2, flex: "none" }}
                        />
                        <span>{it.text}</span>
                      </label>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "auto 1fr",
                          gap: "2px 10px",
                          margin: "8px 0 0 25px",
                          fontSize: 11,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <span style={{ letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>
                          Target
                        </span>
                        <span style={{ fontWeight: 600 }}>{it.target}</span>
                        <span style={{ letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>
                          Now
                        </span>
                        <span style={{ color: nowColor(it.nowOk) }}>{it.now}</span>
                        <span style={{ letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>
                          Measured
                        </span>
                        <span style={{ color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>{it.source}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    marginTop: 14,
                    paddingTop: 10,
                    borderTop: "1px solid var(--color-divider)",
                    color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
                  }}
                >
                  Owner: {ph.owner} · Evidence: {ph.evidence}
                </div>
              </Blueprint>
            ))}
          </div>
        </div>

        <Blueprint style={{ padding: "18px 20px" }}>
          <h4 style={{ margin: "0 0 4px" }}>Close the cycle</h4>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", maxWidth: "80ch" }}>
            Day {sel.daysElapsed ?? sel.thresholds.workingDays} of {sel.thresholds.workingDays}. Record the call so the
            next reviewer sees why — and so an LRM who has pulled it back gets taken off the list.
          </p>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Coaching note for this cycle</label>
            <textarea
              className="input"
              placeholder="What changed, what you saw in the shadowed calls, what you are asking for next."
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {DECISIONS.map((d) => (
              <button
                key={d.key}
                className={d.primary ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => onDecide(d.key)}
              >
                {d.label}
              </button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-accent-700)" }}>
              {decision
                ? `Recorded ${new Date(decision.decidedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} — ${DECISION_TEXT[decision.outcome as Outcome] ?? decision.outcome}`
                : ""}
            </span>
          </div>
        </Blueprint>
      </div>
    </div>
  );
}
