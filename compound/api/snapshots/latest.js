import { readRows, requireGet, sendJson, SNAPSHOT_SELECT, validHorizon } from "../../src/server/snapshotApi.js";

export default async function handler(request, response) {
  if (!requireGet(request, response)) return;
  const url = new URL(request.url, "http://localhost");
  const horizon = validHorizon(url.searchParams.get("horizon"));
  try {
    const result = await readRows(
      request,
      `daily_snapshots?select=${SNAPSHOT_SELECT}&horizon=eq.${horizon}&origin=in.(captured,reconstructed)&order=snapshot_date.desc,published_at.desc&limit=1`,
    );
    if (result.status !== 200) return sendJson(response, result.status, result.body);
    const snapshot = result.body[0];
    return snapshot
      ? sendJson(response, 200, snapshot)
      : sendJson(response, 404, { message: "No published COMPOUND snapshot is available yet." });
  } catch {
    return sendJson(response, 500, { message: "COMPOUND snapshots are not configured." });
  }
}
