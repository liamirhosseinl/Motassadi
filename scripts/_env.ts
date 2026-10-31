/** Minimal .env loader for CLI scripts (Next.js loads .env itself for the app). Existing environment variables win. */
import fs from "node:fs";
import path from "node:path";

for (const name of [".env.local", ".env"]) {
  const file = path.join(process.cwd(), name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL تنظیم نشده است. فایل .env را از روی .env.example بسازید.");
  process.exit(1);
}

export function describeDb(url = process.env.DATABASE_URL ?? "") {
  // Never print credentials.
  return url.startsWith("pglite:") ? url : url.replace(/\/\/([^@/]*)@/, "//***@");
}
