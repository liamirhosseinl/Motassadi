import "server-only";
import { asc, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import * as s from "@/server/db/schema";

export async function ownerOptions() {
  const db = await getDb();
  return db.select({ id: s.contacts.id, fullName: s.contacts.fullName, phone: s.contacts.phone }).from(s.contacts)
    .where(sql`${s.contacts.status} <> 'archived' and (${s.contacts.types} && array['owner','seller','landlord']::text[])`)
    .orderBy(asc(s.contacts.fullName)).limit(1000);
}

