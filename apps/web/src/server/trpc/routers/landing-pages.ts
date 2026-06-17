// tRPC router for landing pages.
// Enqueues the FlowProducer job graph and exposes polling + publish procedures.
// See docs/WORKFLOWS.md §Landing page.
import {
  createAnthropicHaiku,
  getPrompt,
  landingPageCompositionSchema,
  landingPageSectionSchema,
} from "@marketing/ai-router";
import { getPlanCaps } from "@marketing/billing";
import { db } from "@marketing/db";
import {
  aiUsage,
  landingPages,
  landingPageVersions,
  landingPageTemplates,
  businessProfiles,
  customDomains,
  outbox,
  tenants,
} from "@marketing/db";
import { TRPCError } from "@trpc/server";
import { and, eq, desc, asc, sql } from "drizzle-orm";
import type { LandingPageComposition, LandingPageSection, SectionType } from "@marketing/ai-router";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";
import {
  enqueueLandingPageFlow,
  enqueueLandingPageLocalization,
  removeLandingPageFlowJobs,
} from "../../queues/landing-page";
import {
  LANDING_PAGE_LOCALE_KEYS,
  normalizeLandingLanguagePreferences,
  type LandingLanguagePreferences,
  type LandingPageLocale,
} from "../../../lib/landing-language";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

const carouselSettingsInput = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["auto", "manual"]).optional(),
  delayMs: z.number().int().min(1000).max(15000).optional(),
  effect: z.enum(["fade", "slide"]).optional(),
});

const landingPageLocaleEnum = z.enum(
  LANDING_PAGE_LOCALE_KEYS as [LandingPageLocale, ...LandingPageLocale[]],
);
const languagePreferencesInput = z.object({
  locales: z.array(landingPageLocaleEnum).min(1).max(LANDING_PAGE_LOCALE_KEYS.length),
  defaultLocale: landingPageLocaleEnum,
});
const sectionTypeInput = z.enum([
  "hero",
  "about",
  "menu_preview",
  "offer",
  "gallery",
  "testimonials",
  "faq",
  "contact",
  "lead_form",
  "whatsapp_cta",
]);

const DEFAULT_MAP_ADDRESS = "Neuchatel, Switzerland";

function mapEmbedUrlForAddress(address: string | null | undefined): string {
  const query = encodeURIComponent(address?.trim() || DEFAULT_MAP_ADDRESS);
  return `https://www.google.com/maps?q=${query}&output=embed`;
}

function normalizedLanguagePreferences(input: {
  locales?: string[];
  defaultLocale?: string | null;
  fallbackLocale: string;
}): LandingLanguagePreferences {
  return normalizeLandingLanguagePreferences(
    {
      locales: input.locales?.length ? input.locales : [input.fallbackLocale],
      defaultLocale: input.defaultLocale ?? input.fallbackLocale,
    },
    input.fallbackLocale,
  );
}

type LandingGenerationControlState = "running" | "paused" | "cancelled" | "failed";
type LandingGenerationState = "generating" | "paused" | "ready" | "published" | "failed";

function getLandingGenerationControlState(
  stepData: Record<string, unknown> | null | undefined,
): LandingGenerationControlState {
  const state = (stepData?.["generationControl"] as { state?: unknown } | undefined)?.state;
  return state === "paused" || state === "cancelled" || state === "failed" ? state : "running";
}

function getLandingGenerationError(
  stepData: Record<string, unknown> | null | undefined,
): string | null {
  const reason = (stepData?.["generationControl"] as { reason?: unknown } | undefined)?.reason;
  return typeof reason === "string" && reason.trim().length > 0 ? reason : null;
}

function getLandingGenerationState(input: {
  status: "draft" | "published" | "unpublished" | "failed";
  currentVersionId: string | null;
  stepData: Record<string, unknown> | null | undefined;
}): LandingGenerationState {
  const controlState = getLandingGenerationControlState(input.stepData);
  if (controlState === "failed") return "failed";
  if (input.status === "failed") return "failed";
  if (input.status === "published") return "published";
  if (!input.currentVersionId) {
    return controlState === "paused" ? "paused" : "generating";
  }
  return "ready";
}

