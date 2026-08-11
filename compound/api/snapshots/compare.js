import { compareSnapshots, readRows, requireGet, sendJson, SNAPSHOT_SELECT, validDate, validHorizon } from "../../src/server/snapshotApi.js";

export default async function handler(request, response) {
  if (!requireGet(request, response)) return;
  const url = new URL(request.url, "http://localhost");
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"));
  const horizon = validHorizon(url.searchParams.get("horizon"));
  if (!from || !to || from >= to) {
    return sendJson(response, 400, { message: "Choose two dates with from earlier than to." });
  }
  try {
    const result = await readRows(
      request,
      `daily_snapshots?select=${SNAPSHOT_SELECT}&snapshot_date=in.(${from},${to})&horizon=eq.${horizon}&origin=in.(captured,reconstructed)&order=snapshot_date.asc`,
    );
    if (result.status !== 200) return sendJson(response, result.status, result.body);
    const fromSnapshot = result.body.find((item) => item.snapshot_date === from);
    const toSnapshot = result.body.find((item) => item.snapshot_date === to);
    if (!fromSnapshot || !toSnapshot) {
      return sendJson(response, 404, { message: "Both archived dates are required for comparison." });
    }
    return sendJson(response, 200, compareSnapshots(fromSnapshot, toSnapshot));
  } catch {
    return sendJson(response, 500, { message: "COMPOUND snapshots are not configured." });
  }
}
