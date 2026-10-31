import "server-only";
import { DEAL_TYPES, PROPERTY_STATUSES } from "@/lib/vocab";
export { DEAL_TYPES, PROPERTY_STATUSES };
import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { DB, DBorTx } from "../db";
import * as s from "../db/schema";
import {
  assertCan, likePattern, normalizeSearch, PAGE_SIZE, parseOrThrow, ServiceError, type Actor,
  zBool, zEnum, zId, zInt, zMoney, zOptText, zText,
} from "./common";
import { audit, nextReference } from "./infra";
import { readSettings } from "./settings";
import { processPropertyImage, storage } from "./storage";

/* ───── Vocabulary ───── */

export type DealType = keyof typeof DEAL_TYPES;
export type PropertyStatus = keyof typeof PROPERTY_STATUSES;

/** Listed in search & sitemap. */
export const PUBLIC_LIST_STATUSES: PropertyStatus[] = ["published", "reserved"];
/** Detail page reachable (sold/rented stay reachable, marked closed, not indexed). */
export const PUBLIC_PAGE_STATUSES: PropertyStatus[] = ["published", "reserved", "sold", "rented"];

const TRANSITIONS: Record<PropertyStatus, PropertyStatus[]> = {
  draft: ["pending_review", "published", "archived"],
  pending_review: ["draft", "published", "archived"],
  published: ["unpublished", "reserved", "sold", "rented", "archived"],
  reserved: ["published", "sold", "rented", "unpublished", "archived"],
  sold: ["published", "archived"],
  rented: ["published", "archived"],
  unpublished: ["published", "draft", "archived"],
  archived: ["draft"],
};
/** Transitions an editor without publish rights may perform. */
const EDITOR_TRANSITIONS: Partial<Record<PropertyStatus, PropertyStatus[]>> = {
  draft: ["pending_review"],
  pending_review: ["draft"],
  unpublished: ["draft"],
};

export function allowedTransitions(actor: Actor, from: PropertyStatus): PropertyStatus[] {
  if (actor.permissions.has("properties.publish")) {
    return TRANSITIONS[from].filter((t) => (t === "archived" || from === "archived" ? actor.permissions.has("properties.archive") : true));
  }
  if (actor.permissions.has("properties.edit")) return EDITOR_TRANSITIONS[from] ?? [];
  return [];
}

/* ───── Input ───── */

export const propertyInput = z.object({
  title: zText(150),
  dealType: zEnum(["sale", "rent", "mortgage", "exchange"]),
  categoryId: zId.refine((v) => v !== null, "دسته‌بندی را انتخاب کنید."),
  description: zOptText(8000),
  price: zMoney,
  priceNegotiable: zBool,
  priceHidden: zBool,
  deposit: zMoney,
  rentMonthly: zMoney,
  area: zInt(0, 100_000_000),
  landArea: zInt(0, 100_000_000),
  buildingArea: zInt(0, 1_000_000),
  rooms: zInt(0, 50),
  bedrooms: zInt(0, 50),
  bathrooms: zInt(0, 20),
  floor: zInt(-5, 200),
  totalFloors: zInt(0, 200),
  buildYear: zInt(1300, 1500),
  condition: zOptText(200),
  city: zText(80),
  neighborhood: zOptText(120),
  address: zOptText(500),
  publicLocation: zOptText(200),
  internalNotes: zOptText(5000),
  ownerContactId: zId,
  agentId: zId,
  featureIds: z.array(z.coerce.number().int().positive()).max(60).default([]),
  seoTitle: zOptText(120),
  seoDescription: zOptText(300),
});
export type PropertyInput = z.infer<typeof propertyInput>;

