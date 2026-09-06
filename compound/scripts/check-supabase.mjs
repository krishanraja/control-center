import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const compoundRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(compoundRoot, "..");
const migration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260806220210_compound_foundation.sql"), "utf8");
const exposureMigration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260806223500_compound_expose_schema.sql"), "utf8");
const reloadMigration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260806231230_compound_reload_schema.sql"), "utf8");
const loginMigration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260807002034_compound_login_delivery.sql"), "utf8");
const accessMigration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260807010239_compound_magic_word_access.sql"), "utf8");
const accessFixMigration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260807015930_compound_magic_word_rate_limit_fix.sql"), "utf8");
const archiveMigration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260811120000_compound_snapshot_archive.sql"), "utf8");
const edgeFunction = await readFile(join(repositoryRoot, "supabase", "functions", "compound-ask", "index.ts"), "utf8");
const loginFunction = await readFile(join(repositoryRoot, "supabase", "functions", "compound-login", "index.ts"), "utf8");
const loginProxy = await readFile(join(compoundRoot, "api", "compound-login.js"), "utf8");
const config = await readFile(join(repositoryRoot, "supabase", "config.toml"), "utf8");
const propertyMigration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260904100000_compound_property.sql"), "utf8");
const propertyApi = await readFile(join(compoundRoot, "api", "property", "latest.js"), "utf8");
const spendMigration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260905090000_compound_spend.sql"), "utf8");
const spendApi = await readFile(join(compoundRoot, "api", "spend", "latest.js"), "utf8");
const spendServer = await readFile(join(compoundRoot, "src", "server", "spendApi.js"), "utf8");
const cashMigration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260906130000_compound_cash_balances.sql"), "utf8");

const failures = [];
for (const table of ["members", "holdings", "daily_snapshots", "chat_threads", "chat_messages"]) {
  if (!migration.includes(`alter table compound.${table} enable row level security;`)) failures.push(`${table} does not enable RLS`);
  if (!migration.includes(`alter table compound.${table} force row level security;`)) failures.push(`${table} does not force RLS`);
}

