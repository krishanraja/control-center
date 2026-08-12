const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Authorization",
  "Content-Type": "application/json; charset=utf-8",
};

export function sendJson(response, status, body) {
  response.statusCode = status;
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.setHeader(name, value);
  response.end(JSON.stringify(body));
}

export function requireGet(request, response) {
  if (!request.method || request.method === "GET") return true;
  sendJson(response, 405, { message: "Use GET." });
  return false;
}

export function bearerToken(request) {
  const authorization = typeof request.headers.authorization === "string"
    ? request.headers.authorization.trim()
    : "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function config() {
  const url = process.env.VITE_SUPABASE_URL?.trim()?.replace(/\/$/, "");
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) throw new Error("COMPOUND snapshot storage is not configured");
  return { url, publishableKey };
}

export async function readRows(request, tableQuery) {
  const token = bearerToken(request);
  if (!token) return { status: 401, body: { message: "Sign in to read COMPOUND snapshots." } };
  const { url, publishableKey } = config();
  const upstream = await fetch(`${url}/rest/v1/${tableQuery}`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Accept-Profile": "compound",
    },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await upstream.text();
  if (!upstream.ok) {
    const authFailure = upstream.status === 401 || upstream.status === 403;
    return {
      status: authFailure ? upstream.status : 502,
      body: { message: authFailure ? "Your COMPOUND session is not valid." : "Snapshot storage could not be read." },
    };
  }
  try {
    return { status: 200, body: text ? JSON.parse(text) : [] };
  } catch {
    return { status: 502, body: { message: "Snapshot storage returned an invalid response." } };
  }
}

export const SNAPSHOT_SELECT = [
  "id",
  "snapshot_date",
  "published_at",
  "schema_version",
  "engine_version",
  "origin",
  "status",
  "horizon",
  "coverage",
  "brief",
  "payload",
].join(",");

export function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function validHorizon(value) {
  return value === "1y" ? "1y" : "3m";
}

function storyKey(story) {
  const refs = Array.isArray(story?.entityRefs) ? [...story.entityRefs].sort().join("|") : "";
  return refs || story?.domain || story?.id || "unknown";
}

function stories(snapshot) {
  return Array.isArray(snapshot?.brief?.stories) ? snapshot.brief.stories : [];
}

function citations(story) {
  return Array.isArray(story?.citations) ? story.citations : [];
}

function sourceStatuses(snapshot) {
  const sources = Array.isArray(snapshot?.coverage?.sources) ? snapshot.coverage.sources : [];
  return new Map(sources.map((source) => [`${source.provider}:${source.domain}`, source.status]));
}

function metricValues(snapshot) {
  const metrics = Array.isArray(snapshot?.payload?.evidence?.metrics) ? snapshot.payload.evidence.metrics : [];
  const values = new Map();
  for (const metric of metrics) {
    const points = Array.isArray(metric?.points) ? metric.points : [];
    const point = points.at(-1);
    if (metric?.id && Number.isFinite(point?.value)) values.set(metric.id, point.value);
  }
  return values;
}

export function compareSnapshots(from, to) {
  const fromStories = stories(from);
  const toStories = stories(to);
  const fromByKey = new Map(fromStories.map((story) => [storyKey(story), story]));
  const changedVerdicts = [];
  const falsifierTransitions = [];
  const capitalMovement = [];
  for (const story of toStories) {
    const previous = fromByKey.get(storyKey(story));
    if (!previous) continue;
    if (previous.verdict !== story.verdict || previous.stance !== story.stance) {
      changedVerdicts.push({
        key: storyKey(story),
        domain: story.domain,
        from: { verdict: previous.verdict, stance: previous.stance },
        to: { verdict: story.verdict, stance: story.stance },
      });
    }
    if (previous.falsifierState && story.falsifierState && previous.falsifierState !== story.falsifierState) {
      falsifierTransitions.push({
        key: storyKey(story),
        falsifier: story.falsifier,
        from: previous.falsifierState,
        to: story.falsifierState,
      });
    } else if (
      previous.falsifier &&
      previous.stance !== story.stance &&
      previous.falsifierState === story.falsifierState
    ) {
      falsifierTransitions.push({
        key: storyKey(story),
        falsifier: previous.falsifier,
        from: previous.falsifierState ?? "untriggered",
        to: "triggered",
        date: to.snapshot_date,
      });
    }
    if (previous.decisiveMetric?.value !== story.decisiveMetric?.value) {
      capitalMovement.push({
        key: storyKey(story),
        label: story.decisiveMetric?.label,
        from: previous.decisiveMetric?.value,
        to: story.decisiveMetric?.value,
        direction: story.decisiveMetric?.direction,
      });
    }
  }
  const previousCitationUrls = new Set(fromStories.flatMap(citations).map((item) => item.url));
  const newEvidence = toStories.flatMap((story) => citations(story)
    .filter((item) => !previousCitationUrls.has(item.url))
    .map((item) => ({ story: storyKey(story), ...item })));
  const beforeCoverage = sourceStatuses(from);
  const afterCoverage = sourceStatuses(to);
  const coverageDifferences = [...new Set([...beforeCoverage.keys(), ...afterCoverage.keys()])]
    .flatMap((key) => beforeCoverage.get(key) === afterCoverage.get(key) ? [] : [{
      source: key,
      from: beforeCoverage.get(key) ?? "missing",
      to: afterCoverage.get(key) ?? "missing",
    }]);
  const beforeMetrics = metricValues(from);
  const afterMetrics = metricValues(to);
  const rawMetricDeltas = [...afterMetrics.entries()].flatMap(([id, value]) => {
    const previous = beforeMetrics.get(id);
    return previous === undefined ? [] : [{ id, from: previous, to: value, delta: value - previous }];
  });
  return {
    from: from.snapshot_date,
    to: to.snapshot_date,
    changedVerdicts,
    newEvidence,
    falsifierTransitions,
    capitalMovement,
    coverageDifferences,
    rawMetricDeltas,
  };
}
