import { contested } from "../../lib/agreement";
import { aud, pct1, plain1, usd } from "../../lib/format";
import { themesFor } from "../../lib/migration";
import { EXPLAIN } from "../../lib/words";
import type { Snapshot } from "../../types";
import { useSplit } from "../DeviceProvider";
import { AgreementKey, AgreementMeter } from "../components/AgreementMeter";
import { Card } from "../components/Card";
import { CompareBars } from "../components/CompareBars";
import { SectionHead, Tile } from "../components/Tile";

interface Props {
  snapshot: Snapshot;
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
  onAsk: (question: string) => void;
}

/** The loudest move with nothing behind it: price up, everything else down. */
function loudestUnsupported(snapshot: Snapshot) {
  return snapshot.agreement
    .filter((row) => contested(row).priceAlone)
    .sort((a, b) => Math.abs(b.m1 ?? 0) - Math.abs(a.m1 ?? 0))[0];
}

export function NowTab({ snapshot, open, onToggle, onAsk }: Props) {
  const split = useSplit();
  const themes = themesFor(snapshot);
  const theme = themes.find((entry) => entry.diverged) ?? themes[0];
  const unsupported = loudestUnsupported(snapshot);
  const strongest = snapshot.agreement.find((row) => row.agree >= 3 && row.direction === "up");

  const largest = snapshot.holdings.find((holding) => holding.symbol === snapshot.portfolio.largest);
  const solana = snapshot.solana;
  // The comparable month is the past year's fee income divided by twelve. The
  // feed gives a rolling 30 day figure and a rolling 12 month figure, nothing
  // in between, so this is the only like for like the data supports.
  const averageMonth = solana.fees1y != null ? solana.fees1y / 12 : null;
  const feeShortfall = averageMonth && solana.fees30d != null
    ? ((solana.fees30d - averageMonth) / averageMonth) * 100
    : null;

  const cards = [
    theme?.beneficiary && theme.disrupted
      ? (
        <Card
          key="n1"
          id="n1"
          tag={theme.diverged ? "The story and the numbers disagree" : "The story and the numbers agree"}
          head={theme.diverged
            ? `${theme.definition.disrupted} should be dying. Sales are speeding up instead.`
            : `${theme.definition.disrupted} sales are slowing, exactly like the story says.`}
          next={theme.diverged
            ? "If the numbers keep winning, these are too cheap. If the story wins, they are cheap for a reason."
            : "The gap keeps growing. The winning side can charge what it likes for now."}
          visual={
            <CompareBars
              rows={[
                { label: theme.definition.beneficiary, value: theme.beneficiary.avgGrowth, colour: "var(--s1)" },
                { label: theme.definition.disrupted, value: theme.disrupted.avgGrowth, colour: "var(--s3)" },
              ]}
              caption="Sales growth over the last full year"
            />
          }
          source="Company accounts through FMP, latest full year reported"
          ask={`Is AI actually hurting ${theme.definition.disrupted} yet?`}
          open={Boolean(open.n1)}
          onToggle={onToggle}
          onAsk={onAsk}
        >
          <p>
            The story goes: <b>{theme.definition.claim}</b> The sales they reported say otherwise.{" "}
            {theme.disrupted.members.map((member, index) => (
              <span key={member.symbol}>
                {index > 0 && ", "}
                <b>{member.symbol} went from {pct1(member.prev)} to {pct1(member.now)}</b>
              </span>
            ))}
            . All {theme.disrupted.members.length} sped up.
          </p>
          <p>
            Meanwhile {theme.beneficiary.members.map((member) => member.symbol).join(" and ")} went from{" "}
            <b>{pct1(theme.beneficiary.avgPrev)}</b> to <b>{pct1(theme.beneficiary.avgGrowth)}</b>. The gap between the
            two sides is <b>{theme.gap != null ? plain1(theme.gap) : "not available"}</b>, and it is{" "}
            <b>{theme.gapDelta != null && theme.gapDelta < 0 ? "closing" : "getting wider"}</b>.
          </p>
          <p>{theme.verdict}</p>
          <p>
            Two ways this ends. Either the losing side is getting paid to build the very thing meant to replace it,
            which is a real business. Or the spending is a one off and sales drop back in a year or so.{" "}
            {theme.disrupted.avgGm != null && (
              <>Out of every dollar of sales they keep <b>{plain1(theme.disrupted.avgGm)}</b> as profit, against{" "}
              <b>{plain1(theme.beneficiary.avgGm)}</b> for {theme.definition.beneficiary}, so it is a lower quality
              dollar either way.</>
            )}
          </p>
        </Card>
      )
      : null,

    largest
      ? (
        <Card
          key="n2"
          id="n2"
          tone="down"
          tag="The biggest thing you own"
          head={feeShortfall != null && feeShortfall < 0
            ? `${largest.name} is getting used less while the money stays parked.`
            : `${largest.name} is ${largest.pct}% of everything you own.`}
          next="One of those two has to give. Fees turning up would be the first real sign of a recovery."
          visual={
            <CompareBars
              rows={[
                { label: "Fees, last 30 days", value: solana.fees30d, display: usd(solana.fees30d), colour: "var(--dn)" },
                { label: "A normal month", value: averageMonth, display: usd(averageMonth), colour: "var(--s3)" },
              ]}
            />
          }
          source={`DefiLlama, ${snapshot.generated}${solana.stables == null ? " · digital dollar balances did not come back this run" : ""}`}
          ask={`What would tell me ${largest.name} is actually recovering?`}
          open={Boolean(open.n2)}
          onToggle={onToggle}
          onAsk={onAsk}
        >
          <p>
            People paid <b>{usd(solana.fees30d)}</b> to use the network over 30 days. Spread evenly, the past year ran
            at <b>{usd(averageMonth)}</b> a month, so the last month came in{" "}
            <b>{feeShortfall != null ? plain1(Math.abs(feeShortfall)) : "not available"} below</b> that pace.{" "}
            {EXPLAIN.fees}
          </p>
          <p>
            There is <b>{usd(solana.tvl)}</b> of {EXPLAIN.parked}. The money is sitting there and not being used. That is
            either patience or a decision somebody has already made and not acted on yet.
          </p>
          <p>
            You own <b>{aud(largest.valueAud)}</b> of it, which is <b>{largest.pct}%</b> of everything you have, and{" "}
            <b>{plain1(snapshot.portfolio.cryptoPct)}</b> of your money is in crypto that tends to move together.
          </p>
        </Card>
      )
      : null,

    unsupported
      ? (
        <Card
          key="n3"
          id="n3"
          tone="mixed"
          tag="Something is off"
          head={`${unsupported.name.replace(/,? (Inc|Corporation|Corp|Ltd|plc|Company)\.?$/i, "")} is ${(unsupported.m1 ?? 0) > 0 ? "going up" : "going down"} with nothing to back it up.`}
          next="Prices that move with no experts and no news behind them usually give it back."
          visual={<div className="metervis"><AgreementMeter row={unsupported} /><AgreementKey /></div>}
          source="Expert ratings and news scores over 30 days, through FMP and Marketaux"
          ask="Which stocks are moving with nothing behind them?"
          open={Boolean(open.n3)}
          onToggle={onToggle}
          onAsk={onAsk}
        >
          <p>
            {(unsupported.m1 ?? 0) > 0 ? "Up" : "Down"} <b>{pct1(unsupported.m1)}</b> in a month. But{" "}
            {unsupported.signals.analysts < 0 && "fewer experts are positive than before"}
            {unsupported.signals.analysts < 0 && unsupported.signals.news < 0 && ", and "}
            {unsupported.signals.news < 0 && <>the news is <b>negative</b>, scoring {unsupported.sent?.toFixed(2) ?? "nothing"}</>}
            . {unsupported.breadth != null && <>Only <b>{unsupported.breadth}%</b> of experts rate it a buy.</>} The price
            is the only one of the four checks pointing that way.
          </p>
          {strongest && (
            <p>
              Compare that with <b>{strongest.symbol}</b>, where the price, the experts and the news all point the same
              way. Same direction on a chart, completely different amount of evidence underneath.
            </p>
          )}
          <p>
            That is what the four bar strip is for. Four checks that do not talk to each other, so you can see at a
            glance when only one of them is doing the work.
          </p>
        </Card>
      )
      : null,
  ].filter(Boolean);

  const money = (
    <>
      <SectionHead title="Your money" note={aud(snapshot.portfolio.totalAud)} />
      <div className="tiles">
        <Tile
          label="Everything you own"
          value={aud(snapshot.portfolio.totalAud)}
          detail={`${snapshot.holdings.filter((holding) => holding.pct > 0).length} things, plus cash`}
        />
        <Tile
          label="Biggest one"
          value={`${snapshot.portfolio.largestPct}%`}
          detail={`${snapshot.portfolio.largest} · ${aud(largest?.valueAud ?? null)}`}
          signal
        />
        <Tile
          label="Cash you can use"
          value={aud(snapshot.portfolio.cashAud)}
          detail="Ready to buy something, or to sit still"
        />
        <Tile
          label="In crypto"
          value={plain1(snapshot.portfolio.cryptoPct)}
          detail="These tend to rise and fall together"
        />
      </div>
    </>
  );

  return (
    <>
      <p className="eyebrow">Three things worth knowing</p>
      <h2 className="big">What changed while you were away.</h2>
      <p className="sub">
        {split
          ? "Open a card to see the numbers behind it and where they came from."
          : "Tap a card to see the numbers behind it and where they came from."}
      </p>

      {split
        ? <div className="grid lead">{cards.map((card, index) => <div key={index} className={index === 0 ? "wide" : undefined}>{card}</div>)}</div>
        : <div className="cardstack">{cards}</div>}

      {money}

      <div className="footnote">
        Numbers from {snapshot.generated}. Sources: {Object.keys(snapshot.feeds).join(", ")}. COMPOUND explains what the
        data says. It never buys or sells anything.
      </div>
    </>
  );
}
