"use client";

// LP-5: Variant switcher modal.
// Click "Try another layout" on a section → opens this modal showing all variants
// for that section type. Click one → swaps the variant + closes.
// The user sees the change reflected in the main preview iframe after the save.

import React from "react";
import { SECTION_VARIANTS } from "@marketing/ai-router/section-variants";

type SectionType = keyof typeof SECTION_VARIANTS;

type VariantInfo = { label: string; description: string; preview: React.ReactNode };

// Simple mini-illustration SVGs per variant — give the user a sense of the layout.
function Box({ children, accent }: { children?: React.ReactNode; accent?: boolean }) {
  return <div className={`rounded ${accent ? "bg-purple-300" : "bg-gray-300"}`}>{children}</div>;
}

const VARIANTS: Partial<Record<SectionType, Record<string, VariantInfo>>> = {
  hero: {
    "centered": {
      label: "Centered",
      description: "Dark gradient background, large centered headline, CTA button.",
      preview: <div className="h-full bg-gradient-to-br from-gray-900 to-purple-900 rounded p-3 flex flex-col items-center justify-center gap-1.5"><div className="h-2 w-3/4 bg-white/80 rounded" /><div className="h-1 w-1/2 bg-white/40 rounded" /><div className="h-2 w-12 bg-white rounded mt-1" /></div>,
    },
    "image-bg-overlay": {
      label: "Image background",
      description: "Full-bleed photo with dark overlay, left-aligned headline at bottom.",
      preview: <div className="h-full bg-gradient-to-br from-purple-700 to-rose-700 rounded p-3 flex flex-col justify-end gap-1"><div className="h-2 w-3/5 bg-white/90 rounded" /><div className="h-1 w-2/5 bg-white/50 rounded" /></div>,
    },
    "split-image-right": {
      label: "Split + image",
      description: "Clean white background, content on left, image fills the right half.",
      preview: <div className="h-full bg-white rounded border border-gray-200 flex"><div className="flex-1 p-2 flex flex-col justify-center gap-1"><div className="h-1.5 w-3/4 bg-gray-800 rounded" /><div className="h-1 w-1/2 bg-gray-400 rounded" /><div className="h-1.5 w-8 bg-purple-500 rounded mt-1" /></div><div className="flex-1 bg-gray-300 rounded-r" /></div>,
    },
    "split-form-right": {
      label: "Split + form",
      description: "Brand gradient left, white form card on the right.",
      preview: <div className="h-full bg-gradient-to-br from-purple-700 to-indigo-900 rounded flex"><div className="flex-1 p-2 flex flex-col justify-center gap-1"><div className="h-1.5 w-3/4 bg-white/80 rounded" /><div className="h-1 w-1/2 bg-white/50 rounded" /></div><div className="w-1/2 m-2 bg-white rounded p-1 flex flex-col gap-1"><div className="h-1 w-full bg-gray-200 rounded" /><div className="h-1 w-full bg-gray-200 rounded" /><div className="h-1.5 w-full bg-purple-500 rounded" /></div></div>,
    },
  },
  about: {
    "text-image-split": {
      label: "Text + image",
      description: "Left text with value checklist, tall photo on right.",
      preview: <div className="h-full bg-white rounded border border-gray-200 flex p-2 gap-2"><div className="flex-1 flex flex-col justify-center gap-1"><div className="h-1.5 w-3/4 bg-gray-800 rounded" /><div className="h-1 w-full bg-gray-400 rounded" /><div className="flex items-center gap-1 mt-1"><div className="w-2 h-2 rounded-full bg-purple-300" /><div className="h-1 w-1/2 bg-gray-500 rounded" /></div></div><div className="flex-1 bg-gray-300 rounded" /></div>,
    },
    "team-grid": {
      label: "Team grid",
      description: "Heading + body, then team member cards in a grid.",
      preview: <div className="h-full bg-gray-100 rounded p-2 flex flex-col gap-2"><div className="h-1.5 w-1/2 bg-gray-700 rounded mx-auto" /><div className="grid grid-cols-3 gap-1 flex-1"><div className="bg-white rounded p-1 flex flex-col items-center justify-center gap-0.5"><div className="w-4 h-4 rounded-full bg-purple-300" /><div className="h-0.5 w-3 bg-gray-400 rounded" /></div><div className="bg-white rounded p-1 flex flex-col items-center justify-center gap-0.5"><div className="w-4 h-4 rounded-full bg-purple-300" /><div className="h-0.5 w-3 bg-gray-400 rounded" /></div><div className="bg-white rounded p-1 flex flex-col items-center justify-center gap-0.5"><div className="w-4 h-4 rounded-full bg-purple-300" /><div className="h-0.5 w-3 bg-gray-400 rounded" /></div></div></div>,
    },
    "values-3col": {
      label: "3-column values",
      description: "3 feature columns: icon + title — great for 'why us'.",
      preview: <div className="h-full bg-white rounded p-2 flex flex-col gap-2"><div className="h-1.5 w-1/2 bg-gray-700 rounded mx-auto" /><div className="grid grid-cols-3 gap-1 flex-1"><div className="bg-gray-50 rounded p-1 flex flex-col items-center justify-center gap-0.5"><div className="text-base">⭐</div><div className="h-0.5 w-3 bg-gray-500 rounded" /></div><div className="bg-gray-50 rounded p-1 flex flex-col items-center justify-center gap-0.5"><div className="text-base">🛡️</div><div className="h-0.5 w-3 bg-gray-500 rounded" /></div><div className="bg-gray-50 rounded p-1 flex flex-col items-center justify-center gap-0.5"><div className="text-base">⚡</div><div className="h-0.5 w-3 bg-gray-500 rounded" /></div></div></div>,
    },
  },
  gallery: {
    "masonry-3": {
      label: "Masonry (3-col)",
      description: "Pinterest-style 3-column masonry; auto-sized images.",
      preview: <div className="h-full bg-white rounded p-1.5 grid grid-cols-3 gap-1 grid-rows-3"><Box /><Box /><Box /><Box /><Box /><Box /></div>,
    },
    "grid-2x2": {
      label: "Grid (2×2)",
      description: "Four equal-size tiles in a clean 2-by-2 grid.",
      preview: <div className="h-full bg-gray-50 rounded p-2 grid grid-cols-2 gap-1.5"><Box /><Box /><Box /><Box /></div>,
    },
    "carousel-strip": {
      label: "Carousel strip",
      description: "Horizontally scrollable filmstrip of photos.",
      preview: <div className="h-full bg-white rounded p-2 flex flex-col gap-1 overflow-hidden"><div className="h-1.5 w-1/3 bg-gray-700 rounded mx-auto" /><div className="flex-1 flex gap-1 overflow-hidden"><div className="flex-shrink-0 w-1/2 bg-gray-300 rounded" /><div className="flex-shrink-0 w-1/3 bg-gray-300 rounded" /><div className="flex-shrink-0 w-1/4 bg-gray-300 rounded" /></div></div>,
    },
    "feature-side": {
      label: "Feature + side",
      description: "One large hero image, smaller thumbnails on the side.",
      preview: <div className="h-full bg-gray-50 rounded p-2 grid grid-cols-3 gap-1"><div className="col-span-2 bg-gray-300 rounded" /><div className="flex flex-col gap-1"><div className="flex-1 bg-gray-300 rounded" /><div className="flex-1 bg-gray-300 rounded" /></div></div>,
    },
  },
  testimonials: {
    "cards-3col": {
      label: "Cards (3-col)",
      description: "Three quote cards in a row with avatar + name.",
      preview: <div className="h-full bg-gray-50 rounded p-2 grid grid-cols-3 gap-1"><div className="bg-white rounded p-1 flex flex-col gap-0.5"><div className="text-purple-500 text-sm leading-none">&ldquo;</div><div className="h-0.5 w-full bg-gray-300 rounded" /><div className="h-0.5 w-3/4 bg-gray-300 rounded" /><div className="w-2 h-2 rounded-full bg-purple-300 mt-auto" /></div><div className="bg-white rounded p-1 flex flex-col gap-0.5"><div className="text-purple-500 text-sm leading-none">&ldquo;</div><div className="h-0.5 w-full bg-gray-300 rounded" /><div className="h-0.5 w-3/4 bg-gray-300 rounded" /><div className="w-2 h-2 rounded-full bg-purple-300 mt-auto" /></div><div className="bg-white rounded p-1 flex flex-col gap-0.5"><div className="text-purple-500 text-sm leading-none">&ldquo;</div><div className="h-0.5 w-full bg-gray-300 rounded" /><div className="h-0.5 w-3/4 bg-gray-300 rounded" /><div className="w-2 h-2 rounded-full bg-purple-300 mt-auto" /></div></div>,
    },
    "large-quote": {
      label: "Large quote",
      description: "A single prominent centered testimonial.",
      preview: <div className="h-full bg-white rounded flex flex-col items-center justify-center gap-1 p-2"><div className="text-purple-300 text-2xl leading-none">&ldquo;</div><div className="h-1.5 w-3/4 bg-gray-700 rounded" /><div className="h-1 w-2/3 bg-gray-400 rounded" /><div className="w-3 h-3 rounded-full bg-purple-300 mt-1" /></div>,
    },
    "list-with-avatars": {
      label: "List + avatars",
      description: "Vertical list, avatar on left + quote on right.",
      preview: <div className="h-full bg-gray-50 rounded p-2 flex flex-col gap-1"><div className="bg-white rounded p-1 flex gap-1 items-center"><div className="w-4 h-4 rounded-full bg-purple-300 flex-shrink-0" /><div className="flex-1 flex flex-col gap-0.5"><div className="h-0.5 w-full bg-gray-300 rounded" /><div className="h-0.5 w-3/4 bg-gray-300 rounded" /></div></div><div className="bg-white rounded p-1 flex gap-1 items-center"><div className="w-4 h-4 rounded-full bg-purple-300 flex-shrink-0" /><div className="flex-1 flex flex-col gap-0.5"><div className="h-0.5 w-full bg-gray-300 rounded" /><div className="h-0.5 w-3/4 bg-gray-300 rounded" /></div></div></div>,
    },
  },
  menu_preview: {
    "list-borders": {
      label: "List with dividers",
      description: "Clean list, price badge on the right.",
      preview: <div className="h-full bg-gray-50 rounded p-2 flex flex-col gap-1"><div className="bg-white rounded p-1 flex justify-between items-center"><div className="h-1 w-2/3 bg-gray-700 rounded" /><div className="h-1.5 w-6 bg-purple-200 rounded" /></div><div className="border-t border-gray-100 mt-0.5 pt-0.5 flex justify-between items-center"><div className="h-1 w-2/3 bg-gray-700 rounded" /><div className="h-1.5 w-6 bg-purple-200 rounded" /></div><div className="border-t border-gray-100 mt-0.5 pt-0.5 flex justify-between items-center"><div className="h-1 w-2/3 bg-gray-700 rounded" /><div className="h-1.5 w-6 bg-purple-200 rounded" /></div></div>,
    },
    "cards-grid": {
      label: "Cards grid",
      description: "Each menu item as a card with optional photo.",
      preview: <div className="h-full bg-white rounded p-2 grid grid-cols-3 gap-1"><div className="bg-gray-50 rounded p-0.5 flex flex-col gap-0.5"><div className="bg-gray-200 h-3 rounded" /><div className="h-1 w-3/4 bg-gray-700 rounded" /><div className="h-1 w-1/2 bg-purple-300 rounded mt-auto" /></div><div className="bg-gray-50 rounded p-0.5 flex flex-col gap-0.5"><div className="bg-gray-200 h-3 rounded" /><div className="h-1 w-3/4 bg-gray-700 rounded" /><div className="h-1 w-1/2 bg-purple-300 rounded mt-auto" /></div><div className="bg-gray-50 rounded p-0.5 flex flex-col gap-0.5"><div className="bg-gray-200 h-3 rounded" /><div className="h-1 w-3/4 bg-gray-700 rounded" /><div className="h-1 w-1/2 bg-purple-300 rounded mt-auto" /></div></div>,
    },
    "split-image": {
      label: "Split + image",
      description: "Lifestyle photo on left, menu list on right.",
      preview: <div className="h-full bg-gray-50 rounded p-1.5 flex gap-1.5"><div className="flex-1 bg-gray-300 rounded" /><div className="flex-1 flex flex-col gap-0.5"><div className="flex justify-between items-center"><div className="h-1 w-2/3 bg-gray-700 rounded" /><div className="h-1.5 w-4 bg-purple-200 rounded" /></div><div className="flex justify-between items-center"><div className="h-1 w-2/3 bg-gray-700 rounded" /><div className="h-1.5 w-4 bg-purple-200 rounded" /></div></div></div>,
    },
  },
  offer: {
    "banner-centered": {
      label: "Banner (centered)",
      description: "Brand color background, centered price + CTA.",
      preview: <div className="h-full bg-purple-600 rounded p-2 flex flex-col items-center justify-center gap-1"><div className="h-1 w-1/3 bg-white/40 rounded" /><div className="h-2.5 w-1/2 bg-white rounded" /><div className="h-3 w-1/3 bg-white rounded" /><div className="h-1.5 w-1/4 bg-white rounded" /></div>,
    },
    "split-image-price": {
      label: "Split + image",
      description: "Lifestyle photo + price/CTA on the side.",
      preview: <div className="h-full bg-white rounded p-1.5 flex gap-1.5"><div className="flex-1 bg-gray-300 rounded" /><div className="flex-1 flex flex-col justify-center gap-1"><div className="h-1 w-1/3 bg-purple-300 rounded" /><div className="h-1.5 w-2/3 bg-gray-800 rounded" /><div className="h-2.5 w-1/2 bg-purple-600 rounded" /><div className="h-1.5 w-1/3 bg-purple-600 rounded" /></div></div>,
    },
    "countdown-bold": {
      label: "Bold countdown",
      description: "Dark dramatic background with massive price.",
      preview: <div className="h-full bg-gray-900 rounded p-2 flex flex-col items-center justify-center gap-0.5"><div className="h-0.5 w-1/3 bg-purple-400 rounded" /><div className="h-1.5 w-1/2 bg-white rounded" /><div className="bg-purple-500/20 border border-purple-500/40 rounded p-1 mt-0.5"><div className="h-3 w-12 bg-white rounded" /></div><div className="h-1.5 w-1/4 bg-purple-500 rounded mt-0.5" /></div>,
    },
  },
  faq: {
    "accordion": {
      label: "Accordion",
      description: "Expandable Q&A — clean and minimal.",
      preview: <div className="h-full bg-white rounded p-2 flex flex-col gap-1"><div className="border border-gray-200 rounded p-1 flex justify-between items-center"><div className="h-1 w-2/3 bg-gray-700 rounded" /><div className="text-purple-500 text-xs leading-none">+</div></div><div className="border border-gray-200 rounded p-1 flex justify-between items-center"><div className="h-1 w-2/3 bg-gray-700 rounded" /><div className="text-purple-500 text-xs leading-none">+</div></div><div className="border border-gray-200 rounded p-1 flex justify-between items-center"><div className="h-1 w-2/3 bg-gray-700 rounded" /><div className="text-purple-500 text-xs leading-none">+</div></div></div>,
    },
    "two-column": {
      label: "Two columns",
      description: "Questions split into two columns side by side.",
      preview: <div className="h-full bg-gray-50 rounded p-1.5 grid grid-cols-2 gap-1"><div className="bg-white rounded p-0.5 flex flex-col gap-0.5"><div className="h-1 w-full bg-gray-700 rounded" /><div className="h-0.5 w-3/4 bg-gray-400 rounded" /></div><div className="bg-white rounded p-0.5 flex flex-col gap-0.5"><div className="h-1 w-full bg-gray-700 rounded" /><div className="h-0.5 w-3/4 bg-gray-400 rounded" /></div></div>,
    },
    "numbered-list": {
      label: "Numbered list",
      description: "All Q&A visible, large brand-colored numbers.",
      preview: <div className="h-full bg-white rounded p-2 flex flex-col gap-1"><div className="flex gap-1.5"><div className="text-purple-300 font-bold text-sm leading-none">01</div><div className="flex-1 flex flex-col gap-0.5"><div className="h-1 w-3/4 bg-gray-700 rounded" /><div className="h-0.5 w-full bg-gray-400 rounded" /></div></div><div className="flex gap-1.5"><div className="text-purple-300 font-bold text-sm leading-none">02</div><div className="flex-1 flex flex-col gap-0.5"><div className="h-1 w-3/4 bg-gray-700 rounded" /><div className="h-0.5 w-full bg-gray-400 rounded" /></div></div></div>,
    },
  },
  contact: {
    "split-map": {
      label: "Split + map",
      description: "Contact info left, map iframe on the right.",
      preview: <div className="h-full bg-gray-50 rounded p-1.5 flex gap-1.5"><div className="flex-1 flex flex-col gap-0.5 justify-center"><div className="h-1 w-3/4 bg-gray-700 rounded" /><div className="h-1 w-1/2 bg-gray-400 rounded" /><div className="h-1 w-2/3 bg-gray-400 rounded" /></div><div className="flex-1 bg-gradient-to-br from-green-100 to-green-300 rounded" /></div>,
    },
    "cards-row": {
      label: "Cards row",
      description: "Row of icon cards: address, phone, email, hours.",
      preview: <div className="h-full bg-white rounded p-2 grid grid-cols-4 gap-1"><div className="bg-gray-50 rounded p-1 flex flex-col items-center justify-center gap-0.5"><div className="text-xs">📍</div><div className="h-0.5 w-3 bg-gray-400 rounded" /></div><div className="bg-gray-50 rounded p-1 flex flex-col items-center justify-center gap-0.5"><div className="text-xs">📞</div><div className="h-0.5 w-3 bg-gray-400 rounded" /></div><div className="bg-gray-50 rounded p-1 flex flex-col items-center justify-center gap-0.5"><div className="text-xs">✉️</div><div className="h-0.5 w-3 bg-gray-400 rounded" /></div><div className="bg-gray-50 rounded p-1 flex flex-col items-center justify-center gap-0.5"><div className="text-xs">🕐</div><div className="h-0.5 w-3 bg-gray-400 rounded" /></div></div>,
    },
    "full-map-overlay": {
      label: "Full map + card",
      description: "Full-width map with a floating contact card overlaid.",
      preview: <div className="h-full bg-gradient-to-br from-green-100 to-green-300 rounded relative"><div className="absolute top-2 left-2 right-12 bg-white rounded p-1 flex flex-col gap-0.5 shadow"><div className="h-1 w-1/2 bg-purple-400 rounded" /><div className="h-1 w-3/4 bg-gray-700 rounded" /><div className="h-0.5 w-2/3 bg-gray-400 rounded" /></div></div>,
    },
  },
  lead_form: {
    "card-centered": {
      label: "Centered card",
      description: "Centered white card with form fields.",
      preview: <div className="h-full bg-gray-50 rounded p-2 flex items-center justify-center"><div className="bg-white rounded p-2 w-3/4 flex flex-col gap-1 shadow"><div className="h-1 w-full bg-gray-200 rounded" /><div className="h-1 w-full bg-gray-200 rounded" /><div className="h-1.5 w-full bg-purple-500 rounded" /></div></div>,
    },
    "split-side-image": {
      label: "Split + image",
      description: "Photo or gradient on left, form on right.",
      preview: <div className="h-full bg-gray-50 rounded p-1.5 flex gap-1.5"><div className="flex-1 bg-gradient-to-br from-purple-400 to-pink-400 rounded" /><div className="flex-1 bg-white rounded p-1 flex flex-col justify-center gap-0.5"><div className="h-1 w-full bg-gray-200 rounded" /><div className="h-1 w-full bg-gray-200 rounded" /><div className="h-1.5 w-full bg-purple-500 rounded" /></div></div>,
    },
    "full-width-bar": {
      label: "Full-width bar",
      description: "Full-width colored bar with inline form row.",
      preview: <div className="h-full bg-purple-600 rounded p-2 flex items-center gap-2"><div className="flex-1 flex flex-col gap-0.5"><div className="h-1 w-3/4 bg-white/90 rounded" /><div className="h-0.5 w-1/2 bg-white/50 rounded" /></div><div className="flex-1 bg-white rounded p-1 flex gap-0.5"><div className="flex-1 h-1.5 bg-gray-200 rounded" /><div className="flex-1 h-1.5 bg-gray-200 rounded" /><div className="w-3 h-1.5 bg-purple-500 rounded" /></div></div>,
    },
  },
  whatsapp_cta: {
    "centered-button": {
      label: "Centered button",
      description: "Centered layout, big WhatsApp button.",
      preview: <div className="h-full bg-green-50 rounded p-2 flex flex-col items-center justify-center gap-1"><div className="w-5 h-5 rounded-full bg-green-500" /><div className="h-1.5 w-3/4 bg-gray-700 rounded" /><div className="h-1 w-1/2 bg-gray-400 rounded" /><div className="h-1.5 w-1/3 bg-green-500 rounded mt-1" /></div>,
    },
    "banner-strip": {
      label: "Banner strip",
      description: "Slim full-width green strip with inline button.",
      preview: <div className="h-full bg-gray-100 rounded flex items-center"><div className="w-full bg-green-700 p-1.5 flex items-center justify-between"><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-white" /><div className="h-1 w-12 bg-white/80 rounded" /></div><div className="h-1.5 w-6 bg-white rounded" /></div></div>,
    },
  },
};

