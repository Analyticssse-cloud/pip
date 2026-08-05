import Blueprint from "./Blueprint";

export default function KpiCard({ kicker, value, note }: { kicker: string; value: string; note: string }) {
  return (
    <Blueprint style={{ padding: "16px 18px" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent)" }}>
        {kicker}
      </div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 44, lineHeight: 1, marginTop: 6 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginTop: 4 }}>
        {note}
      </div>
    </Blueprint>
  );
}
