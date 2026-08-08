import { SIGNAL_ORDER, splitByBacking } from "../../lib/agreement";
import { SIGNAL_SOURCES } from "../../lib/agreement";
import { CHECK_NAME } from "../../lib/words";
import type { Snapshot } from "../../types";
import { useSplit } from "../DeviceProvider";
import { AgreementKey } from "../components/AgreementMeter";
import { STOCK_COLUMNS, StockRow, TableHead } from "../components/StockRow";
import { SectionHead } from "../components/Tile";

interface Props {
  snapshot: Snapshot;
  excluded: string[];
  onStock: (symbol: string) => void;
}

export function StocksTab({ snapshot, excluded, onStock }: Props) {
  const split = useSplit();
  const hidden = new Set(excluded);
  const visible = snapshot.agreement.filter((row) => !hidden.has(row.industry));
  const hiddenCount = new Set(snapshot.agreement.filter((row) => hidden.has(row.industry)).map((row) => row.industry)).size;
  const { strong, alone } = splitByBacking(visible);

  const agreeList = (
    <>
      <SectionHead title="Most checks agree" note={String(strong.length)} />
      <div className="rowbox">
        <TableHead columns="cols-stock" labels={STOCK_COLUMNS} />
        {strong.length === 0 && <p className="sub empty">Nothing has two checks behind it today.</p>}
        {strong.slice(0, split ? 16 : 12).map((row) => <StockRow key={row.symbol} row={row} onOpen={onStock} />)}
      </div>
    </>
  );

  const aloneList = (
    <>
      <SectionHead title="Only the price says so" note="nothing else agrees" />
      <div className="rowbox">
        <TableHead columns="cols-stock" labels={STOCK_COLUMNS} />
        {alone.length === 0 && <p className="sub empty">Everything that moved has something behind it.</p>}
        {alone.slice(0, split ? 14 : 8).map((row) => <StockRow key={row.symbol} row={row} onOpen={onStock} />)}
      </div>
    </>
  );

  return (
    <>
      <p className="eyebrow">
        {visible.length} companies{hiddenCount > 0 && ` · ${hiddenCount} ${hiddenCount === 1 ? "industry" : "industries"} hidden`}
      </p>
      <h2 className="big">Which ones have real backing.</h2>
      <p className="sub">
        Sorted by how many checks agree, not by how much the price moved. {split ? "Click" : "Tap"} any company to see
        what each check found.
      </p>
      <AgreementKey />

      {/* Both systems stack the two lists. The desktop difference is the table
          itself: full width, so a company keeps its whole name, under column
          headings that say what each figure is. */}
      {agreeList}
      {aloneList}

      <div className="footnote">
        {SIGNAL_ORDER.map((key) => `${CHECK_NAME[key]} is ${SIGNAL_SOURCES[key]}`).join(". ")}. Sources: FMP and
        Marketaux.
      </div>
    </>
  );
}
