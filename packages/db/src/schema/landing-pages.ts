import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { users } from "./auth";
import { aiUsage } from "./content";

// ─── landing_page_vertical enum ───────────────────────────────────────────────
// Platform-wide vertical catalog. Used by the template picker + brief step.
export const landingPageVerticalEnum = pgEnum("landing_page_vertical", [
  "cafe",
  "restaurant",
  "fitness",
  "clinic",
  "retail",
  "service",
  "generic",
]);

// ─── landing_page_style enum ──────────────────────────────────────────────────
export const landingPageStyleEnum = pgEnum("landing_page_style", [
  "minimal",
  "bold",
  "elegant",
  "playful",
]);

// ─── landing_page_goal enum (LP-2) ────────────────────────────────────────────
// What conversion the template is designed to drive.
export const landingPageGoalEnum = pgEnum("landing_page_goal", [
  "lead_capture",
  "sales_promo",
  "event_signup",
  "appointment_booking",
  "info_brochure",
]);

// ─── landing_page_templates ───────────────────────────────────────────────────
// Platform-wide (NOT tenant-scoped). Contains section blueprints + brand hints.
// name_key / description_key are i18n keys resolved by the dashboard UI.
export const landingPageTemplates = pgTable(
  "landing_page_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    nameKey: text("name_key").notNull(),
    descriptionKey: text("description_key").notNull(),
    vertical: landingPageVerticalEnum("vertical").notNull().default("generic"),
    style: landingPageStyleEnum("style").notNull().default("minimal"),
    /** LEGACY (v1): array of { type, order } section stubs the AI fills. Kept for backwards compatibility. */
    defaultSections: jsonb("default_sections").notNull().default([]),
    /** LEGACY (v1): suggested tone + color palette hints. Replaced by themeKey in v2. */
    defaultBrandHints: jsonb("default_brand_hints").notNull().default({}),
    /** LEGACY (v1): single screenshot. Replaced by screenshotUrlsByLocale in v2. */
    screenshotUrl: text("screenshot_url"),
    // ─── LP-2 v2 columns ─────────────────────────────────────────────────────
    /** Multilingual pre-filled sections. Shape: { "de-CH": [{type, variant, heading, body, extras}, ...], ... } */
    sectionsByLocale: jsonb("sections_by_locale").notNull().default({}),
    /** Locales where copy is authored AND reviewed (powers "available in" badge + filter). */
    availableLocales: text("available_locales")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Reference to a theme bundle constant in @marketing/landing-design-system. */
    themeKey: text("theme_key"),
    /** Reference to an Unsplash image bundle constant. */
    imageBundleKey: text("image_bundle_key"),
    /** Conversion goal — drives wizard recommendations + filter chip. */
    goal: landingPageGoalEnum("goal").notNull().default("lead_capture"),
    /** Per-locale per-device screenshots. Shape: { "de-CH": { phone, tablet, desktop }, ... } */
    screenshotUrlsByLocale: jsonb("screenshot_urls_by_locale").notNull().default({}),
    /** True if the theme is Swiss-coded (Alpine Clean, Zurich Modern, etc.). */
    swissSpecific: boolean("swiss_specific").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("lp_templates_key_unique").on(t.key),
    index("lp_templates_vertical_idx")
      .on(t.vertical)
      .where(sql`${t.isActive} = true`),
    index("lp_templates_goal_idx")
      .on(t.goal)
      .where(sql`${t.isActive} = true`),
    index("lp_templates_swiss_idx")
      .on(t.swissSpecific)
      .where(sql`${t.isActive} = true`),
    index("lp_templates_theme_idx")
      .on(t.themeKey)
      .where(sql`${t.isActive} = true`),
  ],
);

// ─── landing_page_status enum ─────────────────────────────────────────────────
export const landingPageStatusEnum = pgEnum("landing_page_status", [
  "draft",
  "published",
  "unpublished",
  "failed",
]);

