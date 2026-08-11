export interface EvidenceRecord {
  id: string;
  label: string;
  detail: string;
  source: string;
  checkedAt: string;
  current: boolean;
}

export function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function extractProviderText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (
    !Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object"
  ) return "";
  const delta = (choices[0] as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") return "";
  const content = (delta as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

export function safeEvidence(value: unknown): EvidenceRecord[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.label !== "string" || typeof row.detail !== "string" ||
      typeof row.source !== "string"
    ) return [];
    return [{
      id: typeof row.id === "string"
        ? row.id.slice(0, 100)
        : `evidence-${index + 1}`,
      label: row.label.slice(0, 180),
      detail: row.detail.slice(0, 220),
      source: row.source.slice(0, 120),
      checkedAt: typeof row.checkedAt === "string"
        ? row.checkedAt.slice(0, 80)
        : "time unavailable",
      current: row.current === true,
    }];
  });
}

export function isBoundaryRequest(question: string): boolean {
  return /(control[ -]?center|app_secrets|system_config|service[ -]?role|api key|access token|reveal.{0,20}(prompt|secret)|ignore.{0,30}(instructions|evidence))/i
    .test(question);
}

/** The industries the reader has switched off, cleaned and capped. */
export function cleanExcluded(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [...new Set(names)].slice(0, 256);
}

export interface ArchiveSnapshotRecord {
  id: string;
  as_of: string;
  snapshot_date: string;
  published_at: string;
  horizon: string;
  status: string;
  origin: string;
  engine_version: string;
  brief: unknown;
  coverage: unknown;
  payload: unknown;
}

export type AskScope = "current" | "compare" | "range";

/**
 * A hidden industry must stay hidden in the answer too, or Ask contradicts the
 * rest of the app. This is the instruction that carries the reader's choice
 * into the model; it returns "" when nothing is hidden so no note is added.
 */
export function excludedNote(excluded: string[]): string {
  const names = cleanExcluded(excluded);
  if (!names.length) return "";
  return `The reader has switched these industries off and does not want them in answers: ${
    names.join(", ")
  }. Do not build the answer around them. If the question is only about a switched-off industry, say it is hidden in their settings.`;
}

/** Best effort: drop evidence whose text names a hidden industry. */
export function filterEvidenceByExcluded(
  evidence: EvidenceRecord[],
  excluded: string[],
): EvidenceRecord[] {
  const matchers = excludedMatchers(excluded);
  if (!matchers.length) return evidence;
  return evidence.filter((item) => {
    const haystack = `${item.label} ${item.detail}`;
    return !matchers.some((matcher) => matcher.test(haystack));
  });
}

function excludedMatchers(excluded: string[]): RegExp[] {
  return cleanExcluded(excluded).map((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
      "iu",
    );
  });
}

export function redactExcluded(value: unknown, excluded: string[]): unknown {
  const matchers = excludedMatchers(excluded);
  if (!matchers.length) return value;
  const containsExcluded = (text: string) =>
    matchers.some((matcher) => matcher.test(text));
  const visit = (item: unknown): unknown => {
    if (typeof item === "string") {
      return containsExcluded(item) ? undefined : item;
    }
    if (Array.isArray(item)) {
      return item.flatMap((entry) => {
        const next = visit(entry);
        return next === undefined ? [] : [next];
      });
    }
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).flatMap(
          ([key, entry]) => {
            if (containsExcluded(key)) return [];
            const next = visit(entry);
            return next === undefined ? [] : [[key, next]];
          },
        ),
      );
    }
    return item;
  };
  return visit(value);
}

export function filterArchiveByExcluded(
  snapshots: ArchiveSnapshotRecord[],
  excluded: string[],
): ArchiveSnapshotRecord[] {
  const matchers = excludedMatchers(excluded);
  if (!matchers.length) return snapshots;
  return snapshots.map((snapshot) => {
    const brief = object(snapshot.brief);
    const visibleStories = stories(snapshot).filter((story) => {
      const haystack = [
        story.title,
        story.verdict,
        ...(Array.isArray(story.entityRefs) ? story.entityRefs : []),
      ]
        .filter((item): item is string => typeof item === "string")
        .join(" ");
      return !matchers.some((matcher) => matcher.test(haystack));
    });
    return { ...snapshot, brief: { ...brief, stories: visibleStories } };
  });
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stories(
  snapshot: ArchiveSnapshotRecord,
): Array<Record<string, unknown>> {
  const value = object(snapshot.brief).stories;
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
    )
    : [];
}

