"use client";

// LP-4: Conversational wizard for landing page generation.
// Multi-step UX inspired by Lovable.dev: locale → industry → goal → template →
// palette → font → vibe → brief → image strategy → confirm → generate → poll.
//
// State is kept entirely client-side until "Generate" is clicked. Then we call
// generateFromWizard tRPC, which enqueues the FlowProducer landing-page flow with
// the wizard payload in stepData. Poll the page status, redirect to /edit when ready.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { trpc } from "../../../../../../lib/trpc";

// ─── Catalogs (mirrored client-side; full source of truth is landing-design-system) ──

type WizardLocale = "de-CH" | "fr-CH" | "it-CH" | "en";

const LOCALES: { key: WizardLocale; flag: string; label: string; description: string }[] = [
  { key: "de-CH", flag: "🇨🇭", label: "Deutsch (Schweiz)", description: "Schweizerdeutsch-nahes Hochdeutsch · CHF · Strasse" },
  { key: "fr-CH", flag: "🇨🇭", label: "Français (Suisse)",  description: "Français de Suisse romande · CHF · vouvoiement" },
  { key: "it-CH", flag: "🇨🇭", label: "Italiano (Svizzera)", description: "Italiano di Svizzera · CHF · forma Lei" },
  { key: "en",    flag: "🌐", label: "English",            description: "Neutral international English · CHF" },
];

const VERTICALS = [
  { key: "cafe",       icon: "☕", label: "Café" },
  { key: "restaurant", icon: "🍽️", label: "Restaurant" },
  { key: "fitness",    icon: "🏋️", label: "Fitness" },
  { key: "clinic",     icon: "⚕️",  label: "Clinic" },
  { key: "retail",     icon: "🛍️", label: "Retail" },
  { key: "service",    icon: "💼", label: "Service" },
] as const;
type Vertical = (typeof VERTICALS)[number]["key"];

const GOALS = [
  { key: "lead_capture",        icon: "📨", label: "Capture leads",         description: "Get visitors to fill in a form" },
  { key: "sales_promo",         icon: "🏷️", label: "Promote a sale",        description: "Highlight a special offer or limited deal" },
  { key: "event_signup",        icon: "🎟️", label: "Drive event signups",   description: "Get registrations for an event or class" },
  { key: "appointment_booking", icon: "📅", label: "Book appointments",     description: "Get visitors to book a time slot" },
  { key: "info_brochure",       icon: "📄", label: "Inform visitors",       description: "Brand storytelling, no hard CTA" },
] as const;
type Goal = (typeof GOALS)[number]["key"];

// Palettes mirrored from landing-design-system (key fields only, for chip display).
const PALETTES = [
  { key: "warm-roasted",      name: "Warm Roasted",   primary: "#8B4513", swiss: false, vibe: "warm" },
  { key: "ocean-fresh",       name: "Ocean Fresh",    primary: "#0EA5E9", swiss: false, vibe: "fresh" },
  { key: "midnight-luxe",     name: "Midnight Luxe",  primary: "#1E1B4B", swiss: false, vibe: "luxe" },
  { key: "sport-orange",      name: "Sport Orange",   primary: "#EA580C", swiss: false, vibe: "energetic" },
  { key: "forest-calm",       name: "Forest Calm",    primary: "#15803D", swiss: false, vibe: "calm" },
  { key: "rose-blush",        name: "Rose Blush",     primary: "#E11D48", swiss: false, vibe: "playful" },
  { key: "alpine-clean",      name: "Alpine Clean",   primary: "#0F172A", swiss: true,  vibe: "minimal" },
  { key: "zurich-modern",     name: "Zürich Modern",  primary: "#374151", swiss: true,  vibe: "modern" },
  { key: "geneve-elegance",   name: "Genève Élégance",primary: "#7F1D1D", swiss: true,  vibe: "elegant" },
  { key: "ticino-sun",        name: "Ticino Sun",     primary: "#B45309", swiss: true,  vibe: "warm" },
  { key: "bern-heritage",     name: "Bern Heritage",  primary: "#991B1B", swiss: true,  vibe: "classic" },
  { key: "lavender-grace",    name: "Lavender Grace", primary: "#7C3AED", swiss: false, vibe: "elegant" },
] as const;
type PaletteKey = (typeof PALETTES)[number]["key"];