async function normalizeInput(db: DBorTx, actor: Actor, raw: unknown, existing?: typeof s.properties.$inferSelect) {
  const data = parseOrThrow(propertyInput, raw);
  const [cat] = await db.select().from(s.propertyCategories).where(eq(s.propertyCategories.id, data.categoryId!));
  if (!cat) throw new ServiceError("دسته‌بندی معتبر نیست.", { categoryId: "دسته‌بندی معتبر نیست." });
  if (!cat.hasRooms) { data.rooms = null; data.bedrooms = null; data.bathrooms = null; data.floor = null; data.totalFloors = null; }
  if (data.floor !== null && data.totalFloors !== null && data.floor > data.totalFloors) {
    throw new ServiceError("طبقه از تعداد کل طبقات بیشتر است.", { floor: "طبقه از تعداد کل طبقات بیشتر است." });
  }
  if (data.dealType === "sale" || data.dealType === "exchange") { data.deposit = null; data.rentMonthly = null; }
  if (data.dealType === "mortgage") { data.rentMonthly = null; data.price = null; }
  if (data.dealType === "rent") data.price = null;
  if (!actor.permissions.has("properties.viewAll")) {
    // Agents work on their own listings; they cannot assign a listing to someone else.
    data.agentId = existing ? existing.agentId : actor.id;
  }
  if (data.ownerContactId) {
    const [c] = await db.select({ id: s.contacts.id }).from(s.contacts).where(eq(s.contacts.id, data.ownerContactId));
    if (!c) throw new ServiceError("مالک انتخاب‌شده پیدا نشد.", { ownerContactId: "مخاطب پیدا نشد." });
  }
  if (data.agentId) {
    const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, data.agentId));
    if (!u) throw new ServiceError("مشاور انتخاب‌شده پیدا نشد.", { agentId: "کاربر پیدا نشد." });
  }
  return { data, category: cat };
}

export function scopeCondition(actor: Actor): SQL | undefined {
  if (actor.permissions.has("properties.viewAll")) return undefined;
  return or(eq(s.properties.agentId, actor.id), eq(s.properties.createdBy, actor.id));
}

export async function getPropertyForActor(db: DBorTx, actor: Actor, id: number) {
  assertCan(actor, "properties.view");
  const where = and(eq(s.properties.id, id), scopeCondition(actor));
  const [row] = await db.select().from(s.properties).where(where);
  if (!row) throw new ServiceError("ملک پیدا نشد یا به آن دسترسی ندارید.");
  return row;
}

async function setFeatures(db: DBorTx, propertyId: number, featureIds: number[]) {
  await db.delete(s.propertyFeatureLinks).where(eq(s.propertyFeatureLinks.propertyId, propertyId));
  const unique = [...new Set(featureIds)];
  if (unique.length) {
    const valid = await db.select({ id: s.propertyFeatures.id }).from(s.propertyFeatures).where(inArray(s.propertyFeatures.id, unique));
    if (valid.length) await db.insert(s.propertyFeatureLinks).values(valid.map((f) => ({ propertyId, featureId: f.id })));
  }
}

export async function createProperty(db: DB, actor: Actor, raw: unknown) {
  assertCan(actor, "properties.edit");
  return db.transaction(async (tx) => {
    const { data } = await normalizeInput(tx, actor, raw);
    const settings = await readSettings(tx);
    const ref = await nextReference(tx, settings.refs.propertyPrefix, "property");
    const { featureIds, ...values } = data;
    const [row] = await tx.insert(s.properties).values({ ...values, categoryId: data.categoryId!, ref, status: "draft", createdBy: actor.id }).returning();
    await setFeatures(tx, row.id, featureIds);
    await tx.insert(s.propertyStatusHistory).values({ propertyId: row.id, fromStatus: null, toStatus: "draft", changedBy: actor.id, note: "ایجاد ملک" });
    await audit(tx, actor.id, "property.create", "property", row.id, { ref });
    return row;
  });
}

