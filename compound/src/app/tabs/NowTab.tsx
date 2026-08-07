import { contested } from "../../lib/agreement";
import { aud, longDate, pct1, plain1, usd } from "../../lib/format";
import { themesFor } from "../../lib/migration";
import type { Snapshot } from "../../types";
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

/** The loudest unsupported move: price moving while the other sources object. */
function loudestUnsupported(snapshot: Snapshot) {
  return snapshot.agreement
    .filter((row) => contested(row).priceAlone)
    .sort((a, b) => Math.abs(b.m1 ?? 0) - Math.abs(a.m1 ?? 0))[0];
}

export function NowTab({ snapshot, open, onToggle, onAsk }: Props) {
  const themes = themesFor(snapshot);
  const theme = themes.find((entry) => entry.diverged) ?? themes[0];
  const unsupported = loudestUnsupported(snapshot);
  const strongest = snapshot.agreement.find((row) => row.agree >= 3 && row.direction === "up");

  const largest = snapshot.holdings.find((holding) => holding.symbol === snapshot.portfolio.largest);
  const solana = snapshot.solana;
  // The comparable month is the past year's fee income divided by twelve. The
  // feed gives a rolling 30-day figure and a rolling 12-month figure, nothing
  // in between, so this is the only like-for-like the data supports.
  const averageMonth = solana.fees1y != null ? solana.fees1y / 12 : null;
  const feeShortfall = averageMonth && solana.fees30d != null
    ? ((solana.fees30d - averageMonth) / averageMonth) * 100
    : null;

  return (
    <>
      <p className="eyebrow">{longDate(snapshot.generated)}</p>
      <h2 className="big">Three things that could matter next.</h2>
      <p className="sub">Tap any card to see the working.</p>
      <div className="cardstack">
        {theme?.beneficiary && theme.disrupted && (
          <Card
            id="n1"
            tag={theme.diverged ? "The story and the numbers disagree" : "The story and the numbers agree"}
            head={theme.diverged
              ? `${theme.definition.disrupted} should be dying. It is speeding up instead.`
              : `${theme.definition.disrupted} revenue is slowing, exactly as the story says.`}
            next={theme.diverged
              ? "If the numbers keep winning, these are mispriced. If the story wins, they are value traps."
              : "The gap is widening. The beneficiaries keep the pricing power for now."}
            visual={
              <CompareBars
                rows={[
                  { label: theme.definition.beneficiary, value: theme.beneficiary.avgGrowth, colour: "var(--s1)" },
                  { label: theme.definition.disrupted, value: theme.disrupted.avgGrowth, colour: "var(--s3)" },
                ]}
              />
            }
            source="FMP income statements, latest full year filed"
            ask={`Is AI actually hurting ${theme.definition.disrupted} revenue yet?`}
            open={Boolean(open.n1)}
            onToggle={onToggle}
            onAsk={onAsk}
          >
            <p>
              The story: <b>{theme.definition.claim}</b> The filed revenue says otherwise.{" "}
              {theme.disrupted.members.map((member, index) => (
                <span key={member.symbol}>
                  {index > 0 && ", "}
                  <b>{member.symbol} went from {pct1(member.prev)} to {pct1(member.now)}</b>
                </span>
              ))}
              . All {theme.disrupted.members.length} accelerated.
            </p>
            <p>
              Meanwhile {theme.beneficiary.members.map((member) => member.symbol).join(" and ")} growth moved from{" "}
              <b>{pct1(theme.beneficiary.avgPrev)}</b> to <b>{pct1(theme.beneficiary.avgGrowth)}</b>. The gap between the
              two groups is <b>{theme.gap != null ? plain1(theme.gap) : "n/a"}</b> of growth, and it is{" "}
              <b>{theme.gapDelta != null && theme.gapDelta < 0 ? "closing" : "widening"}</b>, not the other way round.
            </p>
            <p>{theme.verdict}</p>
            <p>
              Two ways this resolves. Either the disrupted group is being paid to build the thing that is meant to replace
              it, which is a real business. Or the spending is a one-off and the growth rolls over in a few quarters.{" "}
              {theme.disrupted.avgGm != null && <>Gross margin on that revenue is <b>{plain1(theme.disrupted.avgGm)}</b> against{" "}
              <b>{plain1(theme.beneficiary.avgGm)}</b> for {theme.definition.beneficiary}, so it is a lower-quality
              dollar either way.</>}
            </p>
          </Card>
        )}

        {largest && (
          <Card
            id="n2"
            tone="down"
            tag="Your biggest holding"
            head={feeShortfall != null && feeShortfall < 0
              ? `${largest.name} is being used less while deposits stay put.`
              : `${largest.name} is ${largest.pct}% of everything you own.`}
            next="One of those two has to break. Fees turning up would be the first real sign of recovery."
            visual={
              <CompareBars
                rows={[
                  { label: "Fees, 30d", value: solana.fees30d, display: usd(solana.fees30d), colour: "var(--dn)" },
                  { label: "Average month", value: averageMonth, display: usd(averageMonth), colour: "var(--s3)" },
                ]}
              />
            }
            source={`DefiLlama, ${snapshot.generated}${solana.stables == null ? " · stablecoin balances did not return this run" : ""}`}
            ask={`What would tell me ${largest.name} is actually recovering?`}
            open={Boolean(open.n2)}
            onToggle={onToggle}
            onAsk={onAsk}
          >
            <p>
              People paid <b>{usd(solana.fees30d)}</b> to use the network over 30 days. Spread evenly, the past year ran at{" "}
              <b>{usd(averageMonth)}</b> a month, so the last month came in{" "}
              <b>{feeShortfall != null ? plain1(Math.abs(feeShortfall)) : "n/a"} below</b> that pace. Fees are what people
              pay to actually use it, which makes this the closest thing to a revenue line.
            </p>
            <p>
              Money deposited in its apps is <b>{usd(solana.tvl)}</b>. Capital is sitting there and not transacting. That
              is either patience or a decision that has already been made and not yet acted on.
            </p>
            <p>
              You hold <b>{aud(largest.valueAud)}</b> of it, <b>{largest.pct}%</b> of everything you own, and{" "}
              <b>{plain1(snapshot.portfolio.cryptoPct)}</b> of your money is in crypto that tends to move together.
            </p>
          </Card>
        )}

        {unsupported && (
          <Card
            id="n3"
            tone="mixed"
            tag="Something is off"
            head={`${unsupported.name.replace(/,? (Inc|Corporation|Corp|Ltd|plc|Company)\.?$/i, "")} is ${(unsupported.m1 ?? 0) > 0 ? "rising" : "falling"} with no support underneath.`}
            next="Prices that move without analysts or news behind them tend to give it back."
            visual={<div className="metervis"><AgreementMeter row={unsupported} /><AgreementKey /></div>}
            source="FMP grades history and Marketaux entity sentiment, 30 days"
            ask="Which stocks are moving without any support?"
            open={Boolean(open.n3)}
            onToggle={onToggle}
            onAsk={onAsk}
          >
            <p>
              {(unsupported.m1 ?? 0) > 0 ? "Up" : "Down"} <b>{pct1(unsupported.m1)}</b> in a month. But{" "}
              {unsupported.signals.analysts < 0 && "analysts cut their positive count"}
              {unsupported.signals.analysts < 0 && unsupported.signals.news < 0 && ", and "}
              {unsupported.signals.news < 0 && <>news sentiment is <b>negative</b> at {unsupported.sent?.toFixed(2) ?? "n/a"}</>}
              . {unsupported.breadth != null && <>Only <b>{unsupported.breadth}%</b> of ratings are positive.</>} The price
              is the only source pointing that way.
            </p>
            {strongest && (
              <p>
                Compare that with <b>{strongest.symbol}</b>, where price, analysts and news all point the same way. Same
                direction on the screen, completely different amount of evidence behind it.
              </p>
            )}
            <p>
              This is what the four-bar strip is for. Four independent sources, and you can see instantly when only one of
              them is doing the work.
            </p>
          </Card>
        )}
      </div>

      <SectionHead title="Your money" note={aud(snapshot.portfolio.totalAud)} />
      <div className="tiles">
        <Tile
          label="Biggest"
          value={`${snapshot.portfolio.largestPct}%`}
          detail={`${snapshot.portfolio.largest} · ${aud(largest?.valueAud ?? null)}`}
          signal
        />
        <Tile
          label="Cash ready"
          value={aud(snapshot.portfolio.cashAud)}
          detail={`${plain1(snapshot.portfolio.cryptoPct)} of the rest is crypto`}
        />
      </div>

      <div className="footnote">
        Live data {snapshot.generated} · {Object.keys(snapshot.feeds).join(" · ")}
      </div>
    </>
  );
}
