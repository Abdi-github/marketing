/**
 * IT-CH prompt eval fixtures (step-17)
 *
 * Verifies that all four IT-CH prompts are registered, build correct user
 * prompts, and carry Italian system-prompt text. These are fast unit evals
 * that run against the registry without hitting any AI provider.
 *
 * Locale: it-CH / Ticino
 */
import { describe, it, expect } from "vitest";
import { getPrompt, listPromptIds } from "../../../prompts/registry";

const TICINO_BUSINESS = "Ristorante Al Grotto";
const TICINO_CITY = "Lugano";
const TICINO_VERTICAL = "restaurant";

describe("IT-CH prompt registration", () => {
  it("social-post-it-v1 is registered", () => {
    const ids = listPromptIds();
    expect(ids).toContain("social-post-it-v1");
  });

  it("landing-page-brief-it-v1 is registered", () => {
    expect(listPromptIds()).toContain("landing-page-brief-it-v1");
  });

  it("landing-page-copy-it-v1 is registered", () => {
    expect(listPromptIds()).toContain("landing-page-copy-it-v1");
  });

  it("landing-page-layout-it-v1 is registered", () => {
    expect(listPromptIds()).toContain("landing-page-layout-it-v1");
  });
});

describe("social-post-it-v1", () => {
  const prompt = getPrompt("social-post-it-v1");

  it("version is 1", () => {
    expect(prompt.version).toBe(1);
  });

  it("system prompt is in Italian", () => {
    expect(prompt.systemPrompt).toMatch(/Ticino/);
    expect(prompt.systemPrompt).toMatch(/post/i);
  });

  it("system prompt does not contain German", () => {
    expect(prompt.systemPrompt).not.toMatch(/Schweiz/);
    expect(prompt.systemPrompt).not.toMatch(/Deutsch/);
  });

  it("buildUserPrompt includes business name and city", () => {
    const text = prompt.buildUserPrompt({
      businessName: TICINO_BUSINESS,
      city: TICINO_CITY,
      vertical: TICINO_VERTICAL,
      topic: "Risotto al tartufo di stagione",
    });
    expect(text).toContain(TICINO_BUSINESS);
    expect(text).toContain(TICINO_CITY);
    expect(text).toContain("ristorante");
  });

  it("buildUserPrompt includes topic", () => {
    const text = prompt.buildUserPrompt({
      businessName: TICINO_BUSINESS,
      city: TICINO_CITY,
      vertical: TICINO_VERTICAL,
      topic: "Polenta con spezzatino",
    });
    expect(text).toContain("Polenta con spezzatino");
  });

  it("buildUserPrompt appends highlights when provided", () => {
    const text = prompt.buildUserPrompt({
      businessName: TICINO_BUSINESS,
      city: TICINO_CITY,
      vertical: TICINO_VERTICAL,
      topic: "Menu serale",
      highlights: "Vista lago, terrazza aperta",
    });
    expect(text).toContain("Vista lago, terrazza aperta");
  });

  it("buildUserPrompt defaults city to Ticino when omitted", () => {
    const text = prompt.buildUserPrompt({
      businessName: "Caffè della Piazza",
      vertical: "cafe",
      topic: "Colazione di domenica",
    });
    expect(text).toContain("Ticino");
  });

  it("buildUserPrompt renders cafe vertical in Italian", () => {
    const text = prompt.buildUserPrompt({
      businessName: "Bar Bellinzona",
      vertical: "cafe",
      city: "Bellinzona",
      topic: "Aperitivo estivo",
    });
    expect(text).toContain("caffè");
  });

  it("buildUserPrompt renders fitness_studio vertical in Italian", () => {
    const text = prompt.buildUserPrompt({
      businessName: "FitLugano",
      vertical: "fitness_studio",
      city: "Lugano",
      topic: "Nuovo corso pilates",
    });
    expect(text).toContain("studio di fitness");
  });
});

