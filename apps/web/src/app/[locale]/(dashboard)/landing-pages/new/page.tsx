"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { trpc } from "../../../../../lib/trpc";
import { DevicePreview } from "../../../../../components/landing/device-preview";

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionStub = { type: string; order: number };
type ScreenshotsByLocale = Record<string, { phone?: string; tablet?: string; desktop?: string }>;

type Template = {
  id: string;
  key: string;
  nameKey: string;
  descriptionKey: string;
  vertical: string;
  style: string;
  goal: string | null;
  themeKey: string | null;
  imageBundleKey: string | null;
  swissSpecific: boolean;
  availableLocales: string[];
  screenshotUrlsByLocale: ScreenshotsByLocale;
  // Legacy fields preserved for backwards-compat
  defaultSections: SectionStub[];
  defaultBrandHints: Record<string, string>;
  screenshotUrl: string | null;
};

// ─── Vertical / goal / style metadata ─────────────────────────────────────────

const VERTICALS = ["all", "cafe", "restaurant", "fitness", "clinic", "retail", "service"] as const;
type VerticalFilter = (typeof VERTICALS)[number];

const VERTICAL_ICONS: Record<string, string> = {
  cafe: "☕",
  restaurant: "🍽️",
  fitness: "🏋️",
  clinic: "⚕️",
  retail: "🛍️",
  service: "💼",
  generic: "🏢",
};

const VERTICAL_LABELS: Record<string, string> = {
  cafe: "Café",
  restaurant: "Restaurant",
  fitness: "Fitness",
  clinic: "Clinic",
  retail: "Retail",
  service: "Service",
  generic: "Generic",
};

const STYLE_COLORS: Record<string, string> = {
  minimal: "bg-gray-100 text-gray-700",
  bold: "bg-orange-100 text-orange-700",
  elegant: "bg-purple-100 text-purple-700",
  playful: "bg-green-100 text-green-700",
};

const GOAL_LABELS: Record<string, string> = {
  lead_capture: "Lead capture",
  sales_promo: "Sales promo",
  event_signup: "Event signup",
  appointment_booking: "Appointments",
  info_brochure: "Brochure",
};

const LOCALE_FLAGS: Record<string, string> = {
  "de-CH": "🇨🇭 DE",
  "fr-CH": "🇨🇭 FR",
  "it-CH": "🇨🇭 IT",
  en: "🌐 EN",
};

const LOCALES_DISPLAY_ORDER: Array<"de-CH" | "fr-CH" | "it-CH" | "en"> = ["de-CH", "fr-CH", "it-CH", "en"];

// ─── Icons ────────────────────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? "w-4 h-4"}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickPreviewLocale(template: Template, uiLocale: string): string {
  if (template.availableLocales.includes(uiLocale)) return uiLocale;
  if (template.availableLocales.includes("de-CH")) return "de-CH";
  if (template.availableLocales.includes("en")) return "en";
  return template.availableLocales[0] ?? "de-CH";
}

function previewUrl(templateKey: string, locale: string): string {
  return `/p/preview/${templateKey}/${locale}`;
}

function cardThumbUrl(templateKey: string, locale: string): string {
  return `/p/preview-card/${templateKey}/${locale}`;
}

// ─── Concurrency semaphore — max 2 card iframes loading at once ───────────────

let _activeLoads = 0;
const _MAX_CONCURRENT = 2;
const _waitQueue: Array<() => void> = [];

function acquireIframeSlot(): Promise<void> {
  if (_activeLoads < _MAX_CONCURRENT) {
    _activeLoads++;
    return Promise.resolve();
  }
  return new Promise((resolve) => _waitQueue.push(() => { _activeLoads++; resolve(); }));
}

function releaseIframeSlot() {
  _activeLoads = Math.max(0, _activeLoads - 1);
  const next = _waitQueue.shift();
  if (next) next();
}

