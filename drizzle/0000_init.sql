CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" integer,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"phone2" text,
	"email" text,
	"types" text[] DEFAULT '{}'::text[] NOT NULL,
	"preferred_method" text,
	"requirements" text,
	"budget_min" bigint,
	"budget_max" bigint,
	"preferred_locations" text,
	"preferred_category_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"agent_id" integer,
	"source" text,
	"status" text DEFAULT 'active' NOT NULL,
	"follow_up_at" timestamp with time zone,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_pages" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"needs_review" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"is_commission" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "finance_categories_kind_ck" CHECK ("finance_categories"."kind" in ('income','expense'))
);
--> statement-breakpoint
CREATE TABLE "finance_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"category_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"entry_date" date NOT NULL,
	"method" text,
	"description" text,
	"reference_no" text,
	"transaction_id" integer,
	"contact_id" integer,
	"attachment_id" integer,
	"status" text DEFAULT 'recorded' NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"void_reason" text,
	"voided_by" integer,
	"voided_at" timestamp with time zone,
	"idempotency_key" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_entries_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "finance_entries_kind_ck" CHECK ("finance_entries"."kind" in ('income','expense')),
	CONSTRAINT "finance_entries_status_ck" CHECK ("finance_entries"."status" in ('recorded','void')),
	CONSTRAINT "finance_entries_amount_ck" CHECK ("finance_entries"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "followups" (
	"id" serial PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"assigned_to" integer,
	"contact_id" integer,
	"property_id" integer,
	"inquiry_id" integer,
	"notes" text,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"property_id" integer,
	"contact_id" integer,
	"transaction_id" integer,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"message" text,
	"preferred_time" text,
	"source" text DEFAULT 'website' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"agent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiries_status_ck" CHECK ("inquiries"."status" in ('new','contacted','follow_up','visit_scheduled','negotiation','converted','closed','not_interested'))
);
--> statement-breakpoint
CREATE TABLE "inquiry_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"inquiry_id" integer NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"title" text NOT NULL,
	"deal_type" text NOT NULL,
	"category_id" integer NOT NULL,
	"description" text,
	"price" bigint,
	"price_negotiable" boolean DEFAULT false NOT NULL,
	"price_hidden" boolean DEFAULT false NOT NULL,
	"deposit" bigint,
	"rent_monthly" bigint,
	"area" integer,
	"land_area" integer,
	"building_area" integer,
	"rooms" integer,
	"bedrooms" integer,
	"bathrooms" integer,
	"floor" integer,
	"total_floors" integer,
	"build_year" integer,
	"condition" text,
	"city" text DEFAULT 'زرند' NOT NULL,
	"neighborhood" text,
	"address" text,
	"public_location" text,
	"internal_notes" text,
	"owner_contact_id" integer,
	"agent_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "properties_ref_unique" UNIQUE("ref"),
	CONSTRAINT "properties_deal_ck" CHECK ("properties"."deal_type" in ('sale','rent','mortgage','exchange')),
	CONSTRAINT "properties_status_ck" CHECK ("properties"."status" in ('draft','pending_review','published','reserved','sold','rented','unpublished','archived')),
	CONSTRAINT "properties_money_ck" CHECK (coalesce("properties"."price",0) >= 0 and coalesce("properties"."deposit",0) >= 0 and coalesce("properties"."rent_monthly",0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "property_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"has_rooms" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "property_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "property_feature_links" (
	"property_id" integer NOT NULL,
	"feature_id" integer NOT NULL,
	CONSTRAINT "property_feature_links_property_id_feature_id_pk" PRIMARY KEY("property_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "property_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "property_features_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "property_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"property_id" integer NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"property_id" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"changed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" text NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_permission_pk" PRIMARY KEY("role","permission")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "transaction_parties" (
	"transaction_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "transaction_parties_transaction_id_contact_id_role_pk" PRIMARY KEY("transaction_id","contact_id","role")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"property_id" integer,
	"agent_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"deal_amount" bigint,
	"monthly_rent" bigint,
	"commission_mode" text DEFAULT 'fixed' NOT NULL,
	"commission_rate_bp" integer,
	"commission_fixed" bigint,
	"expected_commission" bigint DEFAULT 0 NOT NULL,
	"transaction_date" date,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "transactions_code_unique" UNIQUE("code"),
	CONSTRAINT "transactions_kind_ck" CHECK ("transactions"."kind" in ('sale','rent','other')),
	CONSTRAINT "transactions_status_ck" CHECK ("transactions"."status" in ('draft','pending','completed','cancelled')),
	CONSTRAINT "transactions_mode_ck" CHECK ("transactions"."commission_mode" in ('fixed','percent')),
	CONSTRAINT "transactions_money_ck" CHECK ("transactions"."expected_commission" >= 0 and coalesce("transactions"."deal_amount",0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_ck" CHECK ("users"."role" in ('owner','agent','finance','content'))
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_category_id_property_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."property_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_contact_id_contacts_id_fk" FOREIGN KEY ("owner_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_feature_links" ADD CONSTRAINT "property_feature_links_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_feature_links" ADD CONSTRAINT "property_feature_links_feature_id_property_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."property_features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_status_history" ADD CONSTRAINT "property_status_history_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_status_history" ADD CONSTRAINT "property_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_parties" ADD CONSTRAINT "transaction_parties_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_parties" ADD CONSTRAINT "transaction_parties_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_owner_idx" ON "attachments" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contacts_phone_idx" ON "contacts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "contacts_status_idx" ON "contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contacts_agent_idx" ON "contacts" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_categories_kind_name_uq" ON "finance_categories" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "finance_entries_date_idx" ON "finance_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "finance_entries_kind_idx" ON "finance_entries" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "finance_entries_tx_idx" ON "finance_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "followups_due_idx" ON "followups" USING btree ("done","due_at");--> statement-breakpoint
CREATE INDEX "followups_assigned_idx" ON "followups" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "inquiries_status_idx" ON "inquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inquiries_created_idx" ON "inquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inquiries_phone_idx" ON "inquiries" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "inquiry_activities_inquiry_idx" ON "inquiry_activities" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "properties_status_idx" ON "properties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "properties_deal_idx" ON "properties" USING btree ("deal_type");--> statement-breakpoint
CREATE INDEX "properties_category_idx" ON "properties" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "properties_price_idx" ON "properties" USING btree ("price");--> statement-breakpoint
CREATE INDEX "properties_area_idx" ON "properties" USING btree ("area");--> statement-breakpoint
CREATE INDEX "properties_created_idx" ON "properties" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "properties_agent_idx" ON "properties" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "property_images_property_idx" ON "property_images" USING btree ("property_id","sort");--> statement-breakpoint
CREATE INDEX "property_status_history_property_idx" ON "property_status_history" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree (lower("username"));