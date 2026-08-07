/**
 * A 63-day compounded path. Shape only, so there are no axes to misread. The
 * number next to it carries the magnitude.
 */
export function Sparkline({ series, colour = "var(--s1)", label }: { series: number[]; colour?: string; label: string }) {
  if (series.length < 2) return <span className="spark empty" aria-hidden="true" />;

  let level = 100;
  const path = series.map((change) => {
    level *= 1 + change / 100;
    return level;
  });
  const low = Math.min(...path);
  const high = Math.max(...path);
  const span = high - low || 1;
  const points = path
    .map((value, index) => `${((index / (path.length - 1)) * 60).toFixed(2)},${(16 - ((value - low) / span) * 14).toFixed(2)}`)
    .join(" ");

  return (
    <svg className="spark" viewBox="0 0 60 18" preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke={colour} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
