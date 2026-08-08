import { pct1 } from "../../lib/format";
import type { IndustryRow as Row } from "../../types";
import { useSplit } from "../DeviceProvider";
import { Sparkline } from "./Sparkline";

/**
 * One industry. Desktop lines four columns up under headings. A phone puts the
 * name and the move on the first line and the shape and the price rank on the
 * second, because "dearer than 80%" beside a name beside a chart beside a
 * figure is four things fighting over 288 pixels.
 */
export function IndustryRow({ row }: { row: Row }) {
  const split = useSplit();
  const rank = row.peRank != null ? `dearer than ${row.peRank}%` : "no price rank";
  const move = <span className={`sval ${row.r3m > 0 ? "up" : "dn"}`}>{pct1(row.r3m)}</span>;
  const shape = (
    <Sparkline
      series={row.series}
      colour={row.r3m > 0 ? "var(--up)" : "var(--dn)"}
      label={`${row.industry} over the last three months`}
    />
  );

  if (split) {
    return (
      <div className="srow cols-industry">
        <span className="rowname">{row.industry}</span>
        {shape}
        <span className="sval mut">{rank}</span>
        {move}
      </div>
    );
  }

  return (
    <div className="srow">
      <span className="rowmain">
        <span className="rowtop">
          <span className="rowname">{row.industry}</span>
          {move}
        </span>
        <span className="rowunder">
          <span className="rowsay">{rank}</span>
          {shape}
        </span>
      </span>
    </div>
  );
}
