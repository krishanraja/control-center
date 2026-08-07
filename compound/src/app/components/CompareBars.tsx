import { barWidth, pct1, tone } from "../../lib/format";

export interface BarRow {
  label: string;
  value: number | null;
  /** Overrides the formatted value, for units that are not percentages. */
  display?: string;
  colour?: string;
}

/**
 * A comparison bar instead of a paragraph, wherever the point being made is a
 * magnitude. Widths are relative to the largest value in the set, so the bars
 * compare against each other rather than against an invisible scale.
 */
export function CompareBars({ rows, caption }: { rows: BarRow[]; caption?: string }) {
  const usable = rows.filter((row) => row.value != null && Number.isFinite(row.value));
  const peak = usable.reduce((carry, row) => Math.max(carry, Math.abs(row.value as number)), 0);

  return (
    <div className="mig">
      {caption && <div className="migcap">{caption}</div>}
      {rows.map((row) => (
        <div className="migrow" key={row.label}>
          <span className="mlab">{row.label}</span>
          <div className="migbar">
            {row.value != null && Number.isFinite(row.value) && (
              <span style={{ width: barWidth(row.value, peak), background: row.colour ?? "var(--s1)" }} />
            )}
          </div>
          <span className={`mval ${tone(row.value)}`}>{row.display ?? pct1(row.value)}</span>
        </div>
      ))}
    </div>
  );
}
