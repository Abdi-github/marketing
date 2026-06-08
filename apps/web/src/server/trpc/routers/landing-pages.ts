// tRPC router for landing pages.
// Enqueues the FlowProducer job graph and exposes polling + publish procedures.
// See docs/WORKFLOWS.md §Landing page.
import { createAnthropicHaiku, getPrompt, landingPageCompositionSchema } from "@marketing/ai-router";
import { db } from "@marketing/db";
import {
  landingPages,
  landingPageVersions,
  landingPageTemplates,
  businessProfiles,
  customDomains,
  outbox,
  tenants,
} from "@marketing/db";
import { TRPCError } from "@trpc/server";
import { and, eq, desc, sql } from "drizzle-orm";
import type { LandingPageComposition } from "@marketing/ai-router";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";
import { enqueueLandingPageFlow } from "../../queues/landing-page";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export const landingPagesRouter = router({
  // List active platform templates with v2 fields (LP-2): theme, image bundle, goal,
  // per-locale sections, per-locale-per-device screenshots, Swiss flag.
  listTemplates: tenantProcedure
    .input(
      z
        .object({
          vertical: z.string().optional(),
          goal: z.enum(["lead_capture", "sales_promo", "event_signup", "appointment_booking", "info_brochure"]).optional(),
          swissOnly: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const conditions = [sql`${landingPageTemplates.isActive} = true`];
      if (input?.vertical) {
        conditions.push(eq(landingPageTemplates.vertical, input.vertical as "cafe" | "restaurant" | "fitness" | "clinic" | "retail" | "service" | "generic"));
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
          message: "Describe your business (at least 10 characters) to generate a page from scratch.",
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
        (preferred && available.includes(preferred) && sectionsByLocale[preferred]?.length ? preferred : null) ??
        (available.includes("de-CH") && sectionsByLocale["de-CH"]?.length ? "de-CH" : null) ??
        (available.includes("en") && sectionsByLocale["en"]?.length ? "en" : null) ??
        available.find((l) => sectionsByLocale[l]?.length) ??
        null;

      const rawSections = locale ? sectionsByLocale[locale] : undefined;
      if (!rawSections || rawSections.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This template has no ready-made content yet." });
      }

      // Validate against the composition schema so we never persist a malformed version.
      const parsed = landingPageCompositionSchema.safeParse({
        title: profile.businessName,
        locale,
        sections: rawSections,
      });
      if (!parsed.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Template content failed validation." });
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
        locale: z.enum(["de-CH", "fr-CH", "it-CH", "en"]),
        vertical: z.enum(["cafe", "restaurant", "fitness", "clinic", "retail", "service"]),
        goal: z.enum(["lead_capture", "sales_promo", "event_signup", "appointment_booking", "info_brochure"]),
        templateKey: z.string().min(1).max(120),
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

      // Fetch template sections + theme/image bundle from the chosen template.
      const [template] = await db
        .select({
          defaultSections: landingPageTemplates.defaultSections,
          defaultBrandHints: landingPageTemplates.defaultBrandHints,
          sectionsByLocale: landingPageTemplates.sectionsByLocale,
          imageBundleKey: landingPageTemplates.imageBundleKey,
        })
        .from(landingPageTemplates)
        .where(eq(landingPageTemplates.key, input.templateKey));

      if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Selected template not found." });
      }

      const landingPageId = crypto.randomUUID();
      const baseSlug = slugify(profile.businessName);

      // stepData carries everything the worker needs to personalize the template.
      const initialStepData: Record<string, unknown> = {
        templateKey: input.templateKey,
        templateSections: template.defaultSections,
        templateBrandHints: template.defaultBrandHints,
        sectionsByLocale: template.sectionsByLocale,
        imageBundleKey: template.imageBundleKey,
        wizardPayload: {
          paletteKey: input.paletteKey,
          fontPairKey: input.fontPairKey,
          vibe: input.vibe,
          brief: input.brief,
          imageStrategy: input.imageStrategy,
          goal: input.goal,
        },
      };

      await db.insert(landingPages).values({
        id: landingPageId,
        tenantId,
        slug: `${baseSlug}-${landingPageId.slice(0, 8)}`,
        title: `${profile.businessName} — ${input.goal.replace("_", " ")}`,
        locale: input.locale,
        themeKey: input.paletteKey,
        stepData: initialStepData,
      });

      await enqueueLandingPageFlow({
        tenantId,
        landingPageId,
        userId,
        businessName: profile.businessName,
        vertical: input.vertical,
        city: profile.addressCity ?? undefined,
        locale: input.locale,
        userPrompt: input.brief,
        templateKey: input.templateKey,
        costBudgetCents: input.imageStrategy === "ai" ? 80 : 50,
      });

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
          currentVersionId: landingPages.currentVersionId,
          publishedAt: landingPages.publishedAt,
          createdAt: landingPages.createdAt,
          updatedAt: landingPages.updatedAt,
        })
        .from(landingPages)
        .where(
          and(
            eq(landingPages.tenantId, tenantId),
            eq(landingPages.id, input.pageId),
          ),
        );

      return page ?? null;
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
      .where(and(eq(customDomains.tenantId, tenantId), eq(customDomains.isPrimary, true), eq(customDomains.status, "live")))
      .limit(1);

    const pages = await db
      .select({
        id: landingPages.id,
        slug: landingPages.slug,
        title: landingPages.title,
        status: landingPages.status,
        currentVersionId: landingPages.currentVersionId,
        publishedAt: landingPages.publishedAt,
        createdAt: landingPages.createdAt,
      })
      .from(landingPages)
      .where(eq(landingPages.tenantId, tenantId))
      .orderBy(desc(landingPages.createdAt))
      .limit(50);

    return {
      pages,
      tenantSlug: tenant?.slug ?? "",
      primaryDomain: primaryDomainRow?.hostname ?? null,
    };
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

  // Hard-delete a landing page (cascades to versions and views; unlinks forms).
  deletePage: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [page] = await db
        .select({ id: landingPages.id })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });

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
        .where(
          and(
            eq(landingPages.tenantId, tenantId),
            eq(landingPages.id, input.pageId),
          ),
        );

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

      // Find the highest existing version number for this page.
      const versions = await db
        .select({ version: landingPageVersions.version })
        .from(landingPageVersions)
        .where(eq(landingPageVersions.landingPageId, input.pageId))
        .orderBy(desc(landingPageVersions.version))
        .limit(1);

      const nextVersion = (versions[0]?.version ?? 0) + 1;

      const [newVersion] = await db
        .insert(landingPageVersions)
        .values({
          landingPageId: input.pageId,
          tenantId,
          version: nextVersion,
          composition: currentVersion.composition,
          createdBy: userId,
        })
        .returning({ id: landingPageVersions.id });

      await db
        .update(landingPages)
        .set({
          status: "published",
          currentVersionId: newVersion!.id,
          publishedVersionId: newVersion!.id,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(landingPages.tenantId, tenantId),
            eq(landingPages.id, input.pageId),
          ),
        );

      await db.insert(outbox).values({
        tenantId,
        type: "landing.published",
        payload: {
          landingPageId: input.pageId,
          versionId: newVersion!.id,
          version: nextVersion,
          tenantId,
        },
      });

      return { versionId: newVersion!.id, version: nextVersion };
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

      await db.update(landingPages).set(patch)
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
        .select({ currentVersionId: landingPages.currentVersionId })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page?.currentVersionId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Page has no version to edit." });
      }

      const [version] = await db
        .select({ composition: landingPageVersions.composition, version: landingPageVersions.version })
        .from(landingPageVersions)
        .where(and(eq(landingPageVersions.tenantId, tenantId), eq(landingPageVersions.id, page.currentVersionId)));

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

      const [newVer] = await db
        .insert(landingPageVersions)
        .values({
          landingPageId: input.pageId,
          tenantId,
          version: version.version + 1,
          composition: newComposition,
          createdBy: userId,
        })
        .returning({ id: landingPageVersions.id });

      await db.update(landingPages)
        .set({ currentVersionId: newVer!.id, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      return { versionId: newVer!.id };
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
        .where(and(eq(landingPageVersions.tenantId, tenantId), eq(landingPageVersions.id, page.currentVersionId)));

      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      const section = composition.sections[input.sectionIndex];
      if (!section) throw new TRPCError({ code: "BAD_REQUEST", message: "Section index out of range." });

      const [profile] = await db
        .select({ locale: businessProfiles.locale })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const locale = profile?.locale ?? "de-CH";
      const promptId =
        locale === "it-CH" ? "landing-page-section-regen-it-v1"
        : locale === "en" ? "landing-page-section-regen-en-v1"
        : locale === "fr-CH" ? "landing-page-section-regen-fr-v1"
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
        .select({ currentVersionId: landingPages.currentVersionId })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({ composition: landingPageVersions.composition, version: landingPageVersions.version })
        .from(landingPageVersions)
        .where(and(eq(landingPageVersions.tenantId, tenantId), eq(landingPageVersions.id, page.currentVersionId)));
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      const sections = [...composition.sections];
      if (input.sectionIndex >= sections.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Section index out of range." });
      }
      sections[input.sectionIndex] = { ...sections[input.sectionIndex]!, variant: input.variant };
      const newComposition: LandingPageComposition = { ...composition, sections };

      const [newVer] = await db
        .insert(landingPageVersions)
        .values({
          landingPageId: input.pageId,
          tenantId,
          version: version.version + 1,
          composition: newComposition,
          createdBy: userId,
        })
        .returning({ id: landingPageVersions.id });

      await db.update(landingPages)
        .set({ currentVersionId: newVer!.id, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      return { versionId: newVer!.id };
    }),

  // LP-5: Reorder sections — caller sends the full ordered list of indices.
  // We reassign `order` 0..n-1 in the new sequence.
  reorderSections: tenantProcedure
    .input(z.object({
      pageId: z.string().uuid(),
      newOrder: z.array(z.number().int().min(0)).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;
      const [page] = await db
        .select({ currentVersionId: landingPages.currentVersionId })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({ composition: landingPageVersions.composition, version: landingPageVersions.version })
        .from(landingPageVersions)
        .where(and(eq(landingPageVersions.tenantId, tenantId), eq(landingPageVersions.id, page.currentVersionId)));
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      if (input.newOrder.length !== composition.sections.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reorder length mismatch." });
      }
      const reordered = input.newOrder.map((oldIdx, newIdx) => {
        const src = composition.sections[oldIdx];
        if (!src) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid index in reorder." });
        return { ...src, order: newIdx };
      });
      const newComposition: LandingPageComposition = { ...composition, sections: reordered };

      const [newVer] = await db
        .insert(landingPageVersions)
        .values({
          landingPageId: input.pageId,
          tenantId,
          version: version.version + 1,
          composition: newComposition,
          createdBy: userId,
        })
        .returning({ id: landingPageVersions.id });
      await db.update(landingPages)
        .set({ currentVersionId: newVer!.id, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      return { versionId: newVer!.id };
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
        .select({ currentVersionId: landingPages.currentVersionId })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page?.currentVersionId) throw new TRPCError({ code: "BAD_REQUEST" });

      const [version] = await db
        .select({ composition: landingPageVersions.composition, version: landingPageVersions.version })
        .from(landingPageVersions)
        .where(and(eq(landingPageVersions.tenantId, tenantId), eq(landingPageVersions.id, page.currentVersionId)));
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      const composition = version.composition as LandingPageComposition;
      const sections = [...composition.sections];
      const section = sections[input.sectionIndex];
      if (!section) throw new TRPCError({ code: "BAD_REQUEST", message: "Section index out of range." });

      // Mutate extras by target path. Cast to flexible shape; schema validation runs at write time.
      const extras = { ...(section.extras as Record<string, unknown> | undefined ?? {}) } as Record<string, unknown>;

      if (input.target === "background") {
        extras["backgroundImageUrl"] = input.url;
      } else if (input.target === "about") {
        extras["imageUrl"] = input.url;
      } else if (input.target.startsWith("gallery.")) {
        const idx = parseInt(input.target.slice("gallery.".length), 10);
        const images = [...((extras["images"] as Array<{ url: string; caption?: string }> | undefined) ?? [])];
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
        const members = [...((extras["teamMembers"] as Array<Record<string, unknown>> | undefined) ?? [])];
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
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown image target: ${input.target}` });
      }

      sections[input.sectionIndex] = { ...section, extras: extras as never };
      const newComposition: LandingPageComposition = { ...composition, sections };

      const [newVer] = await db
        .insert(landingPageVersions)
        .values({
          landingPageId: input.pageId,
          tenantId,
          version: version.version + 1,
          composition: newComposition,
          createdBy: userId,
        })
        .returning({ id: landingPageVersions.id });
      await db.update(landingPages)
        .set({ currentVersionId: newVer!.id, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      return { versionId: newVer!.id };
    }),

  // LP-5: Update the page-level theme (palette + optional font pair). Affects the
  // public renderer's CSS variable injection immediately on next page load.
  updateTheme: tenantProcedure
    .input(z.object({
      pageId: z.string().uuid(),
      themeKey: z.string().min(1).max(60).nullable(),
      fontPairKey: z.string().min(1).max(60).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [page] = await db
        .select({ id: landingPages.id })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(landingPages)
        .set({ themeKey: input.themeKey, updatedAt: new Date() })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      // fontPairKey is stored in stepData.themeFontPair for now (no dedicated column).
      if (input.fontPairKey !== undefined) {
        await db.update(landingPages)
          .set({
            stepData: sql`COALESCE(${landingPages.stepData}, '{}'::jsonb) || ${JSON.stringify({ themeFontPair: input.fontPairKey })}::jsonb`,
          })
          .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));
      }
      return { ok: true };
    }),
});
