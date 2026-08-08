import { indexBySymbol } from "../../lib/agreement";
import { aud, plain1, usd } from "../../lib/format";
import { EXPLAIN } from "../../lib/words";
import type { Snapshot } from "../../types";
import { useSplit } from "../DeviceProvider";
import { Card } from "../components/Card";
import { CompareBars } from "../components/CompareBars";
import { HOLDING_COLUMNS, HoldingRow, TableHead } from "../components/StockRow";
import { SectionHead, Tile } from "../components/Tile";

const COLOURS: Record<string, string> = {
  SOL: "var(--s2)",
  BTC: "var(--sig)",
  XRP: "var(--s3)",
  NVDA: "var(--s1)",
  SYM: "#7b6ce0",
  SOUN: "#c05fa8",
};

const COUNT_WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

interface Props {
  snapshot: Snapshot;
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
  onAsk: (question: string) => void;
  onStock: (symbol: string) => void;
}

export function MineTab({ snapshot, open, onToggle, onAsk, onStock }: Props) {
  const split = useSplit();
  const bySymbol = indexBySymbol(snapshot.agreement);
  const held = snapshot.holdings.filter((holding) => holding.pct > 0);
  const invested = held.reduce((carry, holding) => carry + holding.pct, 0);
  const cashPct = Math.max(0, 100 - invested);
  const largest = snapshot.holdings.find((holding) => holding.symbol === snapshot.portfolio.largest);
  const solana = snapshot.solana;
  const averageMonth = solana.fees1y != null ? solana.fees1y / 12 : null;
  const withChecks = held.filter((holding) => bySymbol[holding.symbol]).length;
  const counted = held.length < COUNT_WORD.length ? COUNT_WORD[held.length] : String(held.length);

  const holdings = (
    <>
      <div
        className="allocation"
        role="img"
        aria-label={`${held.map((holding) => `${holding.name} ${holding.pct}%`).join(", ")}, cash ${cashPct.toFixed(1)}%`}
      >
        {held.filter((holding) => holding.pct > 0.5).map((holding) => (
          <div key={holding.symbol} style={{ flex: holding.pct, background: COLOURS[holding.symbol] ?? "#39404a" }} />
        ))}
        <div className="cash" style={{ flex: cashPct }} />
      </div>

      <div className="rowbox">
        <TableHead columns="cols-hold" labels={HOLDING_COLUMNS} />
        {held.map((holding) => (
          <HoldingRow
            key={holding.symbol}
            symbol={holding.symbol}
            name={holding.name}
            pct={holding.pct}
            value={aud(holding.valueAud)}
            change={holding.d1}
            agreement={bySymbol[holding.symbol]}
            onOpen={onStock}
          />
        ))}
      </div>
      <p className="sub">
        {withChecks} of {held.length} have checks behind them. Nobody rates crypto and it files no sales figures, so
        those strips stay empty on purpose.
      </p>
    </>
  );

  const watch = largest && (
    <>
      <SectionHead title="What to watch" />
      <Card
        id="m1"
        tone="down"
        tag={largest.name}
        head="Fee income is the number that decides this one."
        next="Three weeks of rising fees in a row would be the first genuine change."
        visual={
          <CompareBars
            rows={[
              { label: "Fees, last 30 days", value: solana.fees30d, display: usd(solana.fees30d), colour: "var(--dn)" },
              { label: "A normal month", value: averageMonth, display: usd(averageMonth), colour: "var(--s3)" },
            ]}
          />
        }
        source={`DefiLlama, ${snapshot.generated}`}
        ask={`What would make me confident in ${largest.name} again?`}
        open={Boolean(open.m1)}
        onToggle={onToggle}
        onAsk={onAsk}
      >
        <p>
          Fees over 30 days came to <b>{usd(solana.fees30d)}</b>. A normal month over the past year was{" "}
          <b>{usd(averageMonth)}</b>. There is <b>{usd(solana.tvl)}</b> of {EXPLAIN.parked}, so the money has not left,
          it has stopped doing anything. {EXPLAIN.fees}
        </p>
        <p>
          This one is <b>{aud(largest.valueAud)}</b>, or <b>{largest.pct}%</b> of everything you own. Crypto altogether
          is <b>{plain1(snapshot.portfolio.cryptoPct)}</b>, and those coins tend to rise and fall together, so you are
          more exposed than any single line suggests.
        </p>
      </Card>
    </>
  );

  const tiles = (
    <div className="tiles">
      <Tile label="Cash you can use" value={aud(snapshot.portfolio.cashAud)} detail={`${cashPct.toFixed(1)}% of the total`} />
      <Tile
        label="Biggest one"
        value={`${snapshot.portfolio.largestPct}%`}
        detail={`${largest?.name ?? snapshot.portfolio.largest} · ${aud(largest?.valueAud ?? null)}`}
        signal
      />
      <Tile label="In crypto" value={plain1(snapshot.portfolio.cryptoPct)} detail="These rise and fall together" />
      <Tile label="Have checks behind them" value={`${withChecks} of ${held.length}`} detail="The rest have nothing to check" />
    </div>
  );

  return (
    <>
      <p className="eyebrow">Everything you own: {aud(snapshot.portfolio.totalAud)}</p>
      <h2 className="big">{counted.charAt(0).toUpperCase() + counted.slice(1)} things you own, one big bet.</h2>
      <p className="sub">
        The bar shows how your money is split. The widest block is the one that decides how your year goes.
      </p>

      {/* Desktop opens with a row of figures, the way a dashboard does, then
          gives the table the full width so nothing gets shortened. A phone
          leads with the bar and the list, because that is the one thing worth
          seeing before the thumb starts scrolling. */}
      {split && tiles}
      {holdings}
      {watch}

      <div className="footnote">
        You entered what you own by hand. Prices come in live from CoinGecko and FMP.
      </div>
    </>
  );
}
