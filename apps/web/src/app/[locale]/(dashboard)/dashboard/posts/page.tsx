"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { trpc } from "../../../../../lib/trpc";

const PAGE_SIZE = 20;

type Post = {
  id: string;
  jobId: string;
  threadId: string | null;
  status: string;
  generatedText: string | null;
  imageUrl: string | null;
  creativeUrl?: string | null;
  promptInput: unknown;
  metaPostId: string | null;
  publishedToMetaAt: string | Date | null;
  createdAt: string | Date;
};

type Filter = "all" | "draft" | "published";

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className ?? "h-4 w-4"}
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
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

function StatusBadge({ post }: { post: Post }) {
  const t = useTranslations("PostsDashboard");
  if (post.metaPostId) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
        {t("publishedFB")}
      </span>
    );
  }
  if (post.status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        {t("statusDraft")}
      </span>
    );
  }
  if (post.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs text-yellow-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
        {t("statusPending")}
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

function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getTopic(promptInput: unknown): string {
  if (promptInput && typeof promptInput === "object" && "topic" in promptInput) {
    return String((promptInput as { topic: string }).topic);
  }
  return "";
}

export default function PostsDashboardPage() {
  const locale = useLocale();
  const t = useTranslations("PostsDashboard");

  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchPage = useCallback(async (p: number, f: Filter) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await trpc.content.listPosts.query({ page: p, filter: f });
      setPosts(data.posts as Post[]);
      setTotal(data.total);
    } catch {
      setError("load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(page, filter);
  }, [page, filter, fetchPage]);

  // Reset to page 1 when filter changes
  const handleFilterChange = (f: Filter) => {
    setFilter(f);
    setPage(1);
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteId) return;
    const jobId = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(jobId);
    setDeleteError(null);
    try {
      await trpc.content.deletePost.mutate({ jobId });
      if (posts.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await fetchPage(page, filter);
      }
    } catch {
      setDeleteError(t("deleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t("subtitle", { count: total })}</p>
        </div>
        <Link
          href={`/${locale}/dashboard/posts/new`}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          {t("newPost")}
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-2">
        {(["all", "draft", "published"] as const).map((f) => (
          <button
            key={f}
            onClick={() => handleFilterChange(f)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              filter === f
                ? "border-black bg-black text-white"
                : "border-gray-200 hover:border-gray-400"
            }`}
          >
            {t(`filter_${f}`)}
          </button>
        ))}
      </div>

      {/* Delete error banner */}
      {deleteError && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {deleteError}
        </p>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
            >
              <div className="h-44 w-full bg-gray-200" />
              <div className="space-y-2 p-4">
                <div className="h-3 w-3/4 rounded bg-gray-200" />
                <div className="h-3 w-1/2 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load error */}
      {error !== null && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {t("loadError")}
        </p>
      )}

      {/* Empty state */}
      {!isLoading && error === null && posts.length === 0 && (
        <div className="py-20 text-center">
          <p className="mb-4 text-sm text-gray-400">{t("empty")}</p>
          <Link
            href={`/${locale}/dashboard/posts/new`}
            className="text-sm text-gray-600 underline hover:text-black"
          >
            {t("createFirst")}
          </Link>
        </div>
      )}

      {/* Post grid */}
      {!isLoading && posts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const topic = getTopic(post.promptInput);
            const preview = post.generatedText?.slice(0, 140) ?? "";
            const isDeleting = deletingId === post.jobId;

            return (
              <div
                key={post.jobId}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Delete button */}
                <button
                  onClick={() => setConfirmDeleteId(post.jobId)}
                  disabled={deletingId !== null}
                  title={t("deletePost")}
                  className={`absolute right-2 top-2 z-10 rounded-full border border-gray-200 bg-white/90 p-1.5 text-gray-400 shadow-sm backdrop-blur-sm transition-all hover:border-red-300 hover:text-red-500 ${
                    isDeleting ? "text-red-500 opacity-100" : "opacity-0 group-hover:opacity-100"
                  } disabled:cursor-not-allowed`}
                >
                  {isDeleting ? <SpinnerIcon /> : <TrashIcon />}
                </button>

                {/* Image thumbnail */}
                {(post.creativeUrl ?? post.imageUrl) ? (
                  <div className="h-44 overflow-hidden bg-gray-100">
                    <img
                      src={post.creativeUrl ?? post.imageUrl ?? ""}
                      alt={topic}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-44 items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                    <span className="text-3xl">✍️</span>
                  </div>
                )}

                {/* Card body */}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex-1 truncate text-xs font-semibold leading-tight text-gray-900">
                      {topic || t("untitled")}
                    </p>
                    <StatusBadge post={post} />
                  </div>

                  {preview && (
                    <p className="line-clamp-3 text-xs leading-relaxed text-gray-500">
                      {preview}
                      {post.generatedText && post.generatedText.length > 140 ? "…" : ""}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="text-xs text-gray-400">{formatDate(post.createdAt)}</span>
                    <Link
                      href={
                        post.threadId
                          ? `/${locale}/dashboard/posts/new?threadId=${post.threadId}`
                          : `/${locale}/dashboard/posts/new?jobId=${post.jobId}`
                      }
                      className="rounded border px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      {t("continueEditing")}
                    </Link>
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
                <TrashIcon className="h-4 w-4 text-red-500" />
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
                onClick={handleDeleteConfirmed}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                {t("deleteConfirmBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm transition-colors hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("prevPage")}
          </button>
          <span className="text-sm text-gray-500">
            {t("pageInfo", { page, total: totalPages })}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm transition-colors hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("nextPage")}
          </button>
        </div>
      )}
    </div>
  );
}