export async function updateProperty(db: DB, actor: Actor, id: number, raw: unknown, expectedVersion?: number) {
  assertCan(actor, "properties.edit");
  return db.transaction(async (tx) => {
    const existing = await getPropertyForActor(tx, actor, id);
    if (existing.status === "archived") throw new ServiceError("ملک بایگانی‌شده قابل ویرایش نیست؛ ابتدا آن را بازگردانی کنید.");
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ServiceError("این ملک هم‌زمان توسط کاربر دیگری ویرایش شده است. صفحه را دوباره باز کنید.");
    }
    const { data } = await normalizeInput(tx, actor, raw, existing);
    const { featureIds, ...values } = data;
    const [row] = await tx.update(s.properties)
      .set({ ...values, categoryId: data.categoryId!, updatedAt: new Date(), version: existing.version + 1 })
      .where(and(eq(s.properties.id, id), eq(s.properties.version, existing.version)))
      .returning();
    if (!row) throw new ServiceError("این ملک هم‌زمان ویرایش شده است. دوباره تلاش کنید.");
    await setFeatures(tx, id, featureIds);
    // A published listing must keep meeting the publication rules.
    if (PUBLIC_LIST_STATUSES.includes(row.status as PropertyStatus)) {
      const problems = await publishProblems(tx, row.id);
      if (problems.length) throw new ServiceError("با این تغییرات، آگهی شرایط انتشار را ندارد: " + problems.join("، "));
    }
    await audit(tx, actor.id, "property.update", "property", id);
    return row;
  });
}

/** Rules a listing must meet before it can appear publicly. */
export async function publishProblems(db: DBorTx, propertyId: number): Promise<string[]> {
  const [p] = await db.select().from(s.properties).where(eq(s.properties.id, propertyId));
  if (!p) return ["ملک پیدا نشد"];
  const settings = await readSettings(db);
  const problems: string[] = [];
  if (!p.title || p.title.trim().length < 5) problems.push("عنوان کامل");
  if (settings.publishing.requireDescription && (!p.description || p.description.trim().length < 20)) problems.push("توضیحات (دست‌کم ۲۰ نویسه)");
  if (!p.priceHidden) {
    if ((p.dealType === "sale" || p.dealType === "exchange") && !p.price) problems.push("قیمت (یا گزینهٔ «قیمت اعلام نمی‌شود»)");
    if (p.dealType === "rent" && !p.deposit && !p.rentMonthly) problems.push("ودیعه یا اجارهٔ ماهانه");
    if (p.dealType === "mortgage" && !p.deposit) problems.push("مبلغ رهن");
  }
  if (!p.neighborhood && !p.publicLocation) problems.push("محله یا موقعیت عمومی");
  if (settings.publishing.requireImage) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.propertyImages).where(eq(s.propertyImages.propertyId, propertyId));
    if (n < 1) problems.push("دست‌کم یک عکس");
  }
  return problems;
}

export async function changePropertyStatus(db: DB, actor: Actor, id: number, to: PropertyStatus, note?: string | null) {
  assertCan(actor, "properties.edit");
  if (!(to in PROPERTY_STATUSES)) throw new ServiceError("وضعیت معتبر نیست.");
  return db.transaction(async (tx) => {
    const p = await getPropertyForActor(tx, actor, id);
    const from = p.status as PropertyStatus;
    if (from === to) return p;
    if (!allowedTransitions(actor, from).includes(to)) {
      throw new ServiceError(`تغییر وضعیت از «${PROPERTY_STATUSES[from]}» به «${PROPERTY_STATUSES[to]}» مجاز نیست.`);
    }
    if (to === "published" || to === "reserved") {
      const problems = await publishProblems(tx, id);
      if (problems.length) throw new ServiceError("برای انتشار این موارد لازم است: " + problems.join("، "));
    }
    const now = new Date();
    const patch: Partial<typeof s.properties.$inferInsert> = { status: to, updatedAt: now, version: p.version + 1 };
    if (to === "published" && !p.publishedAt) patch.publishedAt = now;
    if (to === "sold" || to === "rented") patch.closedAt = now;
    if (to === "published") patch.closedAt = null;
    if (to === "archived") { patch.archivedAt = now; patch.featured = false; }
    if (from === "archived") patch.archivedAt = null;
    if (!PUBLIC_LIST_STATUSES.includes(to)) patch.featured = false;
    const [row] = await tx.update(s.properties).set(patch).where(and(eq(s.properties.id, id), eq(s.properties.version, p.version))).returning();
    if (!row) throw new ServiceError("این ملک هم‌زمان ویرایش شده است. دوباره تلاش کنید.");
    await tx.insert(s.propertyStatusHistory).values({ propertyId: id, fromStatus: from, toStatus: to, changedBy: actor.id, note: note ?? null });
    await audit(tx, actor.id, "property.status", "property", id, { from, to });
    return row;
  });
}

