import { agreementLabel } from "../../lib/agreement";
import { pct1, tone } from "../../lib/format";
import type { AgreementRow } from "../../types";
import { useSplit } from "../DeviceProvider";
import { AgreementMeter } from "./AgreementMeter";
import { ChevronIcon } from "./Icons";

/**
 * The same row, built twice.
 *
 * Desktop gets a real table row: five aligned columns under a heading, so a
 * column of figures can be read down. A phone gets a list item: the company
 * name and the move on the first line, everything else on the second, nothing
 * clipped. The phone version of the desktop table used to truncate half the
 * company names, which is the failure this split exists to end.
 */

/** Column headings. Desktop only, because a phone list has no columns. */
export function TableHead({ columns, labels }: { columns: string; labels: string[] }) {
  if (!useSplit()) return null;
  return (
    <div className={`dthead ${columns}`} aria-hidden="true">
      {labels.map((label) => <span key={label}>{label}</span>)}
    </div>
  );
}

export const STOCK_COLUMNS = ["Company", "Ticker", "Checks", "What they say", "1 month"];
export const HOLDING_COLUMNS = ["What you own", "Share", "Worth", "Checks", "Today"];

export function StockRow({ row, onOpen }: { row: AgreementRow; onOpen: (symbol: string) => void }) {
  const split = useSplit();
  const reading = agreementLabel(row);
  const move = <span className={`sval ${tone(row.m1)}`}>{pct1(row.m1)}</span>;

  if (split) {
    return (
      <button type="button" className="srow cols-stock" onClick={() => onOpen(row.symbol)}>
        <span className="rowname">{row.name}</span>
        <span className="rowtick">{row.symbol}</span>
        <AgreementMeter row={row} showLabel={false} />
        <span className="rowsay">{reading}</span>
        {move}
        <span className="visually-hidden">{`${row.name}, ${reading}`}</span>
      </button>
    );
  }

  return (
    <button type="button" className="srow" onClick={() => onOpen(row.symbol)}>
      <span className="rowmain">
        <span className="rowtop">
          <span className="rowname">{row.name}</span>
          {move}
        </span>
        <span className="rowunder">
          <span className="rowsay"><span className="rowtick">{row.symbol}</span> · {reading}</span>
          <AgreementMeter row={row} showLabel={false} />
        </span>
      </span>
      <span className="rowchev" aria-hidden="true"><ChevronIcon /></span>
    </button>
  );
}

export function HoldingRow({
  symbol,
  name,
  pct,
  value,
  change,
  agreement,
  onOpen,
}: {
  symbol: string;
  name: string;
  /** How much of everything you own this is, as a percentage. */
  pct: number;
  value: string;
  change: number | null;
  agreement?: AgreementRow;
  onOpen?: (symbol: string) => void;
}) {
  const split = useSplit();
  const move = <span className={`sval ${tone(change)}`}>{pct1(change)}</span>;
  const checks = agreement
    ? <AgreementMeter row={agreement} showLabel={false} />
    : <span className="nometer">no checks</span>;

  // The desktop column heading carries the word "Share", so the cell does not
  // have to. A phone row has no headings, so it spells the whole thing out.
  const inner = split
    ? (
      <>
        <span className="rowname">{name}</span>
        <span className="rowsay">{pct}%</span>
        <span className="sval mut">{value}</span>
        {checks}
        {move}
      </>
    )
    : (
      <span className="rowmain">
        <span className="rowtop">
          <span className="rowname">{name}</span>
          {move}
        </span>
        <span className="rowunder">
          <span className="rowsay">{pct}% of your money · {value}</span>
          {checks}
        </span>
      </span>
    );

  const className = split ? "srow cols-hold" : "srow";
  if (!onOpen || !agreement) return <div className={className}>{inner}</div>;
  return (
    <button type="button" className={className} onClick={() => onOpen(symbol)}>
      {inner}
      {!split && <span className="rowchev" aria-hidden="true"><ChevronIcon /></span>}
    </button>
  );
}
