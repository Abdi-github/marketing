"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { trpc } from "../../../../lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type PageStatus = "draft" | "published" | "unpublished" | "failed";
type PageFilter = "all" | "generating" | "draft" | "published" | "failed";

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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

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

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ page }: { page: PageItem }) {
  const t = useTranslations("LandingPages");
  const isGenerating = page.status === "draft" && !page.currentVersionId;

  if (isGenerating) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs text-yellow-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
        {t("statusGenerating")}
      </span>
    );
  }
  if (page.status === "draft") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
        {t("statusReady")}
      </span>
    );
  }
  if (page.status === "published") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        {t("statusPublished")}
      </span>
    );
  }
  if (page.status === "unpublished") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {t("statusUnpublished")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{t("previewTitle")}</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
          >
            {t("previewClose")}
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading && (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
              <SpinnerIcon />
              <span>Loading preview…</span>
            </div>
          )}

          {!isLoading && !composition && (
            <p className="py-4 text-sm text-gray-400">{t("previewGenerating")}</p>
          )}

          {!isLoading && composition && (
            <article className="prose prose-sm max-w-none">
              <h1 className="mb-6 text-2xl font-bold text-gray-900">{composition.title}</h1>
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
    <section className="mb-6 border-b border-gray-100 pb-6 last:border-0">
      <h2 className={`mb-2 font-semibold text-gray-900 ${isHero ? "text-xl" : "text-base"}`}>
        {section.heading}
      </h2>
      {section.body && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">{section.body}</p>
      )}
      {isLeadForm && (
        <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-400">
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

function pageFilterFor(page: PageItem): PageFilter {
  if (page.status === "draft" && !page.currentVersionId) return "generating";
  if (page.status === "published") return "published";
  if (page.status === "failed") return "failed";
  return "draft";
}

const FILTERS: Array<{ key: PageFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "generating", label: "Generating" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "failed", label: "Failed" },
];

const PAGE_SIZE = 9;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LandingPagesPage() {
  const t = useTranslations("LandingPages");
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";

  const [pages, setPages] = useState<PageItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<PageFilter>("all");
  const [pageIndex, setPageIndex] = useState(0);
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

  const filterCounts = useMemo(() => {
    const counts: Record<PageFilter, number> = {
      all: pages.length,
      generating: 0,
      draft: 0,
      published: 0,
      failed: 0,
    };
    for (const page of pages) counts[pageFilterFor(page)] += 1;
    return counts;
  }, [pages]);

  const filteredPages = useMemo(
    () =>
      statusFilter === "all" ? pages : pages.filter((page) => pageFilterFor(page) === statusFilter),
    [pages, statusFilter],
  );
  const totalPages = Math.max(1, Math.ceil(filteredPages.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const visiblePages = filteredPages.slice(
    safePageIndex * PAGE_SIZE,
    safePageIndex * PAGE_SIZE + PAGE_SIZE,
  );

  useEffect(() => {
    setPageIndex(0);
  }, [statusFilter]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t("subtitle", { count: pages.length })}</p>
        </div>
        <a
          href={`/${locale}/landing-pages/new`}
          className="whitespace-nowrap rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          {t("newPage")}
        </a>
      </div>

      {/* Generating hint — shown when a page is being built in background */}
      {pollingId && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
          <SpinnerIcon className="h-3 w-3 text-yellow-600" />
          <span>{t("generatingHint")}</span>
        </div>
      )}

      {/* Error banners */}
      {error && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {publishError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {publishError}
        </p>
      )}
      {deleteError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {deleteError}
        </p>
      )}

      {!isLoading && pages.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200">
            {FILTERS.filter((filter) => filter.key === "all" || filterCounts[filter.key] > 0).map(
              (filter) => (
                <button
                  key={filter.key}
                  onClick={() => setStatusFilter(filter.key)}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                    statusFilter === filter.key
                      ? "border-black font-medium text-black"
                      : "border-transparent text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <span>{filter.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                      statusFilter === filter.key
                        ? "bg-black text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {filterCounts[filter.key]}
                  </span>
                </button>
              ),
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>
              Showing {visiblePages.length} of {filteredPages.length} page
              {filteredPages.length !== 1 ? "s" : ""}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                  disabled={safePageIndex === 0}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {safePageIndex + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPageIndex((current) => Math.min(totalPages - 1, current + 1))}
                  disabled={safePageIndex >= totalPages - 1}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse space-y-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="h-3 w-1/3 rounded bg-gray-200" />
              <div className="h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && pages.length === 0 && (
        <div className="py-20 text-center">
          <p className="mb-3 text-sm text-gray-400">{t("empty")}</p>
          <a
            href={`/${locale}/landing-pages/new`}
            className="text-sm text-black underline underline-offset-2 hover:opacity-70"
          >
            {t("createFirst")}
          </a>
        </div>
      )}

      {!isLoading && pages.length > 0 && filteredPages.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-400">No pages match this filter.</p>
        </div>
      )}

      {/* Cards grid */}
      {!isLoading && visiblePages.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePages.map((page) => {
            const isGenerating = page.status === "draft" && !page.currentVersionId;
            const isReadyToPublish = page.status === "draft" && !!page.currentVersionId;
            const isPublished = page.status === "published";
            const isDeleting = deletingId === page.id;
            const isPublishing = publishingId === page.id;

            return (
              <div
                key={page.id}
                className="group relative flex flex-col rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Delete button (visible on hover) */}
                <button
                  onClick={() => setConfirmDeleteId(page.id)}
                  disabled={deletingId !== null || isGenerating}
                  title={t("delete")}
                  className={`absolute right-3 top-3 z-10 rounded-full border border-gray-200 bg-white/90 p-1.5 text-gray-400 shadow-sm backdrop-blur-sm transition-all hover:border-red-300 hover:text-red-500 ${
                    isDeleting ? "text-red-500 opacity-100" : "opacity-0 group-hover:opacity-100"
                  } disabled:cursor-not-allowed`}
                >
                  {isDeleting ? <SpinnerIcon /> : <TrashIcon />}
                </button>

                <div className="flex flex-1 flex-col gap-3 p-5">
                  {/* Status + date row */}
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge page={page} />
                    <span className="flex-shrink-0 text-xs text-gray-400">
                      {formatDate(page.createdAt)}
                    </span>
                  </div>

                  {/* Title */}
                  <div>
                    <p className="text-sm font-semibold leading-tight text-gray-900">
                      {page.title || t("untitled")}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-gray-400">{page.slug}</p>
                  </div>

                  {/* Generating pulse */}
                  {isGenerating && (
                    <div className="flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-600">
                      <SpinnerIcon className="h-3 w-3" />
                      <span>{t("generatingHint")}</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    {/* Edit — available whenever there's a version */}
                    {(isReadyToPublish || isPublished) && (
                      <a
                        href={`/${locale}/landing-pages/${page.id}/edit`}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs transition-colors hover:bg-gray-50"
                      >
                        {t("editPage")}
                      </a>
                    )}
                    {/* Analytics — A/B testing, available for published pages */}
                    {isPublished && (
                      <a
                        href={`/${locale}/landing-pages/${page.id}/analytics`}
                        className="rounded-lg border border-purple-200 px-3 py-1.5 text-xs text-purple-700 transition-colors hover:bg-purple-50"
                      >
                        {t("analytics")}
                      </a>
                    )}

                    {/* Preview — available whenever there's a version */}
                    {(isReadyToPublish || isPublished) && (
                      <button
                        onClick={() => handlePreview(page.id)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs transition-colors hover:bg-gray-50"
                      >
                        {t("actionPreview")}
                      </button>
                    )}

                    {/* Publish — only for draft with version */}
                    {isReadyToPublish && (
                      <button
                        onClick={() => void handlePublish(page.id)}
                        disabled={isPublishing}
                        className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                      >
                        {isPublishing && <SpinnerIcon className="h-3 w-3" />}
                        {t("actionPublish")}
                      </button>
                    )}

                    {/* View live page — only when published and tenantSlug is known */}
                    {isPublished && tenantSlug && (
                      <a
                        href={`/p/${tenantSlug}/${page.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-green-700"
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
            className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                <TrashIcon />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t("deleteConfirmTitle")}</h2>
                <p className="mt-1 text-sm text-gray-500">{t("deleteConfirmMessage")}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm transition-colors hover:bg-gray-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => void handleDeleteConfirmed()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
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
          onClose={() => {
            setPreviewOpen(false);
            setPreviewComposition(null);
          }}
          t={t}
        />
      )}
    </div>
  );
}
