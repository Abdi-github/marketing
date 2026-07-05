"use client";

import React, { useState } from "react";
import {
  FONT_PAIRS,
  FONT_PAIRS_BY_KEY,
  PALETTES_BY_KEY,
  THEMES,
  type Theme,
} from "@marketing/landing-design-system";

function paletteFor(theme: Theme) {
  return PALETTES_BY_KEY.get(theme.paletteKey);
}

function radiusLabel(radius: Theme["radius"]): string {
  if (radius === "sharp") return "Sharp";
  if (radius === "rounded") return "Rounded";
  return "Soft";
}

function selectedThemeFor(key: string | null | undefined): Theme | undefined {
  if (!key) return undefined;
  return (
    THEMES.find((theme) => theme.key === key) ?? THEMES.find((theme) => theme.paletteKey === key)
  );
}

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
  const selectedTheme = selectedThemeFor(currentPalette);
  const selectedPalette = selectedTheme
    ? paletteFor(selectedTheme)
    : currentPalette
      ? PALETTES_BY_KEY.get(currentPalette)
      : undefined;
  const selectedFont =
    (currentFontPair ? FONT_PAIRS_BY_KEY.get(currentFontPair) : undefined) ??
    (selectedTheme ? FONT_PAIRS_BY_KEY.get(selectedTheme.fontPairKey) : undefined);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-colors hover:border-gray-300"
      >
        <span className="flex h-5 w-8 overflow-hidden rounded-full border border-gray-200">
          {selectedPalette ? (
            <>
              <span className="flex-1" style={{ background: selectedPalette.colors.primary }} />
              <span className="flex-1" style={{ background: selectedPalette.colors.accent }} />
              <span className="flex-1" style={{ background: selectedPalette.colors.surface }} />
            </>
          ) : (
            <span className="h-full w-full bg-gray-300" />
          )}
        </span>
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
          <div className="absolute right-0 top-full z-40 mt-2 max-h-[82vh] w-[560px] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">Themes</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Professional bundles with color roles, typography, radius, and mood.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 px-4 py-3">
              {THEMES.map((theme) => {
                const palette = paletteFor(theme);
                const font = FONT_PAIRS_BY_KEY.get(theme.fontPairKey);
                const selected = selectedTheme?.key === theme.key || currentPalette === theme.key;
                return (
                  <button
                    key={theme.key}
                    onClick={() => onChange(theme.key, theme.fontPairKey)}
                    className={`overflow-hidden rounded-lg border-2 bg-white text-left transition-all ${
                      selected
                        ? "border-gray-950 shadow-md"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <div
                      className="relative h-20"
                      style={{ background: palette?.colors.surface ?? "#f8fafc" }}
                    >
                      <div className="absolute right-3 top-3 flex -space-x-1.5">
                        {palette &&
                          [
                            palette.colors.primary,
                            palette.colors.secondary,
                            palette.colors.accent,
                            palette.colors.surface,
                          ].map((color) => (
                            <span
                              key={color}
                              className="h-5 w-5 rounded-full border border-white shadow-sm"
                              style={{ background: color }}
                            />
                          ))}
                      </div>
                      <div
                        className="absolute bottom-3 left-3 h-8 w-8 rounded-md"
                        style={{ background: palette?.colors.primary ?? "#111827" }}
                      />
                    </div>
                    <div className="space-y-2 p-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{theme.name}</p>
                        <p className="text-xs text-gray-500">{font?.name ?? theme.fontPairKey}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-600">
                          {theme.vibe}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          {radiusLabel(theme.radius)}
                        </span>
                        {theme.bestFor.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-600"
                          >
                            {tag.replace(/-/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">Typography Override</p>
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 py-3">
              {FONT_PAIRS.map((font) => (
                <button
                  key={font.key}
                  onClick={() => onChange(currentPalette, font.key)}
                  className={`rounded-lg border-2 p-2.5 text-left transition-all ${
                    selectedFont?.key === font.key
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p
                    className="text-sm font-bold text-gray-900"
                    style={{ fontFamily: `'${font.heading.family}', system-ui` }}
                  >
                    {font.heading.family}
                  </p>
                  <p
                    className="text-xs text-gray-500"
                    style={{ fontFamily: `'${font.body.family}', serif` }}
                  >
                    {font.body.family}
                  </p>
                </button>
              ))}
            </div>
            {(selectedTheme || selectedFont) && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                Currently:{" "}
                <span className="font-medium text-gray-900">
                  {selectedTheme?.name ?? selectedPalette?.name ?? "default"}
                </span>
                {selectedFont && (
                  <>
                    {" "}
                    -{" "}
                    <span className="font-medium text-gray-900">
                      {selectedFont.heading.family} + {selectedFont.body.family}
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
