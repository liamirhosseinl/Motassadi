/**
 * Database schema — املاک متصدی
 *
 * Conventions
 * - All money columns are integer TOMAN (bigint, JS number mode; safe up to 9e15).
 * - Timestamps are timestamptz (UTC canonical). Calendar-only values (entry dates,
 *   transaction dates) are `date` columns holding the Gregorian date; the UI renders Jalali.
 * - Business records are never hard-deleted by ordinary actions: properties are archived,
 *   finance entries are voided, transactions are cancelled.
 */
import { sql } from "drizzle-orm";
import {
  pgTable, serial, integer, bigint, text, boolean, timestamp, date, jsonb,
  primaryKey, index, uniqueIndex, check, type AnyPgColumn,
} from "drizzle-orm/pg-core";

const money = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ───────────── Users, roles, sessions ───────────── */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(), // owner | agent | finance | content
  isActive: boolean("is_active").notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("users_username_uq").on(sql`lower(${t.username})`),
  check("users_role_ck", sql`${t.role} in ('owner','agent','finance','content')`),
]);

export const rolePermissions = pgTable("role_permissions", {
  role: text("role").notNull(),
  permission: text("permission").notNull(),
}, (t) => [primaryKey({ columns: [t.role, t.permission] })]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256(token) — the raw token only lives in the cookie
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent"),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

export const counters = pgTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});

/* ───────────── Settings & content ───────────── */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const contentPages = pgTable("content_pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  needsReview: boolean("needs_review").notNull().default(true),
  updatedAt: updatedAt(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
});

/* ───────────── Taxonomies ───────────── */

export const propertyCategories = pgTable("property_categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  hasRooms: boolean("has_rooms").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const propertyFeatures = pgTable("property_features", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const financeCategories = pgTable("finance_categories", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // income | expense
  name: text("name").notNull(),
  isCommission: boolean("is_commission").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [
  uniqueIndex("finance_categories_kind_name_uq").on(t.kind, t.name),
  check("finance_categories_kind_ck", sql`${t.kind} in ('income','expense')`),
]);

/* ───────────── Contacts (CRM) ───────────── */

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(), // normalised Latin digits, e.g. 09121234567
  phone2: text("phone2"),
  email: text("email"),
  types: text("types").array().notNull().default(sql`'{}'::text[]`), // owner,buyer,tenant,seller,landlord,prospect,other
  preferredMethod: text("preferred_method"), // phone | whatsapp | sms | in_person
  requirements: text("requirements"),
  budgetMin: money("budget_min"),
  budgetMax: money("budget_max"),
  preferredLocations: text("preferred_locations"),
  preferredCategoryIds: integer("preferred_category_ids").array().notNull().default(sql`'{}'::int[]`),
  agentId: integer("agent_id").references(() => users.id, { onDelete: "set null" }),
  source: text("source"), // website | phone | walk_in | referral | instagram | whatsapp | other
  status: text("status").notNull().default("active"), // active | inactive | archived
  followUpAt: timestamp("follow_up_at", { withTimezone: true }),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("contacts_phone_idx").on(t.phone),
  index("contacts_status_idx").on(t.status),
  index("contacts_agent_idx").on(t.agentId),
]);

/* ───────────── Properties ───────────── */

export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull().unique(), // public reference, e.g. M-1405-0007
  title: text("title").notNull(),
  dealType: text("deal_type").notNull(), // sale | rent | mortgage | exchange
  categoryId: integer("category_id").notNull().references(() => propertyCategories.id),
  description: text("description"),
  price: money("price"),
  priceNegotiable: boolean("price_negotiable").notNull().default(false),
  priceHidden: boolean("price_hidden").notNull().default(false),
  deposit: money("deposit"),
  rentMonthly: money("rent_monthly"),
  area: integer("area"),
  landArea: integer("land_area"),
  buildingArea: integer("building_area"),
  rooms: integer("rooms"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  floor: integer("floor"),
  totalFloors: integer("total_floors"),
  buildYear: integer("build_year"), // Jalali year, e.g. 1398
  condition: text("condition"),
  city: text("city").notNull().default("زرند"),
  neighborhood: text("neighborhood"),
  address: text("address"), // PRIVATE — never rendered publicly
  publicLocation: text("public_location"), // what the public may see
  internalNotes: text("internal_notes"), // PRIVATE
  ownerContactId: integer("owner_contact_id").references(() => contacts.id, { onDelete: "set null" }),
  agentId: integer("agent_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"),
  featured: boolean("featured").notNull().default(false),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: integer("version").notNull().default(1),
}, (t) => [
  index("properties_status_idx").on(t.status),
  index("properties_deal_idx").on(t.dealType),
  index("properties_category_idx").on(t.categoryId),
  index("properties_price_idx").on(t.price),
  index("properties_area_idx").on(t.area),
  index("properties_created_idx").on(t.createdAt),
  index("properties_agent_idx").on(t.agentId),
  check("properties_deal_ck", sql`${t.dealType} in ('sale','rent','mortgage','exchange')`),
  check("properties_status_ck", sql`${t.status} in ('draft','pending_review','published','reserved','sold','rented','unpublished','archived')`),
  check("properties_money_ck", sql`coalesce(${t.price},0) >= 0 and coalesce(${t.deposit},0) >= 0 and coalesce(${t.rentMonthly},0) >= 0`),
]);

