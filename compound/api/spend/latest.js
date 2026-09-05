import { composeSpendDay, spendQueries } from "../../src/server/spendApi.js";
import { readRows, requireGet, sendJson } from "../../src/server/snapshotApi.js";

/**
 * One composed read of the member's spend. Every query carries the caller's
 * own token, so row level security decides what comes back; this route never
 * holds a privileged key and never touches the Control Center schema.
 */
export default async function handler(request, response) {
  if (!requireGet(request, response)) return;
  try {
    const queries = spendQueries();
    const [items, merchants, overrides, meter, fx, run, cash] = await Promise.all([
      readRows(request, queries.items),
      readRows(request, queries.merchants),
      readRows(request, queries.overrides),
      readRows(request, queries.meter),
      readRows(request, queries.fx),
      readRows(request, queries.run),
      readRows(request, queries.cash),
    ]);
    const failed = [items, merchants, overrides, meter, fx, run, cash].find((result) => result.status !== 200);
    if (failed) return sendJson(response, failed.status, failed.body);
    if (items.body.length === 0 && run.body.length === 0) return sendJson(response, 404, { message: "No spend has been synced yet." });

    const day = composeSpendDay({
      items: items.body,
      merchants: merchants.body,
      overrides: overrides.body,
      meter: meter.body,
      fx: fx.body,
      run: run.body[0] ?? null,
      cash: cash.body[0] ?? null,
    }, { meterSince: queries.meterSince });
    return sendJson(response, 200, day);
  } catch {
    return sendJson(response, 500, { message: "Spend data is not configured." });
  }
}
