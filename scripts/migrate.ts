/**
 * Applies database migrations and idempotent reference data (permissions, categories, default pages).
 * Usage: npm run db:migrate
 */
import { describeDb } from "./_env";
import { getDb, MIGRATIONS_DIR } from "@/server/db";
import { bootstrap } from "@/server/db/bootstrap";

async function main() {
  const url = process.env.DATABASE_URL!;
  console.log(`پایگاه داده: ${describeDb(url)}`);
  const db = await getDb(); // PGlite connections migrate + bootstrap on open.
  if (!url.startsWith("pglite:")) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    await bootstrap(db);
  }
  console.log("مهاجرت و داده‌های پایه انجام شد.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