// ─── Mini-iframe preview — lazy-loaded, concurrency-limited, no-script ────────
//
// Prefers a static screenshot (<img>) when available (instant, zero server load).
// Falls back to /p/preview-card/ iframe when no screenshot exists yet.
// Run `pnpm --filter @marketing/web screenshots` to populate screenshots.
//
// Iframe path uses /p/preview-card/ (not /p/preview/) which is:
//   - 24h ISR cached (no DB hit on repeat loads)
//   - System fonts only (no Google Fonts network request)
//   - Top 2 sections only (hero + one more) — fast to render
// Sandbox has no allow-scripts — the lightweight card page has no JS to run.
// At most 2 iframes load simultaneously (module-level semaphore above).

function CardPreview({
  templateKey,
  locale,
  screenshotUrl,
}: {
  templateKey: string;
  locale: string;
  screenshotUrl?: string | null;
}) {
  // Hooks must always run regardless of screenshotUrl (React rules of hooks).
  // They are no-ops when screenshotUrl is present.
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [src, setSrc] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const releasedRef = React.useRef(false);

  React.useEffect(() => {
    if (screenshotUrl) return; // static screenshot — no iframe needed
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          obs.disconnect();
          void acquireIframeSlot().then(() => {
            if (!cancelled) setSrc(cardThumbUrl(templateKey, locale));
            else releaseIframeSlot();
          });
        }
      },
      { rootMargin: "150px" },
    );
    obs.observe(el);
    return () => {
      cancelled = true;
      obs.disconnect();
    };
  }, [templateKey, locale, screenshotUrl]);

  function handleLoad() {
    setLoaded(true);
    if (!releasedRef.current) { releasedRef.current = true; releaseIframeSlot(); }
  }

  // Fast path: pre-generated screenshot — instant, zero server load
  if (screenshotUrl) {
    return (
      <div className="relative bg-gray-100 overflow-hidden" style={{ height: 220 }}>
        <img
          src={screenshotUrl}
          alt="Template preview"
          className="w-full h-full object-cover object-top"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative bg-gray-100 overflow-hidden" style={{ height: 220 }}>
      {src && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1280,
            height: 1280,
            transform: "scale(0.255)",
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          <iframe
            src={src}
            title="Template preview"
            style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#fff" }}
            sandbox="allow-same-origin"
            onLoad={handleLoad}
          />
        </div>
      )}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gray-200" />
      )}
    </div>
  );
}

// ─── Generate modal ───────────────────────────────────────────────────────────

