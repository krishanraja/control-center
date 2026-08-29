import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = [join(root, "src"), join(root, "api")];
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
// Relative specifiers are resolved against the importing file rather than
// pattern-matched, because "../../public" means the microsite's own public
// directory from src/test and Control Center's from src. Only an import that
// resolves outside this package breaks the isolation the schema relies on.
const relativeImport = /(?:from\s+|import\s*\(|require\s*\()\s*["'](\.[^"']*)["']/g;
const forbiddenSecrets = /(?:service[_-]?role|sbp_|ghp_|vcp_)[A-Za-z0-9_.-]{8,}/i;

function escapes(file, specifier) {
  const target = resolve(dirname(file), specifier);
  const path = relative(root, target);
  return path === ".." || path.startsWith(`..${sep}`);
}

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
try {
  await access(join(root, "public", "latest.json"));
  failures.push("public/latest.json exposes the private snapshot without authentication");
} catch {
  // Expected: demo data is bundled from src/demo and live data uses private APIs.
}
for (const file of (await Promise.all(sourceRoots.map(walk))).flat()) {
  const content = await readFile(file, "utf8");
  for (const [, specifier] of content.matchAll(relativeImport)) {
    if (escapes(file, specifier)) failures.push(`${relative(root, file)} imports "${specifier}", which is outside COMPOUND`);
  }
  if (forbiddenSecrets.test(content)) failures.push(`${relative(root, file)} appears to contain a secret`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("COMPOUND boundary check passed.");
