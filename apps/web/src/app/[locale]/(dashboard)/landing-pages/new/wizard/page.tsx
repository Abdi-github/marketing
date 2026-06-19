"use client";

// LP-4: Conversational wizard for landing page generation.
// Multi-step UX inspired by Lovable.dev: locale → industry → goal → template →
// palette → font → vibe → brief → image strategy → confirm → generate → poll.
//
// State is kept entirely client-side until "Generate" is clicked. Then we call
// generateFromWizard tRPC, which enqueues the FlowProducer landing-page flow with
// the wizard payload in stepData. Poll the page status, redirect to /edit when ready.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { trpc } from "../../../../../../lib/trpc";
import type { LandingPageLocale } from "../../../../../../lib/landing-language";

// ─── Catalogs (mirrored client-side; full source of truth is landing-design-system) ──

type WizardLocale = LandingPageLocale;

const LOCALES: { key: WizardLocale; flag: string; label: string; description: string }[] = [
  {
    key: "de-CH",
    flag: "🇨🇭",
    label: "Deutsch (Schweiz)",
    description: "Schweizerdeutsch-nahes Hochdeutsch · CHF · Strasse",
  },
  {
    key: "fr-CH",
    flag: "🇨🇭",
    label: "Français (Suisse)",
    description: "Français de Suisse romande · CHF · vouvoiement",
  },
  {
    key: "it-CH",
    flag: "🇨🇭",
    label: "Italiano (Svizzera)",
    description: "Italiano di Svizzera · CHF · forma Lei",
  },
  { key: "en", flag: "🌐", label: "English", description: "Neutral international English · CHF" },
];

const VERTICALS = [
  { key: "cafe", icon: "☕", label: "Café" },
  { key: "restaurant", icon: "🍽️", label: "Restaurant" },
  { key: "fitness", icon: "🏋️", label: "Fitness" },
  { key: "clinic", icon: "⚕️", label: "Clinic" },
  { key: "retail", icon: "🛍️", label: "Retail" },
  { key: "service", icon: "💼", label: "Service" },
] as const;
type Vertical = (typeof VERTICALS)[number]["key"];

const GOALS = [
  {
    key: "lead_capture",
    icon: "📨",
    label: "Capture leads",
    description: "Get visitors to fill in a form",
  },
  {
    key: "sales_promo",
    icon: "🏷️",
    label: "Promote a sale",
    description: "Highlight a special offer or limited deal",
  },
  {
    key: "event_signup",
    icon: "🎟️",
    label: "Drive event signups",
    description: "Get registrations for an event or class",
  },
  {
    key: "appointment_booking",
    icon: "📅",
    label: "Book appointments",
    description: "Get visitors to book a time slot",
  },
  {
    key: "info_brochure",
    icon: "📄",
    label: "Inform visitors",
    description: "Brand storytelling, no hard CTA",
  },
] as const;
type Goal = (typeof GOALS)[number]["key"];

// Palettes mirrored from landing-design-system (key fields only, for chip display).
const PALETTES = [
  { key: "warm-roasted", name: "Warm Roasted", primary: "#8B4513", swiss: false, vibe: "warm" },
  { key: "ocean-fresh", name: "Ocean Fresh", primary: "#0EA5E9", swiss: false, vibe: "fresh" },
  { key: "midnight-luxe", name: "Midnight Luxe", primary: "#1E1B4B", swiss: false, vibe: "luxe" },
  {
    key: "sport-orange",
    name: "Sport Orange",
    primary: "#EA580C",
    swiss: false,
    vibe: "energetic",
  },
  { key: "forest-calm", name: "Forest Calm", primary: "#15803D", swiss: false, vibe: "calm" },
  { key: "rose-blush", name: "Rose Blush", primary: "#be123c", swiss: false, vibe: "playful" },
  { key: "alpine-clean", name: "Alpine Clean", primary: "#0F172A", swiss: true, vibe: "minimal" },
  { key: "zurich-modern", name: "Zürich Modern", primary: "#374151", swiss: true, vibe: "modern" },
  {
    key: "geneve-elegance",
    name: "Genève Élégance",
    primary: "#7F1D1D",
    swiss: true,
    vibe: "elegant",
  },
  { key: "ticino-sun", name: "Ticino Sun", primary: "#B45309", swiss: true, vibe: "warm" },
  { key: "bern-heritage", name: "Bern Heritage", primary: "#991B1B", swiss: true, vibe: "classic" },
  {
    key: "lavender-grace",
    name: "Lavender Grace",
    primary: "#6d28d9",
    swiss: false,
    vibe: "elegant",
  },
  { key: "violet-noir", name: "Violet Noir", primary: "#7c3aed", swiss: false, vibe: "dark" },
  {
    key: "midnight-emerald",
    name: "Midnight Emerald",
    primary: "#059669",
    swiss: false,
    vibe: "dark",
  },
] as const;
type PaletteKey = (typeof PALETTES)[number]["key"];

