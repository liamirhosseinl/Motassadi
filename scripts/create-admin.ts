/**
 * First-owner provisioning and owner password recovery. No default password exists anywhere.
 *
 *   npm run admin:create -- --username amir --name "نام کامل"
 *   npm run admin:create -- --reset-password --username amir
 *
 * The password is read from a hidden prompt, or from ADMIN_PASSWORD (for non-interactive deploys;
 * unset it afterwards). Creating an owner when one already exists requires --allow-additional.
 */
import { describeDb } from "./_env";
import { and, eq, sql } from "drizzle-orm";
import { getDb, MIGRATIONS_DIR } from "@/server/db";
import { bootstrap } from "@/server/db/bootstrap";
import * as s from "@/server/db/schema";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { audit } from "@/server/services/infra";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("ورودی تعاملی در دسترس نیست؛ رمز را با ADMIN_PASSWORD بدهید."));
    process.stdout.write(question);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData); process.stdout.write("\n"); return resolve(value);
        }
        if (c === "\u0003") { process.stdout.write("\n"); process.exit(130); }
        if (c === "\u007f" || c === "\b") { value = value.slice(0, -1); continue; }
        value += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const a = await promptHidden("رمز عبور (نمایش داده نمی‌شود): ");
  const b = await promptHidden("تکرار رمز: ");
  if (a !== b) throw new Error("تکرار رمز یکسان نیست.");
  return a;
}

async function main() {
  const url = process.env.DATABASE_URL!;
  console.log(`پایگاه داده: ${describeDb(url)}`);
  const db = await getDb();
  if (!url.startsWith("pglite:")) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    await bootstrap(db);
  }
  const username = (arg("username") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) throw new Error("--username لازم است: ۳ تا ۳۰ حرف لاتین کوچک، عدد یا . _ -");

  if (flag("reset-password")) {
    const [u] = await db.select().from(s.users).where(sql`lower(${s.users.username}) = ${username}`);
    if (!u) throw new Error("کاربری با این نام پیدا نشد.");
    const password = await readPassword();
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
    await db.update(s.users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null, isActive: true }).where(eq(s.users.id, u.id));
    await db.delete(s.sessions).where(eq(s.sessions.userId, u.id));
    await audit(db, null, "user.password", "user", u.id, { via: "cli" });
    console.log(`رمز «${username}» تغییر کرد، حساب فعال و قفل آن باز شد. همهٔ نشست‌های قبلی بسته شد.`);
    return;
  }

  const name = (arg("name") ?? "").trim();
  if (!name) throw new Error('--name لازم است، مثلاً --name "فرج‌الله متصدی زرندی"');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users).where(and(eq(s.users.role, "owner"), eq(s.users.isActive, true)));
  if (n > 0 && !flag("allow-additional")) {
    throw new Error("یک مدیر فعال از قبل وجود دارد. کاربر جدید را از پنل بسازید، یا برای بازیابی رمز از --reset-password استفاده کنید.");
  }
  const [exists] = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.username}) = ${username}`);
  if (exists) throw new Error("این نام کاربری وجود دارد.");
  const password = await readPassword();
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const [u] = await db.insert(s.users).values({ name, username, role: "owner", passwordHash: await hashPassword(password) }).returning({ id: s.users.id });
  await audit(db, null, "user.create", "user", u.id, { username, role: "owner", via: "cli" });
  console.log(`مدیر «${username}» ساخته شد. از /admin/login وارد شوید.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("خطا:", e instanceof Error ? e.message : e); process.exit(1); });
