"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "../../../../lib/trpc";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_UPLOAD_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

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

const FONT_OPTIONS = [
  { value: "system-ui", label: "System UI (default)" },
  { value: "Georgia, serif", label: "Georgia (serif)" },
  { value: "'Playfair Display', serif", label: "Playfair Display (elegant)" },
  { value: "'Inter', sans-serif", label: "Inter (modern)" },
  { value: "'Lato', sans-serif", label: "Lato (friendly)" },
  { value: "'Merriweather', serif", label: "Merriweather (readable)" },
  { value: "'Montserrat', sans-serif", label: "Montserrat (bold)" },
];

type InitialBrand = {
  logoUrl: string;
  faviconUrl: string;
  socialPreviewUrl: string;
  colorPrimary: string;
  colorSecondary: string;
  fontHeading: string;
  fontBody: string;
  voiceTone: string;
} | null;

function ColorInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const isValid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={isValid ? value : "#111827"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#111827"
          maxLength={7}
          className={`flex-1 rounded border px-3 py-2 font-mono text-sm ${
            isValid ? "border-gray-200" : "border-red-300 bg-red-50"
          }`}
        />
        {isValid && (
          <span
            className="h-6 w-6 flex-shrink-0 rounded-full border border-gray-200"
            style={{ background: value }}
          />
        )}
      </div>
      {!isValid && value.length > 0 && (
        <p className="mt-1 text-xs text-red-500">Must be a hex colour like #111827</p>
      )}
    </div>
  );
}