const FONT_PAIRS = [
  { key: "inter-inter", heading: "Inter", body: "Inter", vibe: "Modern & readable" },
  { key: "manrope-inter", heading: "Manrope", body: "Inter", vibe: "Tech-forward editorial" },
  { key: "playfair-inter", heading: "Playfair Display", body: "Inter", vibe: "Elegant & timeless" },
  { key: "playfair-lora", heading: "Playfair Display", body: "Lora", vibe: "Editorial & bold" },
  { key: "fraunces-inter", heading: "Fraunces", body: "Inter", vibe: "Warm & characterful" },
  {
    key: "dm-serif-dm-sans",
    heading: "DM Serif Display",
    body: "DM Sans",
    vibe: "Friendly & approachable",
  },
  {
    key: "space-grotesk-inter",
    heading: "Space Grotesk",
    body: "Inter",
    vibe: "Distinctive & techy",
  },
  { key: "archivo-inter", heading: "Archivo", body: "Inter", vibe: "Confident & serious" },
] as const;
type FontPairKey = (typeof FONT_PAIRS)[number]["key"];

// ─── Wizard state ────────────────────────────────────────────────────────────

type VibeAxis = number; // -1 to +1
type SiteMode = "website" | "campaign";

type WizardState = {
  step: number;
  locale: WizardLocale | null;
  locales: WizardLocale[];
  // A preset vertical key, "other" (custom), or null. The custom label lives in customVertical.
  vertical: Vertical | "other" | null;
  customVertical: string;
  // Multiple goals allowed; the first is treated as primary.
  goals: Goal[];
  siteMode: SiteMode;
  templateKey: string | null;
  // True when the user explicitly chose "no template — design from scratch".
  noTemplate: boolean;
  paletteKey: PaletteKey | null;
  fontPairKey: FontPairKey | null;
  vibe: {
    minimalBold: VibeAxis; // -1 minimal, +1 bold
    classicModern: VibeAxis; // -1 classic, +1 modern
    calmEnergetic: VibeAxis; // -1 calm, +1 energetic
  };
  brief: string;
  imageStrategy: "curated" | "ai";
};

const INITIAL_STATE: WizardState = {
  step: 0,
  locale: null,
  locales: [],
  vertical: null,
  customVertical: "",
  goals: [],
  siteMode: "website",
  templateKey: null,
  noTemplate: false,
  paletteKey: null,
  fontPairKey: null,
  vibe: { minimalBold: 0, classicModern: 0, calmEnergetic: 0 },
  brief: "",
  imageStrategy: "curated",
};

/** The industry string sent to the backend: the custom label when "other", else the preset key. */
function effectiveVertical(s: WizardState): string | null {
  if (s.vertical === "other") return s.customVertical.trim() || null;
  return s.vertical;
}

const STEP_TITLES = [
  "Language",
  "Industry",
  "Goal",
  "Site type",
  "Template",
  "Palette",
  "Typography",
  "Vibe",
  "Your story",
  "Images",
  "Review",
];

const TOTAL_STEPS = STEP_TITLES.length;

// ─── Wizard component ────────────────────────────────────────────────────────

