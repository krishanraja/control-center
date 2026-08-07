import { plain1, pct1, ratio, usd } from "../../lib/format";
import { QUADRANT_LABEL, QUADRANT_NOTE, byQuadrant, quadrantCounts } from "../../lib/industries";
import { themesFor } from "../../lib/migration";
import type { Placed, Quadrant, Snapshot } from "../../types";
import { Card } from "../components/Card";
import { CompareBars } from "../components/CompareBars";
import { Sparkline } from "../components/Sparkline";
import { StageTrack } from "../components/StageTrack";
import { SectionHead } from "../components/Tile";

export const FORCES = [
  { id: "ai", name: "AI" },
  { id: "money", name: "Cost of money" },
  { id: "crypto", name: "Crypto" },
] as const;

const QUADRANTS: Quadrant[] = ["early", "crowded", "turning", "avoid"];

/** The pipeline may label a placement with its force. Until it does, read it. */
export function forceOf(entry: Placed): string {
  if (entry.force) return entry.force;
  if (/crypto|coin|chain|token|bitcoin|solana|stablecoin/i.test(entry.what)) return "crypto";
  if (/rate|bond|credit|borrow|yield|lending|bank/i.test(entry.what)) return "money";
  return "ai";
}

interface Props {
  snapshot: Snapshot;
  force: string;
  quadrant: Quadrant;
  excluded: string[];
  open: Record<string, boolean>;
  onForce: (force: string) => void;
  onQuadrant: (quadrant: Quadrant) => void;
  onToggle: (id: string) => void;
  onAsk: (question: string) => void;
  onTheme: (id: string) => void;
}

