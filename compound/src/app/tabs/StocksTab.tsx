import { splitByBacking } from "../../lib/agreement";
import { SIGNAL_SOURCES } from "../../lib/agreement";
import type { Snapshot } from "../../types";
import { AgreementKey } from "../components/AgreementMeter";
import { StockRow } from "../components/StockRow";
import { SectionHead } from "../components/Tile";

interface Props {
  snapshot: Snapshot;
  excluded: string[];
  onStock: (symbol: string) => void;
}

export function StocksTab({ snapshot, excluded, onStock }: Props) {
  const hidden = new Set(excluded);
  const visible = snapshot.agreement.filter((row) => !hidden.has(row.industry));
  const hiddenCount = new Set(snapshot.agreement.filter((row) => hidden.has(row.industry)).map((row) => row.industry)).size;
  const { strong, alone } = splitByBacking(visible);

  return (
    <>
      <p className="eyebrow">
        {visible.length} names{hiddenCount > 0 && ` · ${hiddenCount} ${hiddenCount === 1 ? "industry" : "industries"} hidden`}
      </p>
      <h2 className="big">What looks worth the work.</h2>
      <p className="sub">Sorted by how many independent sources agree, not by how much it moved.</p>
      <AgreementKey />

      <SectionHead title="Sources agree" note={String(strong.length)} />
      <div className="rowbox">
        {strong.length === 0 && <p className="sub empty">Nothing has two independent sources behind it today.</p>}
        {strong.slice(0, 12).map((row) => <StockRow key={row.symbol} row={row} onOpen={onStock} />)}
      </div>

      <SectionHead title="Price is on its own" note="no backing yet" />
      <div className="rowbox">
        {alone.length === 0 && <p className="sub empty">Every name that moved has something behind it.</p>}
        {alone.slice(0, 8).map((row) => <StockRow key={row.symbol} row={row} onOpen={onStock} />)}
      </div>

      <div className="footnote">
        Price = {SIGNAL_SOURCES.price}. Analysts = {SIGNAL_SOURCES.analysts}. News = {SIGNAL_SOURCES.news}. Revenue ={" "}
        {SIGNAL_SOURCES.revenue}. Sources: FMP, Marketaux.
      </div>
    </>
  );
}