export function BrandForm({ initialBrand }: { initialBrand: InitialBrand }) {
  const t = useTranslations("BrandKit");

  const [logoUrl, setLogoUrl] = useState(initialBrand?.logoUrl ?? "");
  const [faviconUrl, setFaviconUrl] = useState(initialBrand?.faviconUrl ?? "");
  const [socialPreviewUrl, setSocialPreviewUrl] = useState(initialBrand?.socialPreviewUrl ?? "");
  const [colorPrimary, setColorPrimary] = useState(initialBrand?.colorPrimary ?? "#111827");
  const [colorSecondary, setColorSecondary] = useState(initialBrand?.colorSecondary ?? "#6b7280");
  const [fontHeading, setFontHeading] = useState(initialBrand?.fontHeading ?? "system-ui");
  const [fontBody, setFontBody] = useState(initialBrand?.fontBody ?? "system-ui");
  const [voiceTone, setVoiceTone] = useState(initialBrand?.voiceTone ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoLibraryOpen, setLogoLibraryOpen] = useState(false);
  const [logoLibraryLoading, setLogoLibraryLoading] = useState(false);
  const [logoLibraryError, setLogoLibraryError] = useState<string | null>(null);
  const [logoLibraryAssets, setLogoLibraryAssets] = useState<MediaLibraryAsset[]>([]);
  const [assetUploadTarget, setAssetUploadTarget] = useState<
    "logo" | "brand-favicon" | "brand-social-preview" | null
  >(null);

  const isValidHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

  async function loadLogoLibrary() {
    setLogoLibraryLoading(true);
    setLogoLibraryError(null);
    try {
      const assets = await trpc.uploads.list.query({
        scopes: ["logo", "section-image", "social-creative"],
        limit: 24,
      });
      setLogoLibraryAssets(
        assets.filter((asset) => asset.status === "uploaded" && Boolean(asset.publicUrl)),
      );
      setLogoLibraryOpen(true);
    } catch (err) {
      setLogoLibraryError(err instanceof Error ? err.message : "Could not load the media library.");
    } finally {
      setLogoLibraryLoading(false);
    }
  }

  async function handleLogoUpload(file: File | null) {
    await handleBrandAssetUpload(file, "logo", setLogoUrl);
    if (file && logoLibraryOpen) {
      await loadLogoLibrary();
    }
  }

  async function handleBrandAssetUpload(
    file: File | null,
    scope: "logo" | "brand-favicon" | "brand-social-preview",
    applyUrl: (url: string) => void,
  ) {
    if (!file) return;
    if (
      !ALLOWED_UPLOAD_CONTENT_TYPES.includes(
        file.type as (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number],
      )
    ) {
      setLogoLibraryError("Use PNG, JPG, WebP, or GIF.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setLogoLibraryError("Use an image smaller than 8 MB.");
      return;
    }

    setAssetUploadTarget(scope);
    if (scope === "logo") setLogoUploading(true);
    setLogoLibraryError(null);
    try {
      const signed = await trpc.uploads.signedUrl.mutate({
        filename: file.name,
        contentType: file.type as (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number],
        byteSize: file.size,
        scope,
        visibility: "public",
      });
      const response = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}.`);
      }
      await trpc.uploads.complete.mutate({ assetId: signed.assetId });
      applyUrl(signed.publicUrl);
    } catch (err) {
      setLogoLibraryError(err instanceof Error ? err.message : "Asset upload failed.");
    } finally {
      setAssetUploadTarget(null);
      if (scope === "logo") setLogoUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValidHex(colorPrimary) || !isValidHex(colorSecondary)) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await trpc.brand.upsert.mutate({
        logoUrl: logoUrl.trim() || null,
        faviconUrl: faviconUrl.trim() || null,
        socialPreviewUrl: socialPreviewUrl.trim() || null,
        colorPrimary,
        colorSecondary,
        fontHeading,
        fontBody,
        voiceTone: voiceTone.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Logo */}
        <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">
            {t("logoSection")}
          </h2>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="logoUrl">
              {t("logoUrl")}
            </label>
            <input
              id="logoUrl"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              maxLength={500}
              className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">{t("logoUrlHint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => void handleLogoUpload(e.currentTarget.files?.[0] ?? null)}
              />
              {logoUploading ? "Uploading..." : "Upload logo"}
            </label>
            <button
              type="button"
              onClick={() => void loadLogoLibrary()}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {logoLibraryLoading ? "Loading..." : "Media library"}
            </button>
          </div>
          {logoLibraryError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {logoLibraryError}
            </p>
          )}
          {logoUrl && (
            <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <img
                src={logoUrl}
                alt="Logo preview"
                className="h-12 w-auto rounded object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <span className="text-xs text-gray-400">{t("logoPreview")}</span>
            </div>
          )}
          {logoLibraryOpen && (
            <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-900">Choose from tenant media</p>
                <button
                  type="button"
                  onClick={() => setLogoLibraryOpen(false)}
                  className="text-xs font-medium text-gray-500 hover:text-gray-900"
                >
                  Close
                </button>
              </div>
              {logoLibraryAssets.length === 0 ? (
                <p className="text-sm text-gray-500">No reusable images available yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {logoLibraryAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => asset.publicUrl && setLogoUrl(asset.publicUrl)}
                      className="overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm hover:border-gray-900"
                    >
                      <div className="aspect-square overflow-hidden bg-gray-100">
                        <img
                          src={asset.publicUrl ?? ""}
                          alt={asset.originalFilename}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="px-2 py-2">
                        <p className="truncate text-xs font-medium text-gray-800">
                          {asset.originalFilename}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 border-t border-gray-100 pt-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="faviconUrl">
                  Favicon URL
                </label>
                <input
                  id="faviconUrl"
                  type="url"
                  value={faviconUrl}
                  onChange={(e) => setFaviconUrl(e.target.value)}
                  placeholder="https://example.com/favicon.png"
                  maxLength={500}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) =>
                    void handleBrandAssetUpload(
                      e.currentTarget.files?.[0] ?? null,
                      "brand-favicon",
                      setFaviconUrl,
                    )
                  }
                />
                {assetUploadTarget === "brand-favicon" ? "Uploading..." : "Upload favicon"}
              </label>
              {faviconUrl && (
                <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <img
                    src={faviconUrl}
                    alt="Favicon preview"
                    className="h-8 w-8 rounded object-cover"
                  />
                  <span className="text-xs text-gray-400">Shown in tabs and bookmarks.</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="socialPreviewUrl">
                  Social preview image URL
                </label>
                <input
                  id="socialPreviewUrl"
                  type="url"
                  value={socialPreviewUrl}
                  onChange={(e) => setSocialPreviewUrl(e.target.value)}
                  placeholder="https://example.com/og-image.png"
                  maxLength={500}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) =>
                    void handleBrandAssetUpload(
                      e.currentTarget.files?.[0] ?? null,
                      "brand-social-preview",
                      setSocialPreviewUrl,
                    )
                  }
                />
                {assetUploadTarget === "brand-social-preview"
                  ? "Uploading..."
                  : "Upload social preview"}
              </label>
              {socialPreviewUrl && (
                <div className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <img
                    src={socialPreviewUrl}
                    alt="Social preview"
                    className="max-h-40 w-full rounded object-cover"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Colours */}
        <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">
            {t("colorsSection")}
          </h2>
          <ColorInput
            id="colorPrimary"
            label={t("colorPrimary")}
            value={colorPrimary}
            onChange={setColorPrimary}
          />
          <ColorInput
            id="colorSecondary"
            label={t("colorSecondary")}
            value={colorSecondary}
            onChange={setColorSecondary}
          />
          <div
            className="flex items-center gap-3 rounded-lg p-3 text-sm text-white"
            style={{ background: colorPrimary }}
          >
            <span className="font-semibold">{t("colorPreviewCta")}</span>
            <span className="ml-auto text-xs opacity-70">{t("colorPreviewLabel")}</span>
          </div>
        </section>

        {/* Fonts */}
        <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">
            {t("fontsSection")}
          </h2>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="fontHeading">
              {t("fontHeading")}
            </label>
            <select
              id="fontHeading"
              value={fontHeading}
              onChange={(e) => setFontHeading(e.target.value)}
              className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
              style={{ fontFamily: fontHeading }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="fontBody">
              {t("fontBody")}
            </label>
            <select
              id="fontBody"
              value={fontBody}
              onChange={(e) => setFontBody(e.target.value)}
              className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
              style={{ fontFamily: fontBody }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div
            className="rounded-lg border border-gray-100 bg-gray-50 p-4"
            style={{ fontFamily: fontBody }}
          >
            <p
              style={{
                fontFamily: fontHeading,
                fontWeight: 700,
                fontSize: "1.1rem",
                marginBottom: "0.5rem",
              }}
            >
              {t("fontPreviewHeading")}
            </p>
            <p style={{ fontSize: "0.875rem", color: "#4b5563" }}>{t("fontPreviewBody")}</p>
          </div>
        </section>

        {/* Voice tone */}
        <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">
            {t("voiceSection")}
          </h2>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="voiceTone">
              {t("voiceTone")}
            </label>
            <textarea
              id="voiceTone"
              value={voiceTone}
              onChange={(e) => setVoiceTone(e.target.value)}
              placeholder={t("voiceTonePlaceholder")}
              maxLength={300}
              rows={3}
              className="w-full resize-none rounded border border-gray-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">{voiceTone.length}/300</p>
          </div>
        </section>

        {/* Actions */}
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !isValidHex(colorPrimary) || !isValidHex(colorSecondary)}
            className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? t("saving") : t("save")}
          </button>
          {saved && <span className="text-sm font-medium text-green-600">{t("saved")}</span>}
        </div>
      </form>
    </div>
  );
}