export function ShiftsTab({ snapshot, force, quadrant, excluded, open, onForce, onQuadrant, onToggle, onAsk, onTheme }: Props) {
  const themes = themesFor(snapshot);
  const placed = snapshot.placed.filter((entry) => forceOf(entry) === force);
  const hidden = new Set(excluded);
  const industries = snapshot.industries.filter((row) => !hidden.has(row.industry));
  const counts = quadrantCounts(industries);
  const rows = byQuadrant(industries, quadrant).slice(0, 8);
  const macro = snapshot.macro;
  const pricingHikes = macro.pricingHikes ?? (macro.y1 != null && macro.fedFunds != null && macro.y1 > macro.fedFunds);

  return (
    <>
      <p className="eyebrow">What is moving value around</p>
      <h2 className="big">The forces.</h2>
      <p className="sub">Pick one to see what it is doing and what happens next.</p>

      <div className="forces" role="group" aria-label="Force">
        {FORCES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={force === entry.id ? "on" : ""}
            aria-pressed={force === entry.id}
            onClick={() => onForce(entry.id)}
          >
            {entry.name}
          </button>
        ))}
      </div>

      <div className="cardstack">
        {force === "ai" && themes.map((theme) => (
          <Card
            key={theme.definition.id}
            id={`t-${theme.definition.id}`}
            tag={theme.diverged ? "Story and numbers disagree" : "Story and numbers agree"}
            tone={theme.diverged ? "mixed" : "up"}
            head={`${theme.definition.beneficiary} against ${theme.definition.disrupted}.`}
            next={theme.verdict}
            visual={
              <CompareBars
                rows={[
                  { label: theme.definition.beneficiary, value: theme.beneficiary?.avgGrowth ?? null, colour: "var(--s1)" },
                  { label: theme.definition.disrupted, value: theme.disrupted?.avgGrowth ?? null, colour: "var(--s3)" },
                ]}
              />
            }
            source="FMP income statements, latest full year filed"
            ask={`Who actually wins in ${theme.definition.name}?`}
            open={Boolean(open[`t-${theme.definition.id}`])}
            onToggle={onToggle}
            onAsk={onAsk}
          >
            <p>
              The claim being tested: <b>{theme.definition.claim}</b>
            </p>
            <p>
              {theme.definition.beneficiary} revenue growth is <b>{pct1(theme.beneficiary?.avgGrowth ?? null)}</b>,{" "}
              {theme.definition.disrupted} is <b>{pct1(theme.disrupted?.avgGrowth ?? null)}</b>. Levels are the obvious
              comparison and the wrong one. What matters is the direction each one is travelling:{" "}
              <b>{pct1(theme.beneficiary?.avgDelta ?? null)}</b> against{" "}
              <b>{pct1(theme.disrupted?.avgDelta ?? null)}</b> a year.
            </p>
            <button type="button" className="askbtn ghost" onClick={() => onTheme(theme.definition.id)}>
              See both sides →
            </button>
          </Card>
        ))}

        {placed.map((entry, index) => (
          <Card
            key={entry.what}
            id={`p-${force}-${index}`}
            tag={`Stage ${entry.stage} of 5`}
            tone={entry.dir === "up" ? "up" : entry.dir === "down" ? "down" : "mixed"}
            head={entry.what}
            next={entry.note}
            visual={<StageTrack stage={entry.stage} stages={snapshot.stages} />}
            source="Placed from filed revenue, industry momentum and price"
            ask={`What happens next to ${entry.what.toLowerCase()}?`}
            open={Boolean(open[`p-${force}-${index}`])}
            onToggle={onToggle}
            onAsk={onAsk}
          >
            <p>
              {snapshot.stages.find((stage) => stage.stage === entry.stage)?.desc ?? "No description for this stage."}{" "}
              {entry.note}
            </p>
            <p>
              The track runs {snapshot.stages.map((stage) => stage.name.toLowerCase()).join(" → ")}. Most narratives arrive
              years before the numbers, and markets usually price the narrative first, so the interesting money is in the
              gap between the stage a thing is at and the stage it is priced at.
            </p>
          </Card>
        ))}

        {force === "money" && (
          <Card
            id="m-rates"
            tag="The setting everything runs on"
            head={pricingHikes ? "Borrowing costs are priced to rise, not fall." : "Borrowing costs are priced to fall."}
            next={pricingHikes
              ? "While that holds, businesses making cash now keep beating businesses promising it later."
              : "Cheaper money favours the long-dated promises again."}
            visual={
              <CompareBars
                rows={[
                  { label: "Cash rate", value: macro.fedFunds, colour: "var(--s3)" },
                  { label: "1yr bond", value: macro.y1, colour: "var(--s1)" },
                  { label: "10yr bond", value: macro.y10, colour: "var(--s2)" },
                ]}
              />
            }
            source="FRED and US Treasury"
            ask="What happens to my portfolio if rates rise again?"
            open={Boolean(open["m-rates"])}
            onToggle={onToggle}
            onAsk={onAsk}
          >
            <p>
              The 1 year bond pays <b>{plain1(macro.y1)}</b>. Cash pays <b>{plain1(macro.fedFunds)}</b>. When the shorter
              bond pays more than cash, the market is telling you it expects the cash rate to go up, not down.
            </p>
            <p>
              After inflation the 10 year pays <b>{plain1(macro.real10)}</b>, against{" "}
              <b>{plain1(macro.real10_1y)}</b> a year ago. That is the number that actually reprices assets: money today
              is worth more than money later, so anything whose profits arrive in five years is worth less than it was.
            </p>
            <p>
              Credit is not worried yet. High-yield spreads are <b>{plain1(macro.hyOAS)}</b> and the VIX is{" "}
              <b>{ratio(macro.vix)}</b>. Your crypto is <b>{plain1(snapshot.portfolio.cryptoPct)}</b> of your money and
              pays nothing while this holds.
            </p>
          </Card>
        )}

        {force === "crypto" && (
          <Card
            id="c-usage"
            tone="down"
            tag="Value leaving"
            head="Crypto is being used less, not more."
            next="Until fee income stops falling, price rises are traders rather than users."
            visual={
              <CompareBars
                rows={[
                  { label: "Bitcoin", value: snapshot.cryptoGlobal.btcDom, colour: "var(--sig)" },
                  {
                    label: "Everything else",
                    value: snapshot.cryptoGlobal.btcDom != null ? 100 - snapshot.cryptoGlobal.btcDom : null,
                    colour: "var(--s1)",
                  },
                ]}
              />
            }
            source="CoinGecko and DefiLlama"
            ask="Is crypto usage recovering anywhere?"
            open={Boolean(open["c-usage"])}
            onToggle={onToggle}
            onAsk={onAsk}
          >
            <p>
              All crypto is worth <b>{usd(snapshot.cryptoGlobal.mcap)}</b> and Bitcoin is{" "}
              <b>{plain1(snapshot.cryptoGlobal.btcDom)}</b> of it. When the Bitcoin share rises, money is retreating to
              the one asset that does not need a use case.
            </p>
            <p>
              Solana fee income over 30 days is <b>{usd(snapshot.solana.fees30d)}</b> against{" "}
              <b>{usd(snapshot.solana.fees1y != null ? snapshot.solana.fees1y / 12 : null)}</b> for the average month of
              the past year. Fees are the clearest measure of whether people actually use a network, because they are
              paid rather than promised.
            </p>
            {snapshot.cryptoHot.length > 0 && (
              <p>
                Fastest 30 days: {snapshot.cryptoHot.slice(0, 3).map((coin) => `${coin.name} ${pct1(coin.price_change_percentage_30d_in_currency)}`).join(", ")}.
                Those are small enough that the moves say more about float than adoption.
              </p>
            )}
          </Card>
        )}
      </div>

      <SectionHead title="Where the money is going" note={`${industries.length} industries`} />
      <div className="forces small" role="group" aria-label="Industry group">
        {QUADRANTS.map((entry) => (
          <button
            key={entry}
            type="button"
            className={quadrant === entry ? "on" : ""}
            aria-pressed={quadrant === entry}
            onClick={() => onQuadrant(entry)}
          >
            {QUADRANT_LABEL[entry]} <span className="count">{counts[entry]}</span>
          </button>
        ))}
      </div>
      <p className="sub">{QUADRANT_NOTE[quadrant]}</p>

      <div className="rowbox">
        {rows.length === 0 && <p className="sub empty">Nothing in this group once your hidden industries are removed.</p>}
        {rows.map((row) => (
          <div className="srow static" key={row.industry}>
            <span className="snm wide">{row.industry}</span>
            <Sparkline
              series={row.series}
              colour={row.r3m > 0 ? "var(--up)" : "var(--dn)"}
              label={`${row.industry} over 63 trading days`}
            />
            <span className="sval mut">{row.peRank != null ? `${row.peRank}th` : "no pe"}</span>
            <span className={`sval ${row.r3m > 0 ? "up" : "dn"}`}>{pct1(row.r3m)}</span>
          </div>
        ))}
      </div>

      <div className="footnote">
        3 month move compounded from daily industry averages, 63 trading days. Valuation column is this industry's
        price-to-earnings percentile against every industry with a usable P/E. Rising means up over three months, never
        acceleration alone.
      </div>
    </>
  );
}
