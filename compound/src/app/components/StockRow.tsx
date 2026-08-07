import { agreementLabel } from "../../lib/agreement";
import { pct1, tone } from "../../lib/format";
import type { AgreementRow } from "../../types";
import { AgreementMeter } from "./AgreementMeter";

export function StockRow({ row, onOpen }: { row: AgreementRow; onOpen: (symbol: string) => void }) {
  return (
    <button type="button" className="srow" onClick={() => onOpen(row.symbol)}>
      <span className="stk">{row.symbol}</span>
      <span className="snm">{row.name}</span>
      <AgreementMeter row={row} showLabel={false} />
      <span className={`sval ${tone(row.m1)}`}>{pct1(row.m1)}</span>
      <span className="visually-hidden">{`${row.name}, ${agreementLabel(row)}`}</span>
    </button>
  );
}

export function HoldingRow({
  symbol,
  primary,
  change,
  agreement,
  onOpen,
}: {
  symbol: string;
  primary: string;
  change: number | null;
  agreement?: AgreementRow;
  onOpen?: (symbol: string) => void;
}) {
  const inner = (
    <>
      <span className="stk">{symbol}</span>
      <span className="snm">{primary}</span>
      {agreement ? <AgreementMeter row={agreement} showLabel={false} /> : <span className="nometer">no signals</span>}
      <span className={`sval ${tone(change)}`}>{pct1(change)}</span>
    </>
  );

  if (!onOpen || !agreement) return <div className="srow static">{inner}</div>;
  return <button type="button" className="srow" onClick={() => onOpen(symbol)}>{inner}</button>;
}
