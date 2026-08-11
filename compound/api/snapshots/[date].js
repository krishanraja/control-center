import { readRows, requireGet, sendJson, SNAPSHOT_SELECT, validDate, validHorizon } from "../../src/server/snapshotApi.js";

export default async function handler(request, response) {
  if (!requireGet(request, response)) return;
  const url = new URL(request.url, "http://localhost");
  const date = validDate(decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || ""));
  const horizon = validHorizon(url.searchParams.get("horizon"));
  if (!date) return sendJson(response, 400, { message: "Use a snapshot date in YYYY-MM-DD form." });
  try {
    const result = await readRows(
      request,
      `daily_snapshots?select=${SNAPSHOT_SELECT}&snapshot_date=eq.${date}&horizon=eq.${horizon}&origin=in.(captured,reconstructed)&limit=1`,
    );
    if (result.status !== 200) return sendJson(response, result.status, result.body);
    const snapshot = result.body[0];
    return snapshot
      ? sendJson(response, 200, snapshot)
      : sendJson(response, 404, { message: `No COMPOUND snapshot exists for ${date}.` });
  } catch {
    return sendJson(response, 500, { message: "COMPOUND snapshots are not configured." });
  }
}