export async function setFeatured(db: DB, actor: Actor, id: number, featured: boolean) {
  assertCan(actor, "properties.publish");
  const p = await getPropertyForActor(db, actor, id);
  if (featured && !PUBLIC_LIST_STATUSES.includes(p.status as PropertyStatus)) throw new ServiceError("فقط آگهی منتشرشده را می‌توان ویژه کرد.");
  await db.update(s.properties).set({ featured, updatedAt: new Date() }).where(eq(s.properties.id, id));
  await audit(db, actor.id, featured ? "property.feature" : "property.unfeature", "property", id);
}

export async function duplicateProperty(db: DB, actor: Actor, id: number) {
  assertCan(actor, "properties.edit");
  return db.transaction(async (tx) => {
    const p = await getPropertyForActor(tx, actor, id);
    const settings = await readSettings(tx);
    const ref = await nextReference(tx, settings.refs.propertyPrefix, "property");
    const { id: _id, ref: _ref, status: _st, publishedAt: _pa, closedAt: _ca, archivedAt: _aa, createdAt: _c, updatedAt: _u, version: _v, featured: _f, ...rest } = p;
    void _id; void _ref; void _st; void _pa; void _ca; void _aa; void _c; void _u; void _v; void _f;
    const [row] = await tx.insert(s.properties).values({ ...rest, title: `${p.title} (کپی)`, ref, status: "draft", createdBy: actor.id }).returning();
    const feats = await tx.select().from(s.propertyFeatureLinks).where(eq(s.propertyFeatureLinks.propertyId, id));
    if (feats.length) await tx.insert(s.propertyFeatureLinks).values(feats.map((f) => ({ propertyId: row.id, featureId: f.featureId })));
    await tx.insert(s.propertyStatusHistory).values({ propertyId: row.id, toStatus: "draft", changedBy: actor.id, note: `کپی از ${p.ref}` });
    await audit(tx, actor.id, "property.duplicate", "property", row.id, { from: p.ref });
    return row;
  });
}

export type BulkAction = "unpublish" | "archive" | "unfeature";
export async function bulkPropertyAction(db: DB, actor: Actor, ids: number[], action: BulkAction) {
  assertCan(actor, "properties.archive");
  if (ids.length === 0 || ids.length > 200) throw new ServiceError("تعداد موارد انتخاب‌شده معتبر نیست.");
  const results = { done: 0, skipped: 0 };
  for (const id of ids) {
    try {
      if (action === "unfeature") await setFeatured(db, actor, id, false);
      else await changePropertyStatus(db, actor, id, action === "archive" ? "archived" : "unpublished", "عملیات گروهی");
      results.done++;
    } catch { results.skipped++; }
  }
  await audit(db, actor.id, "property.bulk", "property", null, { action, ids, ...results });
  return results;
}

/* ───── Images ───── */

export async function addPropertyImage(db: DB, actor: Actor, propertyId: number, file: Buffer, alt: string | null) {
  assertCan(actor, "properties.edit");
  const p = await getPropertyForActor(db, actor, propertyId);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.propertyImages).where(eq(s.propertyImages.propertyId, p.id));
  if (n >= 30) throw new ServiceError("حداکثر ۳۰ عکس برای هر ملک.");
  const stored = await processPropertyImage(p.id, file);
  const [img] = await db.insert(s.propertyImages).values({
    propertyId: p.id, ...stored, alt: alt?.slice(0, 200) || p.title, sort: n, isCover: n === 0,
  }).returning();
  await audit(db, actor.id, "property.image.add", "property", p.id, { imageId: img.id });
  return img;
}