// ─── brand_assets ─────────────────────────────────────────────────────────────
// One row per tenant. Stores brand colors, fonts, voice tone.
// Applied to public landing pages via CSS variables + injected into copy prompts.
export const brandAssets = pgTable(
  "brand_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    logoUrl: text("logo_url"),
    colorPrimary: text("color_primary").notNull().default("#111827"),
    colorSecondary: text("color_secondary").notNull().default("#6b7280"),
    fontHeading: text("font_heading").notNull().default("system-ui"),
    fontBody: text("font_body").notNull().default("system-ui"),
    voiceTone: text("voice_tone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("brand_assets_tenant_unique").on(t.tenantId)],
);

// ─── landing_pages ────────────────────────────────────────────────────────────
// One row per landing page. Version history in landing_page_versions.
// current_version_id  = editor's working draft (may be unpublished).
// published_version_id = what the public URL /p/<slug> actually serves.
// step_data JSONB accumulates AI-step outputs during the FlowProducer job graph.
export const landingPages = pgTable(
  "landing_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    currentVersionId: uuid("current_version_id"),
    /** Points to the version currently live on the public URL. */
    publishedVersionId: uuid("published_version_id"),
    status: landingPageStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // SEO fields (step-22).
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    ogImageUrl: text("og_image_url"),
    noindex: boolean("noindex").notNull().default(false),
    // LP-2: theme + locale denormalization for the renderer.
    /** Theme bundle key from @marketing/landing-design-system. NULL = system default. */
    themeKey: text("theme_key"),
    /** Locale of the published page content (e.g., "de-CH"). Denormalized from composition.locale. */
    locale: text("locale").notNull().default("de-CH"),
    /** Accumulates AI-step outputs keyed by step name (brief/copy/layout). ADR-0012. */
    stepData: jsonb("step_data").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("landing_pages_tenant_id_idx").on(t.tenantId),
    uniqueIndex("landing_pages_tenant_slug_unique").on(t.tenantId, t.slug),
  ],
);

// ─── landing_page_versions ────────────────────────────────────────────────────
// Immutable. Each publish creates a new row; never mutate.
export const landingPageVersions = pgTable(
  "landing_page_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    landingPageId: uuid("landing_page_id")
      .notNull()
      .references(() => landingPages.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** Section JSON array produced by the layout AI step. */
    composition: jsonb("composition").notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    aiUsageId: uuid("ai_usage_id").references(() => aiUsage.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("landing_page_versions_tenant_id_idx").on(t.tenantId),
    index("landing_page_versions_page_id_idx").on(t.landingPageId),
  ],
);

// ─── landing_page_views ───────────────────────────────────────────────────────
// Append-only. One row per public page load.
export const landingPageViews = pgTable(
  "landing_page_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    landingPageId: uuid("landing_page_id")
      .notNull()
      .references(() => landingPages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    referrer: text("referrer"),
    countryCode: text("country_code"),
    viewedAt: timestamp("viewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("landing_page_views_tenant_id_idx").on(t.tenantId),
    index("landing_page_views_page_id_idx").on(t.landingPageId),
  ],
);

// ─── forms ────────────────────────────────────────────────────────────────────
// Embeddable lead-capture forms. Optionally attached to a landing page.
// Step-24: added `steps` (multi-step field groups) and `settings` (anti-spam).
// Backward-compatible: if `steps` IS NULL the form uses the legacy `schema` field.
export const forms = pgTable(
  "forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** Legacy: flat Zod-compatible JSON schema (pre-step-24 forms). */
    schema: jsonb("schema").notNull(),
    /** Smart form: array of { title?, fields[] } steps. Null = legacy mode. */
    steps: jsonb("steps"),
    /** Anti-spam + UX settings. Default: honeypot on, Turnstile off. */
    settings: jsonb("settings").notNull().default({ honeypot: true, turnstile_enabled: false }),
    /** Override for the submit button text. */
    submitLabel: text("submit_label"),
    landingPageId: uuid("landing_page_id").references(() => landingPages.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("forms_tenant_id_idx").on(t.tenantId),
    uniqueIndex("forms_tenant_slug_unique").on(t.tenantId, t.slug),
  ],
);

// ─── leads ────────────────────────────────────────────────────────────────────
// One row per form submission. contact_id linked when CRM deduplication runs.
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "restrict" }),
    /** Raw submission payload validated against forms.schema. */
    payload: jsonb("payload").notNull(),
    sourceUrl: text("source_url"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set by CRM dedup handler (Phase 7). Null at submission time. */
    contactId: uuid("contact_id"),
  },
  (t) => [
    index("leads_tenant_id_idx").on(t.tenantId),
    index("leads_form_id_idx").on(t.formId),
  ],
);

