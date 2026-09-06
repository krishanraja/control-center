import type { Classifiable, OverrideRow, RegistryRow, Scope, ScopeReason } from "../types.ts";

/**
 * Who was paid and which bucket it belongs to. The key is deliberately dumb:
 * fold the raw merchant to a slug. Judgment lives in three ordered places, an
 * override the member wrote, a static alias for merchants the registry gets
 * wrong, and the Control Center registry's own vendor needles.
 */

const LEGAL_SUFFIX = /\b(?:inc|llc|ltd|limited|pty|pte|gmbh|co|corp|corporation|plc|pbc|bv|sa|ag)\b\.?/g;
const TRAILING_ID = /\s+[a-z0-9]*\d[a-z0-9]{4,}$/;

export function merchantKey(raw: string): string {
  let text = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  text = text.replace(/\(.*?\)/g, (group) => ` ${group.slice(1, -1)} `);
  text = text.replace(/[^a-z0-9\s*&.-]+/g, " ");
  text = text.replace(/\*/g, " ").replace(/\.com\b|\.ai\b|\.io\b/g, " ");
  text = text.replace(LEGAL_SUFFIX, " ");
  text = text.replace(/[&.,-]+/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(TRAILING_ID, "").trim();
  const slug = text.replace(/\s+/g, "-").slice(0, 80);
  return slug || "unknown";
}

export interface AliasRule {
  name: string;
  test: (item: Classifiable, key: string) => boolean;
  merchant_key?: string;
  registry_key?: string;
  scope?: Scope;
}

const OS_DOMAINS = ["themindmaker.ai", "fractionl.ai"];

function domainOf(email: string | null): string {
  const at = (email ?? "").lastIndexOf("@");
  return at < 0 ? "" : (email ?? "").slice(at + 1).toLowerCase();
}

/** Merchants where the registry needle is too broad or the mailbox decides. */
export const ALIASES: AliasRule[] = [
  { name: "n8n via Paddle", test: (_item, key) => key.includes("n8n"), merchant_key: "n8n", registry_key: "n8n", scope: "os" },
  { name: "Google Play is personal", test: (_item, key) => key.startsWith("google-play") || key === "googleplay", merchant_key: "google-play", scope: "personal" },
  { name: "YouTube is personal", test: (_item, key) => key.startsWith("youtube"), merchant_key: "youtube", scope: "personal" },
  {
    name: "Google Workspace by mailbox",
    test: (item, key) => key.startsWith("google-workspace") || (key === "google" && /workspace/i.test(item.item ?? "")),
    merchant_key: "google-workspace",
    scope: undefined,
  },
  { name: "LinkedIn is personal", test: (_item, key) => key.startsWith("linkedin"), merchant_key: "linkedin", scope: "personal" },
];

export interface Classification {
  merchant_key: string;
  registry_key: string | null;
  scope: Scope;
  scope_reason: ScopeReason;
}

/** True when `needle` appears in `haystack` on its own, not inside a longer word. */
export function needleMatches(haystack: string, needle: string): boolean {
  const clean = needle.trim().toLowerCase();
  if (!clean) return false;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(clean, from);
    if (at < 0) return false;
    const before = at === 0 ? " " : haystack[at - 1];
    const after = at + clean.length >= haystack.length ? " " : haystack[at + clean.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = at + 1;
  }
  return false;
}

const DOMAIN_TAIL = /\.(?:com|io|ai|dev|org|net|so|co|app|sh)$/;

/**
 * Registry needles were written for email senders ("apify.com",
 * "payments-noreply@google.com"), so each one is also tried without its
 * domain tail, and the registry key and display name count as needles too.
 * The sheet's Merchant column says "Apify", never "apify.com".
 */
export function registryNeedles(row: RegistryRow): string[] {
  const needles = new Set<string>();
  for (const needle of row.vendor_match ?? []) {
    const clean = needle.trim().toLowerCase();
    if (!clean) continue;
    needles.add(clean);
    const bare = clean.includes("@") ? "" : clean.replace(DOMAIN_TAIL, "");
    if (bare && bare !== clean && bare.length >= 3) needles.add(bare);
  }
  const keyWords = row.key.toLowerCase().replace(/-/g, " ");
  if (keyWords.length >= 3) needles.add(keyWords);
  const nameWords = row.display_name.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  if (nameWords.length >= 3) needles.add(nameWords);
  return [...needles];
}

/** Port of the Control Center matcher over merchant, item, subject and mailbox, with the widened needles. */
export function matchRegistry(registry: RegistryRow[], item: Classifiable): RegistryRow | null {
  const hay = `${item.merchant} ${item.item ?? ""} ${item.subject ?? ""} ${item.account_email ?? ""}`.toLowerCase().replace(/[^a-z0-9@.]+/g, " ");
  for (const row of registry) {
    if (row.active === false) continue;
    for (const needle of registryNeedles(row)) {
      if (needleMatches(hay, needle)) return row;
    }
  }
  return null;
}

export function classify(item: Classifiable, registry: RegistryRow[], overrides: OverrideRow[]): Classification {
  const key = merchantKey(item.merchant);
  if (item.source === "property_ledger") return { merchant_key: key, registry_key: null, scope: "property", scope_reason: "ledger" };

  const alias = ALIASES.find((rule) => rule.test(item, key));
  const finalKey = alias?.merchant_key ?? key;

  // An override names the merchant loosely: "hetzner" covers "hetzner-online" too.
  const covers = (pattern: string, candidate: string) => candidate === pattern || candidate.startsWith(`${pattern}-`);
  const override = overrides.find((row) => covers(row.merchant_key, finalKey) || covers(row.merchant_key, key));
  if (override) return { merchant_key: override.merchant_key, registry_key: alias?.registry_key ?? null, scope: override.scope, scope_reason: "override" };

  if (alias) {
    const scope = alias.scope ?? (OS_DOMAINS.includes(domainOf(item.account_email)) ? "os" : "personal");
    return { merchant_key: finalKey, registry_key: alias.registry_key ?? null, scope, scope_reason: "alias" };
  }

  const direct = item.service_key ? registry.find((row) => row.key === item.service_key) ?? null : null;
  const matched = direct ?? matchRegistry(registry, item);
  if (matched) return { merchant_key: key, registry_key: matched.key, scope: "os", scope_reason: "registry" };

  return { merchant_key: key, registry_key: null, scope: "personal", scope_reason: "default" };
}