export async function updatePropertyImages(
  db: DB, actor: Actor, propertyId: number,
  changes: { order?: number[]; coverId?: number; alts?: Record<number, string>; removeId?: number },
) {
  assertCan(actor, "properties.edit");
  const p = await getPropertyForActor(db, actor, propertyId);
  const images = await db.select().from(s.propertyImages).where(eq(s.propertyImages.propertyId, p.id));
  const ids = new Set(images.map((i) => i.id));
  const removed: typeof images = [];
  await db.transaction(async (tx) => {
    if (changes.removeId && ids.has(changes.removeId)) {
      const img = images.find((i) => i.id === changes.removeId)!;
      if (PUBLIC_LIST_STATUSES.includes(p.status as PropertyStatus) && images.length === 1) {
        const settings = await readSettings(tx);
        if (settings.publishing.requireImage) throw new ServiceError("آگهی منتشرشده باید دست‌کم یک عکس داشته باشد.");
      }
      await tx.delete(s.propertyImages).where(eq(s.propertyImages.id, img.id));
      removed.push(img);
      ids.delete(img.id);
    }
    if (changes.order) {
      const order = changes.order.filter((id) => ids.has(id));
      for (const [i, id] of order.entries()) await tx.update(s.propertyImages).set({ sort: i }).where(eq(s.propertyImages.id, id));
    }
    if (changes.alts) {
      for (const [id, alt] of Object.entries(changes.alts)) {
        if (ids.has(Number(id))) await tx.update(s.propertyImages).set({ alt: alt.trim().slice(0, 200) || null }).where(eq(s.propertyImages.id, Number(id)));
      }
    }
    const coverId = changes.coverId && ids.has(changes.coverId) ? changes.coverId
      : removed.some((r) => r.isCover) ? [...ids][0] : undefined;
    if (coverId) {
      await tx.update(s.propertyImages).set({ isCover: false }).where(eq(s.propertyImages.propertyId, p.id));
      await tx.update(s.propertyImages).set({ isCover: true }).where(eq(s.propertyImages.id, coverId));
    }
    await tx.update(s.properties).set({ updatedAt: new Date() }).where(eq(s.properties.id, p.id));
  });
  for (const r of removed) { await storage().remove(r.storageKey); await storage().remove(r.thumbKey); }
  await audit(db, actor.id, "property.images", "property", p.id, { ...changes, alts: undefined });
}

/* ───── Admin listing ───── */

export const adminPropertyFilters = z.object({
  q: z.string().optional().catch(undefined),
  status: z.enum(Object.keys(PROPERTY_STATUSES) as [PropertyStatus, ...PropertyStatus[]]).optional().catch(undefined),
  deal: z.enum(["sale", "rent", "mortgage", "exchange"]).optional().catch(undefined),
  cat: z.coerce.number().int().positive().optional().catch(undefined),
  agent: z.coerce.number().int().positive().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
});

export async function listAdminProperties(db: DBorTx, actor: Actor, raw: Record<string, unknown>) {
  assertCan(actor, "properties.view");
  const f = adminPropertyFilters.parse(raw);
  const conds: (SQL | undefined)[] = [scopeCondition(actor)];
  const q = normalizeSearch(f.q);
  if (q) conds.push(or(ilike(s.properties.title, likePattern(q)), ilike(s.properties.ref, likePattern(q)), ilike(s.properties.neighborhood, likePattern(q))));
  if (f.status) conds.push(eq(s.properties.status, f.status)); else conds.push(ne(s.properties.status, "archived"));
  if (f.deal) conds.push(eq(s.properties.dealType, f.deal));
  if (f.cat) conds.push(eq(s.properties.categoryId, f.cat));
  if (f.agent) conds.push(eq(s.properties.agentId, f.agent));
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(s.properties).where(where);
  const rows = await db
    .select({ p: s.properties, categoryName: s.propertyCategories.name, agentName: s.users.name })
    .from(s.properties)
    .innerJoin(s.propertyCategories, eq(s.propertyCategories.id, s.properties.categoryId))
    .leftJoin(s.users, eq(s.users.id, s.properties.agentId))
    .where(where)
    .orderBy(desc(s.properties.updatedAt))
    .limit(PAGE_SIZE).offset((f.page - 1) * PAGE_SIZE);
  return { rows, total, page: f.page, filters: f };
}

