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
    centered: {
      label: "Centered",
      description: "Dark gradient background, large centered headline, CTA button.",
      preview: (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 rounded bg-gradient-to-br from-gray-900 to-purple-900 p-3">
          <div className="h-2 w-3/4 rounded bg-white/80" />
          <div className="h-1 w-1/2 rounded bg-white/40" />
          <div className="mt-1 h-2 w-12 rounded bg-white" />
        </div>
      ),
    },
    "image-bg-overlay": {
      label: "Image background",
      description: "Full-bleed photo with dark overlay, left-aligned headline at bottom.",
      preview: (
        <div className="flex h-full flex-col justify-end gap-1 rounded bg-gradient-to-br from-purple-700 to-rose-700 p-3">
          <div className="h-2 w-3/5 rounded bg-white/90" />
          <div className="h-1 w-2/5 rounded bg-white/50" />
        </div>
      ),
    },
    "split-image-right": {
      label: "Split + image",
      description: "Clean white background, content on left, image fills the right half.",
      preview: (
        <div className="flex h-full rounded border border-gray-200 bg-white">
          <div className="flex flex-1 flex-col justify-center gap-1 p-2">
            <div className="h-1.5 w-3/4 rounded bg-gray-800" />
            <div className="h-1 w-1/2 rounded bg-gray-400" />
            <div className="mt-1 h-1.5 w-8 rounded bg-purple-500" />
          </div>
          <div className="flex-1 rounded-r bg-gray-300" />
        </div>
      ),
    },
    "split-form-right": {
      label: "Split + form",
      description: "Brand gradient left, white form card on the right.",
      preview: (
        <div className="flex h-full rounded bg-gradient-to-br from-purple-700 to-indigo-900">
          <div className="flex flex-1 flex-col justify-center gap-1 p-2">
            <div className="h-1.5 w-3/4 rounded bg-white/80" />
            <div className="h-1 w-1/2 rounded bg-white/50" />
          </div>
          <div className="m-2 flex w-1/2 flex-col gap-1 rounded bg-white p-1">
            <div className="h-1 w-full rounded bg-gray-200" />
            <div className="h-1 w-full rounded bg-gray-200" />
            <div className="h-1.5 w-full rounded bg-purple-500" />
          </div>
        </div>
      ),
    },
  },
  about: {
    "text-image-split": {
      label: "Text + image",
      description: "Left text with value checklist, tall photo on right.",
      preview: (
        <div className="flex h-full gap-2 rounded border border-gray-200 bg-white p-2">
          <div className="flex flex-1 flex-col justify-center gap-1">
            <div className="h-1.5 w-3/4 rounded bg-gray-800" />
            <div className="h-1 w-full rounded bg-gray-400" />
            <div className="mt-1 flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-purple-300" />
              <div className="h-1 w-1/2 rounded bg-gray-500" />
            </div>
          </div>
          <div className="flex-1 rounded bg-gray-300" />
        </div>
      ),
    },
    "team-grid": {
      label: "Team grid",
      description: "Heading + body, then team member cards in a grid.",
      preview: (
        <div className="flex h-full flex-col gap-2 rounded bg-gray-100 p-2">
          <div className="mx-auto h-1.5 w-1/2 rounded bg-gray-700" />
          <div className="grid flex-1 grid-cols-3 gap-1">
            <div className="flex flex-col items-center justify-center gap-0.5 rounded bg-white p-1">
              <div className="h-4 w-4 rounded-full bg-purple-300" />
              <div className="h-0.5 w-3 rounded bg-gray-400" />
            </div>
            <div className="flex flex-col items-center justify-center gap-0.5 rounded bg-white p-1">
              <div className="h-4 w-4 rounded-full bg-purple-300" />
              <div className="h-0.5 w-3 rounded bg-gray-400" />
            </div>
            <div className="flex flex-col items-center justify-center gap-0.5 rounded bg-white p-1">
              <div className="h-4 w-4 rounded-full bg-purple-300" />
              <div className="h-0.5 w-3 rounded bg-gray-400" />
            </div>
          </div>
        </div>
      ),
    },
    "values-3col": {
      label: "3-column values",
      description: "3 feature columns: icon + title — great for 'why us'.",
      preview: (
        <div className="flex h-full flex-col gap-2 rounded bg-white p-2">
          <div className="mx-auto h-1.5 w-1/2 rounded bg-gray-700" />
          <div className="grid flex-1 grid-cols-3 gap-1">
            <div className="flex flex-col items-center justify-center gap-0.5 rounded bg-gray-50 p-1">
              <div className="text-base">⭐</div>
              <div className="h-0.5 w-3 rounded bg-gray-500" />
            </div>
            <div className="flex flex-col items-center justify-center gap-0.5 rounded bg-gray-50 p-1">
              <div className="text-base">🛡️</div>
              <div className="h-0.5 w-3 rounded bg-gray-500" />
            </div>
            <div className="flex flex-col items-center justify-center gap-0.5 rounded bg-gray-50 p-1">
              <div className="text-base">⚡</div>
              <div className="h-0.5 w-3 rounded bg-gray-500" />
            </div>
          </div>
        </div>
      ),
    },
  },
  gallery: {
    "masonry-3": {
      label: "Masonry (3-col)",
      description: "Pinterest-style 3-column masonry; auto-sized images.",
      preview: (
        <div className="grid h-full grid-cols-3 grid-rows-3 gap-1 rounded bg-white p-1.5">
          <Box />
          <Box />
          <Box />
          <Box />
          <Box />
          <Box />
        </div>
      ),
    },
    "grid-2x2": {
      label: "Grid (2×2)",
      description: "Four equal-size tiles in a clean 2-by-2 grid.",
      preview: (
        <div className="grid h-full grid-cols-2 gap-1.5 rounded bg-gray-50 p-2">
          <Box />
          <Box />
          <Box />
          <Box />
        </div>
      ),
    },
    "carousel-strip": {
      label: "Carousel strip",
      description: "Horizontally scrollable filmstrip of photos.",
      preview: (
        <div className="flex h-full flex-col gap-1 overflow-hidden rounded bg-white p-2">
          <div className="mx-auto h-1.5 w-1/3 rounded bg-gray-700" />
          <div className="flex flex-1 gap-1 overflow-hidden">
            <div className="w-1/2 flex-shrink-0 rounded bg-gray-300" />
            <div className="w-1/3 flex-shrink-0 rounded bg-gray-300" />
            <div className="w-1/4 flex-shrink-0 rounded bg-gray-300" />
          </div>
        </div>
      ),
    },
    "feature-side": {
      label: "Feature + side",
      description: "One large hero image, smaller thumbnails on the side.",
      preview: (
        <div className="grid h-full grid-cols-3 gap-1 rounded bg-gray-50 p-2">
          <div className="col-span-2 rounded bg-gray-300" />
          <div className="flex flex-col gap-1">
            <div className="flex-1 rounded bg-gray-300" />
            <div className="flex-1 rounded bg-gray-300" />
          </div>
        </div>
      ),
    },
  },
  testimonials: {
    "cards-3col": {
      label: "Cards (3-col)",
      description: "Three quote cards in a row with avatar + name.",
      preview: (
        <div className="grid h-full grid-cols-3 gap-1 rounded bg-gray-50 p-2">
          <div className="flex flex-col gap-0.5 rounded bg-white p-1">
            <div className="text-sm leading-none text-purple-500">&ldquo;</div>
            <div className="h-0.5 w-full rounded bg-gray-300" />
            <div className="h-0.5 w-3/4 rounded bg-gray-300" />
            <div className="mt-auto h-2 w-2 rounded-full bg-purple-300" />
          </div>
          <div className="flex flex-col gap-0.5 rounded bg-white p-1">
            <div className="text-sm leading-none text-purple-500">&ldquo;</div>
            <div className="h-0.5 w-full rounded bg-gray-300" />
            <div className="h-0.5 w-3/4 rounded bg-gray-300" />
            <div className="mt-auto h-2 w-2 rounded-full bg-purple-300" />
          </div>
          <div className="flex flex-col gap-0.5 rounded bg-white p-1">
            <div className="text-sm leading-none text-purple-500">&ldquo;</div>
            <div className="h-0.5 w-full rounded bg-gray-300" />
            <div className="h-0.5 w-3/4 rounded bg-gray-300" />
            <div className="mt-auto h-2 w-2 rounded-full bg-purple-300" />
          </div>
        </div>
      ),
    },
    "large-quote": {
      label: "Large quote",
      description: "A single prominent centered testimonial.",
      preview: (
        <div className="flex h-full flex-col items-center justify-center gap-1 rounded bg-white p-2">
          <div className="text-2xl leading-none text-purple-300">&ldquo;</div>
          <div className="h-1.5 w-3/4 rounded bg-gray-700" />
          <div className="h-1 w-2/3 rounded bg-gray-400" />
          <div className="mt-1 h-3 w-3 rounded-full bg-purple-300" />
        </div>
      ),
    },
    "list-with-avatars": {
      label: "List + avatars",
      description: "Vertical list, avatar on left + quote on right.",
      preview: (
        <div className="flex h-full flex-col gap-1 rounded bg-gray-50 p-2">
          <div className="flex items-center gap-1 rounded bg-white p-1">
            <div className="h-4 w-4 flex-shrink-0 rounded-full bg-purple-300" />
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="h-0.5 w-full rounded bg-gray-300" />
              <div className="h-0.5 w-3/4 rounded bg-gray-300" />
            </div>
          </div>
          <div className="flex items-center gap-1 rounded bg-white p-1">
            <div className="h-4 w-4 flex-shrink-0 rounded-full bg-purple-300" />
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="h-0.5 w-full rounded bg-gray-300" />
              <div className="h-0.5 w-3/4 rounded bg-gray-300" />
            </div>
          </div>
        </div>
      ),
    },
  },
  menu_preview: {
    "list-borders": {
      label: "List with dividers",
      description: "Clean list, price badge on the right.",
      preview: (
        <div className="flex h-full flex-col gap-1 rounded bg-gray-50 p-2">
          <div className="flex items-center justify-between rounded bg-white p-1">
            <div className="h-1 w-2/3 rounded bg-gray-700" />
            <div className="h-1.5 w-6 rounded bg-purple-200" />
          </div>
          <div className="mt-0.5 flex items-center justify-between border-t border-gray-100 pt-0.5">
            <div className="h-1 w-2/3 rounded bg-gray-700" />
            <div className="h-1.5 w-6 rounded bg-purple-200" />
          </div>
          <div className="mt-0.5 flex items-center justify-between border-t border-gray-100 pt-0.5">
            <div className="h-1 w-2/3 rounded bg-gray-700" />
            <div className="h-1.5 w-6 rounded bg-purple-200" />
          </div>
        </div>
      ),
    },
    "cards-grid": {
      label: "Cards grid",
      description: "Each menu item as a card with optional photo.",
      preview: (
        <div className="grid h-full grid-cols-3 gap-1 rounded bg-white p-2">
          <div className="flex flex-col gap-0.5 rounded bg-gray-50 p-0.5">
            <div className="h-3 rounded bg-gray-200" />
            <div className="h-1 w-3/4 rounded bg-gray-700" />
            <div className="mt-auto h-1 w-1/2 rounded bg-purple-300" />
          </div>
          <div className="flex flex-col gap-0.5 rounded bg-gray-50 p-0.5">
            <div className="h-3 rounded bg-gray-200" />
            <div className="h-1 w-3/4 rounded bg-gray-700" />
            <div className="mt-auto h-1 w-1/2 rounded bg-purple-300" />
          </div>
          <div className="flex flex-col gap-0.5 rounded bg-gray-50 p-0.5">
            <div className="h-3 rounded bg-gray-200" />
            <div className="h-1 w-3/4 rounded bg-gray-700" />
            <div className="mt-auto h-1 w-1/2 rounded bg-purple-300" />
          </div>
        </div>
      ),
    },
    "split-image": {
      label: "Split + image",
      description: "Lifestyle photo on left, menu list on right.",
      preview: (
        <div className="flex h-full gap-1.5 rounded bg-gray-50 p-1.5">
          <div className="flex-1 rounded bg-gray-300" />
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <div className="h-1 w-2/3 rounded bg-gray-700" />
              <div className="h-1.5 w-4 rounded bg-purple-200" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-1 w-2/3 rounded bg-gray-700" />
              <div className="h-1.5 w-4 rounded bg-purple-200" />
            </div>
          </div>
        </div>
      ),
    },
  },
  offer: {
    "banner-centered": {
      label: "Banner (centered)",
      description: "Brand color background, centered price + CTA.",
      preview: (
        <div className="flex h-full flex-col items-center justify-center gap-1 rounded bg-purple-600 p-2">
          <div className="h-1 w-1/3 rounded bg-white/40" />
          <div className="h-2.5 w-1/2 rounded bg-white" />
          <div className="h-3 w-1/3 rounded bg-white" />
          <div className="h-1.5 w-1/4 rounded bg-white" />
        </div>
      ),
    },
    "split-image-price": {
      label: "Split + image",
      description: "Lifestyle photo + price/CTA on the side.",
      preview: (
        <div className="flex h-full gap-1.5 rounded bg-white p-1.5">
          <div className="flex-1 rounded bg-gray-300" />
          <div className="flex flex-1 flex-col justify-center gap-1">
            <div className="h-1 w-1/3 rounded bg-purple-300" />
            <div className="h-1.5 w-2/3 rounded bg-gray-800" />
            <div className="h-2.5 w-1/2 rounded bg-purple-600" />
            <div className="h-1.5 w-1/3 rounded bg-purple-600" />
          </div>
        </div>
      ),
    },
    "countdown-bold": {
      label: "Bold countdown",
      description: "Dark dramatic background with massive price.",
      preview: (
        <div className="flex h-full flex-col items-center justify-center gap-0.5 rounded bg-gray-900 p-2">
          <div className="h-0.5 w-1/3 rounded bg-purple-400" />
          <div className="h-1.5 w-1/2 rounded bg-white" />
          <div className="mt-0.5 rounded border border-purple-500/40 bg-purple-500/20 p-1">
            <div className="h-3 w-12 rounded bg-white" />
          </div>
          <div className="mt-0.5 h-1.5 w-1/4 rounded bg-purple-500" />
        </div>
      ),
    },
  },
  faq: {
    accordion: {
      label: "Accordion",
      description: "Expandable Q&A — clean and minimal.",
      preview: (
        <div className="flex h-full flex-col gap-1 rounded bg-white p-2">
          <div className="flex items-center justify-between rounded border border-gray-200 p-1">
            <div className="h-1 w-2/3 rounded bg-gray-700" />
            <div className="text-xs leading-none text-purple-500">+</div>
          </div>
          <div className="flex items-center justify-between rounded border border-gray-200 p-1">
            <div className="h-1 w-2/3 rounded bg-gray-700" />
            <div className="text-xs leading-none text-purple-500">+</div>
          </div>
          <div className="flex items-center justify-between rounded border border-gray-200 p-1">
            <div className="h-1 w-2/3 rounded bg-gray-700" />
            <div className="text-xs leading-none text-purple-500">+</div>
          </div>
        </div>
      ),
    },
    "two-column": {
      label: "Two columns",
      description: "Questions split into two columns side by side.",
      preview: (
        <div className="grid h-full grid-cols-2 gap-1 rounded bg-gray-50 p-1.5">
          <div className="flex flex-col gap-0.5 rounded bg-white p-0.5">
            <div className="h-1 w-full rounded bg-gray-700" />
            <div className="h-0.5 w-3/4 rounded bg-gray-400" />
          </div>
          <div className="flex flex-col gap-0.5 rounded bg-white p-0.5">
            <div className="h-1 w-full rounded bg-gray-700" />
            <div className="h-0.5 w-3/4 rounded bg-gray-400" />
          </div>
        </div>
      ),
    },
    "numbered-list": {
      label: "Numbered list",
      description: "All Q&A visible, large brand-colored numbers.",
      preview: (
        <div className="flex h-full flex-col gap-1 rounded bg-white p-2">
          <div className="flex gap-1.5">
            <div className="text-sm font-bold leading-none text-purple-300">01</div>
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="h-1 w-3/4 rounded bg-gray-700" />
              <div className="h-0.5 w-full rounded bg-gray-400" />
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="text-sm font-bold leading-none text-purple-300">02</div>
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="h-1 w-3/4 rounded bg-gray-700" />
              <div className="h-0.5 w-full rounded bg-gray-400" />
            </div>
          </div>
        </div>
      ),
    },
  },
  contact: {
    "split-map": {
      label: "Split + map",
      description: "Contact info left, map iframe on the right.",
      preview: (
        <div className="flex h-full gap-1.5 rounded bg-gray-50 p-1.5">
          <div className="flex flex-1 flex-col justify-center gap-0.5">
            <div className="h-1 w-3/4 rounded bg-gray-700" />
            <div className="h-1 w-1/2 rounded bg-gray-400" />
            <div className="h-1 w-2/3 rounded bg-gray-400" />
          </div>
          <div className="flex-1 rounded bg-gradient-to-br from-green-100 to-green-300" />
        </div>
      ),
    },
    "cards-row": {
      label: "Cards row",
      description: "Row of icon cards: address, phone, email, hours.",
      preview: (
        <div className="grid h-full grid-cols-4 gap-1 rounded bg-white p-2">
          <div className="flex flex-col items-center justify-center gap-0.5 rounded bg-gray-50 p-1">
            <div className="text-xs">📍</div>
            <div className="h-0.5 w-3 rounded bg-gray-400" />
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded bg-gray-50 p-1">
            <div className="text-xs">📞</div>
            <div className="h-0.5 w-3 rounded bg-gray-400" />
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded bg-gray-50 p-1">
            <div className="text-xs">✉️</div>
            <div className="h-0.5 w-3 rounded bg-gray-400" />
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded bg-gray-50 p-1">
            <div className="text-xs">🕐</div>
            <div className="h-0.5 w-3 rounded bg-gray-400" />
          </div>
        </div>
      ),
    },
    "full-map-overlay": {
      label: "Full map + card",
      description: "Full-width map with a floating contact card overlaid.",
      preview: (
        <div className="relative h-full rounded bg-gradient-to-br from-green-100 to-green-300">
          <div className="absolute left-2 right-12 top-2 flex flex-col gap-0.5 rounded bg-white p-1 shadow">
            <div className="h-1 w-1/2 rounded bg-purple-400" />
            <div className="h-1 w-3/4 rounded bg-gray-700" />
            <div className="h-0.5 w-2/3 rounded bg-gray-400" />
          </div>
        </div>
      ),
    },
  },
  lead_form: {
    "card-centered": {
      label: "Centered card",
      description: "Centered white card with form fields.",
      preview: (
        <div className="flex h-full items-center justify-center rounded bg-gray-50 p-2">
          <div className="flex w-3/4 flex-col gap-1 rounded bg-white p-2 shadow">
            <div className="h-1 w-full rounded bg-gray-200" />
            <div className="h-1 w-full rounded bg-gray-200" />
            <div className="h-1.5 w-full rounded bg-purple-500" />
          </div>
        </div>
      ),
    },
    "split-side-image": {
      label: "Split + image",
      description: "Photo or gradient on left, form on right.",
      preview: (
        <div className="flex h-full gap-1.5 rounded bg-gray-50 p-1.5">
          <div className="flex-1 rounded bg-gradient-to-br from-purple-400 to-pink-400" />
          <div className="flex flex-1 flex-col justify-center gap-0.5 rounded bg-white p-1">
            <div className="h-1 w-full rounded bg-gray-200" />
            <div className="h-1 w-full rounded bg-gray-200" />
            <div className="h-1.5 w-full rounded bg-purple-500" />
          </div>
        </div>
      ),
    },
    "full-width-bar": {
      label: "Full-width bar",
      description: "Full-width colored bar with inline form row.",
      preview: (
        <div className="flex h-full items-center gap-2 rounded bg-purple-600 p-2">
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="h-1 w-3/4 rounded bg-white/90" />
            <div className="h-0.5 w-1/2 rounded bg-white/50" />
          </div>
          <div className="flex flex-1 gap-0.5 rounded bg-white p-1">
            <div className="h-1.5 flex-1 rounded bg-gray-200" />
            <div className="h-1.5 flex-1 rounded bg-gray-200" />
            <div className="h-1.5 w-3 rounded bg-purple-500" />
          </div>
        </div>
      ),
    },
  },
  whatsapp_cta: {
    "centered-button": {
      label: "Centered button",
      description: "Centered layout, big WhatsApp button.",
      preview: (
        <div className="flex h-full flex-col items-center justify-center gap-1 rounded bg-green-50 p-2">
          <div className="h-5 w-5 rounded-full bg-green-500" />
          <div className="h-1.5 w-3/4 rounded bg-gray-700" />
          <div className="h-1 w-1/2 rounded bg-gray-400" />
          <div className="mt-1 h-1.5 w-1/3 rounded bg-green-500" />
        </div>
      ),
    },
    "banner-strip": {
      label: "Banner strip",
      description: "Slim full-width green strip with inline button.",
      preview: (
        <div className="flex h-full items-center rounded bg-gray-100">
          <div className="flex w-full items-center justify-between bg-green-700 p-1.5">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-white" />
              <div className="h-1 w-12 rounded bg-white/80" />
            </div>
            <div className="h-1.5 w-6 rounded bg-white" />
          </div>
        </div>
      ),
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Try another layout</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Pick a different design for this{" "}
              <span className="font-medium capitalize">{sectionType.replace("_", " ")}</span>{" "}
              section.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {variants.map((v) => {
              const active = v === currentVariant;
              const info = variantInfo[v];
              return (
                <button
                  key={v}
                  onClick={() => onPick(v)}
                  className={`overflow-hidden rounded-xl border-2 bg-white text-left transition-all ${active ? "border-purple-600 shadow-lg" : "border-gray-200 hover:border-purple-300 hover:shadow-md"}`}
                >
                  <div className="relative h-32 overflow-hidden bg-gray-50">
                    {info?.preview ?? (
                      <div className="flex h-full items-center justify-center text-xs text-gray-300">
                        No preview
                      </div>
                    )}
                    {active && (
                      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-purple-600 px-2 py-1 text-xs font-semibold text-white">
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Current
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="mb-0.5 text-sm font-semibold text-gray-900">{info?.label ?? v}</p>
                    <p className="text-xs leading-relaxed text-gray-500">
                      {info?.description ?? ""}
                    </p>
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
