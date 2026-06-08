// Eval suite for the social-post-v1 prompt.
// Uses EchoProvider in CI (no real API calls). The structural + content checks
// validate prompt assembly and output shape.
// LLM-as-judge (Haiku) is deferred to the Langfuse eval pipeline (Phase 4+).
import { describe, it, expect } from "vitest";
import { EchoProvider } from "../providers/echo";
import { getPrompt } from "../prompts/registry";
import type { CallOpts } from "../interface";

// ─── Golden input fixtures ─────────────────────────────────────────────────────

const GOLDEN_PAIRS = [
  {
    label: "Restaurant — Mittagsmenü",
    input: {
      businessName: "Zum Goldenen Raben",
      vertical: "restaurant",
      city: "Zürich",
      topic: "Mittagsmenü",
      highlights: "täglich wechselndes 3-Gang-Menü, lokale Zutaten aus dem Zürcher Unterland",
    },
    // Deterministic checks: the ECHO provider mirrors the assembled prompt.
    // Real model output is validated in staging via Langfuse scores.
    expectedPromptContains: [
      "Zum Goldenen Raben",
      "Restaurant",
      "Mittagsmenü",
      "täglich wechselndes",
    ],
    systemPromptShouldContain: "Deutschschweiz",
  },
  {
    label: "Café — Neues Gebäck",
    input: {
      businessName: "Café Hürlimann",
      vertical: "cafe",
      city: "Basel",
      topic: "Neues Herbstgebäck",
      highlights: "Kürbis-Zimtschnecken, frisch gebacken ab 7 Uhr",
    },
    expectedPromptContains: [
      "Café Hürlimann",
      "Café",
      "Neues Herbstgebäck",
      "Kürbis-Zimtschnecken",
    ],
    systemPromptShouldContain: "Cafés",
  },
  {
    label: "Fitness — Kursstart",
    input: {
      businessName: "Crossfit Bern",
      vertical: "fitness_studio",
      city: "Bern",
      topic: "Neuer HIIT-Kurs ab Januar",
      highlights: "Anfängerfreundlich, max. 10 Personen, kostenlose Probestunde",
    },
    expectedPromptContains: [
      "Crossfit Bern",
      "Fitness-Studio",
      "HIIT-Kurs",
      "kostenlose Probestunde",
    ],
    systemPromptShouldContain: "Fitness-Studios",
  },
  {
    label: "Restaurant — Saisonsangebot ohne Highlights",
    input: {
      businessName: "Restaurant Seeblick",
      vertical: "restaurant",
      city: "Luzern",
      topic: "Wildmenü Herbst",
      highlights: undefined,
    },
    expectedPromptContains: ["Restaurant Seeblick", "Wildmenü Herbst"],
    systemPromptShouldContain: "Social-Media",
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const echoProvider = new EchoProvider();
const baseOpts: CallOpts = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  jobId: "00000000-0000-0000-0000-000000000002",
  promptId: "social-post-v1",
  promptVersion: 1,
  costBudgetCents: 50,
};

describe("social-post-v1 — prompt assembly evals", () => {
  for (const pair of GOLDEN_PAIRS) {
    describe(pair.label, () => {
      it("assembles a user prompt containing all required fields", () => {
        const prompt = getPrompt("social-post-v1");
        const userPrompt = prompt.buildUserPrompt({
          businessName: pair.input.businessName,
          vertical: pair.input.vertical,
          city: pair.input.city,
          topic: pair.input.topic,
          highlights: pair.input.highlights ?? "",
        });

        for (const expected of pair.expectedPromptContains) {
          expect(userPrompt).toContain(expected);
        }
      });

      it("system prompt contains expected DE-CH scope keyword", () => {
        const prompt = getPrompt("social-post-v1");
        expect(prompt.systemPrompt).toContain(pair.systemPromptShouldContain);
      });

      it("EchoProvider returns non-empty output and correct provider id", async () => {
        const prompt = getPrompt("social-post-v1");
        const userPrompt = prompt.buildUserPrompt({
          businessName: pair.input.businessName,
          vertical: pair.input.vertical,
          city: pair.input.city,
          topic: pair.input.topic,
          highlights: pair.input.highlights ?? "",
        });

        const result = await echoProvider.complete(
          { prompt: userPrompt, systemPrompt: prompt.systemPrompt },
          baseOpts,
        );

        expect(result.text.length).toBeGreaterThan(0);
        expect(result.provider).toBe("echo");
        expect(result.inputTokens).toBeGreaterThan(0);
        expect(result.outputTokens).toBeGreaterThan(0);
        expect(result.costUsd).toBe(0);
      });
    });
  }
});

describe("social-post-v1 — prompt registry", () => {
  it("prompt is registered with correct id and version", () => {
    const prompt = getPrompt("social-post-v1");
    expect(prompt.id).toBe("social-post-v1");
    expect(prompt.version).toBe(1);
  });

  it("system prompt instructs 2–4 sentence output", () => {
    const prompt = getPrompt("social-post-v1");
    expect(prompt.systemPrompt).toContain("2–4 Sätze");
  });

  it("buildUserPrompt includes vertical label (not internal enum value)", () => {
    const prompt = getPrompt("social-post-v1");
    const out = prompt.buildUserPrompt({
      businessName: "Test",
      vertical: "cafe",
      city: "Bern",
      topic: "Test topic",
      highlights: "",
    });
    expect(out).toContain("Café");
    expect(out).not.toContain('"cafe"');
  });
});
