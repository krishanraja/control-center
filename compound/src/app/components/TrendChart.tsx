/**
 * A dated line with an optional band and an optional second line. Labels sit
 * on the chart (first and last value, three dates) so the picture can be read
 * without a legend. Size comes from the two device systems through `.trend`.
 */

export interface TrendPoint {
  date: string;
  value: number;
  low?: number | null;
  high?: number | null;
}

interface Props {
  points: TrendPoint[];
  /** A second series drawn as a thinner line in the muted colour. */
  compare?: TrendPoint[];
  label: string;
  compareLabel?: string;
  format: (value: number) => string;
  colour?: string;
}

const W = 320;
const H = 120;
const PAD = { top: 14, right: 8, bottom: 18, left: 8 };

function shortDate(iso: string): string {
  const parsed = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return parsed.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function TrendChart({ points, compare = [], label, compareLabel, format, colour = "var(--s1)" }: Props) {
  const all = [...points, ...compare];
  if (points.length < 2) {
    return <p className="trend-empty">Not enough dated points to draw yet.</p>;
  }
  const times = all.map((point) => Date.parse(`${point.date}T00:00:00Z`));
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const values = all.flatMap((point) => [point.value, point.low ?? point.value, point.high ?? point.value]);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const spanT = maxT - minT || 1;
  const spanV = maxV - minV || 1;
  const x = (iso: string) => PAD.left + ((Date.parse(`${iso}T00:00:00Z`) - minT) / spanT) * (W - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - (value - minV) / spanV) * (H - PAD.top - PAD.bottom);
  const line = (series: TrendPoint[]) => series.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const banded = points.filter((point) => point.low != null && point.high != null);
  const band = banded.length >= 2
    ? `${banded.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)},${y(point.high as number).toFixed(1)}`).join(" ")} ${[...banded].reverse().map((point) => `L${x(point.date).toFixed(1)},${y(point.low as number).toFixed(1)}`).join(" ")} Z`
    : null;
  const first = points[0];
  const last = points[points.length - 1];
  const middleIso = new Date((minT + maxT) / 2).toISOString().slice(0, 10);
  const compareLast = compare.at(-1);
  const description = `${label}: ${format(first.value)} on ${shortDate(first.date)}, ${format(last.value)} on ${shortDate(last.date)}${compareLast && compareLabel ? `. ${compareLabel}: ${format(compareLast.value)}` : ""}`;

  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={description}>
      {band && <path d={band} fill={colour} opacity="0.18" />}
      {compare.length >= 2 && <path d={line(compare)} fill="none" stroke="var(--mut)" strokeWidth="1.2" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <path d={line(points)} fill="none" stroke={colour} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last.date)} cy={y(last.value)} r="2.4" fill={colour} />
      <text x={PAD.left} y={PAD.top - 4} className="trend-label">{format(first.value)}</text>
      <text x={W - PAD.right} y={PAD.top - 4} textAnchor="end" className="trend-label">{format(last.value)}</text>
      <text x={PAD.left} y={H - 5} className="trend-tick">{shortDate(first.date)}</text>
      <text x={W / 2} y={H - 5} textAnchor="middle" className="trend-tick">{shortDate(middleIso)}</text>
      <text x={W - PAD.right} y={H - 5} textAnchor="end" className="trend-tick">{shortDate(last.date)}</text>
    </svg>
  );
}
