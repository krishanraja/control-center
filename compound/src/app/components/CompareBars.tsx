import { barWidth, pct1, tone } from "../../lib/format";
import { useSplit } from "../DeviceProvider";

export interface BarRow {
  label: string;
  value: number | null;
  /** Overrides the formatted value, for units that are not percentages. */
  display?: string;
  colour?: string;
}

/**
 * A bar instead of a paragraph, wherever the point is a size. Widths compare
 * against the largest value in the set, never against an invisible scale.
 *
 * The two systems disagree about where the label goes. A desktop row has room
 * for a label column beside the bar. A phone does not, and squeezing one in is
 * how "Average month" turned into "Average mo...", so the phone puts the label
 * and the figure on their own line above a wider bar.
 */
export function CompareBars({ rows, caption }: { rows: BarRow[]; caption?: string }) {
  const split = useSplit();
  const usable = rows.filter((row) => row.value != null && Number.isFinite(row.value));
  const peak = usable.reduce((carry, row) => Math.max(carry, Math.abs(row.value as number)), 0);

  return (
    <div className="mig">
      {caption && <div className="migcap">{caption}</div>}
      {rows.map((row) => {
        const fill = row.value != null && Number.isFinite(row.value)
          ? <span style={{ width: barWidth(row.value, peak), background: row.colour ?? "var(--s1)" }} />
          : null;
        const value = <span className={`mval ${tone(row.value)}`}>{row.display ?? pct1(row.value)}</span>;

        if (split) {
          return (
            <div className="migrow" key={row.label}>
              <span className="mlab">{row.label}</span>
              <div className="migbar">{fill}</div>
              {value}
            </div>
          );
        }

        return (
          <div className="migrow" key={row.label}>
            <div className="migtop">
              <span className="mlab">{row.label}</span>
              {value}
            </div>
            <div className="migbar">{fill}</div>
          </div>
        );
      })}
    </div>
  );
}
