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
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
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
    if (typeof row.label !== "string" || typeof row.detail !== "string" || typeof row.source !== "string") return [];
    return [{
      id: typeof row.id === "string" ? row.id.slice(0, 100) : `evidence-${index + 1}`,
      label: row.label.slice(0, 180),
      detail: row.detail.slice(0, 220),
      source: row.source.slice(0, 120),
      checkedAt: typeof row.checkedAt === "string" ? row.checkedAt.slice(0, 80) : "time unavailable",
      current: row.current === true,
    }];
  });
}

export function isBoundaryRequest(question: string): boolean {
  return /(control[ -]?center|app_secrets|system_config|service[ -]?role|api key|access token|reveal.{0,20}(prompt|secret)|ignore.{0,30}(instructions|evidence))/i.test(question);
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

/**
 * A hidden industry must stay hidden in the answer too, or Ask contradicts the
 * rest of the app. This is the instruction that carries the reader's choice
 * into the model; it returns "" when nothing is hidden so no note is added.
 */
export function excludedNote(excluded: string[]): string {
  const names = cleanExcluded(excluded);
  if (!names.length) return "";
  return `The reader has switched these industries off and does not want them in answers: ${names.join(", ")}. Do not build the answer around them. If the question is only about a switched-off industry, say it is hidden in their settings.`;
}

/** Best effort: drop evidence whose text names a hidden industry. */
export function filterEvidenceByExcluded(evidence: EvidenceRecord[], excluded: string[]): EvidenceRecord[] {
  const matchers = cleanExcluded(excluded).map((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu");
  });
  if (!matchers.length) return evidence;
  return evidence.filter((item) => {
    const haystack = `${item.label} ${item.detail}`;
    return !matchers.some((matcher) => matcher.test(haystack));
  });
}