function GenerateModal({
  template,
  onClose,
  onGenerate,
  onUseAsIs,
  isGenerating,
  isCreating,
  t,
}: {
  template: Template | null;
  onClose: () => void;
  onGenerate: (prompt: string, applyBrand: boolean) => void;
  onUseAsIs: () => void;
  isGenerating: boolean;
  isCreating: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [prompt, setPrompt] = useState("");
  const [applyBrand, setApplyBrand] = useState(false);

  const isTemplate = template !== null;
  const busy = isGenerating || isCreating;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // From scratch still requires a brief; template personalisation does not.
    if (!isTemplate && !prompt.trim()) return;
    onGenerate(prompt.trim(), applyBrand);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b flex-shrink-0">
          {isTemplate && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{VERTICAL_ICONS[template.vertical] ?? "📄"}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STYLE_COLORS[template.style] ?? "bg-gray-100 text-gray-600"}`}>
                {template.style}
              </span>
              {template.swissSpecific && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">🇨🇭 Swiss</span>
              )}
            </div>
          )}
          <h2 className="text-base font-semibold text-gray-900">
            {isTemplate ? t("modalTitleTemplate") : t("modalTitleScratch")}
          </h2>
          {isTemplate && (
            <p className="text-sm text-gray-500 mt-1">{t(`${template.nameKey}` as Parameters<typeof t>[0])}</p>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {/* ── Option A: Use the template exactly as shown (instant, no AI) ── */}
          {isTemplate && (
            <div className="px-6 pt-5">
              <div className="rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{t("useAsIsTitle")}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t("useAsIsDesc")}</p>
                </div>
                <button
                  type="button"
                  onClick={onUseAsIs}
                  disabled={busy}
                  className="flex-shrink-0 text-sm font-medium px-4 py-2 rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isCreating && <SpinnerIcon className="w-3.5 h-3.5" />}
                  {isCreating ? t("creating") : t("useAsIs")}
                </button>
              </div>

              <div className="flex items-center gap-3 my-4">
                <div className="h-px bg-gray-200 flex-1" />
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{t("orPersonalise")}</span>
                <div className="h-px bg-gray-200 flex-1" />
              </div>
            </div>
          )}

          {/* ── Option B: Personalise with AI (prompt optional for templates) ── */}
          <form onSubmit={handleSubmit} className={`px-6 ${isTemplate ? "pb-5" : "py-5"} flex flex-col gap-4`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t("promptLabel")}
                {isTemplate && <span className="text-gray-400 font-normal ml-1">{t("optional")}</span>}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t("promptPlaceholder")}
                rows={4}
                disabled={busy}
                autoFocus={!isTemplate}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-black/10 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {/* Brand opt-in — keep template style by default; only fold in brand when asked. */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyBrand}
                onChange={(e) => setApplyBrand(e.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-black focus:ring-black/20"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-700">{t("applyBrandTitle")}</span>
                <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">{t("applyBrandDesc")}</span>
              </span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} disabled={busy} className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50">
                {t("cancel")}
              </button>
              <button type="submit" disabled={busy || (!isTemplate && !prompt.trim())} className="text-sm font-medium px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                {isGenerating && <SpinnerIcon className="w-3.5 h-3.5" />}
                {isGenerating ? t("generating") : (isTemplate ? t("personaliseWithAi") : t("generate"))}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Template preview modal (v2): DevicePreview + locale switcher ─────────────

function TemplatePreviewModal({
  template,
  initialLocale,
  onClose,
  onUse,
  t,
}: {
  template: Template;
  initialLocale: string;
  onClose: () => void;
  onUse: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [activeLocale, setActiveLocale] = useState(initialLocale);

  const availableLocales = useMemo(() => {
    return LOCALES_DISPLAY_ORDER.filter((l) => template.availableLocales.includes(l));
  }, [template.availableLocales]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xl">{VERTICAL_ICONS[template.vertical] ?? "📄"}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STYLE_COLORS[template.style] ?? "bg-gray-100 text-gray-600"}`}>
                {template.style}
              </span>
              {template.goal && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                  {GOAL_LABELS[template.goal] ?? template.goal}
                </span>
              )}
              {template.swissSpecific && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">🇨🇭 Swiss-styled</span>
              )}
            </div>
            <h2 className="text-lg font-bold text-gray-900">{t(template.nameKey as Parameters<typeof t>[0])}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{t(template.descriptionKey as Parameters<typeof t>[0])}</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors mt-0.5" aria-label="Close">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Locale switcher */}
        {availableLocales.length > 1 && (
          <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-2">Language</span>
            {availableLocales.map((loc) => (
              <button
                key={loc}
                onClick={() => setActiveLocale(loc)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  activeLocale === loc
                    ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {LOCALE_FLAGS[loc] ?? loc}
              </button>
            ))}
          </div>
        )}

        {/* Device preview */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <DevicePreview url={previewUrl(template.key, activeLocale)} initialDevice="desktop" maxHeight="58vh" />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-700 transition-colors">
            Close
          </button>
          <button onClick={onUse} className="text-sm font-medium px-5 py-2 rounded-lg bg-black text-white hover:bg-gray-800 transition-colors flex items-center gap-1.5">
            {t("useTemplate")}
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M2 8a.75.75 0 01.75-.75h8.69L8.22 4.03a.75.75 0 011.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06l3.22-3.22H2.75A.75.75 0 012 8z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template card (v2): real iframe preview ─────────────────────────────────

function TemplateCard({
  template,
  uiLocale,
  onSelect,
  onPreview,
  t,
}: {
  template: Template;
  uiLocale: string;
  onSelect: (template: Template) => void;
  onPreview: (template: Template) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const cardLocale = pickPreviewLocale(template, uiLocale);
  const fullyTranslated = template.availableLocales.length >= 4;

  const screenshotUrl =
    (template.screenshotUrlsByLocale[cardLocale] as { desktop?: string } | undefined)?.desktop ??
    (template.screenshotUrlsByLocale["de-CH"] as { desktop?: string } | undefined)?.desktop ??
    template.screenshotUrl ??
    null;

  return (
    <div className="group bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-md transition-all flex flex-col overflow-hidden">
      <CardPreview templateKey={template.key} locale={cardLocale} screenshotUrl={screenshotUrl} />

      <div className="px-4 pt-3.5 pb-2 flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">{VERTICAL_ICONS[template.vertical] ?? "📄"}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STYLE_COLORS[template.style] ?? "bg-gray-100 text-gray-600"}`}>
            {template.style}
          </span>
          {template.swissSpecific && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100" title="Swiss-styled theme">🇨🇭</span>
          )}
        </div>
        <p className="text-sm font-semibold text-gray-900 leading-snug">{t(template.nameKey as Parameters<typeof t>[0])}</p>
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{t(template.descriptionKey as Parameters<typeof t>[0])}</p>

        {/* Locale availability */}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {LOCALES_DISPLAY_ORDER.map((loc) => {
            const has = template.availableLocales.includes(loc);
            return (
              <span
                key={loc}
                title={has ? `Available in ${loc}` : `Not available in ${loc} yet`}
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  has ? "bg-green-50 text-green-700 border border-green-100" : "bg-gray-50 text-gray-400 border border-gray-100"
                }`}
              >
                {LOCALE_FLAGS[loc]?.split(" ")[1] ?? loc}
              </span>
            );
          })}
          {fullyTranslated && (
            <span className="ml-auto text-[10px] font-medium text-green-700">✓ All locales</span>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2 flex gap-2">
        <button
          onClick={() => onPreview(template)}
          className="flex-1 text-center text-xs font-medium text-gray-600 border border-gray-200 hover:border-gray-400 hover:bg-gray-50 rounded-lg px-3 py-2 transition-all"
        >
          Preview
        </button>
        <button
          onClick={() => onSelect(template)}
          className="flex-1 text-center text-xs font-medium text-black border border-gray-200 hover:border-black hover:bg-black hover:text-white rounded-lg px-3 py-2 transition-all"
        >
          {t("useTemplate")}
        </button>
      </div>
    </div>
  );
}

