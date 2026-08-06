import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "src");
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const forbiddenImport = /(?:from\s+|import\s*\(|require\s*\()\s*["'](?:\.\.\/){2,}(?:src|api|public|warehouse|n8n)(?:\/|["'])/;
const forbiddenSecrets = /(?:service[_-]?role|sbp_|ghp_|vcp_)[A-Za-z0-9_.-]{8,}/i;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (allowedExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const failures = [];
for (const file of await walk(sourceRoot)) {
  const content = await readFile(file, "utf8");
  if (forbiddenImport.test(content)) failures.push(`${relative(root, file)} imports a Control Center path`);
  if (forbiddenSecrets.test(content)) failures.push(`${relative(root, file)} appears to contain a secret`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("COMPOUND boundary check passed.");