const FONT_PAIRS = [
  { key: "inter-lora",            heading: "Inter",          body: "Lora",          vibe: "Modern & readable" },
  { key: "manrope-source-serif",  heading: "Manrope",        body: "Source Serif 4",vibe: "Tech-forward editorial" },
  { key: "playfair-inter",        heading: "Playfair Display",body: "Inter",        vibe: "Elegant & timeless" },
  { key: "bricolage-inter",       heading: "Bricolage Grotesque", body: "Inter",   vibe: "Editorial & bold" },
  { key: "fraunces-inter",        heading: "Fraunces",       body: "Inter",         vibe: "Warm & characterful" },
  { key: "dm-sans-lora",          heading: "DM Sans",        body: "Lora",          vibe: "Friendly & approachable" },
  { key: "space-grotesk-inter",   heading: "Space Grotesk",  body: "Inter",         vibe: "Distinctive & techy" },
  { key: "epilogue-merriweather", heading: "Epilogue",       body: "Merriweather",  vibe: "Confident & serious" },
] as const;
type FontPairKey = (typeof FONT_PAIRS)[number]["key"];

// ─── Wizard state ────────────────────────────────────────────────────────────

type VibeAxis = number; // -1 to +1

type WizardState = {
  step: number;
  locale: WizardLocale | null;
  vertical: Vertical | null;
  goal: Goal | null;
  templateKey: string | null;
  paletteKey: PaletteKey | null;
  fontPairKey: FontPairKey | null;
  vibe: {
    minimalBold: VibeAxis;      // -1 minimal, +1 bold
    classicModern: VibeAxis;    // -1 classic, +1 modern
    calmEnergetic: VibeAxis;    // -1 calm, +1 energetic
  };
  brief: string;
  imageStrategy: "curated" | "ai";
};

const INITIAL_STATE: WizardState = {
  step: 0,
  locale: null,
  vertical: null,
  goal: null,
  templateKey: null,
  paletteKey: null,
  fontPairKey: null,
  vibe: { minimalBold: 0, classicModern: 0, calmEnergetic: 0 },
  brief: "",
  imageStrategy: "curated",
};

