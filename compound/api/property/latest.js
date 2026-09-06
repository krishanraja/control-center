import { composePropertyDay, propertyQueries } from "../../src/server/propertyApi.js";
import { readRows, requireGet, sendJson } from "../../src/server/snapshotApi.js";

/**
 * One composed read of the member's property. Every query carries the caller's
 * own token, so row level security decides what comes back; this route never
 * holds a privileged key.
 */
export default async function handler(request, response) {
  if (!requireGet(request, response)) return;
  try {
    const propertyResult = await readRows(request, "properties?select=*&active=is.true&order=created_at.asc&limit=1");
    if (propertyResult.status !== 200) return sendJson(response, propertyResult.status, propertyResult.body);
    const property = propertyResult.body[0];
    if (!property) return sendJson(response, 404, { message: "No property is set up yet." });

    const queries = propertyQueries(property);
    const [loans, rates, rents, valuations, ledger, observations, latestRanking, cashRate, run] = await Promise.all([
      readRows(request, queries.loans),
      readRows(request, queries.rates),
      readRows(request, queries.rents),
      readRows(request, queries.valuations),
      readRows(request, queries.ledger),
      readRows(request, queries.observations),
      readRows(request, queries.latestRanking),
      readRows(request, queries.cashRate),
      readRows(request, queries.run),
    ]);
    const failed = [loans, rates, rents, valuations, ledger, observations, latestRanking, cashRate, run].find((result) => result.status !== 200);
    if (failed) return sendJson(response, failed.status, failed.body);

    let rankings = { status: 200, body: [] };
    const runOn = latestRanking.body[0]?.run_on;
    if (runOn) {
      rankings = await readRows(request, `property_suburb_rankings?select=*&run_on=eq.${runOn}&order=rank.asc&limit=100`);
      if (rankings.status !== 200) return sendJson(response, rankings.status, rankings.body);
    }

    const day = composePropertyDay({
      property,
      loans: loans.body,
      rates: rates.body,
      rents: rents.body,
      valuations: valuations.body,
      ledger: ledger.body,
      observations: observations.body,
      rankings: rankings.body,
      cashRate: cashRate.body[0] ?? null,
      run: run.body[0] ?? null,
    });
    return sendJson(response, 200, day);
  } catch {
    return sendJson(response, 500, { message: "Property data is not configured." });
  }
}