/* ───── Public queries ───── */

export const publicSearchSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  deal: z.enum(["sale", "rent", "mortgage", "exchange"]).optional().catch(undefined),
  cat: z.string().regex(/^[a-z0-9-]{1,40}$/).optional().catch(undefined),
  hood: z.string().max(120).optional().catch(undefined),
  minPrice: z.coerce.number().int().min(0).max(1e15).optional().catch(undefined),
  maxPrice: z.coerce.number().int().min(0).max(1e15).optional().catch(undefined),
  minArea: z.coerce.number().int().min(0).max(1e8).optional().catch(undefined),
  maxArea: z.coerce.number().int().min(0).max(1e8).optional().catch(undefined),
  beds: z.coerce.number().int().min(0).max(20).optional().catch(undefined),
  feat: z.array(z.coerce.number().int().positive()).max(20).optional().catch(undefined),
  sort: z.enum(["newest", "price_asc", "price_desc", "area_desc", "area_asc"]).catch("newest").default("newest"),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});
export type PublicSearch = z.infer<typeof publicSearchSchema>;

export function parsePublicSearch(params: Record<string, string | string[] | undefined>): PublicSearch {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === "feat") flat.feat = (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(","));
    else flat[k] = Array.isArray(v) ? v[0] : v === "" ? undefined : v;
  }
  return publicSearchSchema.parse(flat);
}

const PUBLIC_PAGE_SIZE = 12;
const priceExpr = sql<number>`coalesce(${s.properties.price}, ${s.properties.deposit})`;

export async function searchPublicProperties(db: DBorTx, f: PublicSearch) {
  const conds: (SQL | undefined)[] = [inArray(s.properties.status, PUBLIC_LIST_STATUSES)];
  const q = normalizeSearch(f.q);
  if (q) {
    const p = likePattern(q);
    conds.push(or(ilike(s.properties.title, p), ilike(s.properties.ref, p), ilike(s.properties.neighborhood, p), ilike(s.properties.publicLocation, p), ilike(s.properties.description, p)));
  }
  if (f.deal) conds.push(eq(s.properties.dealType, f.deal));
  if (f.cat) conds.push(eq(s.propertyCategories.slug, f.cat));
  if (f.hood) conds.push(eq(s.properties.neighborhood, f.hood));
  if (f.minPrice !== undefined) conds.push(and(gte(priceExpr, f.minPrice), eq(s.properties.priceHidden, false)));
  if (f.maxPrice !== undefined) conds.push(and(lte(priceExpr, f.maxPrice), eq(s.properties.priceHidden, false)));
  if (f.minArea !== undefined) conds.push(gte(s.properties.area, f.minArea));
  if (f.maxArea !== undefined) conds.push(lte(s.properties.area, f.maxArea));
  if (f.beds !== undefined) conds.push(gte(s.properties.bedrooms, f.beds));
  if (f.feat?.length) {
    conds.push(sql`(select count(*) from ${s.propertyFeatureLinks} fl where fl.property_id = ${s.properties.id} and fl.feature_id in ${f.feat}) = ${f.feat.length}`);
  }
  const where = and(...conds);
  const order = {
    newest: [desc(s.properties.featured), desc(s.properties.publishedAt)],
    price_asc: [sql`${priceExpr} asc nulls last`],
    price_desc: [sql`${priceExpr} desc nulls last`],
    area_desc: [sql`${s.properties.area} desc nulls last`],
    area_asc: [sql`${s.properties.area} asc nulls last`],
  }[f.sort];
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(s.properties)
    .innerJoin(s.propertyCategories, eq(s.propertyCategories.id, s.properties.categoryId)).where(where);
  const rows = await db.select({ p: s.properties, categoryName: s.propertyCategories.name, categorySlug: s.propertyCategories.slug })
    .from(s.properties)
    .innerJoin(s.propertyCategories, eq(s.propertyCategories.id, s.properties.categoryId))
    .where(where).orderBy(...order, desc(s.properties.id))
    .limit(PUBLIC_PAGE_SIZE).offset((f.page - 1) * PUBLIC_PAGE_SIZE);
  return { items: await withCovers(db, rows), total, pageSize: PUBLIC_PAGE_SIZE };
}

