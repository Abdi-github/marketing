"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { trpc } from "../../../../lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type PageStatus = "draft" | "published" | "unpublished" | "failed";

type PageItem = {
  id: string;
  slug: string;
  title: string;
  status: PageStatus;
  currentVersionId: string | null;
  publishedAt: string | Date | null;
  createdAt: string | Date;
};

type Section = {
  type: string;
  order: number;
  heading: string;
  body?: string;
  extras?: Record<string, unknown>;
};

type Composition = {
  title: string;
  sections: Section[];
};

// ─── Small icons ─────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? "w-4 h-4"}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ page }: { page: PageItem }) {
  const t = useTranslations("LandingPages");
  const isGenerating = page.status === "draft" && !page.currentVersionId;

  if (isGenerating) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
        {t("statusGenerating")}
      </span>
    );
  }
  if (page.status === "draft") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        {t("statusReady")}
      </span>
    );
  }
  if (page.status === "published") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        {t("statusPublished")}
      </span>
    );
  }
  if (page.status === "unpublished") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        {t("statusUnpublished")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      {t("statusFailed")}
    </span>
  );
}

// ─── Preview modal ────────────────────────────────────────────────────────────

function PreviewModal({
  composition,
  isLoading,
  onClose,
  t,
}: {
  composition: Composition | null;
  isLoading: boolean;
  onClose: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{t("previewTitle")}</h2>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1 hover:bg-gray-50 transition-colors"
          >
            {t("previewClose")}
          </button>
        </div>

        {/* Modal body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
              <SpinnerIcon />
              <span>Loading preview…</span>
            </div>
          )}

          {!isLoading && !composition && (
            <p className="text-gray-400 text-sm py-4">{t("previewGenerating")}</p>
          )}

          {!isLoading && composition && (
            <article className="prose prose-sm max-w-none">
              <h1 className="text-2xl font-bold text-gray-900 mb-6">{composition.title}</h1>
              {composition.sections
                .sort((a, b) => a.order - b.order)
                .map((section, i) => (
                  <PreviewSection key={i} section={section} />
                ))}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewSection({ section }: { section: Section }) {
  const isHero = section.type === "hero";
  const isLeadForm = section.type === "lead_form";

  return (
    <section className="mb-6 pb-6 border-b border-gray-100 last:border-0">
      <h2 className={`font-semibold text-gray-900 mb-2 ${isHero ? "text-xl" : "text-base"}`}>
        {section.heading}
      </h2>
      {section.body && (
        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{section.body}</p>
      )}
      {isLeadForm && (
        <div className="mt-3 bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-400 text-center">
          Lead capture form will appear here
        </div>
      )}
    </section>
  );
}

// ─── Format date helper ───────────────────────────────────────────────────────

function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LandingPagesPage() {
  const t = useTranslations("LandingPages");
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";

  const [pages, setPages] = useState<PageItem[]>([]);
  const [tenantSlug, setTenantSlug] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Polling for in-progress pages
  const [pollingId, setPollingId] = useState<string | null>(null);

  // Publish state
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Delete modal
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewComposition, setPreviewComposition] = useState<Composition | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadPages = useCallback(async () => {
    try {
      const data = await trpc.landingPages.listPages.query();
      setPages(data.pages as PageItem[]);
      setTenantSlug(data.tenantSlug);
    } catch {
      setError(t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  // Poll until generating page gets a currentVersionId or fails
  useEffect(() => {
    if (!pollingId) return;
    const interval = setInterval(async () => {
      try {
        const page = await trpc.landingPages.getPage.query({ pageId: pollingId });
        if (!page) return;
        if (page.currentVersionId || page.status === "failed") {
          setPollingId(null);
          await loadPages();
        }
      } catch {
        // ignore transient polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollingId, loadPages]);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handlePublish(pageId: string) {
    setPublishingId(pageId);
    setPublishError(null);
    try {
      await trpc.landingPages.publish.mutate({ pageId });
      await loadPages();
    } catch {
      setPublishError(t("publishError"));
    } finally {
      setPublishingId(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDeleteId) return;
    const pageId = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(pageId);
    setDeleteError(null);
    try {
      await trpc.landingPages.deletePage.mutate({ pageId });
      await loadPages();
    } catch {
      setDeleteError(t("deleteError"));
    } finally {
      setDeletingId(null);
    }
  }

  async function handlePreview(pageId: string) {
    setPreviewComposition(null);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const data = await trpc.landingPages.getComposition.query({ pageId });
      if (data) {
        setPreviewComposition(data.composition as unknown as Composition);
      }
    } catch {
      // show generating message
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("subtitle", { count: pages.length })}
          </p>
        </div>
        <a
          href={`/${locale}/landing-pages/new`}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-black text-white hover:bg-gray-800 transition-colors whitespace-nowrap"
        >
          {t("newPage")}
        </a>
      </div>

      {/* Generating hint — shown when a page is being built in background */}
      {pollingId && (
        <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mb-6">
          <SpinnerIcon className="w-3 h-3 text-yellow-600" />
          <span>{t("generatingHint")}</span>
        </div>
      )}

      {/* Error banners */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
          {error}
        </p>
      )}
      {publishError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          {publishError}
        </p>
      )}
      {deleteError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          {deleteError}
        </p>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse space-y-3">
              <div className="h-3 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && pages.length === 0 && (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm mb-3">{t("empty")}</p>
          <a
            href={`/${locale}/landing-pages/new`}
            className="text-sm text-black underline underline-offset-2 hover:opacity-70"
          >
            {t("createFirst")}
          </a>
        </div>
      )}

      {/* Cards grid */}
      {!isLoading && pages.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map((page) => {
            const isGenerating = page.status === "draft" && !page.currentVersionId;
            const isReadyToPublish = page.status === "draft" && !!page.currentVersionId;
            const isPublished = page.status === "published";
            const isDeleting = deletingId === page.id;
            const isPublishing = publishingId === page.id;

            return (
              <div
                key={page.id}
                className="group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col relative"
              >
                {/* Delete button (visible on hover) */}
                <button
                  onClick={() => setConfirmDeleteId(page.id)}
                  disabled={deletingId !== null || isGenerating}
                  title={t("delete")}
                  className={`absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 transition-all shadow-sm ${
                    isDeleting ? "opacity-100 text-red-500" : "opacity-0 group-hover:opacity-100"
                  } disabled:cursor-not-allowed`}
                >
                  {isDeleting ? <SpinnerIcon /> : <TrashIcon />}
                </button>

                <div className="p-5 flex flex-col flex-1 gap-3">
                  {/* Status + date row */}
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge page={page} />
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(page.createdAt)}</span>
                  </div>

                  {/* Title */}
                  <div>
                    <p className="text-sm font-semibold text-gray-900 leading-tight">
                      {page.title || t("untitled")}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{page.slug}</p>
                  </div>

                  {/* Generating pulse */}
                  {isGenerating && (
                    <div className="flex items-center gap-2 text-xs text-yellow-600 bg-yellow-50 rounded-lg px-3 py-2">
                      <SpinnerIcon className="w-3 h-3" />
                      <span>{t("generatingHint")}</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="mt-auto pt-1 flex items-center gap-2 flex-wrap">
                    {/* Edit — available whenever there's a version */}
                    {(isReadyToPublish || isPublished) && (
                      <a
                        href={`/${locale}/landing-pages/${page.id}/edit`}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        {t("editPage")}
                      </a>
                    )}
                    {/* Analytics — A/B testing, available for published pages */}
                    {isPublished && (
                      <a
                        href={`/${locale}/landing-pages/${page.id}/analytics`}
                        className="text-xs px-3 py-1.5 rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors"
                      >
                        {t("analytics")}
                      </a>
                    )}

                    {/* Preview — available whenever there's a version */}
                    {(isReadyToPublish || isPublished) && (
                      <button
                        onClick={() => handlePreview(page.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        {t("actionPreview")}
                      </button>
                    )}

                    {/* Publish — only for draft with version */}
                    {isReadyToPublish && (
                      <button
                        onClick={() => void handlePublish(page.id)}
                        disabled={isPublishing}
                        className="text-xs px-3 py-1.5 rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                      >
                        {isPublishing && <SpinnerIcon className="w-3 h-3" />}
                        {t("actionPublish")}
                      </button>
                    )}

                    {/* View live page — only when published and tenantSlug is known */}
                    {isPublished && tenantSlug && (
                      <a
                        href={`/p/${tenantSlug}/${page.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                      >
                        {t("actionView")}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                <TrashIcon />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t("deleteConfirmTitle")}</h2>
                <p className="text-sm text-gray-500 mt-1">{t("deleteConfirmMessage")}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => void handleDeleteConfirmed()}
                className="text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
              >
                {t("deleteConfirmBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewOpen && (
        <PreviewModal
          composition={previewComposition}
          isLoading={previewLoading}
          onClose={() => { setPreviewOpen(false); setPreviewComposition(null); }}
          t={t}
        />
      )}
    </div>
  );
}
