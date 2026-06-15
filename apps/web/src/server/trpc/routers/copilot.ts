// Marketing Copilot tRPC router (step-30).
// Implements a persistent conversation thread backed by copilot_threads + copilot_messages.
// The AI proposes actions; users confirm before they are executed (ADR-0025).
//
// Flow:
//   sendMessage → Sonnet proposes text + optional actions (pendingActions in DB row)
//   executeAction → user confirmed → action runs → result stored
//   getThread → returns full message history for display
import {
  createAnthropicSonnet,
  EchoProvider,
  getPrompt,
  type CallOpts,
  type ToolDefinition,
} from "@marketing/ai-router";
import { db } from "@marketing/db";
import {
  contacts,
  copilotMessages,
  copilotThreads,
  emailSequences,
  landingPages,
  landingPageVersions,
  outbox,
} from "@marketing/db";
import type { LandingPageComposition } from "@marketing/ai-router";
import { env, logger } from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, count } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";

// ─── Tool definitions ────────────────────────────────────────────────────────

const COPILOT_TOOLS: ToolDefinition[] = [
  {
    name: "create_landing_page",
    description:
      "Propose creating a new draft landing page from a user brief. The page will be created in draft status — the user can review and publish it separately. Use this when the user asks to create a landing page or promotional page.",
    inputSchema: {
      type: "object",
      required: ["prompt", "title"],
      properties: {
        prompt: {
          type: "string",
          maxLength: 500,
          description: "Brief description of the page content and goal.",
        },
        title: {
          type: "string",
          maxLength: 100,
          description: "Suggested page title.",
        },
        templateKey: {
          type: "string",
          description: "Optional template key (e.g. 'cafe-bold') if the user specified a style.",
        },
      },
    },
  },
  {
    name: "draft_email_sequence",
    description:
      "Propose drafting a new email sequence. The sequence will be created in paused/draft status — the user must activate it. Use this when the user asks to create a drip campaign or follow-up sequence.",
    inputSchema: {
      type: "object",
      required: ["name", "triggerEvent"],
      properties: {
        name: { type: "string", maxLength: 100, description: "Sequence name." },
        triggerEvent: {
          type: "string",
          enum: ["lead.captured", "contact.score_changed", "contact.lifecycle_changed", "manual"],
          description: "Event that enrolls contacts.",
        },
        context: {
          type: "string",
          maxLength: 300,
          description: "Context for AI sequence suggestion (e.g. 'Welcome new café leads').",
        },
      },
    },
  },
  {
    name: "list_contacts",
    description:
      "Safe read-only action — auto-executes. Returns the count and recent contacts for the tenant. Use when the user asks about their contacts or leads.",
    inputSchema: {
      type: "object",
      properties: {
        lifecycleStage: {
          type: "string",
          enum: ["subscriber", "lead", "mql", "sql", "customer", "evangelist"],
          description: "Optional filter by lifecycle stage.",
        },
        tag: { type: "string", description: "Optional filter by tag." },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 5,
          description: "How many sample contacts to return.",
        },
      },
    },
  },
  {
    name: "summarize_stats",
    description:
      "Safe read-only action — auto-executes. Returns a business stats summary: total contacts, open deals, active sequences, landing pages published.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "enroll_contact",
    description:
      "Propose enrolling a specific contact in an email sequence. Requires user confirmation. Use only when the user names a specific contact.",
    inputSchema: {
      type: "object",
      required: ["contactEmail", "sequenceName"],
      properties: {
        contactEmail: { type: "string", description: "Email of the contact to enroll." },
        sequenceName: { type: "string", description: "Name or partial name of the sequence." },
      },
    },
  },
  {
    name: "list_landing_pages",
    description:
      "Safe read-only — auto-executes. Returns the user's landing pages with their IDs, titles, and statuses. Use first when the user wants to edit a landing page so you know the pageId for follow-up swap tools.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
      },
    },
  },
  {
    name: "swap_palette",
    description:
      "Propose changing the color palette of a landing page. Requires user confirmation. Use when the user asks to change the theme/colors of a specific page. Use list_landing_pages first if you don't know the pageId.",
    inputSchema: {
      type: "object",
      required: ["pageId", "paletteKey"],
      properties: {
        pageId: { type: "string", description: "The landing page UUID." },
        paletteKey: {
          type: "string",
          description:
            "Palette key. Examples: warm-roasted, ocean-fresh, midnight-luxe, sport-orange, alpine-clean, zurich-modern, geneve-elegance, ticino-sun, bern-heritage, forest-calm, rose-blush, lavender-grace.",
        },
      },
    },
  },
  {
    name: "swap_font_pair",
    description:
      "Propose changing the typography pairing of a landing page. Requires user confirmation. Use when the user asks to change the fonts of a specific page.",
    inputSchema: {
      type: "object",
      required: ["pageId", "fontPairKey"],
      properties: {
        pageId: { type: "string", description: "The landing page UUID." },
        fontPairKey: {
          type: "string",
          description:
            "Font-pair key. Examples: inter-inter, manrope-inter, playfair-inter, playfair-lora, fraunces-inter, dm-serif-dm-sans, space-grotesk-inter, archivo-inter.",
        },
      },
    },
  },
  {
    name: "swap_section_variant",
    description:
      "Propose changing one section's layout variant on a landing page. Requires user confirmation. Use when the user asks to change how a specific section looks (e.g., 'make the hero a split layout', 'change the gallery to a carousel').",
    inputSchema: {
      type: "object",
      required: ["pageId", "sectionIndex", "variant"],
      properties: {
        pageId: { type: "string", description: "The landing page UUID." },
        sectionIndex: {
          type: "integer",
          minimum: 0,
          description: "Zero-based index of the section in the page composition.",
        },
        variant: {
          type: "string",
          description:
            "Variant key. Examples for hero: centered, image-bg-overlay, split-image-right, split-form-right. For gallery: masonry-3, grid-2x2, carousel-strip, feature-side.",
        },
      },
    },
  },
];