export default function LandingPageWizard() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const routeLocale = params.locale;
  const wizardLocale =
    routeLocale === "de"
      ? "de-CH"
      : routeLocale === "fr"
        ? "fr-CH"
        : routeLocale === "it"
          ? "it-CH"
          : "en";

  const [state, setState] = useState<WizardState>(() => ({
    ...INITIAL_STATE,
    locale: wizardLocale as WizardLocale,
    locales: [wizardLocale as WizardLocale],
  }));
  const [generating, setGenerating] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [isSlowGeneration, setIsSlowGeneration] = useState(false);
  const [generationActionPending, setGenerationActionPending] = useState(false);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const pollErrorCountRef = useRef(0);

  // ─── Load templates when entering the template step ─────────────────────────
  useEffect(() => {
    if (state.step !== 4) return;
    // Custom industries have no curated templates — go straight to the from-scratch option.
    if (state.vertical === "other" || state.vertical === null) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    setTemplatesLoading(true);
    // Don't filter by goal: with multiple goals, show all templates for the industry.
    trpc.landingPages.listTemplates
      .query({ vertical: state.vertical })
      .then((data) => {
        if (!cancelled) setTemplates(data as TemplateLite[]);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.step, state.vertical]);

  // ─── Polling: when generating, poll the page status until ready ─────────────
  useEffect(() => {
    if (!generatingId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const page = await trpc.landingPages.getPageStatus.query({ pageId: generatingId });
        if (cancelled) return;
        pollErrorCountRef.current = 0;
        if (page?.currentVersionId) {
          router.push(`/${routeLocale}/landing-pages/${generatingId}/edit`);
          return;
        }
        if (page?.generationState === "failed") {
          setGenerationFailed(true);
          setIsSlowGeneration(false);
          setGenerationError(
            page.generationError ??
              "Generation failed. Remove the draft or check your plan before trying again.",
          );
          return;
        }
        if (page?.generationState === "paused") {
          setGenerating(false);
          router.push(`/${routeLocale}/landing-pages`);
        }
      } catch {
        pollErrorCountRef.current += 1;
        if (pollErrorCountRef.current >= 5) {
          setGenerationError(
            "The page was created, but the status check is failing. Open the editor or return to your landing pages.",
          );
        }
      }
    };
    const interval = setInterval(tick, 2000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [generatingId, routeLocale, router]);

  useEffect(() => {
    if (!generating || generationFailed) return;
    const timeout = setTimeout(() => {
      setIsSlowGeneration(true);
      setGenerationError(
        generatingId
          ? "Generation is still running in the background. You can open the landing pages list, pause it, or remove the draft."
          : "We are still starting the generation request. Your draft ID is reserved, so keep this page open or check the landing pages list in a moment.",
      );
    }, 90_000);
    return () => clearTimeout(timeout);
  }, [generating, generationFailed, generatingId]);

  // ─── Step navigation ────────────────────────────────────────────────────────

  const canAdvance = useMemo(() => {
    switch (state.step) {
      case 0:
        return (
          state.locale !== null && state.locales.length > 0 && state.locales.includes(state.locale)
        );
      case 1:
        return (
          state.vertical !== null &&
          (state.vertical !== "other" || state.customVertical.trim().length >= 2)
        );
      case 2:
        return (state.goals?.length ?? 0) > 0;
      case 3:
        return true;
      case 4:
        return state.templateKey !== null || state.noTemplate;
      case 5:
        return state.paletteKey !== null;
      case 6:
        return state.fontPairKey !== null;
      case 7:
        return true;
      case 8:
        return state.brief.trim().length >= 10;
      case 9:
        return true;
      case 10:
        return true;
      default:
        return false;
    }
  }, [state]);

  const next = useCallback(
    () => setState((s) => ({ ...s, step: Math.min(s.step + 1, TOTAL_STEPS - 1) })),
    [],
  );
  const back = useCallback(() => setState((s) => ({ ...s, step: Math.max(s.step - 1, 0) })), []);

  const handleGenerate = useCallback(async () => {
    const vertical = effectiveVertical(state);
    const goals = state.goals ?? [];
    if (
      !state.locale ||
      !vertical ||
      goals.length === 0 ||
      !state.paletteKey ||
      !state.fontPairKey
    ) {
      setGenerationError("Please complete all steps.");
      return;
    }
    const landingPageId = crypto.randomUUID();
    setGenerating(true);
    setGeneratingId(landingPageId);
    setGenerationError(null);
    setGenerationFailed(false);
    setIsSlowGeneration(false);
    pollErrorCountRef.current = 0;
    try {
      await trpc.landingPages.generateFromWizard.mutate({
        landingPageId,
        locale: state.locale,
        defaultLocale: state.locale,
        locales: state.locales,
        vertical,
        goals,
        siteMode: state.siteMode,
        templateKey: state.noTemplate ? undefined : (state.templateKey ?? undefined),
        paletteKey: state.paletteKey,
        fontPairKey: state.fontPairKey,
        vibe: state.vibe,
        brief: state.brief.trim(),
        imageStrategy: state.imageStrategy,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed. Please try again.";
      setGenerationError(message);
      setGenerating(false);
      setGeneratingId(null);
    }
  }, [state]);

  // ─── Generation in progress screen ──────────────────────────────────────────
  if (generating) {
    return (
      <GeneratingScreen
        error={generationError}
        pagesHref={`/${routeLocale}/landing-pages`}
        isSlow={isSlowGeneration}
        isFailed={generationFailed}
        isActionPending={generationActionPending}
        onCancel={() => {
          setGenerating(false);
          setGeneratingId(null);
          setGenerationFailed(false);
          setIsSlowGeneration(false);
        }}
        onPause={
          generatingId && !generationFailed
            ? async () => {
                setGenerationActionPending(true);
                try {
                  await trpc.landingPages.pauseGeneration.mutate({ pageId: generatingId });
                  setGenerating(false);
                  router.push(`/${routeLocale}/landing-pages`);
                } finally {
                  setGenerationActionPending(false);
                }
              }
            : undefined
        }
        onRemove={
          generatingId
            ? async () => {
                setGenerationActionPending(true);
                try {
                  await trpc.landingPages.deletePage.mutate({ pageId: generatingId });
                  setGenerating(false);
                  setGeneratingId(null);
                  router.push(`/${routeLocale}/landing-pages`);
                } finally {
                  setGenerationActionPending(false);
                }
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* ─── Header / progress ─── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/${routeLocale}/landing-pages`)}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
              aria-label="Exit wizard"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div>
              <p className="text-xs font-medium text-gray-500">
                Step {state.step + 1} of {TOTAL_STEPS}
              </p>
              <h1 className="text-lg font-semibold text-gray-900">{STEP_TITLES[state.step]}</h1>
            </div>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            {STEP_TITLES.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${i < state.step ? "w-8 bg-purple-600" : i === state.step ? "w-12 bg-purple-600" : "w-8 bg-gray-200"}`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* ─── Step body ─── */}
      <main className="mx-auto max-w-5xl px-6 py-12">
        {state.step === 0 && <StepLocale state={state} setState={setState} />}
        {state.step === 1 && <StepVertical state={state} setState={setState} />}
        {state.step === 2 && <StepGoal state={state} setState={setState} />}
        {state.step === 3 && <StepSiteMode state={state} setState={setState} />}
        {state.step === 4 && (
          <StepTemplate
            state={state}
            setState={setState}
            templates={templates}
            loading={templatesLoading}
          />
        )}
        {state.step === 5 && <StepPalette state={state} setState={setState} />}
        {state.step === 6 && <StepFont state={state} setState={setState} />}
        {state.step === 7 && <StepVibe state={state} setState={setState} />}
        {state.step === 8 && <StepBrief state={state} setState={setState} />}
        {state.step === 9 && <StepImageStrategy state={state} setState={setState} />}
        {state.step === 10 && <StepReview state={state} />}
      </main>

      {/* ─── Footer navigation ─── */}
      <footer className="sticky bottom-0 border-t border-gray-200 bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <button
            onClick={back}
            disabled={state.step === 0}
            className="rounded-lg px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Back
          </button>
          {state.step < TOTAL_STEPS - 1 ? (
            <button
              onClick={next}
              disabled={!canAdvance}
              className="rounded-lg bg-purple-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-purple-200 hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-2.5 font-semibold text-white shadow-lg shadow-purple-200 hover:from-purple-700 hover:to-pink-700 disabled:opacity-40"
            >
              ✨ Generate my page
            </button>
          )}
        </div>
        {generationError && (
          <div className="mx-auto max-w-5xl px-6 pb-3">
            <p className="text-sm text-red-600">{generationError}</p>
          </div>
        )}
      </footer>
    </div>
  );
}

// ─── Step components ─────────────────────────────────────────────────────────

type StepProps = {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
};

function StepLocale({ state, setState }: StepProps) {
  const toggleLocale = (locale: WizardLocale) => {
    setState((current) => {
      const selected = current.locales.includes(locale);
      const locales = selected
        ? current.locales.filter((item) => item !== locale)
        : [...current.locales, locale];
      if (locales.length === 0) return current;
      const defaultLocale =
        current.locale && locales.includes(current.locale) ? current.locale : locales[0]!;
      return { ...current, locales, locale: defaultLocale };
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-2 text-3xl font-bold text-gray-900">
        Which languages should this website support?
      </h2>
      <p className="mb-8 text-gray-600">
        Choose at least one language. Pick a default language for generated copy and the first
        visitor view.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {LOCALES.map((loc) => {
          const selected = state.locales.includes(loc.key);
          const isDefault = state.locale === loc.key;
          return (
            <div
              key={loc.key}
              className={`rounded-xl border-2 p-5 text-left transition-all ${selected ? "border-purple-600 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleLocale(loc.key)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">{loc.label}</span>
                  <span className="mt-1 block text-sm text-gray-500">{loc.description}</span>
                </span>
              </label>
              <label
                className={`mt-4 flex items-center gap-2 text-xs font-semibold ${selected ? "text-purple-700" : "text-gray-400"}`}
              >
                <input
                  type="radio"
                  name="defaultLocale"
                  checked={isDefault}
                  disabled={!selected}
                  onChange={() => setState((s) => ({ ...s, locale: loc.key }))}
                  className="h-3.5 w-3.5 border-gray-300 text-purple-600"
                />
                Default language
              </label>
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-sm text-gray-500">
        {state.locales.length > 1
          ? `A language switcher will appear on the generated website. Default: ${LOCALES.find((loc) => loc.key === state.locale)?.label ?? state.locale}.`
          : "Single-language websites will still use the selected language for generation."}
      </p>
    </div>
  );
}

function StepVertical({ state, setState }: StepProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-2 text-3xl font-bold text-gray-900">What kind of business?</h2>
      <p className="mb-8 text-gray-600">
        Pick the closest fit, or choose &ldquo;Something else&rdquo; and describe it — the AI builds
        for any industry.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {VERTICALS.map((v) => (
          <button
            key={v.key}
            onClick={() =>
              setState((s) => ({
                ...s,
                vertical: v.key,
                customVertical: "",
                templateKey: null,
                noTemplate: false,
              }))
            }
            className={`rounded-xl border-2 p-6 text-center transition-all ${state.vertical === v.key ? "border-purple-600 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}
          >
            <div className="mb-2 text-4xl">{v.icon}</div>
            <p className="font-semibold text-gray-900">{v.label}</p>
          </button>
        ))}
        <button
          onClick={() =>
            setState((s) => ({ ...s, vertical: "other", templateKey: null, noTemplate: false }))
          }
          className={`rounded-xl border-2 p-6 text-center transition-all ${state.vertical === "other" ? "border-purple-600 bg-purple-50 shadow-md" : "border-dashed border-gray-200 bg-white hover:border-purple-300"}`}
        >
          <div className="mb-2 text-4xl">✏️</div>
          <p className="font-semibold text-gray-900">Something else</p>
        </button>
      </div>

      {state.vertical === "other" && (
        <div className="mt-6 max-w-xl">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Describe your industry
          </label>
          <input
            type="text"
            autoFocus
            value={state.customVertical}
            onChange={(e) => setState((s) => ({ ...s, customVertical: e.target.value }))}
            placeholder="e.g. law firm, dental lab, yoga retreat, SaaS startup, real-estate agency…"
            maxLength={60}
            className="w-full rounded-xl border-2 border-gray-200 p-3.5 text-gray-900 focus:border-purple-500 focus:outline-none"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            {state.customVertical.trim().length < 2
              ? "Type at least a couple of characters."
              : "The AI will write copy and structure tailored to this. You'll design from scratch (no preset template)."}
          </p>
        </div>
      )}
    </div>
  );
}

function StepGoal({ state, setState }: StepProps) {
  const toggle = (key: Goal) =>
    setState((s) => {
      const has = s.goals.includes(key);
      const goals = has ? s.goals.filter((g) => g !== key) : [...s.goals, key];
      return { ...s, goals, templateKey: null, noTemplate: false };
    });
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-2 text-3xl font-bold text-gray-900">What are your goals?</h2>
      <p className="mb-8 text-gray-600">
        Select one or more. The first you pick is the primary call-to-action; the rest are supported
        too.
      </p>
      <div className="space-y-3">
        {GOALS.map((g) => {
          const idx = state.goals.indexOf(g.key);
          const selected = idx !== -1;
          return (
            <button
              key={g.key}
              onClick={() => toggle(g.key)}
              className={`flex w-full items-start gap-4 rounded-xl border-2 p-5 text-left transition-all ${selected ? "border-purple-600 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}
            >
              <div className="flex-shrink-0 text-3xl">{g.icon}</div>
              <div className="flex-1">
                <p className="mb-0.5 font-semibold text-gray-900">
                  {g.label}
                  {idx === 0 && (
                    <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                      Primary
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-500">{g.description}</p>
              </div>
              <span
                className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 ${selected ? "border-purple-600 bg-purple-600" : "border-gray-300"}`}
              >
                {selected && (
                  <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepSiteMode({ state, setState }: StepProps) {
  const options: Array<{
    key: SiteMode;
    title: string;
    badge?: string;
    description: string;
    details: string;
  }> = [
    {
      key: "website",
      title: "Small business website",
      badge: "Recommended",
      description: "Navbar, footer, homepage, and supporting pages.",
      details: "Best when visitors should trust the business, browse services, and contact later.",
    },
    {
      key: "campaign",
      title: "Campaign landing page",
      description: "One focused page for one offer, event, promotion, or lead form.",
      details: "Best when visitors should take one action without browsing extra pages.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-2 text-3xl font-bold text-gray-900">What should we generate?</h2>
      <p className="mb-8 text-gray-600">
        Choose the structure first. The vibe sliders later only change style, not the site type.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {options.map((option) => {
          const selected = state.siteMode === option.key;
          return (
            <button
              key={option.key}
              onClick={() => setState((s) => ({ ...s, siteMode: option.key }))}
              className={`flex min-h-[220px] flex-col rounded-xl border-2 bg-white p-6 text-left transition-all ${selected ? "border-purple-600 bg-purple-50 shadow-lg" : "border-gray-200 hover:border-purple-300 hover:shadow-md"}`}
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black ${option.key === "website" ? "bg-purple-100 text-purple-700" : "bg-pink-100 text-pink-700"}`}
                >
                  {option.key === "website" ? "W" : "C"}
                </div>
                {option.badge && (
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                    {option.badge}
                  </span>
                )}
              </div>
              <p className="text-lg font-bold text-gray-900">{option.title}</p>
              <p className="mt-2 text-sm font-medium text-gray-700">{option.description}</p>
              <p className="mt-3 text-sm text-gray-500">{option.details}</p>
              <span
                className={`mt-auto flex h-6 w-6 items-center justify-center self-end rounded-full border-2 ${selected ? "border-purple-600 bg-purple-600" : "border-gray-300"}`}
              >
                {selected && (
                  <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type TemplateLite = {
  id: string;
  key: string;
  nameKey: string;
  vertical: string;
  style: string;
  goal: string | null;
  swissSpecific: boolean;
  availableLocales: string[];
  screenshotUrlsByLocale: Record<string, { phone?: string; tablet?: string; desktop?: string }>;
};

function ScratchOption({ state, setState }: StepProps) {
  const selected = state.noTemplate;
  return (
    <button
      onClick={() => setState((s) => ({ ...s, noTemplate: true, templateKey: null }))}
      className={`flex w-full items-center gap-4 rounded-xl border-2 p-5 text-left transition-all ${selected ? "border-purple-600 bg-purple-50 shadow-md" : "border-dashed border-gray-300 bg-white hover:border-purple-300"}`}
    >
      <div className="flex-shrink-0 text-3xl">✨</div>
      <div className="flex-1">
        <p className="font-semibold text-gray-900">Design from scratch with AI</p>
        <p className="mt-0.5 text-sm text-gray-500">
          No template — the AI builds the whole page from your brief, goals, palette, and vibe.
        </p>
      </div>
      <span
        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-purple-600 bg-purple-600" : "border-gray-300"}`}
      >
        {selected && (
          <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </span>
    </button>
  );
}

function StepTemplate({
  state,
  setState,
  templates,
  loading,
}: StepProps & { templates: TemplateLite[]; loading: boolean }) {
  const filtered = useMemo(
    () => templates.filter((t) => t.availableLocales.length > 0),
    [templates],
  );
  const pickTemplate = (key: string) =>
    setState((s) => ({ ...s, templateKey: key, noTemplate: false }));
  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="mb-2 text-3xl font-bold text-gray-900">Pick a starting point</h2>
      <p className="mb-8 text-gray-600">
        Choose a ready-made template, or let the AI design your page from scratch. Either way you
        personalize it in the next steps.
      </p>

      {/* From-scratch option is always available, so the user is never blocked. */}
      <div className="mb-6">
        <ScratchOption state={state} setState={setState} />
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading templates…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-6 py-10 text-center text-gray-500">
          {state.vertical === "other"
            ? "Custom industries don't have preset templates — the from-scratch option above is the way to go."
            : "No ready-made templates for this industry yet — pick the from-scratch option above and the AI will design it for you."}
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              or start from a template
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => {
              const screenshot =
                t.screenshotUrlsByLocale[state.locale ?? "de-CH"]?.desktop ??
                t.screenshotUrlsByLocale["de-CH"]?.desktop ??
                t.screenshotUrlsByLocale["en"]?.desktop;
              return (
                <button
                  key={t.id}
                  onClick={() => pickTemplate(t.key)}
                  className={`overflow-hidden rounded-xl border-2 bg-white text-left transition-all ${state.templateKey === t.key && !state.noTemplate ? "scale-[1.02] border-purple-600 shadow-xl" : "border-gray-200 hover:border-purple-300 hover:shadow-md"}`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                    {screenshot ? (
                      <img
                        src={screenshot}
                        alt={t.nameKey}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <iframe
                        src={`/p/preview/${t.key}/${state.locale ?? "de-CH"}`}
                        className="pointer-events-none h-full w-full origin-top-left"
                        style={{ width: 1280, height: 960, transform: "scale(0.235)" }}
                      />
                    )}
                    {t.swissSpecific && (
                      <span className="absolute right-2 top-2 rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white">
                        🇨🇭 Swiss
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="mb-1 font-semibold capitalize text-gray-900">
                      {t.vertical} · {t.style}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.availableLocales.length} languages available
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StepPalette({ state, setState }: StepProps) {
  const [showSwissOnly, setShowSwissOnly] = useState(false);
  const visible = showSwissOnly ? PALETTES.filter((p) => p.swiss) : PALETTES;
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h2 className="mb-2 text-3xl font-bold text-gray-900">Pick a color palette</h2>
          <p className="text-gray-600">Sets the brand color used across CTAs and accents.</p>
        </div>
        <button
          onClick={() => setShowSwissOnly((v) => !v)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${showSwissOnly ? "bg-red-600 text-white" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
        >
          🇨🇭 Swiss only
        </button>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((p) => (
          <button
            key={p.key}
            onClick={() => setState((s) => ({ ...s, paletteKey: p.key }))}
            className={`overflow-hidden rounded-xl border-2 text-left transition-all ${state.paletteKey === p.key ? "scale-[1.03] border-purple-600 shadow-lg" : "border-gray-200 hover:border-purple-300"}`}
          >
            <div className="relative h-24" style={{ background: p.primary }}>
              {p.swiss && (
                <span className="absolute right-2 top-2 rounded bg-white/90 px-1.5 py-0.5 text-xs font-bold text-red-700">
                  🇨🇭
                </span>
              )}
            </div>
            <div className="bg-white p-3">
              <p className="text-sm font-semibold text-gray-900">{p.name}</p>
              <p className="text-xs capitalize text-gray-500">{p.vibe}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepFont({ state, setState }: StepProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-2 text-3xl font-bold text-gray-900">Choose a typography pair</h2>
      <p className="mb-8 text-gray-600">
        Headings and body text — proven combinations that always look great together.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {FONT_PAIRS.map((f) => (
          <button
            key={f.key}
            onClick={() => setState((s) => ({ ...s, fontPairKey: f.key }))}
            className={`rounded-xl border-2 bg-white p-5 text-left transition-all ${state.fontPairKey === f.key ? "border-purple-600 shadow-md" : "border-gray-200 hover:border-purple-300"}`}
          >
            <p
              className="mb-1 text-xl font-bold text-gray-900"
              style={{ fontFamily: `'${f.heading}', system-ui` }}
            >
              {f.heading}
            </p>
            <p className="mb-3 text-sm text-gray-600" style={{ fontFamily: `'${f.body}', serif` }}>
              The quick brown fox jumps over the lazy dog.
            </p>
            <p className="text-xs font-medium text-gray-500">{f.vibe}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function VibeSlider({
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex justify-between">
        <span className={`text-sm font-medium ${value < 0 ? "text-purple-600" : "text-gray-500"}`}>
          {leftLabel}
        </span>
        <span className={`text-sm font-medium ${value > 0 ? "text-purple-600" : "text-gray-500"}`}>
          {rightLabel}
        </span>
      </div>
      <input
        type="range"
        min={-100}
        max={100}
        value={value * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-purple-300 via-gray-200 to-purple-300"
      />
    </div>
  );
}

function StepVibe({ state, setState }: StepProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-2 text-3xl font-bold text-gray-900">What&apos;s the vibe?</h2>
      <p className="mb-8 text-gray-600">
        Drag the sliders. Tells the AI how to write copy and pick imagery.
      </p>
      <div className="space-y-4">
        <VibeSlider
          value={state.vibe.minimalBold}
          onChange={(v) => setState((s) => ({ ...s, vibe: { ...s.vibe, minimalBold: v } }))}
          leftLabel="Minimal"
          rightLabel="Bold"
        />
        <VibeSlider
          value={state.vibe.classicModern}
          onChange={(v) => setState((s) => ({ ...s, vibe: { ...s.vibe, classicModern: v } }))}
          leftLabel="Classic"
          rightLabel="Modern"
        />
        <VibeSlider
          value={state.vibe.calmEnergetic}
          onChange={(v) => setState((s) => ({ ...s, vibe: { ...s.vibe, calmEnergetic: v } }))}
          leftLabel="Calm"
          rightLabel="Energetic"
        />
      </div>
    </div>
  );
}

function StepBrief({ state, setState }: StepProps) {
  const placeholderByLocale: Record<WizardLocale, string> = {
    "de-CH":
      "z.B. Spezialitätenkaffee in Zürich mit Sonntags-Brunch. Wir möchten neue Stammgäste gewinnen.",
    "fr-CH":
      "p.ex. Café de spécialité à Genève avec brunch dominical. Nous voulons attirer de nouveaux habitués.",
    "it-CH":
      "p.es. Caffè di specialità a Lugano con brunch domenicale. Vogliamo conquistare nuovi clienti abituali.",
    en: "e.g. Specialty coffee shop in Zurich with Sunday brunch. We want to attract new regulars.",
  };
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-2 text-3xl font-bold text-gray-900">Tell us about your business</h2>
      <p className="mb-8 text-gray-600">
        1-3 sentences. What you offer, who it&apos;s for, what makes it special. The AI uses this to
        personalize the copy.
      </p>
      <textarea
        value={state.brief}
        onChange={(e) => setState((s) => ({ ...s, brief: e.target.value }))}
        placeholder={placeholderByLocale[state.locale ?? "en"]}
        rows={6}
        className="w-full resize-none rounded-xl border-2 border-gray-200 p-4 text-base leading-relaxed text-gray-900 focus:border-purple-500 focus:outline-none"
        maxLength={800}
      />
      <div className="mt-2 flex justify-between text-sm">
        <span className={state.brief.trim().length < 10 ? "text-red-500" : "text-gray-500"}>
          {state.brief.trim().length < 10
            ? `${10 - state.brief.trim().length} more characters needed`
            : "✓ Looks good"}
        </span>
        <span className="text-gray-400">{state.brief.length}/800</span>
      </div>
    </div>
  );
}

function StepImageStrategy({ state, setState }: StepProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-2 text-3xl font-bold text-gray-900">How should we handle images?</h2>
      <p className="mb-8 text-gray-600">You can always swap them later in the editor.</p>
      <div className="space-y-3">
        <button
          onClick={() => setState((s) => ({ ...s, imageStrategy: "curated" }))}
          className={`flex w-full items-start gap-4 rounded-xl border-2 p-5 text-left transition-all ${state.imageStrategy === "curated" ? "border-purple-600 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}
        >
          <div className="text-3xl">📸</div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Use curated stock photos</p>
            <p className="mt-0.5 text-sm text-gray-500">
              Hand-picked high-quality Unsplash photos that fit your industry. Free, instant.
            </p>
          </div>
          <span className="rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
            Recommended
          </span>
        </button>
        <button
          onClick={() => setState((s) => ({ ...s, imageStrategy: "ai" }))}
          className={`flex w-full items-start gap-4 rounded-xl border-2 p-5 text-left transition-all ${state.imageStrategy === "ai" ? "border-purple-600 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}
        >
          <div className="text-3xl">✨</div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Generate unique brand images with AI</p>
            <p className="mt-0.5 text-sm text-gray-500">
              FLUX generates photos tailored to your brand. Adds ~30s and ~CHF 0.15.
            </p>
          </div>
          <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
            Beta
          </span>
        </button>
      </div>
    </div>
  );
}

function StepReview({ state }: { state: WizardState }) {
  const palette = PALETTES.find((p) => p.key === state.paletteKey);
  const font = FONT_PAIRS.find((f) => f.key === state.fontPairKey);
  const vertical = VERTICALS.find((v) => v.key === state.vertical);
  const industryLabel =
    state.vertical === "other"
      ? `✏️ ${state.customVertical.trim() || "Custom"}`
      : `${vertical?.icon ?? ""} ${vertical?.label ?? "—"}`;
  const goals = state.goals ?? [];
  const goalsLabel = goals
    .map((key) => {
      const g = GOALS.find((x) => x.key === key);
      return g ? `${g.icon} ${g.label}` : key;
    })
    .join(",  ");
  const languageLabel =
    state.locales.length > 1
      ? `${state.locales.length} languages, default ${LOCALES.find((l) => l.key === state.locale)?.label ?? state.locale}`
      : `${LOCALES.find((l) => l.key === state.locale)?.label ?? state.locale}`;
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-2 text-3xl font-bold text-gray-900">All set?</h2>
      <p className="mb-8 text-gray-600">
        Quick review before we generate. You can edit everything later.
      </p>
      <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <ReviewRow
          label={state.locales.length > 1 ? "Languages" : "Language"}
          value={languageLabel}
        />
        <ReviewRow label="Industry" value={industryLabel} />
        <ReviewRow
          label="Site type"
          value={state.siteMode === "website" ? "Small business website" : "Campaign landing page"}
        />
        <ReviewRow label={goals.length > 1 ? "Goals" : "Goal"} value={goalsLabel || "—"} />
        <ReviewRow
          label="Template"
          value={state.noTemplate ? "✨ Design from scratch" : (state.templateKey ?? "—")}
        />
        <ReviewRow label="Palette" value={palette?.name ?? "—"} swatch={palette?.primary} />
        <ReviewRow label="Typography" value={`${font?.heading} + ${font?.body}`} />
        <ReviewRow label="Vibe" value={describeVibe(state.vibe)} />
        <ReviewRow
          label="Images"
          value={state.imageStrategy === "ai" ? "AI-generated (FLUX)" : "Curated stock"}
        />
      </div>
      <div className="mt-6 rounded-xl border border-purple-100 bg-purple-50 p-4">
        <p className="mb-1 text-sm font-semibold text-purple-900">Your brief:</p>
        <p className="text-sm italic text-purple-800">&ldquo;{state.brief}&rdquo;</p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <div className="flex items-center gap-2 font-medium text-gray-900">
        {swatch && (
          <span
            className="h-5 w-5 rounded-full border border-gray-200"
            style={{ background: swatch }}
          />
        )}
        {value}
      </div>
    </div>
  );
}

function describeVibe(vibe: WizardState["vibe"]): string {
  const parts: string[] = [];
  parts.push(
    Math.abs(vibe.minimalBold) < 0.2 ? "balanced" : vibe.minimalBold > 0 ? "bold" : "minimal",
  );
  parts.push(
    Math.abs(vibe.classicModern) < 0.2 ? "neutral" : vibe.classicModern > 0 ? "modern" : "classic",
  );
  parts.push(
    Math.abs(vibe.calmEnergetic) < 0.2 ? "even" : vibe.calmEnergetic > 0 ? "energetic" : "calm",
  );
  return parts.join(" · ");
}

// ─── Generating screen ──────────────────────────────────────────────────────

function GeneratingScreen({
  error,
  editorHref,
  pagesHref,
  isSlow,
  isFailed,
  isActionPending,
  onCancel,
  onPause,
  onRemove,
}: {
  error: string | null;
  editorHref?: string;
  pagesHref: string;
  isSlow: boolean;
  isFailed: boolean;
  isActionPending: boolean;
  onCancel: () => void;
  onPause?: () => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 p-6">
      <div className="max-w-md text-center">
        {isFailed ? (
          <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full border-4 border-red-200 bg-red-50 text-4xl text-red-600">
            !
          </div>
        ) : (
          <div className="relative mx-auto mb-8 h-24 w-24">
            <div className="absolute inset-0 animate-pulse rounded-full border-4 border-purple-200" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
            <div className="absolute inset-0 flex items-center justify-center text-xl font-semibold">
              AI
            </div>
          </div>
        )}
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          {isFailed
            ? "Generation stopped"
            : isSlow
              ? "Still generating..."
              : "Crafting your page..."}
        </h1>
        <p className="mb-1 text-gray-600">
          {isFailed
            ? "We saved the draft, but the AI job did not complete."
            : isSlow
              ? "The job is still running in the background."
              : "This takes about 30 seconds."}
        </p>
        <p className="text-sm text-gray-500">
          {error ??
            (isFailed
              ? "Remove the draft or check your plan before trying again."
              : "We're writing copy, picking layouts, and assembling your design.")}
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
          <a
            href={pagesHref}
            className="rounded-lg bg-purple-600 px-6 py-2.5 font-semibold text-white hover:bg-purple-700"
          >
            View pages
          </a>
          {onPause && (
            <button
              onClick={() => void onPause()}
              disabled={isActionPending}
              className="rounded-lg border border-yellow-300 bg-yellow-50 px-6 py-2.5 font-semibold text-yellow-800 hover:bg-yellow-100 disabled:opacity-50"
            >
              Pause generation
            </button>
          )}
          {onRemove && (
            <button
              onClick={() => void onRemove()}
              disabled={isActionPending}
              className="rounded-lg border border-red-200 px-6 py-2.5 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Remove draft
            </button>
          )}
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-6 py-2.5 font-semibold text-gray-700 hover:bg-white"
          >
            Go back
          </button>
        </div>
        {error === "__legacy__" &&
          (error ? (
            <>
              <div className="mb-6 text-6xl">{editorHref ? "⏳" : "😕"}</div>
              <h1 className="mb-2 text-2xl font-bold text-gray-900">
                {editorHref ? "Still working\u2026" : "Something went wrong"}
              </h1>
              <p className="mb-6 text-gray-600">{error}</p>
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                {editorHref ? (
                  <a
                    href={editorHref}
                    className="rounded-lg bg-purple-600 px-6 py-2.5 font-semibold text-white hover:bg-purple-700"
                  >
                    Open editor
                  </a>
                ) : (
                  <a
                    href={pagesHref}
                    className="rounded-lg bg-purple-600 px-6 py-2.5 font-semibold text-white hover:bg-purple-700"
                  >
                    View pages
                  </a>
                )}
                <button
                  onClick={onCancel}
                  className="rounded-lg border border-gray-200 px-6 py-2.5 font-semibold text-gray-700 hover:bg-white"
                >
                  Go back
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="relative mx-auto mb-8 h-24 w-24">
                <div className="absolute inset-0 animate-pulse rounded-full border-4 border-purple-200" />
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
                <div className="absolute inset-0 flex items-center justify-center text-3xl">✨</div>
              </div>
              <h1 className="mb-2 text-2xl font-bold text-gray-900">Crafting your page…</h1>
              <p className="mb-1 text-gray-600">This takes about 30 seconds.</p>
              <p className="text-sm text-gray-500">
                We&apos;re writing copy, picking layouts, and assembling your design.
              </p>
            </>
          ))}
      </div>
    </div>
  );
}
