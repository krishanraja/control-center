import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const compoundRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(compoundRoot, "..");
const migration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260806220210_compound_foundation.sql"), "utf8");
const exposureMigration = await readFile(join(repositoryRoot, "supabase", "migrations", "20260806223500_compound_expose_schema.sql"), "utf8");
const edgeFunction = await readFile(join(repositoryRoot, "supabase", "functions", "compound-ask", "index.ts"), "utf8");
const config = await readFile(join(repositoryRoot, "supabase", "config.toml"), "utf8");

const failures = [];
for (const table of ["members", "holdings", "daily_snapshots", "chat_threads", "chat_messages"]) {
  if (!migration.includes(`alter table compound.${table} enable row level security;`)) failures.push(`${table} does not enable RLS`);
  if (!migration.includes(`alter table compound.${table} force row level security;`)) failures.push(`${table} does not force RLS`);
}

if (!migration.includes("chat_messages_request_role_idx")) failures.push("chat retries are not idempotent");
if (!migration.includes("revoke all on schema compound from public, anon;")) failures.push("compound schema is not denied to anonymous callers");
if (!exposureMigration.includes("exposed_schemas || ', compound'")) failures.push("Data API exposure is not additive");
if (!exposureMigration.includes("notify pgrst, 'reload config'")) failures.push("Data API is not reloaded after schema exposure");
if (!edgeFunction.includes('schema("compound")')) failures.push("Edge Function does not target the compound schema");
if (/schema\(["'](?:public|auth)["']\)/.test(edgeFunction)) failures.push("Edge Function targets a non-COMPOUND schema");
if (/supabaseAdmin|SERVICE_ROLE|service_role/.test(edgeFunction)) failures.push("Edge Function contains a privileged database path");
if (!edgeFunction.includes("AbortSignal.timeout(30_000)")) failures.push("LLM provider call has no bounded timeout");
if (!/\[functions\.compound-ask\][\s\S]*?verify_jwt = true/.test(config)) failures.push("compound-ask does not require a user JWT");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("COMPOUND Supabase boundary check passed.");
