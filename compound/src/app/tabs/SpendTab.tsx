import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CompoundConfig } from "../../lib/env";
import { longDate } from "../../lib/format";
import { monthLabel, usd2, usdRound } from "../../lib/spend/format";
import { useSpendDay } from "../../lib/spend/load";
import type { SpendDay, SpendItem, SpendScope } from "../../lib/spend/schema";
import {
  countable,
  detectSubscriptions,
  groupByMonth,
  issues,
  matchesSearch,
  monthTotals,
  movers,
  normalMonth,
  reconcile,
  thisMonth,
} from "../../lib/spend/summarise";
import { SPEND_EXPLAIN } from "../../lib/words";
import { Card } from "../components/Card";
import { DomainIcon } from "../components/Icons";
import { Segmented } from "../components/Segmented";
import { cycleSentence, ItemRows, MeterRows, SubscriptionRows } from "../components/SpendRows";
import { SectionHead, Tile } from "../components/Tile";
import { TrendChart } from "../components/TrendChart";

interface Props {
  config: CompoundConfig;
  session: Session | null;
  onAsk: (question: string) => void;
}

const SCOPE_WORD: Record<SpendScope, string> = { personal: "Personal", os: "Operating system", property: "Property" };
const SCOPE_SHORT: Record<SpendScope, string> = { personal: "Personal", os: "Op. system", property: "Property" };

type Filter = "all" | SpendScope;

export function SpendTab({ config, session, onAsk }: Props) {
  const load = useSpendDay(config, session);
  if (load.state === "loading") {
    return <div className="portfolio-empty spend-page"><p className="eyebrow">Spend</p><h2>Adding up what went out…</h2></div>;
  }
  if (load.state === "none" || load.state === "error") {
    return (
      <div className="portfolio-empty spend-page">
        <span aria-hidden="true"><DomainIcon domain="currencies" /></span>
        <p className="eyebrow">Spend</p>
        <h2>{load.state === "none" ? "No spend has been synced yet." : "The spend data could not be read."}</h2>
        <p>{load.message}</p>
      </div>
    );
  }
  return <SpendBody day={load.day} onAsk={onAsk} />;
}

function headlineFor(current: number, normal: number | null, month: string): { head: string; tone: "up" | "down" | "mixed" } {
  const name = monthLabel(month);
  if (normal == null || normal <= 0) return { head: `${usdRound(current)} out so far in ${name}. Not enough months yet to know what normal is.`, tone: "mixed" };
  const ratio = current / normal;
  const pace = `${usdRound(current)} out so far in ${name}. A normal month is about ${usdRound(normal)}.`;
  if (ratio > 1.15) return { head: `${pace} Running hot.`, tone: "down" };
  if (ratio < 0.6) return { head: `${pace} Light so far.`, tone: "up" };
  return { head: `${pace} About normal.`, tone: "mixed" };
}

