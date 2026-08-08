import { plain1, pct1, ratio, usd } from "../../lib/format";
import { byQuadrant, quadrantCounts } from "../../lib/industries";
import { themesFor } from "../../lib/migration";
import { EXPLAIN, GROUP_NAME, GROUP_NOTE, GROUP_SHORT, plainStageDesc } from "../../lib/words";
import type { Placed, Quadrant, Snapshot } from "../../types";
import { useSplit } from "../DeviceProvider";
import { Card } from "../components/Card";
import { CompareBars } from "../components/CompareBars";
import { IndustryRow } from "../components/IndustryRow";
import { Segmented } from "../components/Segmented";
import { StageTrack } from "../components/StageTrack";
import { TableHead } from "../components/StockRow";
import { SectionHead } from "../components/Tile";

export const FORCES = [
  { id: "ai", name: "AI" },
  { id: "money", name: "Interest rates", short: "Rates" },
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
  const split = useSplit();
  const themes = themesFor(snapshot);
  const placed = snapshot.placed.filter((entry) => forceOf(entry) === force);
  const hidden = new Set(excluded);
  const industries = snapshot.industries.filter((row) => !hidden.has(row.industry));
  const counts = quadrantCounts(industries);
  const rows = byQuadrant(industries, quadrant).slice(0, split ? 12 : 8);
  const macro = snapshot.macro;
  const pricingHikes = macro.pricingHikes ?? (macro.y1 != null && macro.fedFunds != null && macro.y1 > macro.fedFunds);

  const cards = [
    ...(force === "ai"
      ? themes.map((theme) => (
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
              caption="Sales growth over the last full year"
            />
          }
          source="Company accounts through FMP, latest full year reported"
          ask={`Who actually wins in ${theme.definition.name}?`}
          open={Boolean(open[`t-${theme.definition.id}`])}
          onToggle={onToggle}
          onAsk={onAsk}
        >
          <p>What is being tested: <b>{theme.definition.claim}</b></p>
          <p>
            {theme.definition.beneficiary} grew sales <b>{pct1(theme.beneficiary?.avgGrowth ?? null)}</b>,{" "}
            {theme.definition.disrupted} grew <b>{pct1(theme.disrupted?.avgGrowth ?? null)}</b>. Comparing those two
            numbers is the obvious move and the wrong one. What matters is which way each side is heading:{" "}
            <b>{pct1(theme.beneficiary?.avgDelta ?? null)}</b> against{" "}
            <b>{pct1(theme.disrupted?.avgDelta ?? null)}</b> a year.
          </p>
          <button type="button" className="askbtn ghost" onClick={() => onTheme(theme.definition.id)}>
            See both sides
          </button>
        </Card>
      ))
      : []),

    ...placed.map((entry, index) => (
      <Card
        key={entry.what}
        id={`p-${force}-${index}`}
        tag={`Stage ${entry.stage} of 5`}
        tone={entry.dir === "up" ? "up" : entry.dir === "down" ? "down" : "mixed"}
        head={entry.what}
        next={entry.note}
        visual={<StageTrack stage={entry.stage} stages={snapshot.stages} />}
        source="Placed using reported sales, industry movement and price"
        ask={`What happens next to ${entry.what.toLowerCase()}?`}
        open={Boolean(open[`p-${force}-${index}`])}
        onToggle={onToggle}
        onAsk={onAsk}
      >
        <p>
          {plainStageDesc(snapshot.stages.find((stage) => stage.stage === entry.stage)?.desc ?? "No description for this stage.")}{" "}
          {entry.note}
        </p>
        <p>
          Every big shift walks the same five stages. The talk almost always arrives years before the numbers do, and
          markets price the talk first, so the money is in the gap between the stage a thing is really at and the stage
          its price says it is at.
        </p>
      </Card>
    )),

    force === "money"
      ? (
        <Card
          key="m-rates"
          id="m-rates"
          tag="The setting everything else runs on"
          head={pricingHikes ? "Borrowing is priced to get dearer, not cheaper." : "Borrowing is priced to get cheaper."}
          next={pricingHikes
            ? "While that holds, companies making money now beat companies promising it later."
            : "Cheaper borrowing puts the long shot promises back in favour."}
          visual={
            <CompareBars
              rows={[
                { label: "What safe cash pays", value: macro.fedFunds, colour: "var(--s3)" },
                { label: "1 year loan to the US government", value: macro.y1, colour: "var(--s1)" },
                { label: "10 year loan to the US government", value: macro.y10, colour: "var(--s2)" },
              ]}
              caption="Interest paid per year"
            />
          }
          source="US Federal Reserve data and the US Treasury"
          ask="What happens to my money if borrowing gets dearer again?"
          open={Boolean(open["m-rates"])}
          onToggle={onToggle}
          onAsk={onAsk}
        >
          <p>
            Lending to the US government for a year pays <b>{plain1(macro.y1)}</b>. Leaving it in cash pays{" "}
            <b>{plain1(macro.fedFunds)}</b>. When the one year loan pays more than cash, the market is saying it expects
            cash to pay more soon, not less.
          </p>
          <p>
            The 10 year loan pays <b>{plain1(macro.real10)}</b> once you take price rises out of it, against{" "}
            <b>{plain1(macro.real10_1y)}</b> a year ago. That is {EXPLAIN.realRate}, and it is the number that decides
            what everything else is worth. Money today beats money later, so anything whose profits show up in five
            years is worth less than it was.
          </p>
          <p>
            Lenders are not worried yet. {EXPLAIN.spread} sits at <b>{plain1(macro.hyOAS)}</b>, and {EXPLAIN.nerves} is{" "}
            <b>{ratio(macro.vix)}</b>. Your crypto is <b>{plain1(snapshot.portfolio.cryptoPct)}</b> of your money and
            pays you nothing while this holds.
          </p>
        </Card>
      )
      : null,

    force === "crypto"
      ? (
        <Card
          key="c-usage"
          id="c-usage"
          tone="down"
          tag="People are using it less"
          head="Crypto is being used less, not more."
          next="Until fee income stops falling, a rising price is traders rather than users."
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
              caption="Share of all the money in crypto"
            />
          }
          source="CoinGecko and DefiLlama"
          ask="Is crypto being used more anywhere?"
          open={Boolean(open["c-usage"])}
          onToggle={onToggle}
          onAsk={onAsk}
        >
          <p>
            All crypto together is worth <b>{usd(snapshot.cryptoGlobal.mcap)}</b>, and Bitcoin is{" "}
            <b>{plain1(snapshot.cryptoGlobal.btcDom)}</b> of that. When Bitcoin's share goes up, money is retreating to
            the one coin that does not need anybody to use it for anything.
          </p>
          <p>
            Solana collected <b>{usd(snapshot.solana.fees30d)}</b> in fees over 30 days against{" "}
            <b>{usd(snapshot.solana.fees1y != null ? snapshot.solana.fees1y / 12 : null)}</b> in a normal month of the
            past year. {EXPLAIN.fees}
          </p>
          {snapshot.cryptoHot.length > 0 && (
            <p>
              Fastest risers over 30 days:{" "}
              {snapshot.cryptoHot.slice(0, 3).map((coin) => `${coin.name} ${pct1(coin.price_change_percentage_30d_in_currency)}`).join(", ")}.
              Those are small enough that the moves say more about how few coins exist than about anyone using them.
            </p>
          )}
        </Card>
      )
      : null,
  ].filter(Boolean);

  const industryPanel = (
    <>
      <SectionHead title="Where money is moving" note={`${industries.length} industries`} />
      <Segmented
        label="Which group"
        choices={QUADRANTS.map((entry) => ({ id: entry, name: GROUP_NAME[entry], short: GROUP_SHORT[entry], count: counts[entry] }))}
        value={quadrant}
        onChange={(id) => onQuadrant(id as Quadrant)}
        wrap
        size="sm"
      />
      <p className="sub">{GROUP_NOTE[quadrant]}</p>

      <div className="rowbox">
        <TableHead columns="cols-industry" labels={["Industry", "Shape", "Price vs the rest", "3 month move"]} />
        {rows.length === 0 && <p className="sub empty">Nothing in this group once your hidden industries are taken out.</p>}
        {rows.map((row) => <IndustryRow key={row.industry} row={row} />)}
      </div>
    </>
  );

  return (
    <>
      <p className="eyebrow">What is pushing prices around</p>
      <h2 className="big">The three forces.</h2>
      <p className="sub">Pick one to see what it is doing and what happens next.</p>

      <Segmented label="Which force" choices={FORCES} value={force} onChange={onForce} />

      {/* Desktop reads the force cards two across, then gives the industry
          table the full width so an industry keeps its whole name. A phone
          reads one card at a time and then the same list. */}
      {split
        ? <div className="grid">{cards.map((card, index) => <div key={index}>{card}</div>)}</div>
        : <div className="cardstack">{cards}</div>}
      {industryPanel}

      <div className="footnote">
        The three month move adds up every day of the last 63 trading days, which is about three months. The price
        column compares what you pay for this industry's profits against every other industry, so "dearer than 80%"
        means only one industry in five costs more. Going up means up over three months, never a single good week.
      </div>
    </>
  );
}
