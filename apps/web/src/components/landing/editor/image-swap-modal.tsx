"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  IMAGE_BUNDLES,
  buildUnsplashUrl,
  type ImageBundle,
} from "@marketing/landing-design-system";
import { trpc } from "../../../lib/trpc";

type Tab = "stock" | "library" | "url" | "upload";
type MediaLibraryAsset = {
  id: string;
  publicUrl: string | null;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  scope: string;
  status: string;
  createdAt: string | Date;
  uploadedAt: string | Date | null;
};

const VERTICAL_LABELS: Record<string, string> = {
  cafe: "Cafe",
  restaurant: "Restaurant",
  fitness: "Fitness",
  clinic: "Clinic",
  retail: "Retail",
  service: "Service",
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_UPLOAD_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
type UploadContentType = (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number];

function isAllowedUploadContentType(contentType: string): contentType is UploadContentType {
  return ALLOWED_UPLOAD_CONTENT_TYPES.includes(contentType as UploadContentType);
}

export function ImageSwapModal({
  currentUrl,
  preferredVertical,
  preferredRole,
  onPick,
  onClose,
}: {
  currentUrl?: string | null;
  preferredVertical?: string;
  preferredRole?: "hero" | "gallery" | "lifestyle" | "detail" | "avatar";
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("stock");
  const [urlInput, setUrlInput] = useState(currentUrl ?? "");
  const [verticalFilter, setVerticalFilter] = useState<string>(preferredVertical ?? "all");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [libraryAssets, setLibraryAssets] = useState<MediaLibraryAsset[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);

  const filteredBundles = useMemo<ImageBundle[]>(() => {
    if (verticalFilter === "all") return [...IMAGE_BUNDLES];
    return IMAGE_BUNDLES.filter((bundle) => bundle.vertical === verticalFilter);
  }, [verticalFilter]);

  const filteredPhotos = useMemo(() => {
    const all = filteredBundles.flatMap((bundle) =>
      bundle.photos.map((photo) => ({ ...photo, bundleKey: bundle.key, bundleName: bundle.name })),
    );
    if (!preferredRole) return all;
    const matching = all.filter((photo) => photo.role === preferredRole);
    const others = all.filter((photo) => photo.role !== preferredRole);
    return [...matching, ...others];
  }, [filteredBundles, preferredRole]);

  useEffect(() => {
    if (!uploadFile) {
      setUploadPreviewUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(uploadFile);
    setUploadPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [uploadFile]);

  useEffect(() => {
    if (tab !== "library") return undefined;

    let active = true;
    setLibraryLoading(true);
    setLibraryError(null);

    void trpc.uploads.list
      .query({
        scopes: ["section-image", "social-creative", "logo"],
        limit: 60,
      })
      .then((assets) => {
        if (!active) return;
        setLibraryAssets(
          assets.filter((asset) => asset.status === "uploaded" && Boolean(asset.publicUrl)),
        );
      })
      .catch((err) => {
        if (!active) return;
        setLibraryError(err instanceof Error ? err.message : "Could not load the media library.");
      })
      .finally(() => {
        if (active) setLibraryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tab, libraryRefreshKey]);

  async function handleUpload() {
    if (!uploadFile) return;

    if (!isAllowedUploadContentType(uploadFile.type)) {
      setUploadError("Use PNG, JPG, WebP, or GIF.");
      return;
    }

    if (uploadFile.size > MAX_UPLOAD_BYTES) {
      setUploadError("Use an image smaller than 8 MB.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const signed = await trpc.uploads.signedUrl.mutate({
        filename: uploadFile.name,
        contentType: uploadFile.type,
        byteSize: uploadFile.size,
        scope: "section-image",
        visibility: "public",
      });

      const response = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "content-type": uploadFile.type },
        body: uploadFile,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}.`);
      }

      await trpc.uploads.complete.mutate({ assetId: signed.assetId });
      setLibraryRefreshKey((value) => value + 1);
      onPick(signed.publicUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleArchiveAsset(assetId: string) {
    setLibraryError(null);
    try {
      await trpc.uploads.archive.mutate({ assetId });
      setLibraryAssets((current) => current.filter((asset) => asset.id !== assetId));
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "Could not archive that asset.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Swap image</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Pick a stock photo, reuse tenant media, paste a URL, or upload your own.
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

        <div className="flex items-center gap-1 border-b border-gray-200 px-6">
          <TabButton active={tab === "stock"} onClick={() => setTab("stock")}>
            Stock library
          </TabButton>
          <TabButton active={tab === "library"} onClick={() => setTab("library")}>
            Media library
          </TabButton>
          <TabButton active={tab === "url"} onClick={() => setTab("url")}>
            Paste URL
          </TabButton>
          <TabButton active={tab === "upload"} onClick={() => setTab("upload")}>
            Upload
          </TabButton>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "stock" && (
            <div>
              <div className="flex items-center gap-1.5 overflow-x-auto border-b border-gray-100 px-6 py-3">
                <button
                  onClick={() => setVerticalFilter("all")}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${verticalFilter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  All
                </button>
                {Object.entries(VERTICAL_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setVerticalFilter(key)}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${verticalFilter === key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3 p-6 sm:grid-cols-4">
                {filteredPhotos.map((photo) => {
                  const url = buildUnsplashUrl(photo.id, { width: 1600 });
                  const thumb = buildUnsplashUrl(photo.id, { width: 400 });
                  return (
                    <button
                      key={`${photo.bundleKey}-${photo.id}`}
                      onClick={() => onPick(url)}
                      className="group relative aspect-square overflow-hidden rounded-lg border-2 border-gray-200 transition-all hover:border-purple-500 hover:shadow-lg"
                    >
                      <img
                        src={thumb}
                        alt={photo.caption}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <p className="truncate text-xs font-medium text-white">{photo.caption}</p>
                        <p className="truncate text-[10px] text-white/70">
                          Photo by {photo.photographer}
                        </p>
                      </div>
                      <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                        {photo.role}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">
                Photos courtesy of Unsplash. Photographers are credited per their license.
              </p>
            </div>
          )}

          {tab === "library" && (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Tenant media library</h3>
                  <p className="text-sm text-gray-500">
                    Reuse uploaded logos, section images, and generated social graphics.
                  </p>
                </div>
                <button
                  onClick={() => setLibraryRefreshKey((value) => value + 1)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Refresh
                </button>
              </div>

              {libraryError && (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {libraryError}
                </p>
              )}

              {libraryLoading ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                  Loading media library...
                </div>
              ) : libraryAssets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                  No reusable images yet. Upload one here or generate a social creative first.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {libraryAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                    >
                      <button
                        onClick={() => asset.publicUrl && onPick(asset.publicUrl)}
                        className="group block w-full text-left"
                      >
                        <div className="relative aspect-square overflow-hidden bg-gray-100">
                          <img
                            src={asset.publicUrl ?? ""}
                            alt={asset.originalFilename}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                          />
                          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                            {asset.scope.replace("-", " ")}
                          </span>
                        </div>
                        <div className="space-y-1 px-3 py-3">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {asset.originalFilename}
                          </p>
                          <p className="text-xs text-gray-500">
                            {Math.max(1, Math.round(asset.byteSize / 1024))} KB
                          </p>
                        </div>
                      </button>
                      <div className="border-t border-gray-100 px-3 py-2">
                        <button
                          onClick={() => void handleArchiveAsset(asset.id)}
                          className="text-xs font-medium text-gray-500 hover:text-gray-900"
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "url" && (
            <div className="mx-auto max-w-xl p-8">
              <label className="mb-2 block text-sm font-semibold text-gray-700">Image URL</label>
              <input
                type="url"
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-sm focus:border-purple-500 focus:outline-none"
              />
              <p className="mt-2 text-xs text-gray-500">
                Paste a direct image URL. It should be at least 1200x800 for hero images.
              </p>

              {urlInput && (
                <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <img
                    src={urlInput}
                    alt="Preview"
                    className="max-h-64 w-full object-contain"
                    onError={(event) => {
                      event.currentTarget.style.opacity = "0.3";
                    }}
                  />
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => urlInput && onPick(urlInput)}
                  disabled={!urlInput}
                  className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-40"
                >
                  Use this image
                </button>
              </div>
            </div>
          )}

          {tab === "upload" && (
            <div className="mx-auto max-w-xl p-8">
              <div className="mb-4 text-5xl">+</div>
              <h3 className="mb-2 text-lg font-bold text-gray-900">Upload your own image</h3>
              <p className="mb-5 text-sm text-gray-500">
                PNG, JPG, WebP, or GIF up to 8 MB. Uploaded images are stored in your tenant media
                space and can be reused across pages.
              </p>

              <label className="block rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center hover:border-purple-400">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(event) => {
                    setUploadError(null);
                    const file = event.currentTarget.files?.[0] ?? null;
                    if (file && !isAllowedUploadContentType(file.type)) {
                      setUploadFile(null);
                      setUploadError("Use PNG, JPG, WebP, or GIF.");
                      return;
                    }
                    if (file && file.size > MAX_UPLOAD_BYTES) {
                      setUploadFile(null);
                      setUploadError("Use an image smaller than 8 MB.");
                      return;
                    }
                    setUploadFile(file);
                  }}
                />
                <span className="block text-sm font-semibold text-gray-800">
                  {uploadFile ? uploadFile.name : "Choose image"}
                </span>
                <span className="mt-1 block text-xs text-gray-500">
                  {uploadFile ? `${Math.round(uploadFile.size / 1024)} KB` : "Click to browse"}
                </span>
              </label>

              {uploadPreviewUrl && (
                <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <img
                    src={uploadPreviewUrl}
                    alt="Upload preview"
                    className="max-h-64 w-full object-contain"
                  />
                </div>
              )}

              {uploadError && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {uploadError}
                </p>
              )}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleUpload()}
                  disabled={!uploadFile || uploading}
                  className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-40"
                >
                  {uploading ? "Uploading..." : "Upload and use"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${active ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-800"}`}
    >
      {children}
    </button>
  );
}