function SpendBody({ day, onAsk }: { day: SpendDay; onAsk: (question: string) => void }) {
  const asOf = day.generatedAt.slice(0, 10);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showCopies, setShowCopies] = useState(false);
  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const totals = useMemo(() => monthTotals(day.items, asOf), [day.items, asOf]);
  const normal = useMemo(() => normalMonth(totals, asOf), [totals, asOf]);
  const current = thisMonth(totals, asOf);
  const moved = useMemo(() => movers(day.items, asOf), [day.items, asOf]);
  const subs = useMemo(() => detectSubscriptions(day.items, asOf), [day.items, asOf]);
  const check = useMemo(() => reconcile(day.items, day.meter.days, asOf), [day.items, day.meter.days, asOf]);
  const trouble = useMemo(() => issues(day.items), [day.items]);
  const headline = headlineFor(current.total, normal?.total ?? null, current.month);

  const visible = useMemo(() => {
    return day.items.filter((item: SpendItem) => {
      if (!showCopies && item.supersededByRef) return false;
      if (filter !== "all" && item.scope !== filter) return false;
      return matchesSearch(item, query);
    });
  }, [day.items, filter, query, showCopies]);
  const groups = useMemo(() => groupByMonth(visible), [visible]);
  const counted = day.items.filter(countable).length;

  const topMover = moved[0];
  const changeHead = topMover
    ? `${topMover.name} is ${usdRound(Math.abs(topMover.delta))} ${topMover.delta > 0 ? "above" : "below"} a normal month.`
    : "Nothing has moved much against a normal month.";
  const sheetSource = day.lastRun?.coverage.find((source) => source.provider === "Bills sheet");
  const inboxSource = day.lastRun?.coverage.find((source) => source.provider === "Control Center invoices");
  const ledgerSource = day.lastRun?.coverage.find((source) => source.provider === "Property ledger");
  const fxUsd = day.fxAsOf.find((rate) => rate.currency === "USD");

  const gapReading = check.metered === 0
    ? "The meter has nothing for this month yet."
    : check.gap > 0
    ? "Bills run ahead of use when a plan is prepaid or a receipt lands before the month's use does."
    : check.gap < 0
    ? "Use runs ahead of bills when a receipt has not landed yet or a plan bills after the month ends."
    : "Bills and use agree this month.";

  return (
    <div className="portfolio-page spend-page">
      <p className="eyebrow">Money going out</p>
      <h2 className="big">{headline.head}</h2>
      <p className="sub">
        Every bill, receipt and property payment from every source, priced in US dollars. {SPEND_EXPLAIN.billsAreTheMoney}
      </p>

      <div className="tiles">
        {(["personal", "os", "property"] as SpendScope[]).map((scope) => (
          <Tile
            key={scope}
            label={SCOPE_WORD[scope]}
            value={usdRound(current[scope])}
            detail={normal ? `Normal month about ${usdRound(normal[scope])}. ${current.count === 0 ? "Nothing yet this month." : ""}`.trim() : SPEND_EXPLAIN.normalMonth}
            signal={normal != null && current[scope] > normal[scope] * 1.15}
          />
        ))}
      </div>

      <SectionHead title="Month by month" note={`${counted} priced items`} />
      <TrendChart
        points={totals.map((row) => ({ date: `${row.month}-01`, value: row.total }))}
        compare={totals.map((row) => ({ date: `${row.month}-01`, value: row.os }))}
        label="All spend"
        compareLabel="Operating system"
        format={(value) => usdRound(value)}
      />
      <p className="sub note">Solid line is everything that went out each month. Dotted line is the operating system's share. The current month is still filling in.</p>

      <Card
        id="what-changed"
        tag="What changed"
        tone={topMover ? (topMover.delta > 0 ? "down" : "up") : "mixed"}
        head={changeHead}
        next={`Sheet refreshes on the 9th. Inbox receipts land daily. ${trouble.sheetDuplicates > 0 ? `${trouble.sheetDuplicates} rows look doubled up in the sheet.` : ""}`.trim()}
        source={`Bills sheet to ${sheetSource?.sourceDate ? longDate(sheetSource.sourceDate) : "n/a"}, inbox receipts to ${inboxSource?.sourceDate ? longDate(inboxSource.sourceDate) : "n/a"}.`}
        ask="What changed in my spending this month and why?"
        open={open.has("what-changed")}
        onToggle={toggle}
        onAsk={onAsk}
      >
        {moved.length === 0 && <p>Every merchant is within a dollar of its usual month.</p>}
        {moved.map((row) => (
          <p key={row.merchantKey}>
            <b>{row.name}.</b> {usd2(row.current)} this month against {usd2(row.normal)} in a normal month, {row.delta > 0 ? "up" : "down"} {usd2(Math.abs(row.delta))}. {SCOPE_WORD[row.scope]}.
          </p>
        ))}
        <p className="mut">A normal month is {SPEND_EXPLAIN.normalMonth}. Refunds are taken off. Rows with no price are left out and counted below.</p>
      </Card>

      <SectionHead title="Operating system" note={`${usdRound(check.invoicedOs)} billed this month`} />
      <p className="sub">{SPEND_EXPLAIN.meterIsTheBreakdown}</p>
      <MeterRows units={day.meter.units.slice(0, 8)} />
      {day.meter.silent.length > 0 && <p className="sub note">No meter rows in thirty days from: {day.meter.silent.join(", ")}.</p>}
      {day.cycles.map((cycle) => (
        <p key={cycle.key} className={`sub spend-cycle ${cycle.state === "within" ? "" : "dn"}`}>{cycleSentence(cycle)}</p>
      ))}
      <p className="sub spend-check">
        <b>The check.</b> Bills say {usd2(check.invoicedOs)} went to the operating system this month. The meter saw {usd2(check.metered)} of use. {gapReading}
      </p>

      <SectionHead title="Subscriptions" note={`${subs.active.length} running`} />
      <SubscriptionRows rows={subs.active} />
      {subs.lapsed.length > 0 && (
        <>
          <p className="sub note">Stopped</p>
          <SubscriptionRows rows={subs.lapsed} stopped />
        </>
      )}
      <p className="sub note">Yearly bills need two years of records to be sure. Property payments are not listed here; the Property tab has them.</p>

      <SectionHead title="Every item" note={`${visible.length} shown`} />
      <div className="spend-filters">
        <Segmented
          label="Scope"
          choices={[
            { id: "all", name: "All", short: "All" },
            { id: "personal", name: "Personal", short: SCOPE_SHORT.personal },
            { id: "os", name: "Operating system", short: SCOPE_SHORT.os },
            { id: "property", name: "Property", short: SCOPE_SHORT.property },
          ]}
          value={filter}
          onChange={(id) => setFilter(id as Filter)}
        />
        <input
          type="search"
          className="spend-search"
          placeholder="Search merchants and items"
          aria-label="Search items"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {trouble.superseded > 0 && (
          <label className="spend-copies">
            <input type="checkbox" checked={showCopies} onChange={(event) => setShowCopies(event.target.checked)} />
            Show {trouble.superseded} inbox receipts also on the sheet
          </label>
        )}
      </div>
      {groups.length === 0 && <p className="sub empty">Nothing matches.</p>}
      {groups.map((group) => (
        <section key={group.month} className="spend-month" aria-label={monthLabel(group.month)}>
          <div className="spend-month-head">
            <h4>{monthLabel(group.month)}</h4>
            <span>{usd2(group.total)}</span>
          </div>
          <ItemRows items={group.items} />
        </section>
      ))}

      <div className="src spend-sources">
        {(day.lastRun?.coverage ?? []).map((source) => (
          <span key={source.provider}>{source.provider}: {source.status === "available" ? `updated ${source.sourceDate ? longDate(source.sourceDate) : "recently"}` : source.status.replace("_", " ")}{source.limitation ? ` (${source.limitation})` : ""}. </span>
        ))}
        {ledgerSource == null && <span>Property ledger: not yet synced. </span>}
        {fxUsd && <span>Rates from the Reserve Bank of Australia, {longDate(fxUsd.rateOn)}, A$1 = US${fxUsd.perAud.toFixed(4)}. </span>}
        {trouble.unpriced > 0 && <span>{trouble.unpriced} items have no price yet and are left out of every total. </span>}
        {trouble.possibleDuplicates > 0 && <span>{trouble.possibleDuplicates} items may be doubles and are marked. </span>}
        {day.lastRun?.limitation && <span>{day.lastRun.limitation} </span>}
      </div>
    </div>
  );
}
