"use client";

// LP-5 follow-up: Image swap modal.
// 3 tabs:
//   1. URL paste — works today (any direct URL)
//   2. Stock library — curated Unsplash bundle for the chosen vertical
//   3. Upload — placeholder until Scaleway Object Storage is wired
//
// Calls `landingPages.swapSectionImage` with the chosen URL.

import React, { useState, useMemo } from "react";
import {
  IMAGE_BUNDLES,
  buildUnsplashUrl,
  type ImageBundle,
} from "@marketing/landing-design-system";

type Tab = "stock" | "url" | "upload";

const VERTICAL_LABELS: Record<string, string> = {
  cafe: "Café",
  restaurant: "Restaurant",
  fitness: "Fitness",
  clinic: "Clinic",
  retail: "Retail",
  service: "Service",
};

export function ImageSwapModal({
  currentUrl,
  preferredVertical,
  preferredRole,
  onPick,
  onClose,
}: {
  currentUrl?: string | null;
  /** When set, the Stock tab pre-filters to bundles for this vertical. */
  preferredVertical?: string;
  /** Filter Unsplash photos by role (hero, gallery, lifestyle, detail, avatar). */
  preferredRole?: "hero" | "gallery" | "lifestyle" | "detail" | "avatar";
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("stock");
  const [urlInput, setUrlInput] = useState(currentUrl ?? "");
  const [verticalFilter, setVerticalFilter] = useState<string>(preferredVertical ?? "all");

  const filteredBundles = useMemo<ImageBundle[]>(() => {
    if (verticalFilter === "all") return [...IMAGE_BUNDLES];
    return IMAGE_BUNDLES.filter((b) => b.vertical === verticalFilter);
  }, [verticalFilter]);

  const filteredPhotos = useMemo(() => {
    const all = filteredBundles.flatMap((b) =>
      b.photos.map((p) => ({ ...p, bundleKey: b.key, bundleName: b.name })),
    );
    if (!preferredRole) return all;
    // Show preferred role first, then everything else
    const matching = all.filter((p) => p.role === preferredRole);
    const others = all.filter((p) => p.role !== preferredRole);
    return [...matching, ...others];
  }, [filteredBundles, preferredRole]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Swap image</h2>
            <p className="text-sm text-gray-500 mt-0.5">Pick a stock photo, paste a URL, or upload your own.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-200 flex items-center gap-1">
          <TabButton active={tab === "stock"}  onClick={() => setTab("stock")}>📸 Stock library</TabButton>
          <TabButton active={tab === "url"}    onClick={() => setTab("url")}>🔗 Paste URL</TabButton>
          <TabButton active={tab === "upload"} onClick={() => setTab("upload")}>⬆ Upload</TabButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "stock" && (
            <div>
              {/* Vertical filter chips */}
              <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-1.5 overflow-x-auto">
                <button
                  onClick={() => setVerticalFilter("all")}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${verticalFilter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  All
                </button>
                {Object.entries(VERTICAL_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setVerticalFilter(key)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${verticalFilter === key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Photo grid */}
              <div className="p-6 grid grid-cols-3 sm:grid-cols-4 gap-3">
                {filteredPhotos.map((photo) => {
                  const url = buildUnsplashUrl(photo.id, { width: 1600 });
                  const thumb = buildUnsplashUrl(photo.id, { width: 400 });
                  return (
                    <button
                      key={`${photo.bundleKey}-${photo.id}`}
                      onClick={() => onPick(url)}
                      className="group aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-purple-500 hover:shadow-lg transition-all relative"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb} alt={photo.caption} loading="lazy" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                        <p className="text-xs font-medium text-white truncate">{photo.caption}</p>
                        <p className="text-[10px] text-white/70 truncate">📷 {photo.photographer}</p>
                      </div>
                      <span className="absolute top-1.5 left-1.5 bg-white/90 text-gray-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">{photo.role}</span>
                    </button>
                  );
                })}
              </div>
              <p className="px-6 py-3 text-xs text-gray-400 border-t border-gray-100">
                Photos courtesy of Unsplash. Photographers credited per their license.
              </p>
            </div>
          )}

          {tab === "url" && (
            <div className="p-8 max-w-xl mx-auto">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Image URL</label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none text-sm"
              />
              <p className="text-xs text-gray-500 mt-2">Paste a direct image URL. Should be at least 1200×800 for hero images.</p>

              {urlInput && (
                <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlInput} alt="Preview" className="w-full max-h-64 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />
                </div>
              )}

              <div className="flex items-center gap-2 mt-6 justify-end">
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100 text-sm font-medium">Cancel</button>
                <button
                  onClick={() => urlInput && onPick(urlInput)}
                  disabled={!urlInput}
                  className="px-5 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40"
                >
                  Use this image
                </button>
              </div>
            </div>
          )}

          {tab === "upload" && (
            <div className="p-12 text-center">
              <div className="text-5xl mb-4">⬆</div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Upload your own images</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
                Direct uploads will be available once object storage is provisioned. For now, paste a URL or pick from the stock library.
              </p>
              <button
                onClick={() => setTab("stock")}
                className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium text-gray-700"
              >
                Browse stock library
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${active ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-800"}`}
    >
      {children}
    </button>
  );
}