type CardRow = { p: typeof s.properties.$inferSelect; categoryName: string; categorySlug: string };

async function withCovers(db: DBorTx, rows: CardRow[]) {
  if (!rows.length) return [];
  const imgs = await db.select().from(s.propertyImages)
    .where(inArray(s.propertyImages.propertyId, rows.map((r) => r.p.id)))
    .orderBy(desc(s.propertyImages.isCover), asc(s.propertyImages.sort));
  return rows.map((r) => {
    const cover = imgs.find((i) => i.propertyId === r.p.id);
    return { ...publicCard(r.p), categoryName: r.categoryName, categorySlug: r.categorySlug, cover: cover ? { key: cover.thumbKey, alt: cover.alt ?? r.p.title } : null };
  });
}

/** Whitelist of fields that may leave the server for public pages. Address, notes, owner and agent never do. */
export function publicCard(p: typeof s.properties.$inferSelect) {
  return {
    id: p.id, ref: p.ref, title: p.title, dealType: p.dealType as DealType, status: p.status as PropertyStatus,
    price: p.priceHidden ? null : p.price, deposit: p.priceHidden ? null : p.deposit, rentMonthly: p.priceHidden ? null : p.rentMonthly,
    priceHidden: p.priceHidden, priceNegotiable: p.priceNegotiable,
    area: p.area, landArea: p.landArea, buildingArea: p.buildingArea, rooms: p.rooms, bedrooms: p.bedrooms, bathrooms: p.bathrooms,
    floor: p.floor, totalFloors: p.totalFloors, buildYear: p.buildYear, condition: p.condition,
    city: p.city, neighborhood: p.neighborhood, publicLocation: p.publicLocation,
    description: p.description, featured: p.featured, publishedAt: p.publishedAt, updatedAt: p.updatedAt,
    seoTitle: p.seoTitle, seoDescription: p.seoDescription,
  };
}
export type PublicCard = Awaited<ReturnType<typeof withCovers>>[number];

const cardSelect = { p: s.properties, categoryName: s.propertyCategories.name, categorySlug: s.propertyCategories.slug };

export async function featuredProperties(db: DBorTx, limit = 6) {
  const rows = await db.select(cardSelect).from(s.properties)
    .innerJoin(s.propertyCategories, eq(s.propertyCategories.id, s.properties.categoryId))
    .where(and(inArray(s.properties.status, PUBLIC_LIST_STATUSES), eq(s.properties.featured, true)))
    .orderBy(desc(s.properties.publishedAt)).limit(limit);
  return withCovers(db, rows);
}

export async function recentProperties(db: DBorTx, limit = 6, excludeIds: number[] = []) {
  const rows = await db.select(cardSelect).from(s.properties)
    .innerJoin(s.propertyCategories, eq(s.propertyCategories.id, s.properties.categoryId))
    .where(and(inArray(s.properties.status, PUBLIC_LIST_STATUSES), excludeIds.length ? sql`${s.properties.id} not in ${excludeIds}` : undefined))
    .orderBy(desc(s.properties.publishedAt)).limit(limit);
  return withCovers(db, rows);
}

