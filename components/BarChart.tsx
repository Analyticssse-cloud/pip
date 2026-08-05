// components/BarChart.tsx — the thin proportional bar reused for the band
// buckets, the "where they stand" metric cards, and the plan progress bar.
export default function BarChart({
  width,
  color = "var(--color-accent)",
  height = 4,
}: {
  width: string;
  color?: string;
  height?: number;
}) {
  return (
    <div style={{ height, background: "var(--color-neutral-300)" }}>
      <div style={{ height, width, background: color }} />
    </div>
  );
}
