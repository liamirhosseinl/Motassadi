"use server";

import { createHash } from "node:crypto";
import { publicAction } from "@/server/action";
import { createPublicInquiry } from "@/server/services/crm";
import { clientIp } from "@/server/services/infra";
import { formObject, type ActionResult } from "@/server/services/common";

export async function submitInquiry(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return publicAction(async (db) => {
    // The IP is only used as a hashed rate-limit key; it is not stored with the inquiry.
    const ipKey = createHash("sha256").update(await clientIp()).digest("hex").slice(0, 32);
    await createPublicInquiry(db, formObject(fd), ipKey);
    return { ok: true, message: "درخواست شما ثبت شد. همکاران ما به‌زودی با شما تماس می‌گیرند." };
  });
}
