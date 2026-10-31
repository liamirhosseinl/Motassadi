import "server-only";
import { asc, desc, sql } from "drizzle-orm";
import type { DBorTx } from "@/server/db";
import * as s from "@/server/db/schema";

export async function txFormOptions(db: DBorTx) {
  const [properties, contacts] = await Promise.all([
    db.select({ id: s.properties.id, ref: s.properties.ref, title: s.properties.title }).from(s.properties)
      .where(sql`${s.properties.status} <> 'archived'`).orderBy(desc(s.properties.updatedAt)).limit(500),
    db.select({ id: s.contacts.id, fullName: s.contacts.fullName, phone: s.contacts.phone }).from(s.contacts)
      .where(sql`${s.contacts.status} <> 'archived'`).orderBy(asc(s.contacts.fullName)).limit(2000),
  ]);
  return { properties, contacts };
}