// Safe tools execute immediately; all others require user confirm.
const SAFE_TOOLS = new Set(["list_contacts", "summarize_stats", "list_landing_pages"]);

// ─── Provider ────────────────────────────────────────────────────────────────

function buildProvider() {
  if (env.AI_PROVIDER_FALLBACK === "echo" || !env.ANTHROPIC_API_KEY) {
    return new EchoProvider();
  }
  return createAnthropicSonnet();
}

// ─── Tool execution ───────────────────────────────────────────────────────────

async function executeSafeTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  tenantId: string,
): Promise<Record<string, unknown>> {
  if (toolName === "list_contacts") {
    const conditions = [eq(contacts.tenantId, tenantId)];
    if (toolArgs.lifecycleStage) {
      conditions.push(eq(contacts.lifecycleStage, toolArgs.lifecycleStage as "lead"));
    }
    const [total] = await db
      .select({ total: count() })
      .from(contacts)
      .where(and(...conditions));

    const sample = await db
      .select({
        id: contacts.id,
        name: contacts.firstName,
        email: contacts.email,
        stage: contacts.lifecycleStage,
        score: contacts.leadScore,
      })
      .from(contacts)
      .where(and(...conditions))
      .orderBy(desc(contacts.createdAt))
      .limit(Number(toolArgs.limit ?? 5));

    return { total: total?.total ?? 0, sample };
  }

  if (toolName === "summarize_stats") {
    const [contactTotal] = await db
      .select({ total: count() })
      .from(contacts)
      .where(eq(contacts.tenantId, tenantId));

    const [pageTotal] = await db
      .select({ total: count() })
      .from(landingPages)
      .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.status, "published")));

    const [seqTotal] = await db
      .select({ total: count() })
      .from(emailSequences)
      .where(and(eq(emailSequences.tenantId, tenantId), eq(emailSequences.status, "active")));

    return {
      totalContacts: contactTotal?.total ?? 0,
      publishedPages: pageTotal?.total ?? 0,
      activeSequences: seqTotal?.total ?? 0,
    };
  }

  if (toolName === "list_landing_pages") {
    const pages = await db
      .select({
        id: landingPages.id,
        title: landingPages.title,
        slug: landingPages.slug,
        status: landingPages.status,
        themeKey: landingPages.themeKey,
        updatedAt: landingPages.updatedAt,
      })
      .from(landingPages)
      .where(eq(landingPages.tenantId, tenantId))
      .orderBy(desc(landingPages.updatedAt))
      .limit(Number(toolArgs.limit ?? 10));
    return { pages };
  }

  return {};
}

