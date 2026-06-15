"use client";

// LP-5: Visual editor v2.
// Two-column layout: left sidebar of section blocks (inline editing + variant + reorder),
// right side a live preview iframe with device toggle. Top toolbar with theme picker
// (palette + font) and publish button.

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { trpc } from "../../../../../../lib/trpc";
import { VariantSwitcherModal } from "../../../../../../components/landing/editor/variant-switcher";
import { ThemePickerButton } from "../../../../../../components/landing/editor/theme-picker";
import { ImageSwapModal } from "../../../../../../components/landing/editor/image-swap-modal";
import { CodePreviewPanel } from "../../../../../../components/landing/editor/code-preview-panel";
import { renderRich } from "../../../../../../components/landing/rich-text";
import type { LandingPageComposition, SectionType } from "@marketing/ai-router";
import {
  LANDING_PAGE_LOCALES,
  normalizeLandingLanguagePreferences,
  type LandingLanguagePreferences,
  type LandingPageLocale,
} from "../../../../../../lib/landing-language";

// ─── Rich-text formatting helpers (shared by heading + body editors) ──────────
// Stores formatting as a tiny Markdown subset inside the same heading/body strings:
//   **bold**  *italic*  __underline__  ~~strike~~  — rendered by <RichText> everywhere.

type Mark = { marker: string; label: string; title: string; style?: React.CSSProperties };
const FORMAT_MARKS: Mark[] = [
  { marker: "**", label: "B", title: "Bold", style: { fontWeight: 800 } },
  { marker: "*", label: "I", title: "Italic", style: { fontStyle: "italic" } },
  { marker: "__", label: "U", title: "Underline", style: { textDecoration: "underline" } },
  { marker: "~~", label: "S", title: "Strikethrough", style: { textDecoration: "line-through" } },
];

/** Wrap the current textarea selection (or insert placeholder) with a formatting marker. */
function wrapSelection(
  el: HTMLTextAreaElement | null,
  value: string,
  setValue: (v: string) => void,
  marker: string,
) {
  if (!el) return;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const selected = value.slice(start, end) || "text";
  const next = value.slice(0, start) + marker + selected + marker + value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = start + marker.length;
    el.selectionEnd = start + marker.length + selected.length;
  });
}