function storyKey(story: Record<string, unknown>): string {
  const refs = Array.isArray(story.entityRefs)
    ? story.entityRefs.filter((item): item is string =>
      typeof item === "string"
    ).sort().join("|")
    : "";
  return refs || (typeof story.domain === "string" ? story.domain : "unknown");
}

function compactStory(story: Record<string, unknown>) {
  const citations = Array.isArray(story.citations)
    ? story.citations.flatMap((item) => {
      const row = object(item);
      return typeof row.url === "string"
        ? [{
          publisher: typeof row.publisher === "string"
            ? row.publisher
            : "Source",
          title: typeof row.title === "string" ? row.title : "Evidence",
          url: row.url,
          sourceDate: typeof row.sourceDate === "string"
            ? row.sourceDate
            : undefined,
        }]
        : [];
    }).slice(0, 6)
    : [];
  return {
    key: storyKey(story),
    domain: story.domain,
    classification: story.classification,
    stance: story.stance,
    title: story.title,
    verdict: story.verdict,
    decisiveMetric: story.decisiveMetric,
    falsifier: story.falsifier,
    falsifierState: story.falsifierState,
    citations,
  };
}

function compactSnapshot(snapshot: ArchiveSnapshotRecord) {
  return {
    date: snapshot.snapshot_date,
    publishedAt: snapshot.published_at,
    status: snapshot.status,
    origin: snapshot.origin,
    engineVersion: snapshot.engine_version,
    coverage: snapshot.coverage,
    stories: stories(snapshot).map(compactStory),
  };
}

function dailyMetricValues(snapshot: ArchiveSnapshotRecord) {
  const evidence = object(object(snapshot.payload).evidence);
  const metrics = Array.isArray(evidence.metrics) ? evidence.metrics : [];
  return metrics.flatMap((item) => {
    const metric = object(item);
    const points = Array.isArray(metric.points) ? metric.points : [];
    const point = object(points.at(-1));
    return typeof metric.id === "string" && typeof point.value === "number"
      ? [{ id: metric.id, value: point.value, sourceDate: point.date }]
      : [];
  });
}

/**
 * Long ranges carry one compact value per archived date and every verdict
 * transition. They never send the model every full daily evidence payload.
 */
export function historyGrounding(
  snapshots: ArchiveSnapshotRecord[],
  scope: AskScope,
) {
  const ordered = [...snapshots].sort((a, b) =>
    a.snapshot_date.localeCompare(b.snapshot_date)
  );
  if (scope === "current") {
    return {
      scope,
      snapshot: ordered.at(-1) ? compactSnapshot(ordered.at(-1)!) : null,
    };
  }
  if (scope === "compare") {
    return { scope, snapshots: ordered.map(compactSnapshot) };
  }

  const verdictState = new Map<string, string>();
  const verdictTransitions: Array<Record<string, unknown>> = [];
  const series = new Map<
    string,
    Array<{ date: string; value: number; sourceDate: unknown }>
  >();
  for (const snapshot of ordered) {
    for (const story of stories(snapshot).map(compactStory)) {
      const signature = JSON.stringify([
        story.stance,
        story.verdict,
        story.falsifierState,
      ]);
      if (verdictState.get(story.key) !== signature) {
        verdictTransitions.push({ date: snapshot.snapshot_date, ...story });
        verdictState.set(story.key, signature);
      }
    }
    for (const metric of dailyMetricValues(snapshot)) {
      const values = series.get(metric.id) ?? [];
      values.push({
        date: snapshot.snapshot_date,
        value: metric.value,
        sourceDate: metric.sourceDate,
      });
      series.set(metric.id, values);
    }
  }
  return {
    scope,
    from: ordered[0]?.snapshot_date,
    to: ordered.at(-1)?.snapshot_date,
    snapshotCount: ordered.length,
    verdictTransitions,
    timeSeries: Object.fromEntries(series),
    origins: ordered.map((snapshot) => ({
      date: snapshot.snapshot_date,
      origin: snapshot.origin,
      engineVersion: snapshot.engine_version,
    })),
  };
}

export function evidenceFromArchive(
  snapshot: ArchiveSnapshotRecord,
): EvidenceRecord[] {
  return stories(snapshot).flatMap((story, storyIndex) => {
    const compact = compactStory(story);
    return compact.citations.map((citation, citationIndex) => ({
      id: `${snapshot.snapshot_date}-${storyIndex + 1}-${citationIndex + 1}`,
      label: typeof compact.title === "string"
        ? compact.title
        : "Archived market evidence",
      detail: `${citation.publisher}, ${
        citation.sourceDate ?? snapshot.snapshot_date
      }`,
      source: citation.url,
      checkedAt: citation.sourceDate ?? snapshot.snapshot_date,
      current: true,
    }));
  }).slice(0, 12);
}