// ─── Conversation history formatter ──────────────────────────────────────────

function formatHistory(msgs: Array<{ role: string; content: string }>): string {
  return msgs.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const copilotRouter = router({
  /**
   * Create a new conversation thread.
   */
  createThread: tenantProcedure.mutation(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const userId = ctx.session.user.id as string;

    const [thread] = await db
      .insert(copilotThreads)
      .values({ tenantId, userId: userId as unknown as string })
      .returning({ id: copilotThreads.id });

    return { threadId: thread!.id };
  }),

  /**
   * Get all messages in a thread (most recent 50, chronological).
   */
  getThread: tenantProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [thread] = await db
        .select({ id: copilotThreads.id })
        .from(copilotThreads)
        .where(and(eq(copilotThreads.id, input.threadId), eq(copilotThreads.tenantId, tenantId)));

      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const msgs = await db
        .select()
        .from(copilotMessages)
        .where(eq(copilotMessages.threadId, input.threadId))
        .orderBy(desc(copilotMessages.createdAt))
        .limit(50);

      return msgs.reverse();
    }),

  /**
   * Send a message to the copilot.
   * Returns the assistant reply + any pendingActions that need user confirm.
   */
  sendMessage: tenantProcedure
    .input(
      z.object({
        threadId: z.string().uuid().optional(),
        message: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const userId = ctx.session.user.id as string;

      // Resolve or create thread.
      let threadId = input.threadId;
      if (!threadId) {
        const [t] = await db
          .insert(copilotThreads)
          .values({
            tenantId,
            userId: userId as unknown as string,
            title: input.message.slice(0, 60),
          })
          .returning({ id: copilotThreads.id });
        threadId = t!.id;
      }

      // Store user message.
      await db.insert(copilotMessages).values({
        threadId,
        tenantId,
        role: "user",
        content: input.message,
      });

      // Load last 10 conversation turns for context.
      const history = await db
        .select({ role: copilotMessages.role, content: copilotMessages.content })
        .from(copilotMessages)
        .where(eq(copilotMessages.threadId, threadId))
        .orderBy(desc(copilotMessages.createdAt))
        .limit(21); // 10 turns × 2 roles + current user message

      const historyExcludingCurrent = history.reverse().slice(0, -1); // exclude the message we just inserted

      const conversationHistory = formatHistory(historyExcludingCurrent);

      // Call Sonnet with tools.
      const prompt = getPrompt("copilot-system-v1");
      const provider = buildProvider();

      let replyText = "";
      let pendingActions: Array<{
        id: string;
        type: string;
        label: string;
        args: Record<string, unknown>;
        requiresConfirm: boolean;
      }> = [];
      let autoExecutedResults: Record<string, unknown> | null = null;

      if (provider.completionWithTools) {
        const callOpts: CallOpts = {
          tenantId,
          jobId: `copilot-${threadId}-${Date.now()}`,
          promptId: "copilot-system-v1",
          promptVersion: 1,
          costBudgetCents: 30,
        };

        try {
          const result = await provider.completionWithTools(
            {
              prompt: prompt.buildUserPrompt({
                conversationHistory,
                userMessage: input.message,
              }),
              systemPrompt: prompt.systemPrompt,
              maxTokens: 1024,
            },
            COPILOT_TOOLS,
            callOpts,
          );

          replyText = result.text ?? "";

          if (result.toolResult) {
            const toolCall = result.toolResult as {
              _toolName?: string;
              [key: string]: unknown;
            };
            const toolName = (toolCall["_toolName"] as string | undefined) ?? "";
            const args = { ...toolCall };
            delete args["_toolName"];

            if (SAFE_TOOLS.has(toolName)) {
              // Auto-execute safe tools.
              const execResult = await executeSafeTool(toolName, args, tenantId);
              autoExecutedResults = { tool: toolName, result: execResult };

              // Build a rich, human-readable response from the tool results.
              let resultSummary = "";
              if (toolName === "list_contacts") {
                const r = execResult as {
                  total: number;
                  sample: Array<{
                    name: string | null;
                    email: string;
                    stage: string;
                    score: number;
                  }>;
                };
                const lines = r.sample
                  .map((c) => `• ${c.name ?? c.email} — ${c.stage} (score: ${c.score})`)
                  .join("\n");
                resultSummary = `You have **${r.total}** contact${r.total !== 1 ? "s" : ""} in your CRM.${
                  lines ? `\n\nMost recent:\n${lines}` : ""
                }`;
              } else if (toolName === "summarize_stats") {
                const r = execResult as {
                  totalContacts: number;
                  publishedPages: number;
                  activeSequences: number;
                };
                resultSummary = `Here's your marketing snapshot:\n• **${r.totalContacts}** contact${r.totalContacts !== 1 ? "s" : ""}\n• **${r.publishedPages}** published landing page${r.publishedPages !== 1 ? "s" : ""}\n• **${r.activeSequences}** active email sequence${r.activeSequences !== 1 ? "s" : ""}`;
              } else if (toolName === "list_landing_pages") {
                const r = execResult as {
                  pages: Array<{
                    title: string;
                    slug: string;
                    status: string;
                    themeKey: string | null;
                  }>;
                };
                const lines = r.pages
                  .map(
                    (p) =>
                      `• **${p.title}** — ${p.status}${p.themeKey ? ` (theme: ${p.themeKey})` : ""} · /${p.slug}`,
                  )
                  .join("\n");
                resultSummary =
                  r.pages.length === 0
                    ? "You don't have any landing pages yet."
                    : `Your landing pages:\n${lines}`;
              }
              replyText = [replyText, resultSummary].filter(Boolean).join("\n\n").trim();
            } else {
              // Requires confirm — propose action to user.
              const actionLabel: Record<string, string> = {
                create_landing_page: `Create landing page: "${(args.title as string) ?? ""}"`,
                draft_email_sequence: `Draft email sequence: "${(args.name as string) ?? ""}"`,
                enroll_contact: `Enroll ${(args.contactEmail as string) ?? ""} in sequence "${(args.sequenceName as string) ?? ""}"`,
                swap_palette: `Change palette to "${(args.paletteKey as string) ?? ""}"`,
                swap_font_pair: `Change typography to "${(args.fontPairKey as string) ?? ""}"`,
                swap_section_variant: `Change section ${(args.sectionIndex as number) ?? 0} layout to "${(args.variant as string) ?? ""}"`,
              };

              pendingActions.push({
                id: `action-${Date.now()}`,
                type: toolName,
                label: actionLabel[toolName] ?? toolName,
                args,
                requiresConfirm: true,
              });
            }
          }
        } catch (err) {
          logger.warn({ err: String(err) }, "[copilot] AI call failed, using fallback");
          replyText = "I encountered an issue processing your request. Please try again.";
        }
      } else {
        // EchoProvider fallback.
        replyText = `[Echo] You said: "${input.message}". I can help you create landing pages, manage contacts, and set up email sequences.`;
      }

      // Store assistant message with pending actions.
      const [assistantMsg] = await db
        .insert(copilotMessages)
        .values({
          threadId,
          tenantId,
          role: "assistant",
          content: replyText || "I'm here to help!",
          pendingActions: pendingActions.length > 0 ? pendingActions : null,
          actionResults: autoExecutedResults,
          confirmed: pendingActions.length > 0 ? false : null,
        })
        .returning({ id: copilotMessages.id });

      return {
        threadId,
        messageId: assistantMsg!.id,
        reply: replyText || "I'm here to help!",
        pendingActions,
        autoExecutedResults,
      };
    }),

  /**
   * Execute a pending action after user confirmation.
   */
  executeAction: tenantProcedure
    .input(
      z.object({
        messageId: z.string().uuid(),
        actionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const userId = ctx.session.user.id as string;

      // Load the message with pending actions.
      const [msg] = await db
        .select()
        .from(copilotMessages)
        .where(
          and(eq(copilotMessages.id, input.messageId), eq(copilotMessages.tenantId, tenantId)),
        );

      if (!msg) throw new TRPCError({ code: "NOT_FOUND" });
      if (msg.confirmed === true)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already confirmed" });

      const actions = (msg.pendingActions ?? []) as Array<{
        id: string;
        type: string;
        label: string;
        args: Record<string, unknown>;
      }>;

      const action = actions.find((a) => a.id === input.actionId);
      if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "Action not found" });

      // Execute the action.
      let result: Record<string, unknown> = {};

      if (action.type === "create_landing_page") {
        const slug = (action.args.title as string)
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-")
          .slice(0, 60);

        const [page] = await db
          .insert(landingPages)
          .values({
            tenantId,
            title: action.args.title as string,
            slug: `${slug}-${Date.now()}`,
            status: "draft",
            stepData: { brief: { prompt: action.args.prompt } },
          })
          .returning({ id: landingPages.id, slug: landingPages.slug });

        result = { pageId: page!.id, slug: page!.slug, status: "draft" };

        // Emit outbox event for the landing page generation queue.
        await db.insert(outbox).values({
          tenantId,
          type: "copilot.landing_page_requested",
          payload: {
            pageId: page!.id,
            prompt: action.args.prompt,
            templateKey: action.args.templateKey ?? null,
            requestedBy: userId,
          },
        });

        logger.info({ tenantId, pageId: page!.id }, "[copilot] landing page draft created");
      } else if (action.type === "draft_email_sequence") {
        const allowedTriggers = [
          "lead.captured",
          "contact.score_changed",
          "contact.lifecycle_changed",
          "manual",
        ] as const;
        type TriggerEvent = (typeof allowedTriggers)[number];
        const rawTrigger = (action.args.triggerEvent as string) ?? "manual";
        const triggerEvent: TriggerEvent = allowedTriggers.includes(rawTrigger as TriggerEvent)
          ? (rawTrigger as TriggerEvent)
          : "manual";

        const [seq] = await db
          .insert(emailSequences)
          .values({
            tenantId,
            name: action.args.name as string,
            triggerEvent,
            status: "paused",
            steps: [],
          })
          .returning({ id: emailSequences.id });

        result = { sequenceId: seq!.id, name: action.args.name, status: "paused" };
        logger.info({ tenantId, sequenceId: seq!.id }, "[copilot] email sequence drafted");
      } else if (action.type === "enroll_contact") {
        // Find contact by email.
        const [contact] = await db
          .select({ id: contacts.id, email: contacts.email })
          .from(contacts)
          .where(
            and(
              eq(contacts.tenantId, tenantId),
              eq(contacts.email, action.args.contactEmail as string),
            ),
          );

        if (!contact) {
          result = { error: `Contact ${action.args.contactEmail as string} not found` };
        } else {
          // Find sequence by name (partial match).
          const seqs = await db
            .select({ id: emailSequences.id, name: emailSequences.name })
            .from(emailSequences)
            .where(eq(emailSequences.tenantId, tenantId));

          const matchedSeq = seqs.find((s) =>
            s.name.toLowerCase().includes((action.args.sequenceName as string).toLowerCase()),
          );

          if (!matchedSeq) {
            result = { error: `Sequence "${action.args.sequenceName as string}" not found` };
          } else {
            const { emailSequenceEnrollments } = await import("@marketing/db");
            await db
              .insert(emailSequenceEnrollments)
              .values({
                tenantId,
                sequenceId: matchedSeq.id,
                contactId: contact.id,
                status: "enrolled",
                currentStep: 0,
                nextRunAt: new Date(),
              })
              .onConflictDoNothing();

            result = { contactId: contact.id, sequenceId: matchedSeq.id, enrolled: true };
          }
        }
      } else if (action.type === "swap_palette") {
        const pageId = action.args.pageId as string;
        const paletteKey = action.args.paletteKey as string;
        const [page] = await db
          .select({ id: landingPages.id })
          .from(landingPages)
          .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, pageId)));
        if (!page) {
          result = { error: `Landing page ${pageId} not found.` };
        } else {
          await db
            .update(landingPages)
            .set({ themeKey: paletteKey, updatedAt: new Date() })
            .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, pageId)));
          result = { pageId, paletteKey, updated: true };
          logger.info({ tenantId, pageId, paletteKey }, "[copilot] palette swapped");
        }
      } else if (action.type === "swap_font_pair") {
        const pageId = action.args.pageId as string;
        const fontPairKey = action.args.fontPairKey as string;
        const [page] = await db
          .select({ id: landingPages.id })
          .from(landingPages)
          .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, pageId)));
        if (!page) {
          result = { error: `Landing page ${pageId} not found.` };
        } else {
          const { sql } = await import("drizzle-orm");
          await db
            .update(landingPages)
            .set({
              stepData: sql`COALESCE(${landingPages.stepData}, '{}'::jsonb) || ${JSON.stringify({ themeFontPair: fontPairKey })}::jsonb`,
              updatedAt: new Date(),
            })
            .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, pageId)));
          result = { pageId, fontPairKey, updated: true };
          logger.info({ tenantId, pageId, fontPairKey }, "[copilot] font pair swapped");
        }
      } else if (action.type === "swap_section_variant") {
        const pageId = action.args.pageId as string;
        const sectionIndex = Number(action.args.sectionIndex);
        const variant = action.args.variant as string;
        const [page] = await db
          .select({ id: landingPages.id, currentVersionId: landingPages.currentVersionId })
          .from(landingPages)
          .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, pageId)));
        if (!page?.currentVersionId) {
          result = { error: `Landing page ${pageId} has no version to edit.` };
        } else {
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
          if (!version) {
            result = { error: "Version not found." };
          } else {
            const composition = version.composition as LandingPageComposition;
            const sections = [...composition.sections];
            if (sectionIndex < 0 || sectionIndex >= sections.length) {
              result = {
                error: `Section index ${sectionIndex} out of range (page has ${sections.length} sections).`,
              };
            } else {
              sections[sectionIndex] = { ...sections[sectionIndex]!, variant };
              const newComposition: LandingPageComposition = { ...composition, sections };
              const [newVer] = await db
                .insert(landingPageVersions)
                .values({
                  landingPageId: pageId,
                  tenantId,
                  version: version.version + 1,
                  composition: newComposition,
                  createdBy: userId,
                })
                .returning({ id: landingPageVersions.id });
              await db
                .update(landingPages)
                .set({ currentVersionId: newVer!.id, updatedAt: new Date() })
                .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, pageId)));
              result = { pageId, sectionIndex, variant, versionId: newVer!.id };
              logger.info(
                { tenantId, pageId, sectionIndex, variant },
                "[copilot] section variant swapped",
              );
            }
          }
        }
      }

      // Mark message as confirmed + store results.
      await db
        .update(copilotMessages)
        .set({ confirmed: true, actionResults: result })
        .where(eq(copilotMessages.id, input.messageId));

      return { success: true, result };
    }),
});
