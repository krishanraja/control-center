import { useState } from "react";
import { barWidth } from "../../lib/format";
import type { RankingRecord } from "../../lib/property/schema";
import { useSplit } from "../DeviceProvider";

/**
 * Where to buy next. Desktop gets a table because the eye compares columns;
 * the phone gets one row per suburb with the score as a bar. Every row can open
 * to show the four inputs and which ones were missing.
 */

function pct(value: number | null, digits = 1): string {
  return value == null ? "n/a" : `${value > 0 && digits === 1 ? "+" : ""}${value.toFixed(digits)}%`;
}

function count(value: number | null): string {
  return value == null ? "n/a" : String(Math.round(value));
}

function aud(value: number | null): string {
  return value == null ? "n/a" : `A$${Math.round(value).toLocaleString("en-AU")}`;
}

function Working({ row }: { row: RankingRecord }) {
  return (
    <div className="rank-working">
      <p>
        Rent return {pct(row.grossYieldPct, 2)} from {aud(row.medianWeeklyRentAud)} a week against {aud(row.medianSoldPriceAud)} typical sale.
        Rent growth {pct(row.rentGrowthPct)} and price growth {pct(row.priceGrowthPct)} over a year. {count(row.listingCount)} two bed units for sale.
      </p>
      {row.missing.length > 0 && <p className="mut">Not known yet: {row.missing.join(", ")}. Those inputs scored the middle.</p>}
    </div>
  );
}

export function RankTable({ rows }: { rows: RankingRecord[] }) {
  const split = useSplit();
  const [open, setOpen] = useState<string | null>(null);
  const peak = Math.max(...rows.map((row) => row.score), 1);
  const key = (row: RankingRecord) => `${row.suburb}-${row.postcode}`;

  if (split) {
    return (
      <div className="ranktable-wrap">
        <table className="ranktable">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Suburb</th>
              <th scope="col">Score</th>
              <th scope="col">Rent return</th>
              <th scope="col">Rent growth</th>
              <th scope="col">Price growth</th>
              <th scope="col">For sale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <>
                <tr key={key(row)} className={open === key(row) ? "open" : ""}>
                  <td className="num">{row.rank}</td>
                  <td>
                    <button type="button" className="rank-name" aria-expanded={open === key(row)} onClick={() => setOpen(open === key(row) ? null : key(row))}>
                      {row.suburb} <small>{row.postcode}</small>
                    </button>
                  </td>
                  <td>
                    <span className="rank-bar"><span style={{ width: barWidth(row.score, peak) }} /></span>
                    <span className="num">{row.score.toFixed(0)}</span>
                  </td>
                  <td className="num">{pct(row.grossYieldPct, 2)}</td>
                  <td className="num">{pct(row.rentGrowthPct)}</td>
                  <td className="num">{pct(row.priceGrowthPct)}</td>
                  <td className="num">{count(row.listingCount)}</td>
                </tr>
                {open === key(row) && (
                  <tr key={`${key(row)}-working`} className="rank-detail">
                    <td colSpan={7}><Working row={row} /></td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rank-list">
      {rows.map((row) => (
        <div className="rank-row" key={key(row)}>
          <button type="button" className="rank-head" aria-expanded={open === key(row)} onClick={() => setOpen(open === key(row) ? null : key(row))}>
            <span className="rank-pos num">{row.rank}</span>
            <span className="rank-copy">
              <strong>{row.suburb} <small>{row.postcode}</small></strong>
              <span className="rank-bar"><span style={{ width: barWidth(row.score, peak) }} /></span>
              <small>Rent return {pct(row.grossYieldPct, 2)} · rent {pct(row.rentGrowthPct)} · price {pct(row.priceGrowthPct)} · {count(row.listingCount)} for sale</small>
            </span>
            <span className="rank-score num">{row.score.toFixed(0)}</span>
          </button>
          {open === key(row) && <Working row={row} />}
        </div>
      ))}
    </div>
  );
}