// ─── brand_context_type enum ──────────────────────────────────────────────────
export const brandContextTypeEnum = pgEnum("brand_context_type", [
  "about",
  "menu",
  "offer",
  "faq",
]);

// ─── brand_embeddings ─────────────────────────────────────────────────────────
// pgvector store for tenant brand context. Used by the copy-generation step
// to inject relevant context into the prompt (similarity search).
export const brandEmbeddings = pgTable(
  "brand_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contentType: brandContextTypeEnum("content_type").notNull(),
    contentText: text("content_text").notNull(),
    contentHash: text("content_hash").notNull(),
    /** Float32 embedding array stored as JSONB. Phase 7 will add a pgvector
     *  column + HNSW index once the production Postgres has the extension. */
    embedding: jsonb("embedding"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("brand_embeddings_tenant_id_idx").on(t.tenantId),
    uniqueIndex("brand_embeddings_tenant_hash_unique").on(
      t.tenantId,
      t.contentHash,
    ),
  ],
);

// ─── landing_page_experiments ─────────────────────────────────────────────────
// One experiment per page at a time. Tracks variant traffic split and winner.
export const experimentStatusEnum = pgEnum("experiment_status", [
  "running",
  "stopped",
  "complete",
]);

export const landingPageExperiments = pgTable(
  "landing_page_experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => landingPages.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: experimentStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    winnerVersionId: uuid("winner_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exp_tenant_page_idx").on(t.tenantId, t.pageId)],
);

// ─── experiment_variants ──────────────────────────────────────────────────────
// Each variant maps to a landing page version with a traffic percentage.
// traffic_pct values across variants of one experiment should sum to 100.
export const experimentVariants = pgTable(
  "experiment_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => landingPageExperiments.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => landingPageVersions.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("Variant"),
    trafficPct: integer("traffic_pct").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exp_variants_experiment_idx").on(t.experimentId)],
);

// ─── Types ────────────────────────────────────────────────────────────────────
export type LandingPageTemplate = typeof landingPageTemplates.$inferSelect;
export type LandingPageVertical = (typeof landingPageVerticalEnum.enumValues)[number];
export type LandingPageStyle = (typeof landingPageStyleEnum.enumValues)[number];
export type BrandAsset = typeof brandAssets.$inferSelect;
export type NewBrandAsset = typeof brandAssets.$inferInsert;
export type LandingPage = typeof landingPages.$inferSelect;
export type NewLandingPage = typeof landingPages.$inferInsert;
export type LandingPageStatus =
  (typeof landingPageStatusEnum.enumValues)[number];
export type LandingPageVersion = typeof landingPageVersions.$inferSelect;
export type NewLandingPageVersion = typeof landingPageVersions.$inferInsert;
export type LandingPageView = typeof landingPageViews.$inferSelect;
export type NewLandingPageView = typeof landingPageViews.$inferInsert;
export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type BrandEmbedding = typeof brandEmbeddings.$inferSelect;
export type NewBrandEmbedding = typeof brandEmbeddings.$inferInsert;
export type BrandContextType = (typeof brandContextTypeEnum.enumValues)[number];
export type LandingPageExperiment = typeof landingPageExperiments.$inferSelect;
export type NewLandingPageExperiment = typeof landingPageExperiments.$inferInsert;
export type ExperimentStatus = (typeof experimentStatusEnum.enumValues)[number];
export type ExperimentVariant = typeof experimentVariants.$inferSelect;
export type NewExperimentVariant = typeof experimentVariants.$inferInsert;