describe("landing-page-brief-it-v1", () => {
  const prompt = getPrompt("landing-page-brief-it-v1");

  it("version is 1", () => {
    expect(prompt.version).toBe(1);
  });

  it("system prompt references Ticino", () => {
    expect(prompt.systemPrompt).toMatch(/Ticino/);
  });

  it("buildUserPrompt includes business name, locale and user prompt", () => {
    const text = prompt.buildUserPrompt({
      businessName: TICINO_BUSINESS,
      city: TICINO_CITY,
      vertical: TICINO_VERTICAL,
      locale: "it-CH",
      userPrompt: "Ristorante tradizionale ticinese con piatti locali e vista lago",
    });
    expect(text).toContain(TICINO_BUSINESS);
    expect(text).toContain("it-CH");
    expect(text).toContain("vista lago");
  });

  it("buildUserPrompt appends brand context when provided", () => {
    const text = prompt.buildUserPrompt({
      businessName: TICINO_BUSINESS,
      city: TICINO_CITY,
      vertical: TICINO_VERTICAL,
      locale: "it-CH",
      userPrompt: "Cucina tipica",
      brandContext: "Fondato nel 1987, cucina della nonna",
    });
    expect(text).toContain("Fondato nel 1987");
  });

  it("buildUserPrompt defaults locale to it-CH when omitted", () => {
    const text = prompt.buildUserPrompt({
      businessName: TICINO_BUSINESS,
      vertical: TICINO_VERTICAL,
      userPrompt: "Cucina tipica ticinese",
    });
    expect(text).toContain("it-CH");
  });
});

describe("landing-page-copy-it-v1", () => {
  const prompt = getPrompt("landing-page-copy-it-v1");

  it("version is 1", () => {
    expect(prompt.version).toBe(1);
  });

  it("system prompt instructs Italian Ticino tone", () => {
    expect(prompt.systemPrompt).toMatch(/ticinese/i);
  });

  it("buildUserPrompt includes briefing, business name and sections", () => {
    const text = prompt.buildUserPrompt({
      brief: "Messaggio principale: cucina tradizionale ticinese",
      businessName: TICINO_BUSINESS,
      vertical: TICINO_VERTICAL,
      city: TICINO_CITY,
      sections: "hero, about, menu_preview, lead_form",
    });
    expect(text).toContain("cucina tradizionale ticinese");
    expect(text).toContain(TICINO_BUSINESS);
    expect(text).toContain("hero, about, menu_preview, lead_form");
  });

  it("buildUserPrompt defaults sections to hero/about/contact/lead_form", () => {
    const text = prompt.buildUserPrompt({
      brief: "Briefing rapido",
      businessName: TICINO_BUSINESS,
      vertical: TICINO_VERTICAL,
    });
    expect(text).toContain("hero, about, contact, lead_form");
  });
});

describe("landing-page-layout-it-v1", () => {
  const prompt = getPrompt("landing-page-layout-it-v1");

  it("version is 2", () => {
    expect(prompt.version).toBe(2);
  });

  it("system prompt is in Italian", () => {
    expect(prompt.systemPrompt).toMatch(/landing page/i);
    expect(prompt.systemPrompt).not.toMatch(/Deutsch/);
  });

  it("buildUserPrompt includes locale and title", () => {
    const text = prompt.buildUserPrompt({
      copySections: "hero: Benvenuti al Grotto\nabout: Cucina tradizionale",
      businessName: TICINO_BUSINESS,
      locale: "it-CH",
    });
    expect(text).toContain("it-CH");
    expect(text).toContain(TICINO_BUSINESS);
  });

  it("buildUserPrompt uses title over businessName when both provided", () => {
    const text = prompt.buildUserPrompt({
      copySections: "hero: Testo",
      businessName: TICINO_BUSINESS,
      title: "Pagina principale",
      locale: "it-CH",
    });
    expect(text).toContain("Pagina principale");
    expect(text).not.toContain(TICINO_BUSINESS);
  });
});
