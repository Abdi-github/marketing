-- step-20: CRM v1 — contacts table + leads→contacts FK
-- Contacts are the deduplicated representation of people who submitted forms.
-- The dedup key is (tenant_id, email). Multiple leads from the same email
-- resolve to one contact via the lead-dedup pipeline in the form submission API.

-- ─── contacts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contacts" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid NOT NULL,
  "email"         text NOT NULL,
  "first_name"    text,
  "last_name"     text,
  "phone"         text,
  "tags"          text[] NOT NULL DEFAULT '{}',
  "notes"         text,
  "source"        text NOT NULL DEFAULT 'form',
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at"  timestamp with time zone DEFAULT now() NOT NULL,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "contacts_tenant_id_idx"
  ON "contacts" USING btree ("tenant_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_tenant_email_unique"
  ON "contacts" USING btree ("tenant_id", "email");
--> statement-breakpoint

-- ─── leads.contact_id FK ─────────────────────────────────────────────────────
-- The column already exists (added in 0004); add the FK constraint now that
-- the contacts table exists.
ALTER TABLE "leads"
  ADD CONSTRAINT "leads_contact_id_contacts_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null;
--> statement-breakpoint

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_tenant_isolation ON contacts
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