export function VariantSwitcherModal({
  sectionType,
  currentVariant,
  onPick,
  onClose,
}: {
  sectionType: SectionType;
  currentVariant: string;
  pageId?: string;
  onPick: (variant: string) => void;
  onClose: () => void;
}) {
  const variantInfo = VARIANTS[sectionType] ?? {};
  const variants = SECTION_VARIANTS[sectionType] ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Try another layout</h2>
            <p className="text-sm text-gray-500 mt-0.5">Pick a different design for this <span className="font-medium capitalize">{sectionType.replace("_", " ")}</span> section.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {variants.map((v) => {
              const active = v === currentVariant;
              const info = variantInfo[v];
              return (
                <button
                  key={v}
                  onClick={() => onPick(v)}
                  className={`text-left rounded-xl overflow-hidden border-2 transition-all bg-white ${active ? "border-purple-600 shadow-lg" : "border-gray-200 hover:border-purple-300 hover:shadow-md"}`}
                >
                  <div className="h-32 bg-gray-50 relative overflow-hidden">
                    {info?.preview ?? <div className="h-full flex items-center justify-center text-gray-300 text-xs">No preview</div>}
                    {active && (
                      <span className="absolute top-2 right-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-md font-semibold flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                        Current
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm text-gray-900 mb-0.5">{info?.label ?? v}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{info?.description ?? ""}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
