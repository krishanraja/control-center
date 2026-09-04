import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CompoundConfig } from "../../lib/env";
import { aud, longDate, plain1 } from "../../lib/format";
import { CATEGORY_LABEL, summariseLedger } from "../../lib/property/ledger";
import { usePropertyDay } from "../../lib/property/load";
import { amortise, loanShare, ownOutright } from "../../lib/property/loan";
import { currentRent, grossRentReturn, nextReview, rentBand, rentGap, reviewAdvice, weeklyRent } from "../../lib/property/rent";
import type { PropertyDay, ValuationRecord } from "../../lib/property/schema";
import { PROPERTY_EXPLAIN } from "../../lib/words";
import { Card } from "../components/Card";
import { CompareBars } from "../components/CompareBars";
import { DomainIcon } from "../components/Icons";
import { RankTable } from "../components/RankTable";
import { SectionHead, Tile } from "../components/Tile";
import { TrendChart } from "../components/TrendChart";

interface Props {
  config: CompoundConfig;
  session: Session | null;
  onAsk: (question: string) => void;
}

function weekly(value: number | null | undefined): string {
  return value == null ? "n/a" : `A$${Math.round(value)}/wk`;
}

function latestEstimate(valuations: ValuationRecord[]): ValuationRecord | null {
  const sorted = [...valuations].sort((a, b) => a.estimatedOn.localeCompare(b.estimatedOn) || (a.method === "purchase_price" ? -1 : 1));
  return sorted.at(-1) ?? null;
}

function confidenceWord(confidence: "low" | "medium" | "high"): string {
  return confidence === "high" ? "good" : confidence === "medium" ? "fair" : "thin";
}

export function PropertyTab({ config, session, onAsk }: Props) {
  const load = usePropertyDay(config, session);
  if (load.state === "loading") {
    return <div className="portfolio-empty property-page"><p className="eyebrow">Property</p><h2>Reading your unit…</h2></div>;
  }
  if (load.state === "none" || load.state === "error") {
    return (
      <div className="portfolio-empty property-page">
        <span aria-hidden="true"><DomainIcon domain="macro" /></span>
        <p className="eyebrow">Property</p>
        <h2>{load.state === "none" ? "No unit is set up yet." : "The property data could not be read."}</h2>
        <p>{load.message}</p>
      </div>
    );
  }
  return <PropertyBody day={load.day} onAsk={onAsk} />;
}