if (!migration.includes("chat_messages_request_role_idx")) failures.push("chat retries are not idempotent");
if (!migration.includes("revoke all on schema compound from public, anon;")) failures.push("compound schema is not denied to anonymous callers");
if (!exposureMigration.includes("exposed_schemas || ', compound'")) failures.push("Data API exposure is not additive");
if (!exposureMigration.includes("notify pgrst, 'reload config'")) failures.push("Data API is not reloaded after schema exposure");
if (!reloadMigration.includes("notify pgrst, 'reload schema'")) failures.push("COMPOUND tables are not reflected in the Data API cache");
if (!edgeFunction.includes('schema("compound")')) failures.push("Edge Function does not target the compound schema");
if (/schema\(["'](?:public|auth)["']\)/.test(edgeFunction)) failures.push("Edge Function targets a non-COMPOUND schema");
if (/supabaseAdmin|SERVICE_ROLE|service_role/.test(edgeFunction)) failures.push("Edge Function contains a privileged database path");
if (!edgeFunction.includes("AbortSignal.timeout(30_000)")) failures.push("LLM provider call has no bounded timeout");
if (!/\[functions\.compound-ask\][\s\S]*?verify_jwt = true/.test(config)) failures.push("compound-ask does not require a user JWT");
if (!loginMigration.includes("alter table compound.login_deliveries enable row level security;")) failures.push("login delivery audit does not enable RLS");
if (!loginMigration.includes("alter table compound.login_deliveries force row level security;")) failures.push("login delivery audit does not force RLS");
if (!loginMigration.includes("revoke all on compound.login_deliveries from public, anon, authenticated;")) failures.push("login delivery audit is exposed to user roles");
if (/\bemail\s+text\b/i.test(loginMigration)) failures.push("login delivery audit stores a plaintext email column");
if (!loginFunction.includes('schema("compound")')) failures.push("login function does not keep its audit in COMPOUND");
if (!loginFunction.includes("COMPOUND_LOGIN_PROXY_SECRET") || !loginProxy.includes("COMPOUND_LOGIN_PROXY_SECRET")) failures.push("login proxy secret is not enforced at both ends");
if (!loginMigration.includes("pg_advisory_xact_lock") || !loginMigration.includes("interval '1 hour'")) failures.push("login delivery reservation is not atomically rate limited");
if (!accessMigration.includes("alter table compound.access_attempts enable row level security;")) failures.push("magic-word attempts do not enable RLS");
if (!accessMigration.includes("alter table compound.access_attempts force row level security;")) failures.push("magic-word attempts do not force RLS");
if (!accessMigration.includes("revoke all on compound.access_attempts from public, anon, authenticated;")) failures.push("magic-word attempts are exposed to user roles");
if (!accessMigration.includes("security invoker") || accessMigration.includes("security definer")) failures.push("magic-word throttling uses an elevated execution context");
if (!accessMigration.includes("pg_advisory_xact_lock") || !accessMigration.includes("interval '15 minutes'")) failures.push("magic-word attempts are not atomically rate limited");
if (!accessFixMigration.includes("attempts.outcome in") || !accessFixMigration.includes("attempts.attempted_at")) failures.push("magic-word rate limiting leaves ambiguous audit columns");
if (!accessMigration.includes("alter function compound.reserve_login_delivery(text) security invoker;")) failures.push("the unused email reservation keeps its elevated execution context");
if (/\b(?:magic_word|client_ip)\s+text\b/i.test(accessMigration)) failures.push("magic-word audit stores a word or client IP");
if (!loginFunction.includes("COMPOUND_MAGIC_WORD_HASH") || !loginFunction.includes("hashed_token")) failures.push("magic-word login does not use the server-held digest and one-time token hash");
if (loginFunction.includes("RESEND_API_KEY") || loginFunction.includes("api.resend.com")) failures.push("magic-word login still depends on email delivery");
if (!loginProxy.includes("X-Compound-Client-Fingerprint") || !loginProxy.includes('createHash("sha256")')) failures.push("login proxy does not create a server-peppered client fingerprint");
if (!/\[functions\.compound-login\][\s\S]*?verify_jwt = false/.test(config)) failures.push("compound-login platform auth posture is not explicit");
for (const table of ["snapshot_runs", "snapshot_backfill_checkpoints", "snapshot_context_cache"]) {
  if (!archiveMigration.includes(`alter table compound.${table} enable row level security;`)) failures.push(`${table} does not enable RLS`);
  if (!archiveMigration.includes(`alter table compound.${table} force row level security;`)) failures.push(`${table} does not force RLS`);
}
if (!archiveMigration.includes("prevent_published_snapshot_mutation")) failures.push("published snapshots are not immutable");
if (!archiveMigration.includes("origin in ('captured', 'reconstructed')")) failures.push("starter snapshots are not excluded from published uniqueness");
if (!archiveMigration.includes("request_scope jsonb")) failures.push("historical Ask requests do not preserve their scope");

const propertyTables = [
  "properties", "property_loans", "property_loan_rates", "property_rents", "property_ledger",
  "property_market_observations", "property_valuations", "property_suburb_rankings", "property_runs",
];
for (const table of propertyTables) {
  if (!propertyMigration.includes(`alter table compound.${table} enable row level security;`)) failures.push(`${table} does not enable RLS`);
  if (!propertyMigration.includes(`alter table compound.${table} force row level security;`)) failures.push(`${table} does not force RLS`);
}
if (!propertyMigration.includes("notify pgrst, 'reload schema'")) failures.push("property tables are not reflected in the Data API cache");
// The ledger mirror, market facts, estimates, rankings and run log are written only by the pipeline.
const memberWriteGrant = /grant\s+[^;]*\b(?:insert|update|delete)\b[^;]*\bon\b([^;]*)\bto authenticated;/gis;
for (const match of propertyMigration.matchAll(memberWriteGrant)) {
  for (const table of ["property_ledger", "property_market_observations", "property_valuations", "property_suburb_rankings", "property_runs"]) {
    if (match[1].includes(`compound.${table}`)) failures.push(`${table} grants member writes; only the pipeline may write it`);
  }
}
if (!propertyMigration.includes("unique (user_id, external_ref)")) failures.push("ledger mirror is not idempotent on external_ref");
if (!propertyMigration.includes("unique (loan_id, effective_from)")) failures.push("loan rate history has no natural key");
if (/\binsert\s+into\s+compound\.propert/i.test(propertyMigration)) failures.push("property migration inserts rows; personal facts enter via the import CLI");
if (/account_number|account_ref/i.test(propertyMigration)) failures.push("property migration stores a loan account number");
if (!propertyMigration.includes("revoke all on function compound.read_secret(text) from public, anon, authenticated;")) failures.push("vault reader is exposed to browser roles");
if (!propertyApi.includes("../../src/server/snapshotApi.js")) failures.push("property API does not reuse the member-token snapshot helpers");
if (/SERVICE_ROLE|service_role/.test(propertyApi)) failures.push("property API contains a privileged database path");

const spendTables = ["spend_items", "spend_merchants", "spend_merchant_overrides", "spend_meter_daily", "spend_fx_rates", "spend_runs"];
for (const table of spendTables) {
  if (!spendMigration.includes(`alter table compound.${table} enable row level security;`)) failures.push(`${table} does not enable RLS`);
  if (!spendMigration.includes(`alter table compound.${table} force row level security;`)) failures.push(`${table} does not force RLS`);
}
if (!spendMigration.includes("notify pgrst, 'reload schema'")) failures.push("spend tables are not reflected in the Data API cache");
// Only the member's own override table takes member writes; everything else is pipeline-written.
for (const match of spendMigration.matchAll(memberWriteGrant)) {
  for (const table of spendTables.filter((name) => name !== "spend_merchant_overrides")) {
    if (match[1].includes(`compound.${table}`)) failures.push(`${table} grants member writes; only the pipeline may write it`);
  }
}
if (!spendMigration.includes("unique (user_id, source, source_ref)")) failures.push("spend items are not idempotent on source and source_ref");
if (/\binsert\s+into\s+compound\.spend/i.test(spendMigration)) failures.push("spend migration inserts rows; the pipeline mirrors the registry");
if (/@gmail\.com|@krishraja|@themindmaker/i.test(spendMigration)) failures.push("spend migration carries a personal mailbox");
if (!spendApi.includes("../../src/server/snapshotApi.js")) failures.push("spend API does not reuse the member-token snapshot helpers");
if (/SERVICE_ROLE|service_role/.test(spendApi)) failures.push("spend API contains a privileged database path");

// Cash on hand: the member's own figure, typed in through Settings. Same posture as view settings.
if (!cashMigration.includes("alter table compound.cash_balances enable row level security;")) failures.push("cash_balances does not enable RLS");
if (!cashMigration.includes("alter table compound.cash_balances force row level security;")) failures.push("cash_balances does not force RLS");
if (!cashMigration.includes("revoke all on compound.cash_balances from public, anon;")) failures.push("cash_balances is not denied to anonymous callers");
if (!cashMigration.includes("grant select, insert, update on compound.cash_balances to authenticated;")) failures.push("cash_balances member grants are not exactly select, insert, update");
if (/grant\s+[^;]*\bdelete\b[^;]*\bon\b[^;]*compound\.cash_balances[^;]*\bto authenticated;/is.test(cashMigration)) failures.push("cash_balances grants member deletes");
for (const policy of ["cash_balances_read_self", "cash_balances_insert_self", "cash_balances_update_self"]) {
  if (!cashMigration.includes(`create policy ${policy}`)) failures.push(`cash_balances is missing the ${policy} policy`);
}
if (!cashMigration.includes("references compound.members(user_id) on delete cascade")) failures.push("cash_balances rows are not tied to a member");
if (!cashMigration.includes("unique (user_id, as_of)")) failures.push("cash_balances is not one row per member per date");
if (!cashMigration.includes("check (amount_usd >= 0)")) failures.push("cash_balances allows a negative balance");
if (!cashMigration.includes("notify pgrst, 'reload schema'")) failures.push("cash_balances is not reflected in the Data API cache");
if (/\binsert\s+into\s+compound\.cash/i.test(cashMigration)) failures.push("cash migration inserts rows; balances are typed in by the member");
if (/@gmail\.com|@krishraja|@themindmaker/i.test(cashMigration)) failures.push("cash migration carries a personal mailbox");
if (/\$\s?\d|\b\d{4,}(?:\.\d+)?\b/.test(cashMigration)) failures.push("cash migration carries a dollar figure; balances are typed in by the member");
if (!spendServer.includes("cash_balances?select=as_of,amount_usd&order=as_of.desc&limit=1")) failures.push("spend API does not read the latest cash balance with the member token");
if (!spendApi.includes("queries.cash")) failures.push("spend route does not surface the cash balance");
if (/SERVICE_ROLE|service_role/.test(spendServer)) failures.push("spend composition contains a privileged database path");
// Control Center tables live in `public`. Only the Deno pipeline may read them; no browser or Vercel path may name that profile.
for (const dir of ["api", "src"]) {
  const entries = await readdir(join(compoundRoot, dir), { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:[cm]?js|tsx?)$/.test(entry.name)) continue;
    const text = await readFile(join(entry.parentPath ?? entry.path, entry.name), "utf8");
    if (/(?:Accept|Content)-Profile["']?\s*[:=]\s*["']public["']/.test(text)) failures.push(`${dir}/${entry.name} reads the public schema; only the pipeline may`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("COMPOUND Supabase boundary check passed.");
