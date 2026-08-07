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
