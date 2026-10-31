// Copies the files `next build` (output: "standalone") does not bundle: static assets, public files and SQL migrations.
// Run automatically by `npm run build`. Start the app with: node .next/standalone/server.js
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".next", "standalone");
if (!fs.existsSync(out)) { console.error("No .next/standalone — run next build first."); process.exit(1); }
const copy = (from, to) => fs.cpSync(path.join(root, from), path.join(out, to), { recursive: true });
copy("public", "public");
copy(".next/static", ".next/static");
copy("drizzle", "drizzle");
console.log("standalone ready: public/, .next/static/, drizzle/ copied into .next/standalone");