function FormatToolbar({
  targetRef,
  value,
  setValue,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {FORMAT_MARKS.map((m) => (
        <button
          key={m.marker}
          type="button"
          // Keep the textarea selection: prevent the mousedown from blurring it (which would save).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrapSelection(targetRef.current, value, setValue, m.marker)}
          title={m.title}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-sm leading-none text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          style={m.style}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = {
  type: SectionType;
  order: number;
  variant?: string;
  heading: string;
  body?: string;
  extras?: Record<string, unknown>;
};

type Composition = {
  title: string;
  locale?: string;
  sections: Section[];
  site?: LandingPageComposition["site"];
};

type PageMeta = {
  title: string;
  slug: string;
  status: string;
  publishedVersionId: string | null;
  currentVersionId: string | null;
  themeKey: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  noindex: boolean;
  stepData: Record<string, unknown> | null;
};

type DevicePreset = "phone" | "tablet" | "desktop";
type EditorMode = "preview" | "code";
type HistoryAction = "undo" | "redo" | "original";
type VersionHistory = {
  versions: Array<{
    id: string;
    version: number;
    createdAt: string | Date;
    isCurrent: boolean;
    isPublished: boolean;
    isOriginal: boolean;
  }>;
  currentVersionId: string | null;
  originalVersionId: string | null;
  canUndo: boolean;
  canRedo: boolean;
};

type CarouselSettings = {
  enabled?: boolean;
  mode?: "auto" | "manual";
  delayMs?: number;
  effect?: "fade" | "slide";
};

type DesignPlanView = {
  archetype?: string;
  sectionTopology?: string;
  heroTreatment?: string;
  imageDirection?: string;
  motionStyle?: string;
  uniquenessFingerprint?: string;
};

type LanguageDraft = LandingLanguagePreferences;
type LocalizationStatusView = {
  state?: "idle" | "queued" | "processing" | "done" | string;
  requestedLocales?: string[];
  updatedAt?: string;
};

const DEVICE_SIZES: Record<DevicePreset, { w: number; h: number; label: string; icon: string }> = {
  phone: { w: 375, h: 812, label: "Phone", icon: "📱" },
  tablet: { w: 768, h: 1024, label: "Tablet", icon: "📱" },
  desktop: { w: 1280, h: 800, label: "Desktop", icon: "💻" },
};

const SECTION_TYPE_LABEL: Record<string, string> = {
  hero: "Hero",
  about: "About",
  menu_preview: "Menu",
  offer: "Offer",
  gallery: "Gallery",
  testimonials: "Reviews",
  faq: "FAQ",
  contact: "Contact",
  lead_form: "Lead Form",
  whatsapp_cta: "WhatsApp",
};

const ADDABLE_SECTION_TYPES: SectionType[] = [
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
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? "h-4 w-4"}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-gray-400">
      <circle cx="7" cy="4" r="1.5" />
      <circle cx="13" cy="4" r="1.5" />
      <circle cx="7" cy="10" r="1.5" />
      <circle cx="13" cy="10" r="1.5" />
      <circle cx="7" cy="16" r="1.5" />
      <circle cx="13" cy="16" r="1.5" />
    </svg>
  );
}

// ─── Section block (sidebar) ─────────────────────────────────────────────────

function labelize(value?: string) {
  return value ? value.replace(/[-_]/g, " ") : "Not set";
}

function DesignDnaPanel({ stepData }: { stepData: Record<string, unknown> | null }) {
  const plan = stepData?.designPlan as DesignPlanView | undefined;
  const fingerprint =
    (stepData?.uniquenessFingerprint as string | undefined) ?? plan?.uniquenessFingerprint;
  if (!plan && !fingerprint) return null;
  const items: Array<[string, string | undefined]> = [
    ["Archetype", plan?.archetype],
    ["Topology", plan?.sectionTopology],
    ["Hero", plan?.heroTreatment],
    ["Images", plan?.imageDirection],
    ["Motion", plan?.motionStyle],
  ];
  return (
    <div className="m-4 mb-0 rounded-lg border border-indigo-100 bg-indigo-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-950">Design DNA</p>
        {fingerprint && (
          <span className="font-mono text-[10px] text-indigo-700">{fingerprint}</span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-md border border-indigo-100 bg-white/80 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-indigo-400">{label}</p>
            <p className="truncate text-xs font-medium capitalize text-indigo-950">
              {labelize(value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LanguagePreferencesPanel({
  value,
  status,
  needsLocalization,
  onApply,
}: {
  value: LandingLanguagePreferences;
  status?: LocalizationStatusView | null;
  needsLocalization?: boolean;
  onApply: (value: LandingLanguagePreferences) => Promise<void>;
}) {
  const [draft, setDraft] = useState<LanguageDraft>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(value), [value.defaultLocale, value.locales.join("|")]);

  const toggleLocale = (locale: LandingPageLocale) => {
    setDraft((current) => {
      const selected = current.locales.includes(locale);
      const locales = selected
        ? current.locales.filter((item) => item !== locale)
        : [...current.locales, locale];
      if (locales.length === 0) return current;
      const defaultLocale = locales.includes(current.defaultLocale)
        ? current.defaultLocale
        : locales[0]!;
      return { locales, defaultLocale };
    });
  };

  const isDirty =
    draft.defaultLocale !== value.defaultLocale ||
    draft.locales.join("|") !== value.locales.join("|");
  const isGenerating = status?.state === "queued" || status?.state === "processing";

  return (
    <div className="m-4 mb-0 rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-950">
            Languages
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-700">
            {isGenerating
              ? "Generating translations..."
              : draft.locales.length > 1
                ? "Switcher enabled"
                : "Single-language site"}
          </p>
        </div>
        <button
          type="button"
          disabled={(!isDirty && !needsLocalization) || saving || isGenerating}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await onApply(draft);
            } catch {
              setError("Could not save languages.");
            } finally {
              setSaving(false);
            }
          }}
          className="disabled:opacity-35 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : isDirty ? "Apply" : "Generate translations"}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {LANDING_PAGE_LOCALES.map((locale) => {
          const selected = draft.locales.includes(locale.key);
          return (
            <div key={locale.key} className="bg-white/85 rounded-md border border-emerald-100 p-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-emerald-950">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleLocale(locale.key)}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                {locale.shortLabel}
              </label>
              <label
                className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${selected ? "text-emerald-700" : "text-gray-400"}`}
              >
                <input
                  type="radio"
                  name="editor-default-locale"
                  checked={draft.defaultLocale === locale.key}
                  disabled={!selected}
                  onChange={() =>
                    setDraft((current) => ({ ...current, defaultLocale: locale.key }))
                  }
                  className="h-3 w-3"
                />
                Default
              </label>
            </div>
          );
        })}
      </div>
      {isGenerating && (
        <p className="mt-2 rounded-md border border-emerald-100 bg-white/80 px-2 py-1.5 text-[11px] text-emerald-700">
          The language switcher will show translated copy after the queued localization job
          finishes.
        </p>
      )}
      {!isDirty && needsLocalization && !isGenerating && (
        <p className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
          These languages are selected, but translated page copy has not been generated yet.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function CarouselControls({
  title,
  settings,
  images,
  enabled,
  onChange,
  onAddImage,
  onReplaceImage,
}: {
  title: string;
  settings: CarouselSettings;
  images: Array<{ url?: string; caption?: string }>;
  enabled: boolean;
  onChange: (settings: CarouselSettings) => void;
  onAddImage: () => void;
  onReplaceImage: (index: number, currentUrl: string | null) => void;
}) {
  const initialDraft = {
    enabled,
    mode: settings.mode ?? "auto",
    effect: settings.effect ?? "fade",
    delayMs: settings.delayMs ?? 4500,
  };
  const [draft, setDraft] = useState<CarouselSettings>(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [enabled, settings.delayMs, settings.effect, settings.mode]);

  const delaySeconds = Math.round((draft.delayMs ?? 4500) / 1000);
  const isDirty =
    draft.enabled !== initialDraft.enabled ||
    (draft.mode ?? "auto") !== (initialDraft.mode ?? "auto") ||
    (draft.effect ?? "fade") !== (initialDraft.effect ?? "fade") ||
    (draft.delayMs ?? 4500) !== (initialDraft.delayMs ?? 4500);

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
          <input
            type="checkbox"
            checked={!!draft.enabled}
            onChange={(event) =>
              setDraft((current) => ({ ...current, enabled: event.target.checked }))
            }
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          On
        </label>
      </div>
      {draft.enabled && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-gray-500">
              Mode
              <select
                value={draft.mode ?? "auto"}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    mode: event.target.value as "auto" | "manual",
                  }))
                }
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800"
              >
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label className="text-[11px] text-gray-500">
              Effect
              <select
                value={draft.effect ?? "fade"}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    effect: event.target.value as "fade" | "slide",
                  }))
                }
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800"
              >
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
              </select>
            </label>
            <label className="text-[11px] text-gray-500">
              Delay
              <input
                type="number"
                min={1}
                max={15}
                value={delaySeconds}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    delayMs: Math.max(1, Math.min(15, Number(event.target.value) || 4)) * 1000,
                  }))
                }
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800"
              />
            </label>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {images.slice(0, 12).map((img, imageIndex) => (
              <button
                key={`${img.url ?? "empty"}-${imageIndex}`}
                type="button"
                onClick={() => onReplaceImage(imageIndex, img.url ?? null)}
                className="relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-white"
                title="Replace slide"
              >
                {img.url ? (
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-gray-300">
                    +
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={onAddImage}
              className="aspect-square rounded-md border border-dashed border-gray-300 bg-white text-lg text-gray-400 hover:border-emerald-400 hover:text-emerald-600"
              title="Add slide"
            >
              +
            </button>
          </div>
        </>
      )}
      <div className="flex items-center justify-end gap-2">
        {isDirty && (
          <button
            type="button"
            onClick={() => setDraft(initialDraft)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-white hover:text-gray-800"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange(draft)}
          disabled={!isDirty}
          className="disabled:opacity-35 inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed"
          title="Apply carousel changes"
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.415 0l-3.5-3.5a1.004 1.004 0 111.42-1.42l2.79 2.795 6.795-6.795a1 1 0 011.41 0z"
              clipRule="evenodd"
            />
          </svg>
          Apply
        </button>
      </div>
    </div>
  );
}

function needsLocalizedCompositions(
  stepData: Record<string, unknown> | null | undefined,
  preferences: LandingLanguagePreferences,
  sourceLocale?: string | null,
): boolean {
  if (preferences.locales.length <= 1) return false;
  const localized = stepData?.localizedCompositions as Record<string, unknown> | undefined;
  return preferences.locales.some((item) => item !== sourceLocale && !localized?.[item]);
}

function AddSectionPanel({
  canAdd,
  onAdd,
}: {
  canAdd: boolean;
  onAdd: (type: SectionType, mode: "manual" | "ai", instruction?: string) => Promise<void>;
}) {
  const [sectionType, setSectionType] = useState<SectionType>("about");
  const [instruction, setInstruction] = useState("");
  const [mode, setMode] = useState<"manual" | "ai" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(nextMode: "manual" | "ai") {
    setMode(nextMode);
    setError(null);
    try {
      await onAdd(sectionType, nextMode, instruction);
      setInstruction("");
    } catch {
      setError("Could not add section.");
    } finally {
      setMode(null);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-purple-200 bg-purple-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
            Add section
          </p>
          <p className="text-[11px] text-purple-600/80">
            Manual or AI-drafted, always using safe registered layouts.
          </p>
        </div>
        {!canAdd && (
          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-gray-500">
            8 max
          </span>
        )}
      </div>
      <select
        value={sectionType}
        disabled={!canAdd || mode !== null}
        onChange={(event) => setSectionType(event.target.value as SectionType)}
        className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
      >
        {ADDABLE_SECTION_TYPES.map((type) => (
          <option key={type} value={type}>
            {SECTION_TYPE_LABEL[type] ?? type}
          </option>
        ))}
      </select>
      <textarea
        value={instruction}
        disabled={!canAdd || mode !== null}
        onChange={(event) => setInstruction(event.target.value)}
        rows={2}
        placeholder="Optional AI instruction"
        className="w-full resize-none rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-200"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canAdd || mode !== null}
          onClick={() => void submit("manual")}
          className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mode === "manual" ? "Adding..." : "Add manual"}
        </button>
        <button
          type="button"
          disabled={!canAdd || mode !== null}
          onClick={() => void submit("ai")}
          className="rounded-lg bg-purple-700 px-3 py-2 text-xs font-medium text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mode === "ai" ? "Writing..." : "Add with AI"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SectionImageGrid({
  title,
  images,
  emptyLabel,
  onReplace,
}: {
  title: string;
  images: Array<{ url?: string | null; label?: string | null }>;
  emptyLabel: string;
  onReplace: (imageIndex: number, currentUrl: string | null) => void;
}) {
  if (images.length === 0) return null;

  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {images.map((image, imageIndex) => (
          <button
            key={imageIndex}
            type="button"
            onClick={() => onReplace(imageIndex, image.url ?? null)}
            className="group relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-100 hover:border-emerald-400"
            title={image.label ? `Replace: ${image.label}` : emptyLabel}
          >
            {image.url ? (
              <img
                src={image.url}
                alt={image.label ?? ""}
                className="h-full w-full object-cover"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <span className="flex h-full items-center justify-center text-lg text-gray-300">
                📷
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  index,
  pageId,
  onSaved,
  onSwapVariant,
  onSwapImage,
  onUpdateCarousel,
  onUpdateContactLocation,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  // Preview sync
  isActive,
  onActivate,
  // Drag-and-drop
  draggingIdx,
  dropTargetIdx,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
  onDrop,
  t,
}: {
  section: Section;
  index: number;
  pageId: string;
  onSaved: () => void | Promise<void>;
  onSwapVariant: (sectionIndex: number, type: SectionType, currentVariant: string) => void;
  onSwapImage: (
    sectionIndex: number,
    type: SectionType,
    target: string,
    currentUrl: string | null,
  ) => void;
  onUpdateCarousel: (sectionIndex: number, settings: CarouselSettings) => void;
  onUpdateContactLocation: (sectionIndex: number, address: string) => void;
  onDelete: (sectionIndex: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isActive: boolean;
  onActivate: () => void;
  draggingIdx: number | null;
  dropTargetIdx: number | null;
  onDragStart: (idx: number) => void;
  onDragEnter: (idx: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (targetIdx: number) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [editingHeading, setEditingHeading] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [heading, setHeading] = useState(section.heading);
  const [body, setBody] = useState(section.body ?? "");
  const [address, setAddress] = useState(
    ((section.extras as Record<string, unknown> | undefined)?.address as string | undefined) ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const headingRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingHeading) headingRef.current?.focus();
  }, [editingHeading]);
  useEffect(() => {
    if (editingBody) bodyRef.current?.focus();
  }, [editingBody]);
  useEffect(() => {
    setAddress(
      ((section.extras as Record<string, unknown> | undefined)?.address as string | undefined) ??
        "",
    );
  }, [section.extras]);

  async function saveHeading() {
    if (heading === section.heading) {
      setEditingHeading(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await trpc.landingPages.editSection.mutate({ pageId, sectionIndex: index, heading });
      setEditingHeading(false);
      await onSaved();
    } catch {
      setSaveError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function saveBody() {
    if (body === (section.body ?? "")) {
      setEditingBody(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await trpc.landingPages.editSection.mutate({ pageId, sectionIndex: index, body });
      setEditingBody(false);
      await onSaved();
    } catch {
      setSaveError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function saveContactLocation() {
    const trimmed = address.trim();
    if (
      !trimmed ||
      trimmed === ((section.extras as Record<string, unknown> | undefined)?.address ?? "")
    ) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onUpdateContactLocation(index, trimmed);
      await onSaved();
    } catch {
      setSaveError("Could not save location.");
    } finally {
      setSaving(false);
    }
  }

  const isDragging = draggingIdx === index;
  const isDropTarget = dropTargetIdx === index && draggingIdx !== null && draggingIdx !== index;
  const extras = (section.extras as Record<string, unknown> | undefined) ?? {};
  const carouselSettings = (extras["carousel"] as CarouselSettings | undefined) ?? {};
  const heroImages = [
    ...((extras["backgroundImageUrl"] as string | undefined)
      ? [{ url: extras["backgroundImageUrl"] as string }]
      : []),
    ...((extras["images"] as Array<{ url?: string; caption?: string }> | undefined) ?? []),
  ].filter(
    (image, imageIndex, all) =>
      image.url && all.findIndex((item) => item.url === image.url) === imageIndex,
  );
  const galleryImages = (
    (extras["images"] as Array<{ url?: string; caption?: string }> | undefined) ?? []
  ).filter((image) => image.url);
  const menuImages = (
    (extras["items"] as
      | Array<{ imageUrl?: string; name?: string; caption?: string }>
      | undefined) ?? []
  ).map((item) => ({ url: item.imageUrl, label: item.name ?? item.caption ?? "Menu item" }));
  const testimonialImages = (
    (extras["items"] as Array<{ avatarUrl?: string; author?: string }> | undefined) ?? []
  ).map((item) => ({ url: item.avatarUrl, label: item.author ?? "Testimonial" }));
  const teamImages = (
    (extras["teamMembers"] as
      | Array<{ photoUrl?: string; name?: string; role?: string }>
      | undefined) ?? []
  ).map((member) => ({ url: member.photoUrl, label: member.name ?? member.role ?? "Team member" }));

  return (
    <div
      data-sidebar-index={index}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
      className={`overflow-hidden rounded-xl border bg-white transition-all ${isDragging ? "border-purple-400 opacity-40" : isDropTarget ? "border-2 border-purple-500 shadow-lg" : isActive ? "border-purple-400 ring-2 ring-purple-200" : "border-gray-200 hover:border-gray-300"}`}
    >
      <div
        onClick={onActivate}
        className="flex cursor-pointer items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2"
      >
        <div
          draggable
          onDragStart={(e) => {
            onDragStart(index);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(index));
          }}
          onDragEnd={onDragEnd}
          className="flex min-w-0 cursor-grab items-center gap-2 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <DragHandleIcon />
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-gray-700">
            {SECTION_TYPE_LABEL[section.type] ?? section.type}
          </span>
          {section.variant && (
            <span className="truncate rounded border border-purple-100 bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] text-purple-700">
              {section.variant}
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
            title="Move up"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
            title="Move down"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            onClick={() => onDelete(index)}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Remove section"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 006 3.75v.44c-.79.08-1.58.18-2.36.3a.75.75 0 10.22 1.48l.15-.02.84 10.52A2.75 2.75 0 008.34 19h3.32a2.75 2.75 0 002.74-2.53l.84-10.52.15.02a.75.75 0 00.22-1.48c-.78-.12-1.57-.22-2.36-.3v-.44A2.75 2.75 0 0010.5 1H8.75zm3 6.5a.75.75 0 00-1.5 0v8a.75.75 0 001.5 0v-8zm-3.5.75a.75.75 0 011.5 0v7.25a.75.75 0 01-1.5 0V8.25z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {(section.type === "hero" || section.type === "about") && (
            <button
              onClick={() => {
                const extras = section.extras as Record<string, unknown> | undefined;
                const isHero = section.type === "hero";
                const target = isHero ? "background" : "about";
                const currentUrl =
                  ((isHero ? extras?.["backgroundImageUrl"] : extras?.["imageUrl"]) as
                    | string
                    | null) ?? null;
                onSwapImage(index, section.type, target, currentUrl);
              }}
              className="ml-1 flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
              title={
                section.type === "hero"
                  ? "Replace the hero background image"
                  : "Set the about section image"
              }
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              Image
            </button>
          )}
          <button
            onClick={() => onSwapVariant(index, section.type, section.variant ?? "")}
            className="ml-1 flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
            title="Try a different layout for this section"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            Layout
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {editingHeading ? (
          <div className="space-y-1.5">
            <FormatToolbar targetRef={headingRef} value={heading} setValue={setHeading} />
            <textarea
              ref={headingRef}
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-purple-300 px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200"
              onBlur={saveHeading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveHeading();
                }
              }}
            />
            <p className="text-[11px] text-gray-400">
              Select text, then use B / I / U / S. Enter to save.
            </p>
          </div>
        ) : (
          <p
            className="-mx-1 cursor-text rounded px-1 py-0.5 text-base font-semibold text-gray-900 transition-all hover:bg-purple-50 hover:ring-1 hover:ring-purple-200"
            onClick={() => {
              onActivate();
              setEditingHeading(true);
            }}
            title="Click to edit"
          >
            {renderRich(heading)}
          </p>
        )}

        {section.type !== "lead_form" &&
          (editingBody ? (
            <div className="space-y-1.5">
              <FormatToolbar targetRef={bodyRef} value={body} setValue={setBody} />
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-purple-300 px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-200"
                onBlur={saveBody}
              />
              <p className="text-[11px] text-gray-400">
                Select text, then use B / I / U / S to format. Click away to save.
              </p>
            </div>
          ) : (
            <p
              className={`-mx-1 cursor-text whitespace-pre-line rounded px-1 py-0.5 text-sm leading-relaxed text-gray-600 transition-all hover:bg-purple-50 hover:ring-1 hover:ring-purple-200 ${!body ? "italic text-gray-300" : ""}`}
              onClick={() => {
                onActivate();
                setEditingBody(true);
              }}
              title="Click to edit"
            >
              {body ? renderRich(body) : "(no body)"}
            </p>
          ))}

        {section.type === "contact" && (
          <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                Map location
              </p>
              <p className="text-[11px] text-emerald-700/75">
                Used for the embedded map. Default: Neuchatel, Switzerland.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveContactLocation();
                  }
                }}
                placeholder="Business address"
                className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
              <button
                type="button"
                onClick={() => void saveContactLocation()}
                className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {section.type === "hero" && (
          <CarouselControls
            title="Hero carousel"
            settings={carouselSettings}
            images={heroImages}
            enabled={!!carouselSettings.enabled}
            onChange={(settings) => onUpdateCarousel(index, settings)}
            onAddImage={() => onSwapImage(index, section.type, "heroCarousel.add", null)}
            onReplaceImage={(imageIndex, currentUrl) =>
              onSwapImage(index, section.type, `heroCarousel.${imageIndex}`, currentUrl)
            }
          />
        )}

        {section.type === "gallery" && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Images — click to replace
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                ((section.extras as Record<string, unknown> | undefined)?.["images"] as
                  | Array<{ url?: string; caption?: string }>
                  | undefined) ?? []
              ).map((img, gi) => (
                <button
                  key={gi}
                  onClick={() => onSwapImage(index, section.type, `gallery.${gi}`, img.url ?? null)}
                  className="group relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-100 hover:border-emerald-400"
                  title={img.caption ? `Replace: ${img.caption}` : "Replace this image"}
                >
                  {img.url ? (
                    <img
                      src={img.url}
                      alt={img.caption ?? ""}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-lg text-gray-300">
                      📷
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2.5"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onSwapImage(index, section.type, "gallery.add", null)}
              className="mt-2 w-full rounded-md border border-dashed border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Add gallery image
            </button>
          </div>
        )}

        {section.type === "menu_preview" && (
          <SectionImageGrid
            title="Menu item images — click to replace"
            images={menuImages}
            emptyLabel="Replace menu item image"
            onReplace={(imageIndex, currentUrl) =>
              onSwapImage(index, section.type, `menu.${imageIndex}`, currentUrl)
            }
          />
        )}

        {section.type === "testimonials" && (
          <SectionImageGrid
            title="Avatar images — click to replace"
            images={testimonialImages}
            emptyLabel="Replace testimonial avatar"
            onReplace={(imageIndex, currentUrl) =>
              onSwapImage(index, section.type, `testimonial.${imageIndex}`, currentUrl)
            }
          />
        )}

        {section.type === "about" && teamImages.length > 0 && (
          <SectionImageGrid
            title="Team images — click to replace"
            images={teamImages}
            emptyLabel="Replace team image"
            onReplace={(imageIndex, currentUrl) =>
              onSwapImage(index, section.type, `team.${imageIndex}`, currentUrl)
            }
          />
        )}

        {section.type === "gallery" && section.variant === "carousel-strip" && (
          <CarouselControls
            title="Gallery carousel"
            settings={carouselSettings}
            images={galleryImages}
            enabled={carouselSettings.enabled ?? true}
            onChange={(settings) => onUpdateCarousel(index, settings)}
            onAddImage={() => onSwapImage(index, section.type, "gallery.add", null)}
            onReplaceImage={(imageIndex, currentUrl) =>
              onSwapImage(index, section.type, `gallery.${imageIndex}`, currentUrl)
            }
          />
        )}

        {saving && (
          <p className="flex items-center gap-1 text-xs text-gray-400">
            <SpinnerIcon className="h-3 w-3" /> Saving…
          </p>
        )}
        {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      </div>
    </div>
  );
}

// ─── Main editor ─────────────────────────────────────────────────────────────

export default function EditLandingPage() {
  const t = useTranslations("PageEditor");
  const router = useRouter();
  const params = useParams();
  const pageId = params?.id as string;
  const locale = (params?.locale as string) ?? "en";

  const [composition, setComposition] = useState<Composition | null>(null);
  const [pageMeta, setPageMeta] = useState<PageMeta | null>(null);
  const [versionHistory, setVersionHistory] = useState<VersionHistory | null>(null);
  const [tenantSlug, setTenantSlug] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedNow, setPublishedNow] = useState(false);

  // Variant switcher modal state
  const [variantModal, setVariantModal] = useState<{
    sectionIndex: number;
    type: SectionType;
    currentVariant: string;
  } | null>(null);
  // Image swap modal state
  const [imageModal, setImageModal] = useState<{
    sectionIndex: number;
    type: SectionType;
    target: string;
    currentUrl: string | null;
  } | null>(null);

  // Drag-and-drop reorder state
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  // Device preview
  const [device, setDevice] = useState<DevicePreset>("desktop");
  const [editorMode, setEditorMode] = useState<EditorMode>("preview");

  // Preview iframe bust — bump to force reload after edits
  const [previewVersion, setPreviewVersion] = useState(0);

  // Preview <-> editor sync
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const pendingFocusIndexRef = useRef<number | null>(null);
  const lastEditedSectionIndexRef = useRef<number | null>(null);
  const [historyAction, setHistoryAction] = useState<HistoryAction | null>(null);

  // Tell the preview iframe to scroll a given section into view + flash it.
  const scrollPreviewTo = useCallback((index: number) => {
    setActiveIndex(index);
    iframeRef.current?.contentWindow?.postMessage(
      { source: "lp-editor", type: "scrollTo", index },
      window.location.origin,
    );
  }, []);

  const scrollSidebarTo = useCallback((index: number) => {
    const el = document.querySelector(`[data-sidebar-index="${index}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  // Listen for "active section" pings from the preview as the user scrolls it.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: string; type?: string; index?: number } | null;
      if (
        !data ||
        data.source !== "lp-preview" ||
        data.type !== "active" ||
        typeof data.index !== "number"
      )
        return;
      setActiveIndex(data.index);
      // Bring the matching sidebar block into view (without yanking focus while editing).
      const el = document.querySelector(`[data-sidebar-index="${data.index}"]`);
      if (el && document.activeElement?.tagName !== "TEXTAREA") {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const loadPage = useCallback(
    async (opts?: { focusSectionIndex?: number | null }) => {
      try {
        const [compositionData, pageData, listData, historyData] = await Promise.all([
          trpc.landingPages.getComposition.query({ pageId }),
          trpc.landingPages.getPage.query({ pageId }),
          trpc.landingPages.listPages.query(),
          trpc.landingPages.getVersionHistory.query({ pageId }),
        ]);

        if (compositionData) {
          setComposition(compositionData.composition as Composition);
        }
        setVersionHistory(historyData as VersionHistory);
        if (pageData) {
          const meta = pageData as Record<string, unknown>;
          setPageMeta({
            title: pageData.title,
            slug: (meta.slug as string) ?? "",
            status: pageData.status,
            publishedVersionId: (meta.publishedVersionId as string | null) ?? null,
            currentVersionId: pageData.currentVersionId,
            themeKey: (meta.themeKey as string | null) ?? null,
            metaTitle: (meta.metaTitle as string | null) ?? null,
            metaDescription: (meta.metaDescription as string | null) ?? null,
            ogImageUrl: (meta.ogImageUrl as string | null) ?? null,
            noindex: (meta.noindex as boolean) ?? false,
            stepData: (meta.stepData as Record<string, unknown> | null) ?? null,
          });
        }
        setTenantSlug(listData.tenantSlug);
        if (opts?.focusSectionIndex !== undefined && opts.focusSectionIndex !== null) {
          pendingFocusIndexRef.current = opts.focusSectionIndex;
          setActiveIndex(opts.focusSectionIndex);
          requestAnimationFrame(() => scrollSidebarTo(opts.focusSectionIndex!));
        }
        setPreviewVersion((v) => v + 1);
      } catch {
        setLoadError(t("loadError"));
      } finally {
        setIsLoading(false);
      }
    },
    [pageId, scrollSidebarTo, t],
  );

  const waitForLocalization = useCallback(
    async (preferences: LandingLanguagePreferences, sourceLocale?: string | null) => {
      const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const targetLocales = preferences.locales.filter((item) => item !== sourceLocale);
      if (targetLocales.length === 0) {
        await loadPage();
        return;
      }

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(attempt === 0 ? 1200 : 2500);
        const pageData = await trpc.landingPages.getPage.query({ pageId });
        const stepData = (pageData?.stepData as Record<string, unknown> | null) ?? null;
        const localized = stepData?.localizedCompositions as Record<string, unknown> | undefined;
        const status = stepData?.localizationStatus as LocalizationStatusView | undefined;
        const ready = targetLocales.every((item) => !!localized?.[item]);
        if (ready || status?.state === "done") break;
      }

      await loadPage();
    },
    [loadPage, pageId],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const handlePreviewLoad = useCallback(() => {
    const index = pendingFocusIndexRef.current;
    if (index === null) return;
    window.setTimeout(() => {
      scrollPreviewTo(index);
      scrollSidebarTo(index);
      pendingFocusIndexRef.current = null;
    }, 150);
  }, [scrollPreviewTo, scrollSidebarTo]);

  async function handlePublish() {
    setPublishing(true);
    setPublishError(null);
    setPublishedNow(false);
    try {
      await trpc.landingPages.publish.mutate({ pageId });
      setPublishedNow(true);
      await loadPage();
      setTimeout(() => setPublishedNow(false), 3000);
    } catch {
      setPublishError(t("publishError"));
    } finally {
      setPublishing(false);
    }
  }

  const runHistoryAction = useCallback(
    async (action: HistoryAction) => {
      const focusIndex =
        action === "original" ? 0 : (lastEditedSectionIndexRef.current ?? activeIndex ?? 0);
      setHistoryAction(action);
      try {
        if (action === "undo") {
          await trpc.landingPages.undo.mutate({ pageId });
        } else if (action === "redo") {
          await trpc.landingPages.redo.mutate({ pageId });
        } else {
          await trpc.landingPages.restoreOriginal.mutate({ pageId });
        }
        await loadPage({ focusSectionIndex: focusIndex });
      } finally {
        setHistoryAction(null);
      }
    },
    [activeIndex, loadPage, pageId],
  );

  // Section variant swap
  const handleSwapVariant = useCallback(
    (sectionIndex: number, type: SectionType, currentVariant: string) => {
      setVariantModal({ sectionIndex, type, currentVariant });
    },
    [],
  );

  const applyVariant = useCallback(
    async (variant: string) => {
      if (!variantModal) return;
      try {
        await trpc.landingPages.swapVariant.mutate({
          pageId,
          sectionIndex: variantModal.sectionIndex,
          variant,
        });
        lastEditedSectionIndexRef.current = variantModal.sectionIndex;
        setVariantModal(null);
        await loadPage({ focusSectionIndex: variantModal.sectionIndex });
      } catch {
        /* keep modal open on error */
      }
    },
    [variantModal, pageId, loadPage],
  );

  // Image swap
  const handleSwapImage = useCallback(
    (sectionIndex: number, type: SectionType, target: string, currentUrl: string | null) => {
      setImageModal({ sectionIndex, type, target, currentUrl });
    },
    [],
  );

  const applyImage = useCallback(
    async (url: string) => {
      if (!imageModal) return;
      const keepPickerOpen =
        imageModal.target === "heroCarousel.add" || imageModal.target === "gallery.add";
      try {
        await trpc.landingPages.swapSectionImage.mutate({
          pageId,
          sectionIndex: imageModal.sectionIndex,
          target: imageModal.target,
          url,
        });
        lastEditedSectionIndexRef.current = imageModal.sectionIndex;
        if (!keepPickerOpen) setImageModal(null);
        await loadPage({ focusSectionIndex: imageModal.sectionIndex });
      } catch {
        /* keep modal open on error */
      }
    },
    [imageModal, pageId, loadPage],
  );

  const updateCarousel = useCallback(
    async (sectionIndex: number, settings: CarouselSettings) => {
      try {
        await trpc.landingPages.updateSectionCarousel.mutate({ pageId, sectionIndex, settings });
        lastEditedSectionIndexRef.current = sectionIndex;
        await loadPage({ focusSectionIndex: sectionIndex });
      } catch {
        /* ignore */
      }
    },
    [pageId, loadPage],
  );

  const updateContactLocation = useCallback(
    async (sectionIndex: number, address: string) => {
      await trpc.landingPages.updateContactLocation.mutate({ pageId, sectionIndex, address });
      lastEditedSectionIndexRef.current = sectionIndex;
      await loadPage({ focusSectionIndex: sectionIndex });
    },
    [pageId, loadPage],
  );

  const addSection = useCallback(
    async (type: SectionType, mode: "manual" | "ai", instruction?: string) => {
      const insertAfter = Math.max(0, (composition?.sections.length ?? 1) - 1);
      await trpc.landingPages.addSection.mutate({
        pageId,
        sectionType: type,
        insertAfter,
        mode,
        instruction,
      });
      lastEditedSectionIndexRef.current = insertAfter + 1;
      await loadPage({ focusSectionIndex: insertAfter + 1 });
    },
    [composition?.sections.length, pageId, loadPage],
  );

  const deleteSection = useCallback(
    async (sectionIndex: number) => {
      const ok = window.confirm("Remove this section from the page?");
      if (!ok) return;
      await trpc.landingPages.deleteSection.mutate({ pageId, sectionIndex });
      const focusIndex = Math.max(0, sectionIndex - 1);
      lastEditedSectionIndexRef.current = focusIndex;
      await loadPage({ focusSectionIndex: focusIndex });
    },
    [pageId, loadPage],
  );

  // Section reorder (move up / move down OR drag-and-drop)
  const moveSection = useCallback(
    async (fromIdx: number, toIdx: number) => {
      if (!composition) return;
      if (fromIdx === toIdx) return;
      const newOrder = composition.sections.map((_, i) => i);
      const [moved] = newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, moved!);
      try {
        await trpc.landingPages.reorderSections.mutate({ pageId, newOrder });
        lastEditedSectionIndexRef.current = toIdx;
        await loadPage({ focusSectionIndex: toIdx });
      } catch {
        /* ignore */
      }
    },
    [composition, pageId, loadPage],
  );

  // Drag-and-drop handlers (HTML5 native — no library)
  const handleDragStart = useCallback((idx: number) => setDraggingIdx(idx), []);
  const handleDragEnter = useCallback((idx: number) => setDropTargetIdx(idx), []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const handleDragEnd = useCallback(() => {
    setDraggingIdx(null);
    setDropTargetIdx(null);
  }, []);
  const handleDrop = useCallback(
    async (targetIdx: number) => {
      if (draggingIdx === null || draggingIdx === targetIdx) {
        setDraggingIdx(null);
        setDropTargetIdx(null);
        return;
      }
      const from = draggingIdx;
      setDraggingIdx(null);
      setDropTargetIdx(null);
      await moveSection(from, targetIdx);
    },
    [draggingIdx, moveSection],
  );

  // Theme swap
  const handleThemeChange = useCallback(
    async (palette: string | null, fontPair: string | null) => {
      try {
        await trpc.landingPages.updateTheme.mutate({
          pageId,
          themeKey: palette,
          fontPairKey: fontPair,
        });
        await loadPage();
      } catch {
        /* ignore */
      }
    },
    [pageId, loadPage],
  );

  const handleLanguagePreferencesChange = useCallback(
    async (preferences: LandingLanguagePreferences) => {
      const result = await trpc.landingPages.updateLanguagePreferences.mutate({
        pageId,
        preferences,
      });
      await loadPage();
      if (result.localizationQueued) {
        await waitForLocalization(preferences, composition?.locale);
      }
    },
    [composition?.locale, pageId, loadPage, waitForLocalization],
  );

  const hasUnpublishedChanges =
    pageMeta?.currentVersionId && pageMeta.currentVersionId !== pageMeta.publishedVersionId;

  const sections = composition?.sections.slice().sort((a, b) => a.order - b.order) ?? [];
  const currentFontPair = (pageMeta?.stepData?.themeFontPair as string | null) ?? null;
  const languagePreferences = normalizeLandingLanguagePreferences(
    pageMeta?.stepData?.languagePreferences,
    composition?.locale ?? "de-CH",
  );
  const localizationStatus = pageMeta?.stepData?.localizationStatus as
    | LocalizationStatusView
    | undefined;
  const missingLocalizedCompositions = needsLocalizedCompositions(
    pageMeta?.stepData,
    languagePreferences,
    composition?.locale,
  );
  const canUndo = versionHistory?.canUndo ?? false;
  const canRedo = versionHistory?.canRedo ?? false;
  const isOriginalVersion =
    !!versionHistory?.originalVersionId &&
    pageMeta?.currentVersionId === versionHistory.originalVersionId;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <SpinnerIcon className="h-8 w-8 text-gray-400" />
      </div>
    );
  }

  if (loadError || !composition || !pageMeta) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-red-600">{loadError ?? t("loadError")}</p>
      </div>
    );
  }

  // Always use the draft preview route — it always shows the current (in-flight) version,
  // so changes show up in the iframe even before publishing.
  const previewUrl = `/p/preview/page/${pageId}?v=${previewVersion}`;
  const publicBasePath =
    tenantSlug && pageMeta.slug ? `/p/${tenantSlug}/${pageMeta.slug}` : `/p/preview/page/${pageId}`;

  const deviceDims = DEVICE_SIZES[device];

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* ─── Top toolbar ───────────────────────────────────────────────────── */}
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => router.push(`/${locale}/landing-pages`)}
            className="flex-shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            title="Back to pages"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{pageMeta.title}</p>
            <p className="text-xs capitalize text-gray-500">
              {pageMeta.status}
              {hasUnpublishedChanges && (
                <span className="ml-1 text-amber-600">· unpublished changes</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => void runHistoryAction("undo")}
              disabled={!canUndo || historyAction !== null}
              className="disabled:opacity-35 flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed"
              title="Undo"
            >
              {historyAction === "undo" ? (
                <SpinnerIcon className="h-3.5 w-3.5" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M7.793 2.232a.75.75 0 01-.025 1.061L5.622 5.34h6.628a5.75 5.75 0 010 11.5H10a.75.75 0 010-1.5h2.25a4.25 4.25 0 000-8.5H5.622l2.146 2.047a.75.75 0 11-1.036 1.085l-3.5-3.34a.75.75 0 010-1.085l3.5-3.34a.75.75 0 011.061.025z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={() => void runHistoryAction("redo")}
              disabled={!canRedo || historyAction !== null}
              className="disabled:opacity-35 flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed"
              title="Redo"
            >
              {historyAction === "redo" ? (
                <SpinnerIcon className="h-3.5 w-3.5" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M12.207 2.232a.75.75 0 00.025 1.061l2.146 2.047H7.75a5.75 5.75 0 000 11.5H10a.75.75 0 000-1.5H7.75a4.25 4.25 0 010-8.5h6.628l-2.146 2.047a.75.75 0 101.036 1.085l3.5-3.34a.75.75 0 000-1.085l-3.5-3.34a.75.75 0 00-1.061.025z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={() => void runHistoryAction("original")}
              disabled={
                isOriginalVersion || !versionHistory?.originalVersionId || historyAction !== null
              }
              className="disabled:opacity-35 h-8 rounded-md px-2.5 text-xs font-medium text-gray-600 hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed"
              title="Restore the original generated page"
            >
              {historyAction === "original" ? <SpinnerIcon className="h-3.5 w-3.5" /> : "Original"}
            </button>
          </div>

          <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
            {(["preview", "code"] as EditorMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setEditorMode(mode)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-all ${editorMode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Device toggle */}
          {editorMode === "preview" && (
            <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
              {(["phone", "tablet", "desktop"] as DevicePreset[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${device === d ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  title={DEVICE_SIZES[d].label}
                >
                  <span className="mr-1">{DEVICE_SIZES[d].icon}</span>
                  <span className="hidden sm:inline">{DEVICE_SIZES[d].label}</span>
                </button>
              ))}
            </div>
          )}

          <ThemePickerButton
            currentPalette={pageMeta.themeKey}
            currentFontPair={currentFontPair}
            onChange={handleThemeChange}
          />

          {pageMeta.status === "published" && tenantSlug && (
            <a
              href={`/p/${tenantSlug}/${pageMeta.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View live ↗
            </a>
          )}
          <button
            onClick={handlePublish}
            disabled={publishing || !pageMeta.currentVersionId}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {publishing && <SpinnerIcon className="h-3.5 w-3.5" />}
            {publishedNow ? "✓ Published" : publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      {publishError && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {publishError}
        </p>
      )}

      {/* ─── Main split: sidebar | preview ────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[420px] flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sections</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Click any text to edit. Use ⬆⬇ to reorder. &ldquo;Layout&rdquo; tries variants.
            </p>
          </div>
          <DesignDnaPanel stepData={pageMeta.stepData} />
          <LanguagePreferencesPanel
            value={languagePreferences}
            status={localizationStatus}
            needsLocalization={missingLocalizedCompositions}
            onApply={handleLanguagePreferencesChange}
          />
          <div className="space-y-3 p-4">
            <AddSectionPanel canAdd={sections.length < 8} onAdd={addSection} />
            {sections.map((section, i) => (
              <SectionBlock
                key={`${section.type}-${i}`}
                section={section}
                index={i}
                pageId={pageId}
                onSaved={() => {
                  lastEditedSectionIndexRef.current = i;
                  void loadPage({ focusSectionIndex: i });
                }}
                onSwapVariant={handleSwapVariant}
                onSwapImage={handleSwapImage}
                onUpdateCarousel={updateCarousel}
                onUpdateContactLocation={updateContactLocation}
                onDelete={deleteSection}
                onMoveUp={() => moveSection(i, i - 1)}
                onMoveDown={() => moveSection(i, i + 1)}
                canMoveUp={i > 0}
                canMoveDown={i < sections.length - 1}
                isActive={activeIndex === i}
                onActivate={() => scrollPreviewTo(i)}
                draggingIdx={draggingIdx}
                dropTargetIdx={dropTargetIdx}
                onDragStart={handleDragStart}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                t={t}
              />
            ))}
          </div>
        </aside>

        {editorMode === "preview" ? (
          <main className="flex flex-1 items-center justify-center overflow-hidden bg-gray-100 p-6">
            <div
              className="overflow-hidden rounded-lg bg-white shadow-2xl transition-all duration-300"
              style={{
                width: `min(${deviceDims.w}px, 100%)`,
                height: `min(${deviceDims.h}px, 100%)`,
                maxWidth: "100%",
                maxHeight: "100%",
              }}
            >
              <iframe
                key={previewVersion}
                ref={iframeRef}
                src={previewUrl}
                title="Live preview"
                className="h-full w-full border-0"
                sandbox="allow-same-origin allow-scripts allow-forms"
                onLoad={handlePreviewLoad}
              />
            </div>
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto bg-gray-100 p-6">
            <CodePreviewPanel
              composition={composition as LandingPageComposition}
              publicBasePath={publicBasePath}
            />
          </main>
        )}
      </div>

      {/* ─── Variant switcher modal ────────────────────────────────────────── */}
      {variantModal && (
        <VariantSwitcherModal
          sectionType={variantModal.type}
          currentVariant={variantModal.currentVariant}
          pageId={pageId}
          onPick={applyVariant}
          onClose={() => setVariantModal(null)}
        />
      )}

      {/* ─── Image swap modal ──────────────────────────────────────────────── */}
      {imageModal && (
        <ImageSwapModal
          currentUrl={imageModal.currentUrl}
          preferredVertical={
            (pageMeta?.stepData?.["wizardPayload"] as { vertical?: string } | undefined)?.vertical
          }
          preferredRole={
            imageModal.target === "background" || imageModal.target.startsWith("heroCarousel.")
              ? "hero"
              : imageModal.target === "gallery.add" || imageModal.target.startsWith("gallery.")
                ? "gallery"
                : imageModal.target.startsWith("menu.")
                  ? "gallery"
                  : imageModal.target.startsWith("testimonial.")
                    ? "avatar"
                    : imageModal.target.startsWith("team.")
                      ? "avatar"
                      : "lifestyle"
          }
          onPick={applyImage}
          onClose={() => setImageModal(null)}
        />
      )}
    </div>
  );
}
