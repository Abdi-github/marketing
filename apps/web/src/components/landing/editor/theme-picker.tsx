"use client";

// LP-5: Theme picker dropdown.
// Sits in the editor toolbar; opens a panel with palette + font pair grids.
// On change, calls `landingPages.updateTheme` and refreshes the preview iframe.

import React, { useState } from "react";

const PALETTES = [
  { key: "warm-roasted", name: "Warm Roasted", primary: "#8B4513", swiss: false },
  { key: "ocean-fresh", name: "Ocean Fresh", primary: "#0EA5E9", swiss: false },
  { key: "midnight-luxe", name: "Midnight Luxe", primary: "#1E1B4B", swiss: false },
  { key: "sport-orange", name: "Sport Orange", primary: "#EA580C", swiss: false },
  { key: "forest-calm", name: "Forest Calm", primary: "#15803D", swiss: false },
  { key: "rose-blush", name: "Rose Blush", primary: "#be123c", swiss: false },
  { key: "alpine-clean", name: "Alpine Clean", primary: "#0F172A", swiss: true },
  { key: "zurich-modern", name: "Zürich Modern", primary: "#374151", swiss: true },
  { key: "geneve-elegance", name: "Genève Élégance", primary: "#7F1D1D", swiss: true },
  { key: "ticino-sun", name: "Ticino Sun", primary: "#B45309", swiss: true },
  { key: "bern-heritage", name: "Bern Heritage", primary: "#991B1B", swiss: true },
  { key: "lavender-grace", name: "Lavender Grace", primary: "#6d28d9", swiss: false },
];

const FONT_PAIRS = [
  { key: "inter-inter", heading: "Inter", body: "Inter" },
  { key: "manrope-inter", heading: "Manrope", body: "Inter" },
  { key: "playfair-inter", heading: "Playfair Display", body: "Inter" },
  { key: "playfair-lora", heading: "Playfair Display", body: "Lora" },
  { key: "fraunces-inter", heading: "Fraunces", body: "Inter" },
  { key: "dm-serif-dm-sans", heading: "DM Serif Display", body: "DM Sans" },
  { key: "space-grotesk-inter", heading: "Space Grotesk", body: "Inter" },
  { key: "archivo-inter", heading: "Archivo", body: "Inter" },
];

export function ThemePickerButton({
  currentPalette,
  currentFontPair,
  onChange,
}: {
  currentPalette: string | null;
  currentFontPair: string | null;
  onChange: (palette: string | null, fontPair: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const palette = PALETTES.find((p) => p.key === currentPalette);
  const font = FONT_PAIRS.find((f) => f.key === currentFontPair);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-colors hover:border-gray-300"
      >
        <span
          className="h-5 w-5 rounded-full border border-gray-300"
          style={{ background: palette?.primary ?? "#9ca3af" }}
        />
        <span className="font-medium text-gray-700">Theme</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="text-gray-400"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-2 max-h-[80vh] w-[420px] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">Color palette</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Drives the brand color across CTAs, accents, and gradients.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 border-b border-gray-100 px-4 py-3">
              {PALETTES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => onChange(p.key, currentFontPair)}
                  className={`relative aspect-square rounded-lg border-2 transition-all ${currentPalette === p.key ? "scale-105 border-gray-900 shadow-md" : "border-transparent hover:border-gray-300"}`}
                  style={{ background: p.primary }}
                  title={p.name}
                >
                  {p.swiss && (
                    <span className="absolute right-0.5 top-0.5 rounded bg-white/90 px-0.5 text-[8px] font-bold text-red-700">
                      🇨🇭
                    </span>
                  )}
                  {currentPalette === p.key && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="white">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">Typography</p>
              <p className="mt-0.5 text-xs text-gray-500">Heading + body font pairing.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 py-3">
              {FONT_PAIRS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => onChange(currentPalette, f.key)}
                  className={`rounded-lg border-2 p-2.5 text-left transition-all ${currentFontPair === f.key ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <p
                    className="text-sm font-bold text-gray-900"
                    style={{ fontFamily: `'${f.heading}', system-ui` }}
                  >
                    {f.heading}
                  </p>
                  <p className="text-xs text-gray-500" style={{ fontFamily: `'${f.body}', serif` }}>
                    {f.body}
                  </p>
                </button>
              ))}
            </div>
            {(palette || font) && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                Currently:{" "}
                <span className="font-medium text-gray-900">{palette?.name ?? "default"}</span>
                {font && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-medium text-gray-900">
                      {font.heading} + {font.body}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
