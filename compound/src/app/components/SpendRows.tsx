import { barWidth, longDate } from "../../lib/format";
import { original, usd2 } from "../../lib/spend/format";
import type { CycleRecord, MeterUnit, SpendItem, SpendSource } from "../../lib/spend/schema";
import type { Subscription } from "../../lib/spend/summarise";
import { useSplit } from "../DeviceProvider";

/**
 * The row shapes of the spend tab. Meter rows are a breakdown with a bar;
 * item rows are the itemised list, one per outgoing, in its own currency and
 * in USD; subscription rows name a rhythm. None of them sum anything.
 */

export const SOURCE_WORD: Record<SpendSource, string> = { bills_sheet: "Sheet", cc_invoices: "Inbox", property_ledger: "Ledger" };

const PROVIDER_WORD: Record<string, string> = { anthropic: "Model calls", apify: "Scrapers", n8n: "Workflows" };

export function MeterRows({ units }: { units: MeterUnit[] }) {
  if (units.length === 0) return <p className="sub empty">The meter has no usage in the last thirty days.</p>;
  const peak = Math.max(...units.map((unit) => unit.usd), 0.01);
  return (
    <ul className="spend-meter" aria-label="Where the operating-system money went">
      {units.map((unit) => (
        <li key={`${unit.provider}-${unit.unitKind}-${unit.unitKey}`} className="spend-meter-row">
          <div className="spend-meter-copy">
            <strong>{unit.label}</strong>
            <small>{PROVIDER_WORD[unit.provider] ?? unit.provider}{unit.failed > 0 ? `, ${unit.failed} failed` : ""}</small>
            <span className="rank-bar"><span style={{ width: barWidth(unit.usd, peak) }} /></span>
          </div>
          <div className="spend-meter-num">
            <strong>{usd2(unit.usd)}</strong>
            <small>{usd2(unit.usd7d)} in 7 days</small>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function cycleSentence(cycle: CycleRecord): string {
  const plan = `${cycle.name} plan covers ${usd2(cycle.includedUsd)}.`;
  if (cycle.cycleUsd == null) return `${plan} This cycle's use is not known yet.`;
  if (cycle.state === "within") return `${plan} Used ${usd2(cycle.cycleUsd)} this cycle, ${usd2(cycle.headroomUsd)} still in hand.`;
  const over = `Used ${usd2(cycle.cycleUsd)} this cycle, so ${usd2(cycle.overUsd)} over.`;
  if (cycle.state === "charging_early") return `${plan} ${over} That is past the point where they bill early.`;
  if (cycle.state === "near_trigger") return `${plan} ${over} Close to the point where they bill early.`;
  return `${plan} ${over}`;
}

function flagWords(item: SpendItem): string[] {
  const words: string[] = [];
  if (item.flags.includes("possible_duplicate") || item.flags.includes("sheet_duplicate")) words.push("May be a double");
  if (item.amountUsd == null) words.push("No price yet");
  if (item.flags.includes("needs_review")) words.push("Check the parse");
  if (item.flags.includes("matched_by_amount")) words.push("Matched by amount");
  if (item.supersededByRef) words.push("Also on the sheet");
  return words;
}

function signed(item: SpendItem): string {
  if (item.amountUsd == null) return "n/a";
  return item.kind === "refund" ? `-${usd2(item.amountUsd)}` : usd2(item.amountUsd);
}

export function ItemRows({ items }: { items: SpendItem[] }) {
  const split = useSplit();
  if (split) {
    return (
      <div className="ranktable-wrap spendtable-wrap">
        <table className="ranktable spendtable">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Merchant</th>
              <th scope="col">Item</th>
              <th scope="col">Kind</th>
              <th scope="col">USD</th>
              <th scope="col">As charged</th>
              <th scope="col">Source</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.source}-${item.sourceRef}`} className={item.supersededByRef ? "spend-superseded" : ""}>
                <td className="mono">{item.occurredOn}</td>
                <td><strong>{item.merchant}</strong></td>
                <td className="mut">{item.item ?? item.category ?? ""}</td>
                <td className="mut">{item.kind === "refund" ? "Refund" : item.scope === "os" ? "Operating system" : item.scope === "property" ? "Property" : "Personal"}</td>
                <td className={`num ${item.kind === "refund" ? "up" : ""}`}>{signed(item)}</td>
                <td className="num mut">{original(item.amount, item.currency)}</td>
                <td className="mut">{SOURCE_WORD[item.source]}{item.confidence ? `, ${item.confidence.toLowerCase()}` : ""}</td>
                <td className="mut">{flagWords(item).join(". ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ul className="spend-list">
      {items.map((item) => (
        <li key={`${item.source}-${item.sourceRef}`} className={`spend-row${item.supersededByRef ? " spend-superseded" : ""}`}>
          <div className="spend-row-copy">
            <strong>{item.merchant}</strong>
            <small>{longDate(item.occurredOn)}{item.item ? `. ${item.item}` : ""}</small>
            <small className="spend-row-meta">{SOURCE_WORD[item.source]}{item.confidence ? `, ${item.confidence.toLowerCase()}` : ""}{flagWords(item).map((word) => `. ${word}`).join("")}</small>
          </div>
          <div className={`spend-row-num${item.kind === "refund" ? " up" : ""}`}>
            <strong>{signed(item)}</strong>
            <small>{original(item.amount, item.currency)}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SubscriptionRows({ rows, stopped = false }: { rows: Subscription[]; stopped?: boolean }) {
  if (rows.length === 0) return <p className="sub empty">{stopped ? "Nothing has stopped recently." : "No steady rhythm found yet. Three monthly charges or two yearly ones make one."}</p>;
  return (
    <ul className="spend-subs">
      {rows.map((row) => (
        <li key={row.merchantKey} className="spend-sub">
          <div className="spend-row-copy">
            <strong>{row.name}</strong>
            <small>
              {row.cadence === "monthly" ? "Monthly" : "Yearly"}, last paid {longDate(row.lastPaidOn)}.
              {stopped ? "" : ` Next around ${longDate(row.nextExpectedOn)}.`}
              {row.confidence === "thin" ? " One bill so far, so this is a guess." : ""}
            </small>
          </div>
          <div className="spend-row-num">
            <strong>{usd2(row.monthlyEquivalentUsd)}<small> a month</small></strong>
            <small>{row.cadence === "yearly" ? `${usd2(row.lastAmountUsd)} a year` : `${usd2(row.monthlyEquivalentUsd * 12)} a year`}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}
