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
import { renderRich } from "../../../../../../components/landing/rich-text";
import type { SectionType } from "@marketing/ai-router";

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
          className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-sm leading-none"
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
  sections: Section[];
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

const DEVICE_SIZES: Record<DevicePreset, { w: number; h: number; label: string; icon: string }> = {
  phone:   { w: 375,  h: 812,  label: "Phone",   icon: "📱" },
  tablet:  { w: 768,  h: 1024, label: "Tablet",  icon: "📱" },
  desktop: { w: 1280, h: 800,  label: "Desktop", icon: "💻" },
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

// ─── Icons ────────────────────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? "w-4 h-4"}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-gray-400">
      <circle cx="7" cy="4" r="1.5" /><circle cx="13" cy="4" r="1.5" />
      <circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" />
      <circle cx="7" cy="16" r="1.5" /><circle cx="13" cy="16" r="1.5" />
    </svg>
  );
}

// ─── Section block (sidebar) ─────────────────────────────────────────────────

function SectionBlock({
  section,
  index,
  pageId,
  onSaved,
  onSwapVariant,
  onSwapImage,
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
  onSaved: () => void;
  onSwapVariant: (sectionIndex: number, type: SectionType, currentVariant: string) => void;
  onSwapImage: (sectionIndex: number, type: SectionType, target: string, currentUrl: string | null) => void;
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const headingRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editingHeading) headingRef.current?.focus(); }, [editingHeading]);
  useEffect(() => { if (editingBody) bodyRef.current?.focus(); }, [editingBody]);

  async function saveHeading() {
    if (heading === section.heading) { setEditingHeading(false); return; }
    setSaving(true); setSaveError(null);
    try {
      await trpc.landingPages.editSection.mutate({ pageId, sectionIndex: index, heading });
      setEditingHeading(false);
      onSaved();
    } catch { setSaveError(t("saveError")); }
    finally { setSaving(false); }
  }

  async function saveBody() {
    if (body === (section.body ?? "")) { setEditingBody(false); return; }
    setSaving(true); setSaveError(null);
    try {
      await trpc.landingPages.editSection.mutate({ pageId, sectionIndex: index, body });
      setEditingBody(false);
      onSaved();
    } catch { setSaveError(t("saveError")); }
    finally { setSaving(false); }
  }

  const isDragging = draggingIdx === index;
  const isDropTarget = dropTargetIdx === index && draggingIdx !== null && draggingIdx !== index;

  return (
    <div
      data-sidebar-index={index}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={onDragOver}
      onDrop={(e) => { e.preventDefault(); onDrop(index); }}
      className={`border rounded-xl bg-white overflow-hidden transition-all ${isDragging ? "opacity-40 border-purple-400" : isDropTarget ? "border-purple-500 border-2 shadow-lg" : isActive ? "border-purple-400 ring-2 ring-purple-200" : "border-gray-200 hover:border-gray-300"}`}
    >
      <div
        onClick={onActivate}
        className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2 cursor-pointer"
      >
        <div
          draggable
          onDragStart={(e) => {
            onDragStart(index);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(index));
          }}
          onDragEnd={onDragEnd}
          className="flex items-center gap-2 min-w-0 cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <DragHandleIcon />
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide truncate">
            {SECTION_TYPE_LABEL[section.type] ?? section.type}
          </span>
          {section.variant && (
            <span className="text-[10px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 truncate">{section.variant}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onMoveUp} disabled={!canMoveUp} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500" title="Move up">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd"/></svg>
          </button>
          <button onClick={onMoveDown} disabled={!canMoveDown} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500" title="Move down">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
          </button>
          {(section.type === "hero" || section.type === "about") && (
            <button
              onClick={() => {
                const extras = section.extras as Record<string, unknown> | undefined;
                const isHero = section.type === "hero";
                const target = isHero ? "background" : "about";
                const currentUrl = (isHero ? extras?.["backgroundImageUrl"] : extras?.["imageUrl"]) as string | null ?? null;
                onSwapImage(index, section.type, target, currentUrl);
              }}
              className="text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors ml-1"
              title={section.type === "hero" ? "Replace the hero background image" : "Set the about section image"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
              Image
            </button>
          )}
          <button
            onClick={() => onSwapVariant(index, section.type, section.variant ?? "")}
            className="text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors ml-1"
            title="Try a different layout for this section"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Layout
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {editingHeading ? (
          <div className="space-y-1.5">
            <FormatToolbar targetRef={headingRef} value={heading} setValue={setHeading} />
            <textarea
              ref={headingRef}
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              rows={2}
              className="w-full text-base font-semibold border border-purple-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-200"
              onBlur={saveHeading}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveHeading(); } }}
            />
            <p className="text-[11px] text-gray-400">Select text, then use B / I / U / S. Enter to save.</p>
          </div>
        ) : (
          <p
            className="text-base font-semibold text-gray-900 cursor-text hover:bg-purple-50 hover:ring-1 hover:ring-purple-200 rounded px-1 -mx-1 py-0.5 transition-all"
            onClick={() => { onActivate(); setEditingHeading(true); }}
            title="Click to edit"
          >
            {renderRich(heading)}
          </p>
        )}

        {section.type !== "lead_form" && (
          editingBody ? (
            <div className="space-y-1.5">
              <FormatToolbar targetRef={bodyRef} value={body} setValue={setBody} />
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full text-sm text-gray-600 border border-purple-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-200"
                onBlur={saveBody}
              />
              <p className="text-[11px] text-gray-400">Select text, then use B / I / U / S to format. Click away to save.</p>
            </div>
          ) : (
            <p
              className={`text-sm text-gray-600 leading-relaxed cursor-text hover:bg-purple-50 hover:ring-1 hover:ring-purple-200 rounded px-1 -mx-1 py-0.5 transition-all whitespace-pre-line ${!body ? "text-gray-300 italic" : ""}`}
              onClick={() => { onActivate(); setEditingBody(true); }}
              title="Click to edit"
            >
              {body ? renderRich(body) : "(no body)"}
            </p>
          )
        )}

        {section.type === "gallery" && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Images — click to replace</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(((section.extras as Record<string, unknown> | undefined)?.["images"] as Array<{ url?: string; caption?: string }> | undefined) ?? []).map((img, gi) => (
                <button
                  key={gi}
                  onClick={() => onSwapImage(index, section.type, `gallery.${gi}`, img.url ?? null)}
                  className="group relative aspect-square rounded-md overflow-hidden border border-gray-200 hover:border-emerald-400 bg-gray-100"
                  title={img.caption ? `Replace: ${img.caption}` : "Replace this image"}
                >
                  {img.url
                    ? <img src={img.url} alt={img.caption ?? ""} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : <span className="flex items-center justify-center h-full text-gray-300 text-lg">📷</span>}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 opacity-0 group-hover:opacity-100 transition-all">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {saving && <p className="text-xs text-gray-400 flex items-center gap-1"><SpinnerIcon className="w-3 h-3" /> Saving…</p>}
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
  const [tenantSlug, setTenantSlug] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedNow, setPublishedNow] = useState(false);

  // Variant switcher modal state
  const [variantModal, setVariantModal] = useState<{ sectionIndex: number; type: SectionType; currentVariant: string } | null>(null);
  // Image swap modal state
  const [imageModal, setImageModal] = useState<{ sectionIndex: number; type: SectionType; target: string; currentUrl: string | null } | null>(null);

  // Drag-and-drop reorder state
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  // Device preview
  const [device, setDevice] = useState<DevicePreset>("desktop");

  // Preview iframe bust — bump to force reload after edits
  const [previewVersion, setPreviewVersion] = useState(0);

  // Preview <-> editor sync
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Tell the preview iframe to scroll a given section into view + flash it.
  const scrollPreviewTo = useCallback((index: number) => {
    setActiveIndex(index);
    iframeRef.current?.contentWindow?.postMessage(
      { source: "lp-editor", type: "scrollTo", index },
      window.location.origin,
    );
  }, []);

  // Listen for "active section" pings from the preview as the user scrolls it.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: string; type?: string; index?: number } | null;
      if (!data || data.source !== "lp-preview" || data.type !== "active" || typeof data.index !== "number") return;
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

  const loadPage = useCallback(async () => {
    try {
      const [compositionData, pageData, listData] = await Promise.all([
        trpc.landingPages.getComposition.query({ pageId }),
        trpc.landingPages.getPage.query({ pageId }),
        trpc.landingPages.listPages.query(),
      ]);

      if (compositionData) {
        setComposition(compositionData.composition as Composition);
      }
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
      setPreviewVersion((v) => v + 1);
    } catch {
      setLoadError(t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [pageId, t]);

  useEffect(() => { void loadPage(); }, [loadPage]);

  async function handlePublish() {
    setPublishing(true); setPublishError(null); setPublishedNow(false);
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

  // Section variant swap
  const handleSwapVariant = useCallback((sectionIndex: number, type: SectionType, currentVariant: string) => {
    setVariantModal({ sectionIndex, type, currentVariant });
  }, []);

  const applyVariant = useCallback(async (variant: string) => {
    if (!variantModal) return;
    try {
      await trpc.landingPages.swapVariant.mutate({ pageId, sectionIndex: variantModal.sectionIndex, variant });
      setVariantModal(null);
      await loadPage();
    } catch {
      /* keep modal open on error */
    }
  }, [variantModal, pageId, loadPage]);

  // Image swap
  const handleSwapImage = useCallback((sectionIndex: number, type: SectionType, target: string, currentUrl: string | null) => {
    setImageModal({ sectionIndex, type, target, currentUrl });
  }, []);

  const applyImage = useCallback(async (url: string) => {
    if (!imageModal) return;
    try {
      await trpc.landingPages.swapSectionImage.mutate({
        pageId,
        sectionIndex: imageModal.sectionIndex,
        target: imageModal.target,
        url,
      });
      setImageModal(null);
      await loadPage();
    } catch { /* keep modal open on error */ }
  }, [imageModal, pageId, loadPage]);

  // Section reorder (move up / move down OR drag-and-drop)
  const moveSection = useCallback(async (fromIdx: number, toIdx: number) => {
    if (!composition) return;
    if (fromIdx === toIdx) return;
    const newOrder = composition.sections.map((_, i) => i);
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved!);
    try {
      await trpc.landingPages.reorderSections.mutate({ pageId, newOrder });
      await loadPage();
    } catch { /* ignore */ }
  }, [composition, pageId, loadPage]);

  // Drag-and-drop handlers (HTML5 native — no library)
  const handleDragStart = useCallback((idx: number) => setDraggingIdx(idx), []);
  const handleDragEnter = useCallback((idx: number) => setDropTargetIdx(idx), []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const handleDragEnd = useCallback(() => { setDraggingIdx(null); setDropTargetIdx(null); }, []);
  const handleDrop = useCallback(async (targetIdx: number) => {
    if (draggingIdx === null || draggingIdx === targetIdx) {
      setDraggingIdx(null); setDropTargetIdx(null);
      return;
    }
    const from = draggingIdx;
    setDraggingIdx(null); setDropTargetIdx(null);
    await moveSection(from, targetIdx);
  }, [draggingIdx, moveSection]);

  // Theme swap
  const handleThemeChange = useCallback(async (palette: string | null, fontPair: string | null) => {
    try {
      await trpc.landingPages.updateTheme.mutate({ pageId, themeKey: palette, fontPairKey: fontPair });
      await loadPage();
    } catch { /* ignore */ }
  }, [pageId, loadPage]);

  const hasUnpublishedChanges =
    pageMeta?.currentVersionId &&
    pageMeta.currentVersionId !== pageMeta.publishedVersionId;

  const sections = composition?.sections.slice().sort((a, b) => a.order - b.order) ?? [];
  const currentFontPair = (pageMeta?.stepData?.themeFontPair as string | null) ?? null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SpinnerIcon className="w-8 h-8 text-gray-400" />
      </div>
    );
  }

  if (loadError || !composition || !pageMeta) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-sm text-red-600">{loadError ?? t("loadError")}</p>
      </div>
    );
  }

  // Always use the draft preview route — it always shows the current (in-flight) version,
  // so changes show up in the iframe even before publishing.
  const previewUrl = `/p/preview/page/${pageId}?v=${previewVersion}`;

  const deviceDims = DEVICE_SIZES[device];

  return (
    <div className="h-screen flex flex-col bg-gray-50">

      {/* ─── Top toolbar ───────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push(`/${locale}/landing-pages`)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex-shrink-0"
            title="Back to pages"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd"/></svg>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{pageMeta.title}</p>
            <p className="text-xs text-gray-500 capitalize">{pageMeta.status}{hasUnpublishedChanges && <span className="text-amber-600 ml-1">· unpublished changes</span>}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Device toggle */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(["phone", "tablet", "desktop"] as DevicePreset[]).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${device === d ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                title={DEVICE_SIZES[d].label}
              >
                <span className="mr-1">{DEVICE_SIZES[d].icon}</span>
                <span className="hidden sm:inline">{DEVICE_SIZES[d].label}</span>
              </button>
            ))}
          </div>

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
              className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              View live ↗
            </a>
          )}
          <button
            onClick={handlePublish}
            disabled={publishing || !pageMeta.currentVersionId}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 flex items-center gap-1.5"
          >
            {publishing && <SpinnerIcon className="w-3.5 h-3.5" />}
            {publishedNow ? "✓ Published" : (publishing ? "Publishing…" : "Publish")}
          </button>
        </div>
      </header>

      {publishError && <p className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700">{publishError}</p>}

      {/* ─── Main split: sidebar | preview ────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[420px] bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="p-4 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sections</p>
            <p className="text-xs text-gray-400 mt-0.5">Click any text to edit. Use ⬆⬇ to reorder. &ldquo;Layout&rdquo; tries variants.</p>
          </div>
          <div className="p-4 space-y-3">
            {sections.map((section, i) => (
              <SectionBlock
                key={`${section.type}-${i}`}
                section={section}
                index={i}
                pageId={pageId}
                onSaved={loadPage}
                onSwapVariant={handleSwapVariant}
                onSwapImage={handleSwapImage}
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

        {/* Preview iframe */}
        <main className="flex-1 overflow-hidden bg-gray-100 flex items-center justify-center p-6">
          <div
            className="bg-white shadow-2xl rounded-lg overflow-hidden transition-all duration-300"
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
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms"
            />
          </div>
        </main>
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
          preferredVertical={(pageMeta?.stepData?.["wizardPayload"] as { vertical?: string } | undefined)?.vertical}
          preferredRole={imageModal.target === "background" ? "hero" : imageModal.target.startsWith("gallery.") ? "gallery" : imageModal.target.startsWith("testimonial.") ? "avatar" : imageModal.target.startsWith("team.") ? "avatar" : "lifestyle"}
          onPick={applyImage}
          onClose={() => setImageModal(null)}
        />
      )}
    </div>
  );
}
