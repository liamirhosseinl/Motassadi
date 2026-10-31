import "server-only";
import { getDb, type DB } from "./db";
import { authorize, ForbiddenError, type CurrentUser } from "./auth/session";
import { ServiceError, type ActionResult } from "./services/common";
import type { Permission } from "./auth/permissions";

function isNextControlFlow(e: unknown) {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_HTTP_ERROR"));
}

/** Runs a staff action: authorises on the server, maps business errors to form feedback, never leaks internals. */
export async function staffAction(
  perms: Permission[],
  fn: (ctx: { db: DB; user: CurrentUser }) => Promise<ActionResult | void>,
): Promise<ActionResult> {
  try {
    const user = await authorize(...perms);
    const db = await getDb();
    return (await fn({ db, user })) ?? { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    if (e instanceof ForbiddenError) return { ok: false, message: e.permission === "auth" ? "نشست شما به پایان رسیده است؛ دوباره وارد شوید." : "شما اجازهٔ انجام این کار را ندارید." };
    if (e instanceof ServiceError) return { ok: false, message: e.message, fieldErrors: e.fieldErrors };
    console.error("[action]", e);
    return { ok: false, message: "خطای غیرمنتظره رخ داد. دوباره تلاش کنید؛ اگر تکرار شد با مدیر سامانه تماس بگیرید." };
  }
}

/** Same error mapping for public (anonymous) actions. */
export async function publicAction(fn: (db: DB) => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn(await getDb());
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    if (e instanceof ServiceError) return { ok: false, message: e.message, fieldErrors: e.fieldErrors };
    console.error("[public-action]", e);
    return { ok: false, message: "ارسال انجام نشد. لطفاً دوباره تلاش کنید یا تماس بگیرید." };
  }
}
