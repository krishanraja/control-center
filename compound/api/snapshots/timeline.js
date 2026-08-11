import { readRows, requireGet, sendJson, SNAPSHOT_SELECT, validDate, validHorizon } from "../../src/server/snapshotApi.js";

export default async function handler(request, response) {
  if (!requireGet(request, response)) return;
  const url = new URL(request.url, "http://localhost");
  const before = validDate(url.searchParams.get("before"));
  const horizon = validHorizon(url.searchParams.get("horizon"));
  const limit = Math.min(90, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "30", 10) || 30));
  const beforeFilter = before ? `&snapshot_date=lt.${before}` : "";
  try {
    const result = await readRows(
      request,
      `daily_snapshots?select=${SNAPSHOT_SELECT}&horizon=eq.${horizon}&origin=in.(captured,reconstructed)${beforeFilter}&order=snapshot_date.desc,published_at.desc&limit=${limit}`,
    );
    return sendJson(response, result.status, result.body);
  } catch {
    return sendJson(response, 500, { message: "COMPOUND snapshots are not configured." });
  }
}