async function assertLandingGenerationBudgetAvailable(
  tenantId: string,
  estimatedCostCents: number,
): Promise<void> {
  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  const plan = tenant?.plan ?? "trial";
  const planCaps = getPlanCaps(plan);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(cost_usd), 0)` })
    .from(aiUsage)
    .where(
      and(eq(aiUsage.tenantId, tenantId), sql`${aiUsage.createdAt} >= ${monthStart.toISOString()}`),
    );

  const monthlySpendUsd = Number.parseFloat(row?.total ?? "0");
  const estimatedCostUsd = estimatedCostCents / 100;

  if (monthlySpendUsd >= planCaps.monthlyAiBudgetUsd) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Monthly AI budget exceeded (${plan}: USD ${planCaps.monthlyAiBudgetUsd.toFixed(2)}). Upgrade your plan or wait until next month to generate a new page.`,
    });
  }

  if (monthlySpendUsd + estimatedCostUsd > planCaps.monthlyAiBudgetUsd) {
    const remainingUsd = Math.max(0, planCaps.monthlyAiBudgetUsd - monthlySpendUsd);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Not enough monthly AI budget remaining for this generation. Remaining: USD ${remainingUsd.toFixed(2)} on the ${plan} plan.`,
    });
  }
}

async function getNextVersionNumber(tenantId: string, pageId: string): Promise<number> {
  const [latest] = await db
    .select({ version: landingPageVersions.version })
    .from(landingPageVersions)
    .where(
      and(
        eq(landingPageVersions.tenantId, tenantId),
        eq(landingPageVersions.landingPageId, pageId),
      ),
    )
    .orderBy(desc(landingPageVersions.version))
    .limit(1);
  return (latest?.version ?? 0) + 1;
}

async function insertDraftVersion(input: {
  tenantId: string;
  userId: string;
  pageId: string;
  composition: LandingPageComposition;
}): Promise<{ id: string; version: number }> {
  const nextVersion = await getNextVersionNumber(input.tenantId, input.pageId);
  const [newVersion] = await db
    .insert(landingPageVersions)
    .values({
      landingPageId: input.pageId,
      tenantId: input.tenantId,
      version: nextVersion,
      composition: input.composition,
      createdBy: input.userId,
    })
    .returning({ id: landingPageVersions.id, version: landingPageVersions.version });

  return newVersion!;
}

type LocalizedCompositions = Record<string, LandingPageComposition>;

function isComposition(value: unknown): value is LandingPageComposition {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as { sections?: unknown }).sections)
  );
}

function mapLocalizedCompositions(
  stepData: Record<string, unknown> | null | undefined,
  mapper: (composition: LandingPageComposition) => LandingPageComposition,
): Record<string, unknown> | null {
  const localized = stepData?.["localizedCompositions"] as Record<string, unknown> | undefined;
  if (!localized) return null;

  let changed = false;
  const next: LocalizedCompositions = {};
  for (const [locale, composition] of Object.entries(localized)) {
    if (!isComposition(composition)) continue;
    next[locale] = mapper(composition);
    changed = true;
  }
  if (!changed) return null;
  return {
    ...(stepData ?? {}),
    localizedCompositions: next,
    localizationStatus: {
      state: "synced-from-editor",
      updatedAt: new Date().toISOString(),
      note: "Editor changes were mirrored across saved localized compositions.",
    },
  };
}

function mapSectionByIndex(
  composition: LandingPageComposition,
  sectionIndex: number,
  update: (section: LandingPageSection) => LandingPageSection,
): LandingPageComposition {
  const target = composition.sections[sectionIndex];
  if (!target) return composition;
  const sections = composition.sections.map((section, index) =>
    index === sectionIndex ? update(section) : section,
  );
  const pages = composition.site?.pages?.map((page) => ({
    ...page,
    sections: page.sections.map((section) =>
      section.type === target.type && section.order === target.order ? update(section) : section,
    ),
  }));
  return {
    ...composition,
    sections,
    site: composition.site ? { ...composition.site, pages } : composition.site,
  };
}

function reorderCompositionSections(
  composition: LandingPageComposition,
  newOrder: number[],
): LandingPageComposition {
  if (newOrder.length !== composition.sections.length) return composition;
  const sections = newOrder
    .map((oldIdx, newIdx) => {
      const section = composition.sections[oldIdx];
      return section ? { ...section, order: newIdx } : null;
    })
    .filter((section): section is LandingPageSection => !!section);
  if (sections.length !== composition.sections.length) return composition;
  return { ...composition, sections };
}

function defaultSection(type: SectionType, order: number): LandingPageSection {
  const base = {
    order,
    heading: SECTION_DEFAULTS[type].heading,
    body: SECTION_DEFAULTS[type].body,
    variant: SECTION_DEFAULTS[type].variant,
    extras: SECTION_DEFAULTS[type].extras,
  };
  const parsed = landingPageSectionSchema.safeParse({ ...base, type });
  if (!parsed.success) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid default section." });
  }
  return parsed.data;
}

const SECTION_DEFAULTS: Record<
  SectionType,
  {
    heading: string;
    body?: string;
    variant?: string;
    extras?: Record<string, unknown>;
  }
> = {
  hero: {
    heading: "Welcome to your new section",
    body: "Introduce the most important promise for this page.",
    variant: "centered",
  },
  about: {
    heading: "About this business",
    body: "Share what makes the team, service, or experience different.",
    variant: "text-image-split",
  },
  menu_preview: {
    heading: "Popular choices",
    body: "Highlight the items visitors ask for most.",
    variant: "cards-grid",
    extras: {
      items: [
        { name: "Signature option", description: "A concise description of the offer." },
        { name: "Seasonal option", description: "A timely choice for new visitors." },
        { name: "Local favorite", description: "A reliable reason to visit or book." },
      ],
    },
  },
  offer: {
    heading: "Featured offer",
    body: "Give visitors a clear reason to take action today.",
    variant: "banner-centered",
    extras: { ctaText: "Get started", ctaHref: "#contact" },
  },
  gallery: {
    heading: "Gallery",
    body: "Show the atmosphere, products, or results visitors can expect.",
    variant: "masonry-3",
    extras: { images: [] },
  },
  testimonials: {
    heading: "What customers say",
    body: "Add social proof from real customers or clients.",
    variant: "cards-3col",
    extras: {
      items: [
        { quote: "A thoughtful experience from start to finish.", author: "Customer" },
        { quote: "Professional, clear, and easy to recommend.", author: "Client" },
      ],
    },
  },
  faq: {
    heading: "Questions",
    body: "Answer common questions before visitors contact you.",
    variant: "accordion",
    extras: {
      items: [
        {
          question: "How do we get started?",
          answer: "Send a message and the team will guide you through the next step.",
        },
      ],
    },
  },
  contact: {
    heading: "Visit or contact us",
    body: "Use the details below to reach the team or find the location.",
    variant: "split-map",
    extras: {
      address: DEFAULT_MAP_ADDRESS,
      mapEmbedUrl: mapEmbedUrlForAddress(DEFAULT_MAP_ADDRESS),
    },
  },
  lead_form: {
    heading: "Request a callback",
    body: "Leave your details and the team will respond shortly.",
    variant: "card-centered",
    extras: {},
  },
  whatsapp_cta: {
    heading: "Prefer WhatsApp?",
    body: "Send a quick message and get a direct response.",
    variant: "centered-button",
    extras: { buttonText: "Message us" },
  },
};

function insertSection(
  composition: LandingPageComposition,
  section: LandingPageSection,
  insertAfter: number | null | undefined,
): LandingPageComposition {
  const sorted = composition.sections.slice().sort((a, b) => a.order - b.order);
  const insertAt =
    typeof insertAfter === "number"
      ? Math.min(Math.max(insertAfter + 1, 0), sorted.length)
      : sorted.length;
  const sections = [...sorted.slice(0, insertAt), section, ...sorted.slice(insertAt)].map(
    (item, order) => ({ ...item, order }),
  );
  return { ...composition, sections };
}

function removeSection(
  composition: LandingPageComposition,
  sectionIndex: number,
): LandingPageComposition {
  const sections = composition.sections
    .filter((_, index) => index !== sectionIndex)
    .map((section, order) => ({ ...section, order }));
  return { ...composition, sections };
}

export const landingPagesRouter = router({
  // List active platform templates with v2 fields (LP-2): theme, image bundle, goal,
  // per-locale sections, per-locale-per-device screenshots, Swiss flag.
  listTemplates: tenantProcedure
    .input(
      z
        .object({
          vertical: z.string().optional(),
          goal: z
            .enum([
              "lead_capture",
              "sales_promo",
              "event_signup",
              "appointment_booking",
              "info_brochure",
            ])
            .optional(),
          swissOnly: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const conditions = [sql`${landingPageTemplates.isActive} = true`];
      if (input?.vertical) {
        conditions.push(
          eq(
            landingPageTemplates.vertical,
            input.vertical as
              | "cafe"
              | "restaurant"
              | "fitness"
              | "clinic"
              | "retail"
              | "service"
              | "generic",
          ),
        );
      }
      if (input?.goal) {
        conditions.push(eq(landingPageTemplates.goal, input.goal));
      }
      if (input?.swissOnly) {
        conditions.push(eq(landingPageTemplates.swissSpecific, true));
      }
      return db
        .select({
          id: landingPageTemplates.id,
          key: landingPageTemplates.key,
          nameKey: landingPageTemplates.nameKey,
          descriptionKey: landingPageTemplates.descriptionKey,
          vertical: landingPageTemplates.vertical,
          style: landingPageTemplates.style,
          goal: landingPageTemplates.goal,
          themeKey: landingPageTemplates.themeKey,
          imageBundleKey: landingPageTemplates.imageBundleKey,
          swissSpecific: landingPageTemplates.swissSpecific,
          availableLocales: landingPageTemplates.availableLocales,
          screenshotUrlsByLocale: landingPageTemplates.screenshotUrlsByLocale,
          /** Legacy fields preserved for backwards-compat (still consumed by old gallery). */
          defaultSections: landingPageTemplates.defaultSections,
          defaultBrandHints: landingPageTemplates.defaultBrandHints,
          screenshotUrl: landingPageTemplates.screenshotUrl,
        })
        .from(landingPageTemplates)
        .where(and(...conditions))
        .orderBy(landingPageTemplates.vertical, landingPageTemplates.style);
    }),

  // Enqueue a "generate from prompt" job graph. Returns pageId for polling.
  // Accepts optional templateKey — when provided, the copy step uses the template's
  // section blueprint and the template-fill prompt instead of free-form generation.
  draftFromPrompt: tenantProcedure
    .input(
      z.object({
        // Optional: when a template is chosen the user may personalise with AI and leave
        // the prompt blank. We synthesise a sensible brief in that case.
        prompt: z.string().max(1000).optional(),
        title: z.string().min(1).max(150).optional(),
        templateKey: z.string().optional(),
        // Opt-in to folding the tenant's brand (colours, tone) into the generation.
        // Default false: keep the template's own theme/voice so the result matches the preview.
        applyBrand: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [profile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      if (!profile) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Complete your business profile before generating a landing page.",
        });
      }

      // A free-form (from-scratch) generation still needs a brief to work from.
      if (!input.templateKey && (!input.prompt || input.prompt.trim().length < 10)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Describe your business (at least 10 characters) to generate a page from scratch.",
        });
      }

      // Fetch template sections + theme to seed stepData before the job starts.
      let templateSections: Array<{ type: string; order: number }> | undefined;
      let templateBrandHints: Record<string, string> | undefined;
      let templateThemeKey: string | null = null;
      if (input.templateKey) {
        const [template] = await db
          .select({
            defaultSections: landingPageTemplates.defaultSections,
            defaultBrandHints: landingPageTemplates.defaultBrandHints,
            themeKey: landingPageTemplates.themeKey,
          })
          .from(landingPageTemplates)
          .where(eq(landingPageTemplates.key, input.templateKey));
        if (template) {
          templateSections = template.defaultSections as Array<{ type: string; order: number }>;
          templateBrandHints = template.defaultBrandHints as Record<string, string>;
          templateThemeKey = template.themeKey ?? null;
        }
      }

      // Brief seed: user's prompt, or a synthesised one when they personalise a template blank.
      const effectivePrompt =
        input.prompt && input.prompt.trim().length >= 3
          ? input.prompt.trim()
          : `Create a landing page for ${profile.businessName}, a ${profile.vertical} business${profile.addressCity ? ` in ${profile.addressCity}` : ""}.`;

      const landingPageId = crypto.randomUUID();
      const baseSlug = slugify(input.title ?? profile.businessName ?? effectivePrompt.slice(0, 40));

      // Build initial stepData: seed template sections if a template was chosen.
      // The copy step reads stepData.templateSections to decide section structure.
      const initialStepData: Record<string, unknown> = { applyBrand: input.applyBrand };
      if (templateSections) {
        initialStepData["templateSections"] = templateSections;
        initialStepData["templateKey"] = input.templateKey;
        if (templateBrandHints) initialStepData["templateBrandHints"] = templateBrandHints;
      }

      await assertLandingGenerationBudgetAvailable(tenantId, 50);

      await db.insert(landingPages).values({
        id: landingPageId,
        tenantId,
        slug: `${baseSlug}-${landingPageId.slice(0, 8)}`,
        title: input.title ?? profile.businessName ?? effectivePrompt.slice(0, 80),
        // Carry the template's theme so generated colours match the preview the user saw.
        // When applyBrand is true we still start from the template theme; brand colours can be
        // applied later via the editor's theme picker.
        themeKey: templateThemeKey,
        locale: profile.locale,
        stepData: initialStepData,
      });

      await enqueueLandingPageFlow({
        tenantId,
        landingPageId,
        userId,
        businessName: profile.businessName,
        vertical: profile.vertical,
        city: profile.addressCity ?? undefined,
        locale: profile.locale,
        userPrompt: effectivePrompt,
        templateKey: input.templateKey,
        applyBrand: input.applyBrand,
        costBudgetCents: 50,
      });

      return { landingPageId };
    }),

  // "Use template as-is" — instant, no AI. Materialises the template's pre-written
  // sections_by_locale[locale] into a draft version and carries the template theme,
  // so the page looks exactly like the preview. The user edits everything afterwards.
  createFromTemplate: tenantProcedure
    .input(
      z.object({
        templateKey: z.string().min(1).max(120),
        locale: z.enum(["de-CH", "fr-CH", "it-CH", "en"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [profile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      if (!profile) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Complete your business profile before creating a landing page.",
        });
      }

      const [template] = await db
        .select({
          nameKey: landingPageTemplates.nameKey,
          themeKey: landingPageTemplates.themeKey,
          availableLocales: landingPageTemplates.availableLocales,
          sectionsByLocale: landingPageTemplates.sectionsByLocale,
        })
        .from(landingPageTemplates)
        .where(eq(landingPageTemplates.key, input.templateKey));

      if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Selected template not found." });
      }

      const sectionsByLocale = (template.sectionsByLocale ?? {}) as Record<string, unknown[]>;
      const available = (template.availableLocales ?? []) as string[];

      // Pick a locale that the template actually ships content for.
      const preferred = input.locale ?? profile.locale;
      const locale =
        (preferred && available.includes(preferred) && sectionsByLocale[preferred]?.length
          ? preferred
          : null) ??
        (available.includes("de-CH") && sectionsByLocale["de-CH"]?.length ? "de-CH" : null) ??
        (available.includes("en") && sectionsByLocale["en"]?.length ? "en" : null) ??
        available.find((l) => sectionsByLocale[l]?.length) ??
        null;

      const rawSections = locale ? sectionsByLocale[locale] : undefined;
      if (!rawSections || rawSections.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This template has no ready-made content yet.",
        });
      }

      // Validate against the composition schema so we never persist a malformed version.
      const parsed = landingPageCompositionSchema.safeParse({
        title: profile.businessName,
        locale,
        sections: rawSections,
      });
      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Template content failed validation.",
        });
      }

      const landingPageId = crypto.randomUUID();
      const baseSlug = slugify(profile.businessName);

      await db.insert(landingPages).values({
        id: landingPageId,
        tenantId,
        slug: `${baseSlug}-${landingPageId.slice(0, 8)}`,
        title: profile.businessName,
        themeKey: template.themeKey ?? null,
        locale: locale ?? profile.locale,
        status: "draft",
        stepData: { templateKey: input.templateKey, usedAsIs: true },
      });

      const [version] = await db
        .insert(landingPageVersions)
        .values({
          landingPageId,
          tenantId,
          version: 1,
          composition: parsed.data,
          createdBy: userId,
        })
        .returning({ id: landingPageVersions.id });

      await db
        .update(landingPages)
        .set({ currentVersionId: version!.id, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, landingPageId)));

      await db.insert(outbox).values({
        tenantId,
        type: "content.draft.created",
        payload: { landingPageId, versionId: version!.id, tenantId },
      });

      return { landingPageId };
    }),

  // LP-4: Generate from the conversational wizard. Accepts the full wizard payload
  // (locale, vertical, goal, template, palette, font pair, vibe sliders, brief,
  // image strategy). Stored on the landing_pages row as stepData.wizardPayload and
  // theme_key. The personalize step in the worker reads these to write copy that
  // matches the chosen palette/font/vibe instead of generic AI output.
  generateFromWizard: tenantProcedure
    .input(
      z.object({
        landingPageId: z.string().uuid().optional(),
        locale: landingPageLocaleEnum,
        locales: z
          .array(landingPageLocaleEnum)
          .min(1)
          .max(LANDING_PAGE_LOCALE_KEYS.length)
          .optional(),
        defaultLocale: landingPageLocaleEnum.optional(),
        // Free-text vertical: one of the presets OR a custom industry the user typed.
        // The worker passes this straight into the prompts, so any industry works.
        vertical: z.string().min(2).max(60),
        // One or more goals. The page can pursue several objectives at once.
        goals: z
          .array(
            z.enum([
              "lead_capture",
              "sales_promo",
              "event_signup",
              "appointment_booking",
              "info_brochure",
            ]),
          )
          .min(1)
          .max(5),
        siteMode: z.enum(["website", "campaign"]).default("website"),
        // Optional: omit to let the AI design the page from scratch (no template).
        templateKey: z.string().min(1).max(120).optional(),
        paletteKey: z.string().min(1).max(60),
        fontPairKey: z.string().min(1).max(60),
        vibe: z.object({
          minimalBold: z.number().min(-1).max(1),
          classicModern: z.number().min(-1).max(1),
          calmEnergetic: z.number().min(-1).max(1),
        }),
        brief: z.string().min(10).max(1000),
        imageStrategy: z.enum(["curated", "ai"]).default("curated"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [profile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      if (!profile) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Complete your business profile before generating a landing page.",
        });
      }

      // Fetch template sections + theme/image bundle — only when a template was chosen.
      // When omitted, the worker designs the page from scratch (default section set,
      // copy driven entirely by the brief + vibe + goals).
      let template:
        | {
            defaultSections: unknown;
            defaultBrandHints: unknown;
            sectionsByLocale: unknown;
            imageBundleKey: string | null;
          }
        | undefined;
      if (input.templateKey) {
        const [row] = await db
          .select({
            defaultSections: landingPageTemplates.defaultSections,
            defaultBrandHints: landingPageTemplates.defaultBrandHints,
            sectionsByLocale: landingPageTemplates.sectionsByLocale,
            imageBundleKey: landingPageTemplates.imageBundleKey,
          })
          .from(landingPageTemplates)
          .where(eq(landingPageTemplates.key, input.templateKey));
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Selected template not found." });
        }
        template = row;
      }

      const landingPageId = input.landingPageId ?? crypto.randomUUID();
      const baseSlug = slugify(profile.businessName);
      const primaryGoal = input.goals[0]!;
      const languagePreferences = normalizedLanguagePreferences({
        locales: input.locales,
        defaultLocale: input.defaultLocale ?? input.locale,
        fallbackLocale: input.locale,
      });
      const estimatedCostCents = input.imageStrategy === "ai" ? 80 : 50;

      // stepData carries everything the worker needs. Template fields are only seeded
      // when a template was chosen; otherwise the worker free-forms from the wizard payload.
      const initialStepData: Record<string, unknown> = {
        generationControl: {
          state: "running",
          requestedAt: new Date().toISOString(),
        },
        languagePreferences,
        wizardPayload: {
          paletteKey: input.paletteKey,
          fontPairKey: input.fontPairKey,
          languagePreferences,
          vibe: input.vibe,
          brief: input.brief,
          imageStrategy: input.imageStrategy,
          siteMode: input.siteMode,
          goal: primaryGoal,
          goals: input.goals,
          vertical: input.vertical,
        },
      };
      if (template) {
        initialStepData["templateKey"] = input.templateKey;
        initialStepData["templateSections"] = template.defaultSections;
        initialStepData["templateBrandHints"] = template.defaultBrandHints;
        initialStepData["sectionsByLocale"] = template.sectionsByLocale;
        initialStepData["imageBundleKey"] = template.imageBundleKey;
      }

      await assertLandingGenerationBudgetAvailable(tenantId, estimatedCostCents);

      await db.insert(landingPages).values({
        id: landingPageId,
        tenantId,
        slug: `${baseSlug}-${landingPageId.slice(0, 8)}`,
        title: `${profile.businessName} — ${primaryGoal.replace("_", " ")}`,
        locale: languagePreferences.defaultLocale,
        themeKey: input.paletteKey,
        stepData: initialStepData,
      });

      try {
        await enqueueLandingPageFlow({
          tenantId,
          landingPageId,
          userId,
          businessName: profile.businessName,
          vertical: input.vertical,
          city: profile.addressCity ?? undefined,
          locale: languagePreferences.defaultLocale,
          languagePreferences,
          userPrompt: input.brief,
          templateKey: input.templateKey,
          costBudgetCents: estimatedCostCents,
        });
      } catch (err) {
        // Clean up the DB record so the tenant can retry.
        await db.delete(landingPages).where(eq(landingPages.id, landingPageId)).catch(() => null);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Could not queue the generation job (Redis unreachable). Please check your REDIS_URL environment variable in Vercel and try again.",
          cause: err,
        });
      }

      return { landingPageId };
    }),

  // Poll the status of a landing page (used by the dashboard status badge).
  getPage: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [page] = await db
        .select({
          id: landingPages.id,
          slug: landingPages.slug,
          title: landingPages.title,
          status: landingPages.status,
          publishedVersionId: landingPages.publishedVersionId,
          currentVersionId: landingPages.currentVersionId,
          themeKey: landingPages.themeKey,
          metaTitle: landingPages.metaTitle,
          metaDescription: landingPages.metaDescription,
          ogImageUrl: landingPages.ogImageUrl,
          noindex: landingPages.noindex,
          stepData: landingPages.stepData,
          publishedAt: landingPages.publishedAt,
          createdAt: landingPages.createdAt,
          updatedAt: landingPages.updatedAt,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page) return null;

      return {
        ...page,
        generationState: getLandingGenerationState({
          status: page.status,
          currentVersionId: page.currentVersionId,
          stepData: (page.stepData as Record<string, unknown> | null) ?? null,
        }),
        generationError: getLandingGenerationError(
          (page.stepData as Record<string, unknown> | null) ?? null,
        ),
      };
    }),

  // List all pages for the tenant (newest first, limit 50). Includes tenantSlug for building public URLs.
  // Also includes the tenant's primary custom domain (if any) so the UI can show
  // canonical URLs at the user's own hostname rather than the platform fallback.
  listPages: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;

    const [tenant] = await db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    const [primaryDomainRow] = await db
      .select({ hostname: customDomains.hostname })
      .from(customDomains)
      .where(
        and(
          eq(customDomains.tenantId, tenantId),
          eq(customDomains.isPrimary, true),
          eq(customDomains.status, "live"),
        ),
      )
      .limit(1);

    const pages = await db
      .select({
        id: landingPages.id,
        slug: landingPages.slug,
        title: landingPages.title,
        status: landingPages.status,
        currentVersionId: landingPages.currentVersionId,
        stepData: landingPages.stepData,
        publishedAt: landingPages.publishedAt,
        createdAt: landingPages.createdAt,
      })
      .from(landingPages)
      .where(eq(landingPages.tenantId, tenantId))
      .orderBy(desc(landingPages.createdAt))
      .limit(50);

    return {
      pages: pages.map((page) => ({
        ...page,
        generationState: getLandingGenerationState({
          status: page.status,
          currentVersionId: page.currentVersionId,
          stepData: (page.stepData as Record<string, unknown> | null) ?? null,
        }),
        generationError: getLandingGenerationError(
          (page.stepData as Record<string, unknown> | null) ?? null,
        ),
      })),
      tenantSlug: tenant?.slug ?? "",
      primaryDomain: primaryDomainRow?.hostname ?? null,
    };
  }),

  pauseGeneration: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [page] = await db
        .select({
          id: landingPages.id,
          status: landingPages.status,
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });
      if (page.currentVersionId || page.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only in-progress drafts can be paused.",
        });
      }

      const stepData = { ...((page.stepData as Record<string, unknown> | null) ?? {}) };
      await db
        .update(landingPages)
        .set({
          stepData: {
            ...stepData,
            generationControl: {
              state: "paused",
              pausedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      await removeLandingPageFlowJobs(input.pageId).catch(() => null);

      return { paused: true };
    }),

  // Return the composition JSON for a page's current version (used for preview).
  getComposition: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [page] = await db
        .select({ currentVersionId: landingPages.currentVersionId, title: landingPages.title })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page?.currentVersionId) return null;

      const [version] = await db
        .select({ composition: landingPageVersions.composition })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );

      return version ? { composition: version.composition, title: page.title } : null;
    }),

  getVersionHistory: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [page] = await db
        .select({
          currentVersionId: landingPages.currentVersionId,
          publishedVersionId: landingPages.publishedVersionId,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });

      const versions = await db
        .select({
          id: landingPageVersions.id,
          version: landingPageVersions.version,
          createdAt: landingPageVersions.createdAt,
        })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.landingPageId, input.pageId),
          ),
        )
        .orderBy(asc(landingPageVersions.version), asc(landingPageVersions.createdAt));

      const currentIndex = versions.findIndex((v) => v.id === page.currentVersionId);
      const originalVersionId = versions[0]?.id ?? null;

      return {
        versions: versions.map((v) => ({
          ...v,
          isCurrent: v.id === page.currentVersionId,
          isPublished: v.id === page.publishedVersionId,
          isOriginal: v.id === originalVersionId,
        })),
        currentVersionId: page.currentVersionId,
        originalVersionId,
        canUndo: currentIndex > 0,
        canRedo: currentIndex >= 0 && currentIndex < versions.length - 1,
      };
    }),

  restoreVersion: tenantProcedure
    .input(z.object({ pageId: z.string().uuid(), versionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [version] = await db
        .select({ id: landingPageVersions.id, version: landingPageVersions.version })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.landingPageId, input.pageId),
            eq(landingPageVersions.id, input.versionId),
          ),
        );

      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });

      await db
        .update(landingPages)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { versionId: version.id, version: version.version };
    }),

  undo: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [page] = await db
        .select({
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Page has no version history." });

      const versions = await db
        .select({ id: landingPageVersions.id, version: landingPageVersions.version })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.landingPageId, input.pageId),
          ),
        )
        .orderBy(asc(landingPageVersions.version), asc(landingPageVersions.createdAt));

      const currentIndex = versions.findIndex((v) => v.id === page.currentVersionId);
      const target = currentIndex > 0 ? versions[currentIndex - 1] : null;
      if (!target) return { versionId: page.currentVersionId, canUndo: false };

      await db
        .update(landingPages)
        .set({ currentVersionId: target.id, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { versionId: target.id, version: target.version, canUndo: currentIndex - 1 > 0 };
    }),

  redo: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [page] = await db
        .select({
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Page has no version history." });

      const versions = await db
        .select({ id: landingPageVersions.id, version: landingPageVersions.version })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.landingPageId, input.pageId),
          ),
        )
        .orderBy(asc(landingPageVersions.version), asc(landingPageVersions.createdAt));

      const currentIndex = versions.findIndex((v) => v.id === page.currentVersionId);
      const target = currentIndex >= 0 ? versions[currentIndex + 1] : null;
      if (!target) return { versionId: page.currentVersionId, canRedo: false };

      await db
        .update(landingPages)
        .set({ currentVersionId: target.id, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return {
        versionId: target.id,
        version: target.version,
        canRedo: currentIndex + 1 < versions.length - 1,
      };
    }),

  restoreOriginal: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [original] = await db
        .select({ id: landingPageVersions.id, version: landingPageVersions.version })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.landingPageId, input.pageId),
          ),
        )
        .orderBy(asc(landingPageVersions.version), asc(landingPageVersions.createdAt))
        .limit(1);

      if (!original)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Page has no original version." });

      await db
        .update(landingPages)
        .set({ currentVersionId: original.id, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { versionId: original.id, version: original.version };
    }),

  // Hard-delete a landing page (cascades to versions and views; unlinks forms).
  deletePage: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [page] = await db
        .select({
          id: landingPages.id,
          status: landingPages.status,
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });

      const isGeneratingDraft = page.status === "draft" && !page.currentVersionId;
      if (isGeneratingDraft) {
        const stepData = { ...((page.stepData as Record<string, unknown> | null) ?? {}) };
        await db
          .update(landingPages)
          .set({
            stepData: {
              ...stepData,
              generationControl: {
                state: "cancelled",
                cancelledAt: new Date().toISOString(),
              },
            },
            updatedAt: new Date(),
          })
          .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

        await removeLandingPageFlowJobs(input.pageId).catch(() => null);
      }

      await db
        .delete(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { deleted: true };
    }),

  // Publish: create a new version row + flip status to published.
  publish: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [page] = await db
        .select()
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });
      }
      if (!page.currentVersionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Page generation is not complete yet.",
        });
      }

      // Read the current (draft) version to copy its composition.
      const [currentVersion] = await db
        .select()
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );

      if (!currentVersion) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
      }

      const newVersion = await insertDraftVersion({
        tenantId,
        userId,
        pageId: input.pageId,
        composition: currentVersion.composition as LandingPageComposition,
      });

      await db
        .update(landingPages)
        .set({
          status: "published",
          currentVersionId: newVersion.id,
          publishedVersionId: newVersion.id,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      await db.insert(outbox).values({
        tenantId,
        type: "landing.published",
        payload: {
          landingPageId: input.pageId,
          versionId: newVersion.id,
          version: newVersion.version,
          tenantId,
        },
      });

      return { versionId: newVersion.id, version: newVersion.version };
    }),

  // Update SEO fields for a landing page (meta title, description, OG image, noindex).
  updateSeo: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        metaTitle: z.string().max(120).optional().nullable(),
        metaDescription: z.string().max(300).optional().nullable(),
        ogImageUrl: z.string().url().optional().nullable(),
        noindex: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [page] = await db
        .select({ id: landingPages.id })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page) throw new TRPCError({ code: "NOT_FOUND" });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.metaTitle !== undefined) patch.metaTitle = input.metaTitle;
      if (input.metaDescription !== undefined) patch.metaDescription = input.metaDescription;
      if (input.ogImageUrl !== undefined) patch.ogImageUrl = input.ogImageUrl;
      if (input.noindex !== undefined) patch.noindex = input.noindex;

      await db
        .update(landingPages)
        .set(patch)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { saved: true };
    }),

  // Save an inline section edit. Creates a new draft version; does NOT touch publishedVersionId.
  // The live public page is unaffected until the user explicitly publishes.
  editSection: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        sectionIndex: z.number().int().min(0),
        heading: z.string().min(1).max(200).optional(),
        body: z.string().max(2000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [page] = await db
        .select({
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page?.currentVersionId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Page has no version to edit." });
      }

      const [version] = await db
        .select({
          composition: landingPageVersions.composition,
          version: landingPageVersions.version,
        })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );

      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      const sections = [...composition.sections];

      if (input.sectionIndex >= sections.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Section index out of range." });
      }

      sections[input.sectionIndex] = {
        ...sections[input.sectionIndex]!,
        ...(input.heading !== undefined ? { heading: input.heading } : {}),
        ...(input.body !== undefined ? { body: input.body ?? undefined } : {}),
      };

      const newComposition: LandingPageComposition = { ...composition, sections };
      const localizedStepData = mapLocalizedCompositions(
        (page.stepData as Record<string, unknown> | null) ?? null,
        (localized) =>
          mapSectionByIndex(localized, input.sectionIndex, (section) => ({
            ...section,
            ...(input.heading !== undefined ? { heading: input.heading } : {}),
            ...(input.body !== undefined ? { body: input.body ?? undefined } : {}),
          })),
      );

      const newVer = await insertDraftVersion({
        tenantId,
        userId,
        pageId: input.pageId,
        composition: newComposition,
      });

      await db
        .update(landingPages)
        .set({
          currentVersionId: newVer.id,
          ...(localizedStepData ? { stepData: localizedStepData } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { versionId: newVer.id };
    }),

  // Regenerate a single section using AI (Haiku, synchronous ~1-2s).
  // Returns a suggestion for the user to review; does NOT save until they accept.
  regenerateSection: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        sectionIndex: z.number().int().min(0),
        instruction: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [page] = await db
        .select({ currentVersionId: landingPages.currentVersionId, title: landingPages.title })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({ composition: landingPageVersions.composition })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );

      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      const section = composition.sections[input.sectionIndex];
      if (!section)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Section index out of range." });

      const [profile] = await db
        .select({ locale: businessProfiles.locale })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const locale = profile?.locale ?? "de-CH";
      const promptId =
        locale === "it-CH"
          ? "landing-page-section-regen-it-v1"
          : locale === "en"
            ? "landing-page-section-regen-en-v1"
            : locale === "fr-CH"
              ? "landing-page-section-regen-fr-v1"
              : "landing-page-section-regen-v1";

      const prompt = getPrompt(promptId);
      const userPrompt = prompt.buildUserPrompt({
        pageTitle: page.title,
        sectionType: section.type,
        currentHeading: section.heading,
        currentBody: section.body ?? "",
        instruction: input.instruction ?? "",
      });

      const REWRITE_TOOL = {
        name: "rewrite_section",
        description: "Return the rewritten section heading and body",
        inputSchema: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
          },
          required: ["heading"],
        },
      };

      const provider = createAnthropicHaiku();
      const result = await provider.completionWithTools!(
        { prompt: userPrompt, systemPrompt: prompt.systemPrompt, maxTokens: 600, temperature: 0.5 },
        [REWRITE_TOOL],
        { tenantId, jobId: crypto.randomUUID(), promptId, promptVersion: 1, costBudgetCents: 10 },
      );

      const suggestion = result.toolResult as { heading?: string; body?: string } | null;

      return {
        heading: suggestion?.heading ?? section.heading,
        body: suggestion?.body ?? section.body ?? "",
      };
    }),

  // LP-5: Swap a section's variant key (e.g., hero.centered → hero.split-image-right).
  // Creates a new version so it's reversible via history.
  swapVariant: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        sectionIndex: z.number().int().min(0),
        variant: z.string().min(1).max(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;
      const [page] = await db
        .select({
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({
          composition: landingPageVersions.composition,
          version: landingPageVersions.version,
        })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      const sections = [...composition.sections];
      if (input.sectionIndex >= sections.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Section index out of range." });
      }
      sections[input.sectionIndex] = { ...sections[input.sectionIndex]!, variant: input.variant };
      const newComposition: LandingPageComposition = { ...composition, sections };
      const localizedStepData = mapLocalizedCompositions(
        (page.stepData as Record<string, unknown> | null) ?? null,
        (localized) =>
          mapSectionByIndex(localized, input.sectionIndex, (section) => ({
            ...section,
            variant: input.variant,
          })),
      );

      const newVer = await insertDraftVersion({
        tenantId,
        userId,
        pageId: input.pageId,
        composition: newComposition,
      });

      await db
        .update(landingPages)
        .set({
          currentVersionId: newVer.id,
          ...(localizedStepData ? { stepData: localizedStepData } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      return { versionId: newVer.id };
    }),

  // LP-5: Reorder sections — caller sends the full ordered list of indices.
  // We reassign `order` 0..n-1 in the new sequence.
  reorderSections: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        newOrder: z.array(z.number().int().min(0)).min(1).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;
      const [page] = await db
        .select({
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({
          composition: landingPageVersions.composition,
          version: landingPageVersions.version,
        })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      if (input.newOrder.length !== composition.sections.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reorder length mismatch." });
      }
      const reordered = input.newOrder.map((oldIdx, newIdx) => {
        const src = composition.sections[oldIdx];
        if (!src)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid index in reorder." });
        return { ...src, order: newIdx };
      });
      const newComposition: LandingPageComposition = { ...composition, sections: reordered };
      const localizedStepData = mapLocalizedCompositions(
        (page.stepData as Record<string, unknown> | null) ?? null,
        (localized) => reorderCompositionSections(localized, input.newOrder),
      );

      const newVer = await insertDraftVersion({
        tenantId,
        userId,
        pageId: input.pageId,
        composition: newComposition,
      });
      await db
        .update(landingPages)
        .set({
          currentVersionId: newVer.id,
          ...(localizedStepData ? { stepData: localizedStepData } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      return { versionId: newVer.id };
    }),

  // LP-5 follow-up: Swap an image inside a section's extras.
  // Supports the most common image fields via a `target` string:
  //   - "background"          → hero.extras.backgroundImageUrl
  //   - "gallery.<idx>"       → gallery.extras.images[idx].url
  //   - "testimonial.<idx>"   → testimonials.extras.items[idx].avatarUrl
  //   - "team.<idx>"          → about.extras.teamMembers[idx].photoUrl
  //   - "menu.<idx>"          → menu_preview.extras.items[idx].imageUrl
  swapSectionImage: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        sectionIndex: z.number().int().min(0),
        target: z.string().min(1).max(50),
        url: z.string().url().max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;
      const [page] = await db
        .select({
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({
          composition: landingPageVersions.composition,
          version: landingPageVersions.version,
        })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      const sections = [...composition.sections];
      const section = sections[input.sectionIndex];
      if (!section)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Section index out of range." });

      // Mutate extras by target path. Cast to flexible shape; schema validation runs at write time.
      const extras = {
        ...((section.extras as Record<string, unknown> | undefined) ?? {}),
      } as Record<string, unknown>;

      if (input.target === "background") {
        extras["backgroundImageUrl"] = input.url;
        const images = [
          ...((extras["images"] as Array<{ url: string; caption?: string }> | undefined) ?? []),
        ];
        if (!images.some((image) => image.url === input.url)) {
          extras["images"] = [{ url: input.url }, ...images].slice(0, 12);
        }
      } else if (input.target === "about") {
        extras["imageUrl"] = input.url;
      } else if (input.target === "heroCarousel.add") {
        const images = [
          ...((extras["images"] as Array<{ url: string; caption?: string }> | undefined) ?? []),
        ];
        if (!images.some((image) => image.url === input.url)) images.push({ url: input.url });
        extras["images"] = images.slice(0, 12);
        extras["backgroundImageUrl"] =
          (extras["backgroundImageUrl"] as string | undefined) ?? input.url;
      } else if (input.target.startsWith("heroCarousel.")) {
        const idx = parseInt(input.target.slice("heroCarousel.".length), 10);
        const images = [
          ...((extras["images"] as Array<{ url: string; caption?: string }> | undefined) ?? []),
        ];
        if (Number.isNaN(idx) || idx < 0 || idx >= images.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Hero carousel index out of range.",
          });
        }
        images[idx] = { ...images[idx]!, url: input.url };
        extras["images"] = images;
        extras["backgroundImageUrl"] =
          (extras["backgroundImageUrl"] as string | undefined) ?? input.url;
      } else if (input.target === "gallery.add") {
        const images = [
          ...((extras["images"] as Array<{ url: string; caption?: string }> | undefined) ?? []),
        ];
        images.push({ url: input.url });
        extras["images"] = images.slice(0, 12);
      } else if (input.target.startsWith("gallery.")) {
        const idx = parseInt(input.target.slice("gallery.".length), 10);
        const images = [
          ...((extras["images"] as Array<{ url: string; caption?: string }> | undefined) ?? []),
        ];
        if (Number.isNaN(idx) || idx < 0 || idx >= images.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Gallery index out of range." });
        }
        images[idx] = { ...images[idx]!, url: input.url };
        extras["images"] = images;
      } else if (input.target.startsWith("testimonial.")) {
        const idx = parseInt(input.target.slice("testimonial.".length), 10);
        const items = [...((extras["items"] as Array<Record<string, unknown>> | undefined) ?? [])];
        if (Number.isNaN(idx) || idx < 0 || idx >= items.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Testimonial index out of range." });
        }
        items[idx] = { ...items[idx]!, avatarUrl: input.url };
        extras["items"] = items;
      } else if (input.target.startsWith("team.")) {
        const idx = parseInt(input.target.slice("team.".length), 10);
        const members = [
          ...((extras["teamMembers"] as Array<Record<string, unknown>> | undefined) ?? []),
        ];
        if (Number.isNaN(idx) || idx < 0 || idx >= members.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Team member index out of range." });
        }
        members[idx] = { ...members[idx]!, photoUrl: input.url };
        extras["teamMembers"] = members;
      } else if (input.target.startsWith("menu.")) {
        const idx = parseInt(input.target.slice("menu.".length), 10);
        const items = [...((extras["items"] as Array<Record<string, unknown>> | undefined) ?? [])];
        if (Number.isNaN(idx) || idx < 0 || idx >= items.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Menu item index out of range." });
        }
        items[idx] = { ...items[idx]!, imageUrl: input.url };
        extras["items"] = items;
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown image target: ${input.target}`,
        });
      }

      sections[input.sectionIndex] = { ...section, extras: extras as never };
      const newComposition: LandingPageComposition = { ...composition, sections };
      const localizedStepData = mapLocalizedCompositions(
        (page.stepData as Record<string, unknown> | null) ?? null,
        (localized) =>
          mapSectionByIndex(localized, input.sectionIndex, (localizedSection) => ({
            ...localizedSection,
            extras: extras as never,
          })),
      );

      const newVer = await insertDraftVersion({
        tenantId,
        userId,
        pageId: input.pageId,
        composition: newComposition,
      });
      await db
        .update(landingPages)
        .set({
          currentVersionId: newVer.id,
          ...(localizedStepData ? { stepData: localizedStepData } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      return { versionId: newVer.id };
    }),

  updateSectionCarousel: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        sectionIndex: z.number().int().min(0),
        settings: carouselSettingsInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [page] = await db
        .select({
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({ composition: landingPageVersions.composition })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      const sections = [...composition.sections];
      const section = sections[input.sectionIndex];
      if (!section)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Section index out of range." });
      if (section.type !== "hero" && section.type !== "gallery") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Carousel settings are only available for hero and gallery sections.",
        });
      }

      const extras = { ...((section.extras as Record<string, unknown> | undefined) ?? {}) };
      extras["carousel"] = {
        ...((extras["carousel"] as Record<string, unknown> | undefined) ?? {}),
        ...input.settings,
      };
      sections[input.sectionIndex] = { ...section, extras: extras as never };
      const newComposition: LandingPageComposition = { ...composition, sections };
      const localizedStepData = mapLocalizedCompositions(
        (page.stepData as Record<string, unknown> | null) ?? null,
        (localized) =>
          mapSectionByIndex(localized, input.sectionIndex, (localizedSection) => ({
            ...localizedSection,
            extras: {
              ...((localizedSection.extras as Record<string, unknown> | undefined) ?? {}),
              carousel: extras["carousel"],
            } as never,
          })),
      );

      const newVer = await insertDraftVersion({
        tenantId,
        userId,
        pageId: input.pageId,
        composition: newComposition,
      });
      await db
        .update(landingPages)
        .set({
          currentVersionId: newVer.id,
          ...(localizedStepData ? { stepData: localizedStepData } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { versionId: newVer.id };
    }),

  updateContactLocation: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        sectionIndex: z.number().int().min(0),
        address: z.string().min(1).max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;
      const [page] = await db
        .select({
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({ composition: landingPageVersions.composition })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      const section = composition.sections[input.sectionIndex];
      if (!section || section.type !== "contact") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Contact section not found." });
      }

      const mapEmbedUrl = mapEmbedUrlForAddress(input.address);
      const newComposition = mapSectionByIndex(composition, input.sectionIndex, (current) => ({
        ...current,
        extras: {
          ...((current.extras as Record<string, unknown> | undefined) ?? {}),
          address: input.address,
          mapEmbedUrl,
        } as never,
      }));
      const localizedStepData = mapLocalizedCompositions(
        (page.stepData as Record<string, unknown> | null) ?? null,
        (localized) =>
          mapSectionByIndex(localized, input.sectionIndex, (current) => ({
            ...current,
            extras: {
              ...((current.extras as Record<string, unknown> | undefined) ?? {}),
              address: input.address,
              mapEmbedUrl,
            } as never,
          })),
      );

      const newVer = await insertDraftVersion({
        tenantId,
        userId,
        pageId: input.pageId,
        composition: newComposition,
      });
      await db
        .update(landingPages)
        .set({
          currentVersionId: newVer.id,
          ...(localizedStepData ? { stepData: localizedStepData } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { versionId: newVer.id };
    }),

  addSection: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        sectionType: sectionTypeInput,
        insertAfter: z.number().int().min(0).optional().nullable(),
        mode: z.enum(["manual", "ai"]).default("manual"),
        instruction: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;
      const [page] = await db
        .select({
          title: landingPages.title,
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({ composition: landingPageVersions.composition })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      if (composition.sections.length >= 8) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A page can have up to 8 sections.",
        });
      }

      let section = defaultSection(input.sectionType, composition.sections.length);
      if (input.mode === "ai") {
        const AI_SECTION_TOOL = {
          name: "draft_landing_section",
          description: "Return one safe registered landing-page section.",
          inputSchema: {
            type: "object",
            properties: {
              heading: { type: "string" },
              body: { type: "string" },
              extras: { type: "object" },
            },
            required: ["heading"],
          },
        };
        try {
          const provider = createAnthropicHaiku();
          const result = await provider.completionWithTools!(
            {
              prompt: [
                `Draft a ${input.sectionType} section for the page "${composition.title || page.title}".`,
                `Existing section headings: ${composition.sections.map((item) => item.heading).join(" | ")}`,
                input.instruction ? `User instruction: ${input.instruction}` : "",
                "Use concise Swiss SME website copy. Return only visitor-facing content for the requested registered section type.",
              ]
                .filter(Boolean)
                .join("\n"),
              systemPrompt:
                "You draft content for a safe registered landing-page section. Do not return HTML, JSX, CSS, scripts, or unsupported fields.",
              maxTokens: 700,
              temperature: 0.5,
            },
            [AI_SECTION_TOOL],
            {
              tenantId,
              jobId: crypto.randomUUID(),
              promptId: "landing-page-add-section-v1",
              promptVersion: 1,
              costBudgetCents: 10,
            },
          );
          const toolResult = (result.toolResult as Record<string, unknown> | null) ?? {};
          const candidate = {
            ...section,
            ...toolResult,
            extras: {
              ...((section.extras as Record<string, unknown> | undefined) ?? {}),
              ...((toolResult.extras as Record<string, unknown> | undefined) ?? {}),
            },
            type: input.sectionType,
            order: composition.sections.length,
            variant: section.variant,
          };
          const parsed = landingPageSectionSchema.safeParse(candidate);
          if (parsed.success) section = parsed.data;
        } catch {
          // Fall back to the manual section. Adding a section should not fail because AI is down.
        }
      }

      const newComposition = insertSection(composition, section, input.insertAfter);
      const localizedStepData = mapLocalizedCompositions(
        (page.stepData as Record<string, unknown> | null) ?? null,
        (localized) => insertSection(localized, section, input.insertAfter),
      );

      const newVer = await insertDraftVersion({
        tenantId,
        userId,
        pageId: input.pageId,
        composition: newComposition,
      });
      await db
        .update(landingPages)
        .set({
          currentVersionId: newVer.id,
          ...(localizedStepData ? { stepData: localizedStepData } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { versionId: newVer.id };
    }),

  deleteSection: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        sectionIndex: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;
      const [page] = await db
        .select({
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({ composition: landingPageVersions.composition })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.id, page.currentVersionId),
          ),
        );
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      if (composition.sections.length <= 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A page needs at least 2 sections.",
        });
      }
      if (!composition.sections[input.sectionIndex]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Section index out of range." });
      }

      const newComposition = removeSection(composition, input.sectionIndex);
      const localizedStepData = mapLocalizedCompositions(
        (page.stepData as Record<string, unknown> | null) ?? null,
        (localized) => removeSection(localized, input.sectionIndex),
      );

      const newVer = await insertDraftVersion({
        tenantId,
        userId,
        pageId: input.pageId,
        composition: newComposition,
      });
      await db
        .update(landingPages)
        .set({
          currentVersionId: newVer.id,
          ...(localizedStepData ? { stepData: localizedStepData } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { versionId: newVer.id };
    }),

  updateLanguagePreferences: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        preferences: languagePreferencesInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;
      const [page] = await db
        .select({
          id: landingPages.id,
          title: landingPages.title,
          locale: landingPages.locale,
          currentVersionId: landingPages.currentVersionId,
          stepData: landingPages.stepData,
        })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });

      const [profile] = await db
        .select({
          businessName: businessProfiles.businessName,
          vertical: businessProfiles.vertical,
          city: businessProfiles.addressCity,
        })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const languagePreferences = normalizedLanguagePreferences({
        locales: input.preferences.locales,
        defaultLocale: input.preferences.defaultLocale,
        fallbackLocale: page.locale,
      });
      const stepData = { ...((page.stepData as Record<string, unknown> | null) ?? {}) };
      const needsLocalization = page.currentVersionId && languagePreferences.locales.length > 1;
      const wizardPayload = {
        ...((stepData["wizardPayload"] as Record<string, unknown> | undefined) ?? {}),
        languagePreferences,
      };

      await db
        .update(landingPages)
        .set({
          locale: languagePreferences.defaultLocale,
          stepData: {
            ...stepData,
            languagePreferences,
            wizardPayload,
            localizationStatus: needsLocalization
              ? {
                  state: "queued",
                  requestedLocales: languagePreferences.locales,
                  updatedAt: new Date().toISOString(),
                }
              : {
                  state: "idle",
                  requestedLocales: languagePreferences.locales,
                  updatedAt: new Date().toISOString(),
                },
          },
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (needsLocalization) {
        await enqueueLandingPageLocalization({
          tenantId,
          landingPageId: input.pageId,
          userId,
          businessName: profile?.businessName ?? page.title,
          vertical: profile?.vertical ?? "generic",
          city: profile?.city ?? undefined,
          locale: languagePreferences.defaultLocale,
          languagePreferences,
          userPrompt: `Localize the current generated landing page for ${profile?.businessName ?? page.title}.`,
          costBudgetCents: 50,
        });
      }

      return { languagePreferences, localizationQueued: !!needsLocalization };
    }),

  // LP-5: Update the page-level theme (palette + optional font pair). Affects the
  // public renderer's CSS variable injection immediately on next page load.
  updateTheme: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        themeKey: z.string().min(1).max(60).nullable(),
        fontPairKey: z.string().min(1).max(60).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [page] = await db
        .select({ id: landingPages.id })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .update(landingPages)
        .set({ themeKey: input.themeKey, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      // fontPairKey is stored in stepData.themeFontPair for now (no dedicated column).
      if (input.fontPairKey !== undefined) {
        await db
          .update(landingPages)
          .set({
            stepData: sql`COALESCE(${landingPages.stepData}, '{}'::jsonb) || ${JSON.stringify({ themeFontPair: input.fontPairKey })}::jsonb`,
          })
          .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      }
      return { ok: true };
    }),
});