export const propertyFeatureLinks = pgTable("property_feature_links", {
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  featureId: integer("feature_id").notNull().references(() => propertyFeatures.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.propertyId, t.featureId] })]);

export const propertyImages = pgTable("property_images", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  thumbKey: text("thumb_key").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  alt: text("alt"),
  sort: integer("sort").notNull().default(0),
  isCover: boolean("is_cover").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("property_images_property_idx").on(t.propertyId, t.sort)]);

export const propertyStatusHistory = pgTable("property_status_history", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  note: text("note"),
  changedBy: integer("changed_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("property_status_history_property_idx").on(t.propertyId)]);

/* ───────────── Inquiries & follow-ups ───────────── */

export const inquiries = pgTable("inquiries", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "set null" }),
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  transactionId: integer("transaction_id").references((): AnyPgColumn => transactions.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  message: text("message"),
  preferredTime: text("preferred_time"),
  source: text("source").notNull().default("website"),
  status: text("status").notNull().default("new"),
  agentId: integer("agent_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("inquiries_status_idx").on(t.status),
  index("inquiries_created_idx").on(t.createdAt),
  index("inquiries_phone_idx").on(t.phone),
  check("inquiries_status_ck", sql`${t.status} in ('new','contacted','follow_up','visit_scheduled','negotiation','converted','closed','not_interested')`),
]);

export const inquiryActivities = pgTable("inquiry_activities", {
  id: serial("id").primaryKey(),
  inquiryId: integer("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // note | call | status | assign | link
  body: text("body").notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("inquiry_activities_inquiry_idx").on(t.inquiryId)]);

export const followups = pgTable("followups", {
  id: serial("id").primaryKey(),
  purpose: text("purpose").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  assignedTo: integer("assigned_to").references(() => users.id, { onDelete: "set null" }),
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "set null" }),
  inquiryId: integer("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }),
  notes: text("notes"),
  done: boolean("done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("followups_due_idx").on(t.done, t.dueAt), index("followups_assigned_idx").on(t.assignedTo)]);

/* ───────────── Transactions ───────────── */

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g. T-1405-0003
  kind: text("kind").notNull(), // sale | rent | other
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "set null" }),
  agentId: integer("agent_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"), // draft | pending | completed | cancelled
  dealAmount: money("deal_amount"), // property transaction value (sale price or deposit) — NOT brokerage revenue
  monthlyRent: money("monthly_rent"),
  commissionMode: text("commission_mode").notNull().default("fixed"), // fixed | percent
  commissionRateBp: integer("commission_rate_bp"), // basis points (1% = 100) when mode = percent
  commissionFixed: money("commission_fixed"),
  expectedCommission: money("expected_commission").notNull().default(0), // computed on the server
  transactionDate: date("transaction_date"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
}, (t) => [
  index("transactions_status_idx").on(t.status),
  index("transactions_date_idx").on(t.transactionDate),
  check("transactions_kind_ck", sql`${t.kind} in ('sale','rent','other')`),
  check("transactions_status_ck", sql`${t.status} in ('draft','pending','completed','cancelled')`),
  check("transactions_mode_ck", sql`${t.commissionMode} in ('fixed','percent')`),
  check("transactions_money_ck", sql`${t.expectedCommission} >= 0 and coalesce(${t.dealAmount},0) >= 0`),
]);

export const transactionParties = pgTable("transaction_parties", {
  transactionId: integer("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "restrict" }),
  role: text("role").notNull(), // buyer | seller | tenant | landlord | other
}, (t) => [primaryKey({ columns: [t.transactionId, t.contactId, t.role] })]);

/* ───────────── Attachments & finance ───────────── */

export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  storageKey: text("storage_key").notNull(),
  originalName: text("original_name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  ownerType: text("owner_type").notNull(), // finance | transaction | property
  ownerId: integer("owner_id"),
  uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("attachments_owner_idx").on(t.ownerType, t.ownerId)]);

export const financeEntries = pgTable("finance_entries", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // income | expense
  categoryId: integer("category_id").notNull().references(() => financeCategories.id),
  amount: money("amount").notNull(), // toman, always > 0
  entryDate: date("entry_date").notNull(),
  method: text("method"), // cash | card | transfer | cheque | pos | other
  description: text("description"),
  referenceNo: text("reference_no"),
  transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "restrict" }),
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  attachmentId: integer("attachment_id").references(() => attachments.id, { onDelete: "set null" }),
  status: text("status").notNull().default("recorded"), // recorded | void
  approved: boolean("approved").notNull().default(true),
  voidReason: text("void_reason"),
  voidedBy: integer("voided_by").references(() => users.id, { onDelete: "set null" }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  idempotencyKey: text("idempotency_key").unique(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  index("finance_entries_date_idx").on(t.entryDate),
  index("finance_entries_kind_idx").on(t.kind, t.status),
  index("finance_entries_tx_idx").on(t.transactionId),
  check("finance_entries_kind_ck", sql`${t.kind} in ('income','expense')`),
  check("finance_entries_status_ck", sql`${t.status} in ('recorded','void')`),
  check("finance_entries_amount_ck", sql`${t.amount} > 0`),
]);

/* ───────────── Audit ───────────── */

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details"),
  createdAt: createdAt(),
}, (t) => [index("audit_logs_entity_idx").on(t.entity, t.entityId), index("audit_logs_created_idx").on(t.createdAt)]);