const STEP_TITLES = [
  "Language",
  "Industry",
  "Goal",
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
  const wizardLocale = routeLocale === "de" ? "de-CH" : routeLocale === "fr" ? "fr-CH" : routeLocale === "it" ? "it-CH" : "en";

  const [state, setState] = useState<WizardState>(() => ({ ...INITIAL_STATE, locale: wizardLocale as WizardLocale }));
  const [generating, setGenerating] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // ─── Load templates when entering the template step ─────────────────────────
  useEffect(() => {
    if (state.step !== 3 || !state.vertical) return;
    let cancelled = false;
    setTemplatesLoading(true);
    trpc.landingPages.listTemplates
      .query({ vertical: state.vertical, goal: state.goal ?? undefined })
      .then((data) => { if (!cancelled) setTemplates(data as TemplateLite[]); })
      .catch(() => { if (!cancelled) setTemplates([]); })
      .finally(() => { if (!cancelled) setTemplatesLoading(false); });
    return () => { cancelled = true; };
  }, [state.step, state.vertical, state.goal]);

  // ─── Polling: when generating, poll the page status until ready ─────────────
  useEffect(() => {
    if (!generatingId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const page = await trpc.landingPages.getPage.query({ pageId: generatingId });
        if (cancelled) return;
        if (page?.currentVersionId) {
          router.push(`/${routeLocale}/landing-pages/${generatingId}/edit`);
        }
      } catch {
        /* keep polling on transient errors */
      }
    };
    const interval = setInterval(tick, 2000);
    void tick();
    return () => { cancelled = true; clearInterval(interval); };
  }, [generatingId, routeLocale, router]);

  // ─── Step navigation ────────────────────────────────────────────────────────

  const canAdvance = useMemo(() => {
    switch (state.step) {
      case 0: return state.locale !== null;
      case 1: return state.vertical !== null;
      case 2: return state.goal !== null;
      case 3: return state.templateKey !== null;
      case 4: return state.paletteKey !== null;
      case 5: return state.fontPairKey !== null;
      case 6: return true;
      case 7: return state.brief.trim().length >= 10;
      case 8: return true;
      case 9: return true;
      default: return false;
    }
  }, [state]);

  const next = useCallback(() => setState((s) => ({ ...s, step: Math.min(s.step + 1, TOTAL_STEPS - 1) })), []);
  const back = useCallback(() => setState((s) => ({ ...s, step: Math.max(s.step - 1, 0) })), []);

  const handleGenerate = useCallback(async () => {
    if (!state.locale || !state.vertical || !state.goal || !state.templateKey || !state.paletteKey || !state.fontPairKey) {
      setGenerationError("Please complete all steps.");
      return;
    }
    setGenerating(true);
    setGenerationError(null);
    try {
      const result = await trpc.landingPages.generateFromWizard.mutate({
        locale: state.locale,
        vertical: state.vertical,
        goal: state.goal,
        templateKey: state.templateKey,
        paletteKey: state.paletteKey,
        fontPairKey: state.fontPairKey,
        vibe: state.vibe,
        brief: state.brief.trim(),
        imageStrategy: state.imageStrategy,
      });
      setGeneratingId(result.landingPageId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed. Please try again.";
      setGenerationError(message);
      setGenerating(false);
    }
  }, [state]);

  // ─── Generation in progress screen ──────────────────────────────────────────
  if (generating) {
    return <GeneratingScreen error={generationError} onCancel={() => { setGenerating(false); setGeneratingId(null); }} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* ─── Header / progress ─── */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/${routeLocale}/landing-pages`)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              aria-label="Exit wizard"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
            <div>
              <p className="text-xs text-gray-500 font-medium">Step {state.step + 1} of {TOTAL_STEPS}</p>
              <h1 className="text-lg font-semibold text-gray-900">{STEP_TITLES[state.step]}</h1>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {STEP_TITLES.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${i < state.step ? "bg-purple-600 w-8" : i === state.step ? "bg-purple-600 w-12" : "bg-gray-200 w-8"}`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* ─── Step body ─── */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        {state.step === 0 && <StepLocale state={state} setState={setState} />}
        {state.step === 1 && <StepVertical state={state} setState={setState} />}
        {state.step === 2 && <StepGoal state={state} setState={setState} />}
        {state.step === 3 && <StepTemplate state={state} setState={setState} templates={templates} loading={templatesLoading} />}
        {state.step === 4 && <StepPalette state={state} setState={setState} />}
        {state.step === 5 && <StepFont state={state} setState={setState} />}
        {state.step === 6 && <StepVibe state={state} setState={setState} />}
        {state.step === 7 && <StepBrief state={state} setState={setState} />}
        {state.step === 8 && <StepImageStrategy state={state} setState={setState} />}
        {state.step === 9 && <StepReview state={state} />}
      </main>

      {/* ─── Footer navigation ─── */}
      <footer className="sticky bottom-0 bg-white border-t border-gray-200 shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={back}
            disabled={state.step === 0}
            className="px-5 py-2.5 rounded-lg text-gray-700 font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
          {state.step < TOTAL_STEPS - 1 ? (
            <button
              onClick={next}
              disabled={!canAdvance}
              className="px-6 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-purple-200"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-8 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:from-purple-700 hover:to-pink-700 shadow-lg shadow-purple-200 disabled:opacity-40"
            >
              ✨ Generate my page
            </button>
          )}
        </div>
        {generationError && (
          <div className="max-w-5xl mx-auto px-6 pb-3">
            <p className="text-sm text-red-600">{generationError}</p>
          </div>
        )}
      </footer>
    </div>
  );
}

// ─── Step components ─────────────────────────────────────────────────────────

type StepProps = { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> };