function PropertyBody({ day, onAsk }: { day: PropertyDay; onAsk: (question: string) => void }) {
  const asOf = day.generatedAt.slice(0, 10);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const estimate = latestEstimate(day.valuations);
  const loanState = useMemo(() => day.loan ? amortise(day.loan, day.rates, asOf) : null, [day.loan, day.rates, asOf]);
  const balance = loanState?.balance ?? 0;
  const mid = estimate?.midAud ?? day.property.purchasePriceAud;
  const owned = ownOutright(mid, balance);
  const share = loanShare(balance, mid);
  const gain = mid - day.property.purchasePriceAud;

  const valuePoints = useMemo(() => {
    const byDate = new Map<string, ValuationRecord>();
    for (const row of [...day.valuations].sort((a, b) => a.estimatedOn.localeCompare(b.estimatedOn))) byDate.set(row.estimatedOn, row);
    return [...byDate.values()].map((row) => ({ date: row.estimatedOn, value: row.midAud, low: row.lowAud, high: row.highAud }));
  }, [day.valuations]);
  const balancePoints = useMemo(
    () => (loanState?.schedule ?? []).map((row) => ({ date: row.date, value: row.closing })),
    [loanState],
  );

  const rent = currentRent(day.rents, asOf);
  const rentWeekly = rent ? weeklyRent(rent) : null;
  const band = rentBand(day.observations, day.property.postcode, day.property.bedrooms);
  const gap = rentWeekly != null ? rentGap(rentWeekly, band) : null;
  const review = nextReview(day.rents, asOf);
  const rentReturn = rentWeekly != null ? grossRentReturn(rentWeekly, day.property.purchasePriceAud) : null;

  const ledger = useMemo(() => summariseLedger(day.ledger, loanState?.schedule ?? [], asOf), [day.ledger, loanState, asOf]);
  const cumulativePoints = ledger.cumulative.map((point) => ({ date: point.date, value: point.net }));

  const cashRates = day.observations.filter((row) => row.metric === "cash_rate_pct").sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const cashAtSettlement = cashRates.find((row) => row.periodEnd >= day.property.settledOn) ?? cashRates[0];
  const cashNow = cashRates.at(-1);
  const rateNow = loanState?.currentRatePct ?? day.rates.at(-1)?.ratePct ?? null;

  const usesDomain = day.observations.some((row) => row.source === "domain");
  const anchor = estimate?.inputs.anchor as { price?: number; soldOn?: string; address?: string | null; adjusted?: number | null; carAdjustmentAud?: number | null } | null | undefined;
  const pool = estimate?.inputs.pool as { scope?: string; count?: number; median?: number | null } | undefined;
  const assumptions = Array.isArray(estimate?.inputs.assumptions) ? estimate?.inputs.assumptions as string[] : [];

  const headline = estimate
    ? owned > 0
      ? `Worth about ${aud(mid)}. You own ${aud(owned)} of it outright.`
      : `Worth about ${aud(mid)}, which is less than the loan.`
    : "No estimate yet. The first weekly run will add one.";

  return (
    <div className="portfolio-page property-page">
      <p className="eyebrow">Your unit, separate from markets</p>
      <h2 className="big">{headline}</h2>
      <p className="sub">
        {day.property.label}, {day.property.suburb} {day.property.postcode}. {day.property.bedrooms} bed, {day.property.bathrooms} bath, {day.property.carSpaces} car.
        Bought for {aud(day.property.purchasePriceAud)}, settled {longDate(day.property.settledOn)}.
      </p>

      <div className="tiles">
        <Tile
          label="Worth now"
          value={estimate ? aud(mid) : "n/a"}
          detail={estimate?.lowAud != null && estimate.highAud != null ? `${aud(estimate.lowAud)} to ${aud(estimate.highAud)}. ${gain >= 0 ? "Up" : "Down"} ${aud(Math.abs(gain))} on the price paid.` : PROPERTY_EXPLAIN.worthNow}
          signal={gain > 0}
        />
        <Tile label="You own outright" value={aud(owned)} detail={PROPERTY_EXPLAIN.ownOutright} />
        <Tile label="Loan left" value={aud(balance)} detail={loanState ? `${loanState.paymentsMade} repayments made. ${aud(loanState.principalPaid)} paid down so far.` : "No loan recorded."} />
        <Tile label="Loan as a share of value" value={share == null ? "n/a" : plain1(share)} detail={PROPERTY_EXPLAIN.loanShare} />
      </div>

      <SectionHead title="Where the value and the loan are heading" note={estimate ? `estimate ${longDate(estimate.estimatedOn)}` : undefined} />
      <TrendChart
        points={valuePoints}
        compare={balancePoints}
        label="Estimated value"
        compareLabel="Loan balance"
        format={(value) => aud(value)}
      />
      <p className="sub note">Solid line is the estimated value with its low to high band. Dotted line is the loan balance.</p>

      {estimate && (
        <Card
          id="value-working"
          tag={`Estimate, ${confidenceWord(estimate.confidence)} evidence`}
          tone={gain >= 0 ? "up" : "down"}
          head={`${aud(mid)} today, in a band from ${aud(estimate.lowAud ?? mid)} to ${aud(estimate.highAud ?? mid)}.`}
          next="This moves when a two bed unit sells nearby or in the building."
          source={`Method: ${String(estimate.inputs.method ?? estimate.method)}. Engine ${estimate.engineVersion}.`}
          ask="How was the value of my unit estimated and what would change it?"
          open={open.has("value-working")}
          onToggle={toggle}
          onAsk={onAsk}
        >
          {anchor?.price != null && (
            <p>
              <b>Building sale.</b> {anchor.address ?? "A same size unit in the block"} sold for {aud(anchor.price)} on {anchor.soldOn ? longDate(anchor.soldOn) : "an unknown date"}.
              {anchor.carAdjustmentAud ? ` Adjusted by ${aud(anchor.carAdjustmentAud)} for the difference in car spaces` : ""}{anchor.adjusted != null ? `, giving ${aud(anchor.adjusted)}.` : "."}
            </p>
          )}
          {pool && (
            <p><b>Nearby sales.</b> {pool.count ?? 0} two bed unit sales in {pool.scope ?? day.property.postcode} over the last year{pool.median != null ? `, typical price ${aud(pool.median)}` : ""}.</p>
          )}
          {assumptions.length > 0 && <p><b>Assumptions.</b> {assumptions.join(" ")}</p>}
          <p><b>Rent return.</b> {rentReturn == null ? "Not known." : `${plain1(rentReturn)} a year on the price paid, before costs.`} {PROPERTY_EXPLAIN.rentReturn}.</p>
        </Card>
      )}

      <SectionHead title="Rent" note={rent ? `${weekly(rentWeekly)} since ${longDate(rent.effectiveFrom)}` : undefined} />
      <CompareBars
        caption="Weekly rent, yours against the area"
        rows={[
          { label: "Your rent", value: rentWeekly, display: weekly(rentWeekly), colour: "var(--sig)" },
          { label: "Area median", value: band.areaMedian, display: weekly(band.areaMedian) },
          { label: "Asking, low quarter", value: band.askingP25, display: weekly(band.askingP25) },
          { label: "Asking, middle", value: band.askingMedian, display: weekly(band.askingMedian) },
          { label: "Asking, high quarter", value: band.askingP75, display: weekly(band.askingP75) },
        ]}
      />
      <Card
        id="rent-working"
        tag={gap ? (gap.gapPct > 3 ? "Room to move" : gap.gapPct < -3 ? "Above the area" : "On the area") : "No market figure yet"}
        tone={gap ? (gap.gapPct > 3 ? "up" : "mixed") : undefined}
        head={reviewAdvice(gap)}
        next={review.earliestIncreaseOn ? `Next allowed increase ${longDate(review.earliestIncreaseOn)}. Written notice by ${longDate(review.noticeBy ?? review.earliestIncreaseOn)}.` : "No rent history recorded yet."}
        source={[
          band.areaMedian != null ? `Area median from ${band.areaMedianSource === "rta" ? "RTA bonds" : band.areaMedianSource ?? "market data"}, quarter to ${band.areaMedianPeriod ? longDate(band.areaMedianPeriod) : "n/a"}.` : "No area median yet.",
          band.askingMedian != null ? `Asking rents from ${band.askingCount ?? 0} current two bed listings, ${band.askingPeriod ? longDate(band.askingPeriod) : ""}.` : "No current asking rents yet.",
        ].join(" ")}
        ask="What rent should I charge for my unit and when can I change it?"
        open={open.has("rent-working")}
        onToggle={toggle}
        onAsk={onAsk}
      >
        {gap && <p><b>The gap.</b> Your {weekly(rentWeekly)} against {weekly(gap.reference)} for {gap.referenceLabel}: {gap.gapWeekly >= 0 ? "+" : ""}{aud(gap.gapWeekly)} a week, {plain1(gap.gapPct)}.</p>}
        <p><b>The rule.</b> Queensland allows one increase every twelve months, with two months of written notice.{review.leaseEndsOn ? ` The current lease ends ${longDate(review.leaseEndsOn)}.` : ""}</p>
        {rent?.managementFeePct != null && <p><b>Agent fee.</b> {plain1(rent.managementFeePct)} of rent collected.</p>}
      </Card>

      <SectionHead title="Money in and out" note={ledger.to ? `to ${longDate(ledger.to)}` : undefined} />
      {day.ledger.length === 0 ? (
        <p className="sub empty">No cost records loaded yet. The ledger sheet mirror fills this in.</p>
      ) : (
        <>
          <div className="tiles">
            <Tile label="Rent received" value={aud(ledger.rentReceived)} detail={`Since ${ledger.from ? longDate(ledger.from) : "the start"}.`} />
            <Tile label="Holding costs" value={aud(ledger.holdingCosts)} detail="Agent, body corporate, rates, water, insurance, repairs." />
            <Tile label="Interest paid" value={aud(ledger.interestPaid)} detail={`Out of ${aud(ledger.loanRepayments)} in repayments.`} />
            <Tile label="Loan paydown" value={aud(ledger.principalPaid)} detail={PROPERTY_EXPLAIN.loanPaydown} signal />
            <Tile label="Net out of pocket" value={aud(ledger.netOutOfPocket)} detail={`${PROPERTY_EXPLAIN.netOutOfPocket}. ${aud(ledger.netCostExcludingPaydown)} once paydown is added back.`} />
            <Tile label="Buying costs" value={aud(ledger.oneOffCosts)} detail="One-off costs to buy: agent, legal, setup." />
          </div>
          <TrendChart points={cumulativePoints} label="Running net cash position" format={(value) => aud(value)} colour="var(--s2)" />
          <p className="sub note">Running total of everything in minus everything out, including loan repayments.</p>
          <CompareBars
            caption="Costs over the last twelve months, by kind"
            rows={ledger.trailingYearByCategory.map((row) => ({ label: row.label, value: row.total, display: aud(row.total) }))}
          />
          <Card
            id="costs-working"
            tag={ledger.fastestRising ? "Cost to watch" : "Costs"}
            tone={ledger.fastestRising ? "down" : undefined}
            head={ledger.fastestRising
              ? `${ledger.fastestRising.label} went from ${aud(ledger.fastestRising.first)} to ${aud(ledger.fastestRising.latest)} a quarter.`
              : "No single cost is running away."}
            next={ledger.gaps.length > 0 ? `${ledger.gaps.length} known gap${ledger.gaps.length === 1 ? "" : "s"} in the records still to chase.` : "No known gaps in the records."}
            source={`Cost ledger sheet, ${Math.round(ledger.confirmedShare * 100)}% of rows confirmed from a document. Last synced ${ledger.lastSyncedAt ? longDate(ledger.lastSyncedAt) : "n/a"}.`}
            ask="Which of my property costs are rising fastest and what can I do about them?"
            open={open.has("costs-working")}
            onToggle={toggle}
            onAsk={onAsk}
          >
            {ledger.byCategory.map((row) => (
              <p key={row.category}><b>{CATEGORY_LABEL[row.category]}.</b> {aud(row.total)} over {row.count} payment{row.count === 1 ? "" : "s"}.</p>
            ))}
            {ledger.gaps.map((row) => (
              <p key={`${row.occurredOn}-${row.sheetCategory}`} className="mut">Gap, {longDate(row.occurredOn)}: {row.description ?? row.sheetCategory}</p>
            ))}
          </Card>
        </>
      )}

      {cashNow && cashAtSettlement && rateNow != null && (
        <p className="sub note">
          Cash rate {plain1(cashAtSettlement.value)} at settlement, {plain1(cashNow.value)} at {longDate(cashNow.periodEnd)}. Your loan rate on record is {plain1(rateNow)}.
        </p>
      )}

      <SectionHead title="Where to buy next" note={day.rankings[0] ? `run ${longDate(day.rankings[0].runOn)}` : undefined} />
      {day.rankings.length === 0 || day.rankings.every((row) => row.missing.length >= 4) ? (
        <p className="sub empty">Not enough market data yet to rank suburbs. Rent and sale feeds fill this in over the first runs.</p>
      ) : (
        <RankTable rows={day.rankings} />
      )}

      <div className="src property-sources">
        {(day.lastRun?.coverage ?? []).map((source) => (
          <span key={source.provider}>{source.provider}: {source.status === "available" ? `updated ${source.sourceDate ? longDate(source.sourceDate) : "recently"}` : source.status.replace("_", " ")}{source.limitation ? ` (${source.limitation})` : ""}. </span>
        ))}
        {usesDomain && <span>Listings data powered by Domain.</span>}
      </div>
    </div>
  );
}