// ─── Scratch card ─────────────────────────────────────────────────────────────

function ScratchCard({ onSelect, t }: { onSelect: () => void; t: ReturnType<typeof useTranslations> }) {
  return (
    <button onClick={onSelect} className="group text-left bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-black transition-all flex flex-col overflow-hidden">
      <div className="bg-gray-50 px-4 py-5 border-b border-dashed border-gray-200 flex items-center justify-center" style={{ height: 220 }}>
        <span className="text-4xl opacity-40 group-hover:opacity-70 transition-opacity">✨</span>
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <p className="text-sm font-semibold text-gray-900">{t("startFromScratch")}</p>
        <p className="text-xs text-gray-500 leading-relaxed">{t("startFromScratchDesc")}</p>
      </div>
      <div className="px-4 pb-4">
        <span className="block text-center text-xs font-medium text-gray-700 border border-gray-200 group-hover:border-black group-hover:bg-black group-hover:text-white rounded-lg px-3 py-2 transition-all">
          {t("startFromScratch")}
        </span>
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewLandingPagePage() {
  const t = useTranslations("TemplatesPage");
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";

  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [verticalFilter, setVerticalFilter] = useState<VerticalFilter>("all");
  const [swissOnly, setSwissOnly] = useState(false);

  const [modalTemplate, setModalTemplate] = useState<Template | null | undefined>(undefined);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      const data = await trpc.landingPages.listTemplates.query();
      setTemplates(data as Template[]);
    } catch {
      // Templates are best-effort
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const filtered = useMemo(() => {
    return templates.filter((tpl) => {
      // Hide legacy templates (v1) — they have no sections_by_locale data so their iframe preview would be blank.
      if (!tpl.availableLocales || tpl.availableLocales.length === 0) return false;
      if (verticalFilter !== "all" && tpl.vertical !== verticalFilter) return false;
      if (swissOnly && !tpl.swissSpecific) return false;
      return true;
    });
  }, [templates, verticalFilter, swissOnly]);

  const availableVerticals = useMemo(
    () => Array.from(new Set(templates.map((t) => t.vertical))),
    [templates],
  );

  async function handleGenerate(prompt: string, applyBrand: boolean) {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const templateKey = modalTemplate?.key ?? undefined;
      await trpc.landingPages.draftFromPrompt.mutate({
        prompt: prompt || undefined,
        templateKey,
        applyBrand,
      });
      router.push(`/${locale}/landing-pages`);
    } catch {
      setGenerateError(t("generateError"));
      setIsGenerating(false);
    }
  }

  // "Use template as-is" — instant materialisation, then jump straight to the editor.
  async function handleUseAsIs() {
    if (!modalTemplate) return;
    setIsCreating(true);
    setGenerateError(null);
    try {
      const { landingPageId } = await trpc.landingPages.createFromTemplate.mutate({
        templateKey: modalTemplate.key,
      });
      router.push(`/${locale}/landing-pages/${landingPageId}/edit`);
    } catch {
      setGenerateError(t("generateError"));
      setIsCreating(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => router.push(`/${locale}/landing-pages`)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <BackIcon />
              {t("back")}
            </button>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">{t("title")}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{t("subtitle")}</p>
            </div>
            <button
              onClick={() => router.push(`/${locale}/landing-pages/new/wizard`)}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:from-purple-700 hover:to-pink-700 shadow-lg shadow-purple-100 flex items-center gap-2 transition-all"
            >
              <span>✨</span>
              <span>Use AI wizard</span>
              <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded">New</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3">
        {/* Vertical filter tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
          {VERTICALS.filter((v) => v === "all" || availableVerticals.includes(v)).map((v) => (
            <button
              key={v}
              onClick={() => setVerticalFilter(v)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                verticalFilter === v
                  ? "border-black text-black font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {v !== "all" && <span>{VERTICAL_ICONS[v]}</span>}
              {v === "all" ? "All" : VERTICAL_LABELS[v] ?? v}
            </button>
          ))}
        </div>

        {/* Secondary filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSwissOnly((x) => !x)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
              swissOnly
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            🇨🇭 Swiss-styled only
          </button>
          <span className="text-xs text-gray-500 ml-2">
            {filtered.length} template{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {generateError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
          {generateError}
        </p>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse">
              <div className="h-48 bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-2/3" />
                <div className="h-3 bg-gray-200 rounded w-full" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <ScratchCard onSelect={() => setModalTemplate(null)} t={t} />
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              uiLocale={locale}
              onSelect={(tpl) => setModalTemplate(tpl)}
              onPreview={(tpl) => setPreviewTemplate(tpl)}
              t={t}
            />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-12">
          {t("noTemplatesForVertical")}
        </p>
      )}

      {/* Preview modal */}
      {previewTemplate !== null && (
        <TemplatePreviewModal
          template={previewTemplate}
          initialLocale={pickPreviewLocale(previewTemplate, locale)}
          onClose={() => setPreviewTemplate(null)}
          onUse={() => {
            setModalTemplate(previewTemplate);
            setPreviewTemplate(null);
          }}
          t={t}
        />
      )}

      {/* Generate modal */}
      {modalTemplate !== undefined && (
        <GenerateModal
          template={modalTemplate}
          onClose={() => {
            if (!isGenerating && !isCreating) setModalTemplate(undefined);
          }}
          onGenerate={handleGenerate}
          onUseAsIs={handleUseAsIs}
          isGenerating={isGenerating}
          isCreating={isCreating}
          t={t}
        />
      )}
    </div>
  );
}