function StepLocale({ state, setState }: StepProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">What language should your page be in?</h2>
      <p className="text-gray-600 mb-8">Your visitors will see this language. You can change it later.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {LOCALES.map((loc) => (
          <button
            key={loc.key}
            onClick={() => setState((s) => ({ ...s, locale: loc.key }))}
            className={`text-left p-5 rounded-xl border-2 transition-all ${state.locale === loc.key ? "border-purple-600 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{loc.flag}</span>
              <span className="font-semibold text-gray-900">{loc.label}</span>
            </div>
            <p className="text-sm text-gray-500">{loc.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepVertical({ state, setState }: StepProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">What kind of business?</h2>
      <p className="text-gray-600 mb-8">We&apos;ll suggest templates that fit.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {VERTICALS.map((v) => (
          <button
            key={v.key}
            onClick={() => setState((s) => ({ ...s, vertical: v.key, templateKey: null }))}
            className={`p-6 rounded-xl border-2 transition-all text-center ${state.vertical === v.key ? "border-purple-600 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}
          >
            <div className="text-4xl mb-2">{v.icon}</div>
            <p className="font-semibold text-gray-900">{v.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepGoal({ state, setState }: StepProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">What&apos;s the main goal?</h2>
      <p className="text-gray-600 mb-8">One primary goal per page works best.</p>
      <div className="space-y-3">
        {GOALS.map((g) => (
          <button
            key={g.key}
            onClick={() => setState((s) => ({ ...s, goal: g.key, templateKey: null }))}
            className={`w-full flex items-start gap-4 p-5 rounded-xl border-2 transition-all text-left ${state.goal === g.key ? "border-purple-600 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}
          >
            <div className="text-3xl flex-shrink-0">{g.icon}</div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 mb-0.5">{g.label}</p>
              <p className="text-sm text-gray-500">{g.description}</p>
            </div>
            {state.goal === g.key && (
              <svg className="w-6 h-6 text-purple-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            )}
          </button>
        ))}
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

function StepTemplate({ state, setState, templates, loading }: StepProps & { templates: TemplateLite[]; loading: boolean }) {
  const filtered = useMemo(
    () => templates.filter((t) => t.availableLocales.length > 0),
    [templates],
  );
  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">Pick a starting template</h2>
      <p className="text-gray-600 mb-8">We&apos;ll personalize the copy and visuals to your business in the next steps.</p>
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading templates…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No templates yet for this combination. Try a different industry or goal.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((t) => {
            const screenshot = t.screenshotUrlsByLocale[state.locale ?? "de-CH"]?.desktop
              ?? t.screenshotUrlsByLocale["de-CH"]?.desktop
              ?? t.screenshotUrlsByLocale["en"]?.desktop;
            return (
              <button
                key={t.id}
                onClick={() => setState((s) => ({ ...s, templateKey: t.key }))}
                className={`text-left rounded-xl overflow-hidden border-2 transition-all bg-white ${state.templateKey === t.key ? "border-purple-600 shadow-xl scale-[1.02]" : "border-gray-200 hover:border-purple-300 hover:shadow-md"}`}
              >
                <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                  {screenshot ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={screenshot} alt={t.nameKey} className="w-full h-full object-cover" />
                  ) : (
                    <iframe src={`/p/preview/${t.key}/${state.locale ?? "de-CH"}`} className="w-full h-full pointer-events-none origin-top-left" style={{ width: 1280, height: 960, transform: "scale(0.235)" }} />
                  )}
                  {t.swissSpecific && <span className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded-md font-bold">🇨🇭 Swiss</span>}
                </div>
                <div className="p-4">
                  <p className="font-semibold text-gray-900 mb-1 capitalize">{t.vertical} · {t.style}</p>
                  <p className="text-xs text-gray-500">{t.availableLocales.length} languages available</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StepPalette({ state, setState }: StepProps) {
  const [showSwissOnly, setShowSwissOnly] = useState(false);
  const visible = showSwissOnly ? PALETTES.filter((p) => p.swiss) : PALETTES;
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Pick a color palette</h2>
          <p className="text-gray-600">Sets the brand color used across CTAs and accents.</p>
        </div>
        <button
          onClick={() => setShowSwissOnly((v) => !v)}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${showSwissOnly ? "bg-red-600 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"}`}
        >
          🇨🇭 Swiss only
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-8">
        {visible.map((p) => (
          <button
            key={p.key}
            onClick={() => setState((s) => ({ ...s, paletteKey: p.key }))}
            className={`text-left rounded-xl overflow-hidden border-2 transition-all ${state.paletteKey === p.key ? "border-purple-600 shadow-lg scale-[1.03]" : "border-gray-200 hover:border-purple-300"}`}
          >
            <div className="h-24 relative" style={{ background: p.primary }}>
              {p.swiss && <span className="absolute top-2 right-2 text-xs bg-white/90 text-red-700 px-1.5 py-0.5 rounded font-bold">🇨🇭</span>}
            </div>
            <div className="p-3 bg-white">
              <p className="font-semibold text-sm text-gray-900">{p.name}</p>
              <p className="text-xs text-gray-500 capitalize">{p.vibe}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepFont({ state, setState }: StepProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">Choose a typography pair</h2>
      <p className="text-gray-600 mb-8">Headings and body text — proven combinations that always look great together.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {FONT_PAIRS.map((f) => (
          <button
            key={f.key}
            onClick={() => setState((s) => ({ ...s, fontPairKey: f.key }))}
            className={`text-left p-5 rounded-xl border-2 transition-all bg-white ${state.fontPairKey === f.key ? "border-purple-600 shadow-md" : "border-gray-200 hover:border-purple-300"}`}
          >
            <p className="font-bold text-xl text-gray-900 mb-1" style={{ fontFamily: `'${f.heading}', system-ui` }}>{f.heading}</p>
            <p className="text-sm text-gray-600 mb-3" style={{ fontFamily: `'${f.body}', serif` }}>The quick brown fox jumps over the lazy dog.</p>
            <p className="text-xs text-gray-500 font-medium">{f.vibe}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function VibeSlider({ value, onChange, leftLabel, rightLabel }: { value: number; onChange: (v: number) => void; leftLabel: string; rightLabel: string }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200">
      <div className="flex justify-between mb-3">
        <span className={`text-sm font-medium ${value < 0 ? "text-purple-600" : "text-gray-500"}`}>{leftLabel}</span>
        <span className={`text-sm font-medium ${value > 0 ? "text-purple-600" : "text-gray-500"}`}>{rightLabel}</span>
      </div>
      <input
        type="range"
        min={-100}
        max={100}
        value={value * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full h-2 bg-gradient-to-r from-purple-300 via-gray-200 to-purple-300 rounded-full appearance-none cursor-pointer"
      />
    </div>
  );
}

function StepVibe({ state, setState }: StepProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">What&apos;s the vibe?</h2>
      <p className="text-gray-600 mb-8">Drag the sliders. Tells the AI how to write copy and pick imagery.</p>
      <div className="space-y-4">
        <VibeSlider value={state.vibe.minimalBold}     onChange={(v) => setState((s) => ({ ...s, vibe: { ...s.vibe, minimalBold: v }    }))} leftLabel="Minimal"  rightLabel="Bold" />
        <VibeSlider value={state.vibe.classicModern}   onChange={(v) => setState((s) => ({ ...s, vibe: { ...s.vibe, classicModern: v }  }))} leftLabel="Classic"  rightLabel="Modern" />
        <VibeSlider value={state.vibe.calmEnergetic}   onChange={(v) => setState((s) => ({ ...s, vibe: { ...s.vibe, calmEnergetic: v }  }))} leftLabel="Calm"     rightLabel="Energetic" />
      </div>
    </div>
  );
}

function StepBrief({ state, setState }: StepProps) {
  const placeholderByLocale: Record<WizardLocale, string> = {
    "de-CH": "z.B. Spezialitätenkaffee in Zürich mit Sonntags-Brunch. Wir möchten neue Stammgäste gewinnen.",
    "fr-CH": "p.ex. Café de spécialité à Genève avec brunch dominical. Nous voulons attirer de nouveaux habitués.",
    "it-CH": "p.es. Caffè di specialità a Lugano con brunch domenicale. Vogliamo conquistare nuovi clienti abituali.",
    "en":    "e.g. Specialty coffee shop in Zurich with Sunday brunch. We want to attract new regulars.",
  };
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">Tell us about your business</h2>
      <p className="text-gray-600 mb-8">1-3 sentences. What you offer, who it&apos;s for, what makes it special. The AI uses this to personalize the copy.</p>
      <textarea
        value={state.brief}
        onChange={(e) => setState((s) => ({ ...s, brief: e.target.value }))}
        placeholder={placeholderByLocale[state.locale ?? "en"]}
        rows={6}
        className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-gray-900 resize-none text-base leading-relaxed"
        maxLength={800}
      />
      <div className="flex justify-between mt-2 text-sm">
        <span className={state.brief.trim().length < 10 ? "text-red-500" : "text-gray-500"}>
          {state.brief.trim().length < 10 ? `${10 - state.brief.trim().length} more characters needed` : "✓ Looks good"}
        </span>
        <span className="text-gray-400">{state.brief.length}/800</span>
      </div>
    </div>
  );
}

function StepImageStrategy({ state, setState }: StepProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">How should we handle images?</h2>
      <p className="text-gray-600 mb-8">You can always swap them later in the editor.</p>
      <div className="space-y-3">
        <button
          onClick={() => setState((s) => ({ ...s, imageStrategy: "curated" }))}
          className={`w-full flex items-start gap-4 p-5 rounded-xl border-2 text-left transition-all ${state.imageStrategy === "curated" ? "border-purple-600 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}
        >
          <div className="text-3xl">📸</div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Use curated stock photos</p>
            <p className="text-sm text-gray-500 mt-0.5">Hand-picked high-quality Unsplash photos that fit your industry. Free, instant.</p>
          </div>
          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-semibold">Recommended</span>
        </button>
        <button
          onClick={() => setState((s) => ({ ...s, imageStrategy: "ai" }))}
          className={`w-full flex items-start gap-4 p-5 rounded-xl border-2 text-left transition-all ${state.imageStrategy === "ai" ? "border-purple-600 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}
        >
          <div className="text-3xl">✨</div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Generate unique brand images with AI</p>
            <p className="text-sm text-gray-500 mt-0.5">FLUX generates photos tailored to your brand. Adds ~30s and ~CHF 0.15.</p>
          </div>
          <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded font-semibold">Beta</span>
        </button>
      </div>
    </div>
  );
}

function StepReview({ state }: { state: WizardState }) {
  const palette = PALETTES.find((p) => p.key === state.paletteKey);
  const font = FONT_PAIRS.find((f) => f.key === state.fontPairKey);
  const vertical = VERTICALS.find((v) => v.key === state.vertical);
  const goal = GOALS.find((g) => g.key === state.goal);
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">All set?</h2>
      <p className="text-gray-600 mb-8">Quick review before we generate. You can edit everything later.</p>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
        <ReviewRow label="Language"   value={`${LOCALES.find((l) => l.key === state.locale)?.flag} ${LOCALES.find((l) => l.key === state.locale)?.label}`} />
        <ReviewRow label="Industry"   value={`${vertical?.icon} ${vertical?.label}`} />
        <ReviewRow label="Goal"       value={`${goal?.icon} ${goal?.label}`} />
        <ReviewRow label="Template"   value={state.templateKey ?? "—"} />
        <ReviewRow label="Palette"    value={palette?.name ?? "—"} swatch={palette?.primary} />
        <ReviewRow label="Typography" value={`${font?.heading} + ${font?.body}`} />
        <ReviewRow label="Vibe"       value={describeVibe(state.vibe)} />
        <ReviewRow label="Images"     value={state.imageStrategy === "ai" ? "AI-generated (FLUX)" : "Curated stock"} />
      </div>
      <div className="mt-6 bg-purple-50 border border-purple-100 rounded-xl p-4">
        <p className="text-sm text-purple-900 font-semibold mb-1">Your brief:</p>
        <p className="text-sm text-purple-800 italic">&ldquo;{state.brief}&rdquo;</p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <div className="flex items-center gap-2 text-gray-900 font-medium">
        {swatch && <span className="w-5 h-5 rounded-full border border-gray-200" style={{ background: swatch }} />}
        {value}
      </div>
    </div>
  );
}

function describeVibe(vibe: WizardState["vibe"]): string {
  const parts: string[] = [];
  parts.push(Math.abs(vibe.minimalBold) < 0.2 ? "balanced" : vibe.minimalBold > 0 ? "bold" : "minimal");
  parts.push(Math.abs(vibe.classicModern) < 0.2 ? "neutral" : vibe.classicModern > 0 ? "modern" : "classic");
  parts.push(Math.abs(vibe.calmEnergetic) < 0.2 ? "even" : vibe.calmEnergetic > 0 ? "energetic" : "calm");
  return parts.join(" · ");
}

// ─── Generating screen ──────────────────────────────────────────────────────

function GeneratingScreen({ error, onCancel }: { error: string | null; onCancel: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        {error ? (
          <>
            <div className="text-6xl mb-6">😕</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button onClick={onCancel} className="px-6 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700">
              Go back
            </button>
          </>
        ) : (
          <>
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 rounded-full border-4 border-purple-200 animate-pulse" />
              <div className="absolute inset-0 rounded-full border-4 border-purple-600 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-3xl">✨</div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Crafting your page…</h1>
            <p className="text-gray-600 mb-1">This takes about 30 seconds.</p>
            <p className="text-sm text-gray-500">We&apos;re writing copy, picking layouts, and assembling your design.</p>
          </>
        )}
      </div>
    </div>
  );
}
