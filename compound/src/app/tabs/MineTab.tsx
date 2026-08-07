import { indexBySymbol } from "../../lib/agreement";
import { aud, plain1, usd } from "../../lib/format";
import type { Snapshot } from "../../types";
import { Card } from "../components/Card";
import { CompareBars } from "../components/CompareBars";
import { HoldingRow } from "../components/StockRow";
import { SectionHead } from "../components/Tile";

const COLOURS: Record<string, string> = {
  SOL: "var(--s2)",
  BTC: "var(--sig)",
  XRP: "var(--s3)",
  NVDA: "var(--s1)",
  SYM: "#7b6ce0",
  SOUN: "#c05fa8",
};

interface Props {
  snapshot: Snapshot;
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
  onAsk: (question: string) => void;
  onStock: (symbol: string) => void;
}

export function MineTab({ snapshot, open, onToggle, onAsk, onStock }: Props) {
  const bySymbol = indexBySymbol(snapshot.agreement);
  const held = snapshot.holdings.filter((holding) => holding.pct > 0);
  const invested = held.reduce((carry, holding) => carry + holding.pct, 0);
  const cashPct = Math.max(0, 100 - invested);
  const largest = snapshot.holdings.find((holding) => holding.symbol === snapshot.portfolio.largest);
  const solana = snapshot.solana;
  const averageMonth = solana.fees1y != null ? solana.fees1y / 12 : null;

  return (
    <>
      <p className="eyebrow">{aud(snapshot.portfolio.totalAud)} · {aud(snapshot.portfolio.cashAud)} cash</p>
      <h2 className="big">
        {held.length} {held.length === 1 ? "position" : "positions"}, one real bet.
      </h2>

      <div className="allocation" role="img" aria-label={held.map((holding) => `${holding.symbol} ${holding.pct}%`).join(", ") + `, cash ${cashPct.toFixed(1)}%`}>
        {held.filter((holding) => holding.pct > 0.5).map((holding) => (
          <div key={holding.symbol} style={{ flex: holding.pct, background: COLOURS[holding.symbol] ?? "#39404a" }} />
        ))}
        <div className="cash" style={{ flex: cashPct }} />
      </div>

      <div className="rowbox">
        {held.map((holding) => (
          <HoldingRow
            key={holding.symbol}
            symbol={holding.symbol}
            primary={`${holding.pct}% · ${aud(holding.valueAud)}`}
            change={holding.d1}
            agreement={bySymbol[holding.symbol]}
            onOpen={onStock}
          />
        ))}
      </div>
      <p className="sub">
        {held.filter((holding) => bySymbol[holding.symbol]).length} of {held.length} positions have independent signals.
        Crypto has no analyst ratings or filed revenue, so its strip stays empty by design.
      </p>

      <SectionHead title="What to watch" />
      <div className="cardstack">
        {largest && (
          <Card
            id="m1"
            tone="down"
            tag={largest.name}
            head="Fee income is the number that decides this."
            next="Three straight weeks of rising fees would be the first genuine change."
            visual={
              <CompareBars
                rows={[
                  { label: "Fees, 30d", value: solana.fees30d, display: usd(solana.fees30d), colour: "var(--dn)" },
                  { label: "Average month", value: averageMonth, display: usd(averageMonth), colour: "var(--s3)" },
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
              Fees over 30 days: <b>{usd(solana.fees30d)}</b>. The past year averaged <b>{usd(averageMonth)}</b> a month.
              Deposits held in its apps are <b>{usd(solana.tvl)}</b>, so the capital has not left, it has stopped working.
            </p>
            <p>
              This position is <b>{aud(largest.valueAud)}</b>, <b>{largest.pct}%</b> of everything you own. Crypto in
              total is <b>{plain1(snapshot.portfolio.cryptoPct)}</b> and those holdings tend to move together, so the real
              concentration is higher than any single line suggests.
            </p>
          </Card>
        )}
      </div>

      <div className="footnote">Positions entered by hand. Prices live from CoinGecko and FMP.</div>
    </>
  );
}