export async function relatedProperties(db: DBorTx, p: { id: number; categoryId: number; dealType: string }, limit = 3) {
  const rows = await db.select(cardSelect).from(s.properties)
    .innerJoin(s.propertyCategories, eq(s.propertyCategories.id, s.properties.categoryId))
    .where(and(inArray(s.properties.status, PUBLIC_LIST_STATUSES), ne(s.properties.id, p.id), eq(s.properties.dealType, p.dealType),
      eq(s.properties.categoryId, p.categoryId)))
    .orderBy(desc(s.properties.publishedAt)).limit(limit);
  return withCovers(db, rows);
}

export async function getPublicProperty(db: DBorTx, ref: string) {
  if (!/^[A-Za-z]{1,4}-\d{4}-\d{4,6}$/.test(ref)) return null;
  const [row] = await db.select({ p: s.properties, categoryName: s.propertyCategories.name, categorySlug: s.propertyCategories.slug })
    .from(s.properties).innerJoin(s.propertyCategories, eq(s.propertyCategories.id, s.properties.categoryId))
    .where(and(eq(s.properties.ref, ref.toUpperCase()), inArray(s.properties.status, PUBLIC_PAGE_STATUSES)));
  if (!row) return null;
  const images = await db.select({ id: s.propertyImages.id, key: s.propertyImages.storageKey, thumb: s.propertyImages.thumbKey, alt: s.propertyImages.alt, width: s.propertyImages.width, height: s.propertyImages.height })
    .from(s.propertyImages).where(eq(s.propertyImages.propertyId, row.p.id)).orderBy(desc(s.propertyImages.isCover), asc(s.propertyImages.sort));
  const features = await db.select({ name: s.propertyFeatures.name }).from(s.propertyFeatureLinks)
    .innerJoin(s.propertyFeatures, eq(s.propertyFeatures.id, s.propertyFeatureLinks.featureId))
    .where(eq(s.propertyFeatureLinks.propertyId, row.p.id)).orderBy(asc(s.propertyFeatures.sort));
  return {
    ...publicCard(row.p), categoryId: row.p.categoryId, categoryName: row.categoryName, categorySlug: row.categorySlug,
    images, features: features.map((f) => f.name),
  };
}

/** Is this stored image allowed to be served to an anonymous visitor? */
export async function isPublicImageKey(db: DBorTx, key: string) {
  const [row] = await db.select({ status: s.properties.status }).from(s.propertyImages)
    .innerJoin(s.properties, eq(s.properties.id, s.propertyImages.propertyId))
    .where(or(eq(s.propertyImages.storageKey, key), eq(s.propertyImages.thumbKey, key)));
  return !!row && PUBLIC_PAGE_STATUSES.includes(row.status as PropertyStatus);
}

export async function publicNeighborhoods(db: DBorTx) {
  const rows = await db.selectDistinct({ n: s.properties.neighborhood }).from(s.properties)
    .where(and(inArray(s.properties.status, PUBLIC_LIST_STATUSES), sql`${s.properties.neighborhood} is not null`))
    .orderBy(asc(s.properties.neighborhood));
  return rows.map((r) => r.n!).filter(Boolean);
}

export async function activeCategories(db: DBorTx) {
  return db.select().from(s.propertyCategories).where(eq(s.propertyCategories.isActive, true)).orderBy(asc(s.propertyCategories.sort));
}
export async function activeFeatures(db: DBorTx) {
  return db.select().from(s.propertyFeatures).where(eq(s.propertyFeatures.isActive, true)).orderBy(asc(s.propertyFeatures.sort));
}

export async function sitemapProperties(db: DBorTx) {
  return db.select({ ref: s.properties.ref, updatedAt: s.properties.updatedAt }).from(s.properties)
    .where(inArray(s.properties.status, PUBLIC_LIST_STATUSES)).orderBy(desc(s.properties.updatedAt)).limit(5000);
}

