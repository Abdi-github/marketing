"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { trpc } from "../../../../../../lib/trpc";

type PostStatus = "pending" | "completed" | "failed";
type AspectRatio = "1:1" | "4:3" | "3:4" | "4:5" | "16:9" | "9:16";
type SocialCreativeAspectRatio = "1:1" | "4:5" | "9:16";
type SocialCreativeTemplate =
  | "auto"
  | "promo-badge"
  | "editorial-collage"
  | "event-poster"
  | "story-card"
  | "retail-offer"
  | "product-hero"
  | "testimonial-proof"
  | "carousel-cover";

type ThreadPost = {
  jobId: string;
  status: PostStatus;
  generatedText?: string | null;
  imageUrl?: string | null;
  creativeUrl?: string | null;
  creativeTemplate?: string | null;
  creativeAspectRatio?: string | null;
  creativeStatus?: string | null;
  creativeError?: string | null;
  creativeUpdatedAt?: string | Date | null;
  refinementInstruction?: string | null;
  promptInput?: unknown;
  createdAt: string | Date;
};

type ActiveJob = {
  jobId: string;
  threadId: string | null;
  parentJobId: string | null;
  instruction: string | null;
};

function getDisplayCreativeUrl(post: ThreadPost | null | undefined): string | null {
  return post?.creativeUrl ?? null;
}

const ACTIVE_JOB_POLL_MS = 2000;
const ACTIVE_JOB_TIMEOUT_MS = 120000;
const ACTIVE_JOB_MAX_TRANSIENT_ERRORS = 8;

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "4:5", label: "4:5 Feed" },
  { value: "16:9", label: "16:9 Wide" },
  { value: "9:16", label: "9:16 Story" },
];

const SOCIAL_GRAPHIC_ASPECT_RATIOS: { value: SocialCreativeAspectRatio; label: string }[] = [
  { value: "4:5", label: "4:5 Feed" },
  { value: "1:1", label: "1:1 Square" },
  { value: "9:16", label: "9:16 Story" },
];

const SOCIAL_GRAPHIC_TEMPLATES: { value: SocialCreativeTemplate; labelKey: string }[] = [
  { value: "auto", labelKey: "templateAuto" },
  { value: "promo-badge", labelKey: "templatePromo" },
  { value: "editorial-collage", labelKey: "templateEditorial" },
  { value: "event-poster", labelKey: "templateEvent" },
  { value: "story-card", labelKey: "templateStory" },
  { value: "retail-offer", labelKey: "templateRetailOffer" },
  { value: "product-hero", labelKey: "templateProductHero" },
  { value: "testimonial-proof", labelKey: "templateTestimonial" },
  { value: "carousel-cover", labelKey: "templateCarousel" },
];

// Inline SVG icons â€” no icon library needed.
function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

export default function NewPostPage() {
  return (
    <Suspense fallback={null}>
      <NewPostPageContent />
    </Suspense>
  );
}

function NewPostPageContent() {
  const locale = useLocale();
  const t = useTranslations("NewPost");
  const searchParams = useSearchParams();

  // Form state
  const [topic, setTopic] = useState("");
  const [highlights, setHighlights] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Thread state
  const [threadId, setThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadPost[]>([]);

  // Active polling job
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);

  // Refinement input
  const [refineText, setRefineText] = useState("");
  const [refining, setRefining] = useState(false);
  // Conversational image generation/edit triggered from the refine box.
  const [imageActivity, setImageActivity] = useState<{ instruction: string } | null>(null);

  // Publish to Meta state (per job)
  const [publishingJobId, setPublishingJobId] = useState<string | null>(null);
  const [publishedJobIds, setPublishedJobIds] = useState<Set<string>>(new Set());
  const [previewPost, setPreviewPost] = useState<ThreadPost | null>(null);

  // Designed social graphic state.
  const [creativeAspectRatio, setCreativeAspectRatio] = useState<SocialCreativeAspectRatio>("4:5");
  const [creativeTemplate, setCreativeTemplate] = useState<SocialCreativeTemplate>("auto");
  const [creativeDirection, setCreativeDirection] = useState("");
  const [generatingCreativeJobId, setGeneratingCreativeJobId] = useState<string | null>(null);

  // Copy state
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);

  // Manual text-edit state
  const [editingTextJobId, setEditingTextJobId] = useState<string | null>(null);
  const [editTextValue, setEditTextValue] = useState("");
  const [savingTextJobId, setSavingTextJobId] = useState<string | null>(null);
  const [editTextError, setEditTextError] = useState<string | null>(null);
  // Image generation state
  const [imagePromptJobId, setImagePromptJobId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [generatingImageJobId, setGeneratingImageJobId] = useState<string | null>(null);
  const [suggestingPromptJobId, setSuggestingPromptJobId] = useState<string | null>(null);

  // Image edit (img2img) state
  const [editImageJobId, setEditImageJobId] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState("");
  const [editAspectRatio, setEditAspectRatio] = useState<AspectRatio>("1:1");
  const [applyingEditJobId, setApplyingEditJobId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Load existing thread when navigating from the posts list.
  useEffect(() => {
    const tid = searchParams.get("threadId");
    const jid = searchParams.get("jobId");
    const resolvedThreadId = tid ?? jid;
    if (!resolvedThreadId) return;
    setThreadId(tid);
    trpc.content.listThread
      .query({ threadId: resolvedThreadId })
      .then((posts) => {
        const loaded = posts as ThreadPost[];
        setThread(loaded);
        const first = loaded[0];
        if (
          first?.promptInput &&
          typeof first.promptInput === "object" &&
          "topic" in first.promptInput
        ) {
          setTopic(String((first.promptInput as { topic: string }).topic));
          const h = (first.promptInput as { highlights?: string }).highlights;
          if (h) setHighlights(h);
        }
      })
      .catch(() => {});
  }, []);

  // Poll activeJob until it completes, then refresh the thread.
  useEffect(() => {
    if (!activeJob) return;
    const { jobId } = activeJob;
    const startedAt = Date.now();
    let transientErrors = 0;
    let stopped = false;
    let inFlight = false;

    const stopPolling = () => {
      stopped = true;
      clearInterval(interval);
    };

    const poll = async () => {
      if (inFlight) return;
      if (Date.now() - startedAt > ACTIVE_JOB_TIMEOUT_MS) {
        stopPolling();
        setActiveJob(null);
        setFormError(t("generationTimeout"));
        return;
      }

      inFlight = true;
      try {
        const result = await trpc.content.jobStatus.query({ jobId });
        if (!result) return;
        transientErrors = 0;

        if (result.status === "completed" || result.status === "failed") {
          stopPolling();

          const resolvedThreadId = threadId ?? result.threadId ?? jobId;
          if (!threadId && result.threadId) setThreadId(result.threadId);

          if (resolvedThreadId) {
            const posts = await trpc.content.listThread.query({ threadId: resolvedThreadId });
            setThread(posts as ThreadPost[]);
          }

          setActiveJob(null);
          setRefineText("");
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        }
      } catch {
        transientErrors += 1;
        if (transientErrors >= ACTIVE_JOB_MAX_TRANSIENT_ERRORS) {
          stopPolling();
          setActiveJob(null);
          setFormError(t("generationNetworkError"));
        }
      } finally {
        inFlight = false;
      }
    };

    const interval = setInterval(() => {
      if (!stopped) void poll();
    }, ACTIVE_JOB_POLL_MS);
    void poll();

    return () => stopPolling();
  }, [activeJob, threadId, t]);
  useEffect(() => {
    const hasPendingCreative = thread.some((post) => post.creativeStatus === "pending");
    const resolvedThreadId = threadId ?? thread[0]?.jobId;
    if (!hasPendingCreative || !resolvedThreadId) return;

    const interval = setInterval(async () => {
      try {
        const posts = await trpc.content.listThread.query({ threadId: resolvedThreadId });
        const loaded = posts as ThreadPost[];
        setThread(loaded);
        if (!loaded.some((post) => post.creativeStatus === "pending")) {
          setGeneratingCreativeJobId(null);
          clearInterval(interval);
        }
      } catch {
        // Transient - keep polling.
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [thread, threadId]);

  async function waitForImageRefresh(jobId: string, previousUrl?: string | null): Promise<string> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < ACTIVE_JOB_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const post = await trpc.content.jobStatus.query({ jobId });
      if (post?.imageUrl && post.imageUrl !== previousUrl) {
        setThread((prev) =>
          prev.map((p) =>
            p.jobId === jobId
              ? {
                  ...p,
                  imageUrl: post.imageUrl,
                  creativeUrl: post.creativeUrl,
                  creativeStatus: post.creativeStatus,
                  creativeError: post.creativeError,
                  creativeUpdatedAt: post.creativeUpdatedAt,
                }
              : p,
          ),
        );
        return post.imageUrl;
      }
    }
    throw new Error(t("generationTimeout"));
  }

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!topic.trim()) return;
    setFormError(null);
    setSubmitting(true);
    setThread([]);
    setThreadId(null);
    setActiveJob(null);

    try {
      const result = await trpc.content.generateSocialPost.mutate({
        topic: topic.trim(),
        highlights: highlights.trim() || undefined,
      });
      setActiveJob({ jobId: result.jobId, threadId: null, parentJobId: null, instruction: null });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const instruction = refineText.trim();
    if (!instruction || !threadId) return;

    const latestCompleted = [...thread].reverse().find((p) => p.status === "completed");
    if (!latestCompleted?.generatedText) return;

    setRefining(true);
    setFormError(null);
    try {
      // Decide whether the user is talking about the text or the image.
      const intent = await trpc.content.interpretRefinement.mutate({
        jobId: latestCompleted.jobId,
        instruction,
        hasImage: !!latestCompleted.imageUrl,
      });

      // â”€â”€ Image path: generate a fresh image or edit the current one â”€â”€
      if (intent.target === "image") {
        setRefineText("");
        setImageActivity({ instruction });
        try {
          const res =
            intent.action === "edit" && latestCompleted.imageUrl
              ? await trpc.content.editPostImage.mutate({
                  jobId: latestCompleted.jobId,
                  editInstruction: intent.imagePrompt,
                  aspectRatio: "1:1",
                })
              : await trpc.content.generatePostImage.mutate({
                  jobId: latestCompleted.jobId,
                  imagePrompt: intent.imagePrompt,
                  aspectRatio: "1:1",
                });
          if (res.status === "pending") {
            await waitForImageRefresh(latestCompleted.jobId, latestCompleted.imageUrl);
          }
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        } catch (err) {
          setFormError(err instanceof Error ? err.message : t("imageGenError"));
        } finally {
          setImageActivity(null);
        }
        return;
      }

      // â”€â”€ Text path: existing refinement behaviour â”€â”€
      const result = await trpc.content.refinePost.mutate({
        threadId,
        parentJobId: latestCompleted.jobId,
        previousDraft: latestCompleted.generatedText,
        refinementInstruction: instruction,
      });
      setActiveJob({
        jobId: result.jobId,
        threadId,
        parentJobId: latestCompleted.jobId,
        instruction,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setRefining(false);
    }
  }

  async function handlePublishToMeta(jobId: string) {
    setPublishingJobId(jobId);
    try {
      await trpc.integrations.publishToMeta.mutate({ jobId });
      setPublishedJobIds((prev) => new Set([...prev, jobId]));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("publishMetaError"));
    } finally {
      setPublishingJobId(null);
    }
  }

  function handleCopy(text: string, jobId: string) {
    void navigator.clipboard.writeText(text);
    setCopiedJobId(jobId);
    setTimeout(() => setCopiedJobId(null), 2000);
  }

  function openTextEdit(post: ThreadPost) {
    setEditingTextJobId(post.jobId);
    setEditTextValue(post.generatedText ?? "");
    setEditTextError(null);
  }

  function cancelTextEdit() {
    setEditingTextJobId(null);
    setEditTextError(null);
  }

  async function saveTextEdit(jobId: string) {
    const text = editTextValue.trim();
    if (!text) return;
    setSavingTextJobId(jobId);
    setEditTextError(null);
    try {
      const res = await trpc.content.editPostText.mutate({ jobId, text });
      setThread((prev) =>
        prev.map((p) =>
          p.jobId === jobId
            ? {
                ...p,
                generatedText: res.text,
                creativeUrl: res.creativeUrl ?? p.creativeUrl,
                creativeStatus: res.creativeStatus ?? p.creativeStatus,
              }
            : p,
        ),
      );
      setEditingTextJobId(null);
    } catch (err) {
      setEditTextError(err instanceof Error ? err.message : t("editTextError"));
    } finally {
      setSavingTextJobId(null);
    }
  }

  function handleReset() {
    setThread([]);
    setThreadId(null);
    setActiveJob(null);
    setTopic("");
    setHighlights("");
    setRefineText("");
    setFormError(null);
    setImagePromptJobId(null);
    setImagePrompt("");
    setSuggestingPromptJobId(null);
    setEditImageJobId(null);
    setEditInstruction("");
    setImageActivity(null);
    setCreativeAspectRatio("4:5");
    setCreativeTemplate("auto");
    setCreativeDirection("");
    setGeneratingCreativeJobId(null);
    setEditingTextJobId(null);
    setEditTextError(null);
    setPreviewPost(null);
  }

  async function openImagePrompt(post: ThreadPost) {
    setSuggestingPromptJobId(post.jobId);
    try {
      const { prompt } = await trpc.content.suggestImagePrompt.query({ jobId: post.jobId });
      setImagePrompt(prompt ?? "");
    } catch {
      setImagePrompt("");
    } finally {
      setSuggestingPromptJobId(null);
      setImagePromptJobId(post.jobId);
    }
  }

  async function handleGenerateImage(jobId: string) {
    if (!imagePrompt.trim()) return;
    setGeneratingImageJobId(jobId);
    setImagePromptJobId(null);
    try {
      const result = await trpc.content.generatePostImage.mutate({
        jobId,
        imagePrompt: imagePrompt.trim(),
        aspectRatio,
      });
      if (result.status === "pending") {
        const previousUrl = thread.find((p) => p.jobId === jobId)?.imageUrl;
        await waitForImageRefresh(jobId, previousUrl);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("imageGenError"));
    } finally {
      setGeneratingImageJobId(null);
      setImagePrompt("");
    }
  }

  async function handleEditImage(jobId: string) {
    if (!editInstruction.trim()) return;
    setApplyingEditJobId(jobId);
    setEditImageJobId(null);
    try {
      const result = await trpc.content.editPostImage.mutate({
        jobId,
        editInstruction: editInstruction.trim(),
        aspectRatio: editAspectRatio,
      });
      if (result.status === "pending") {
        const previousUrl = thread.find((p) => p.jobId === jobId)?.imageUrl;
        await waitForImageRefresh(jobId, previousUrl);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("imageGenError"));
    } finally {
      setApplyingEditJobId(null);
      setEditInstruction("");
    }
  }

  async function handleGenerateCreative(jobId: string) {
    setGeneratingCreativeJobId(jobId);
    try {
      const result = await trpc.content.generateSocialCreative.mutate({
        jobId,
        aspectRatio: creativeAspectRatio,
        template: creativeTemplate,
        creativeDirection: creativeDirection.trim() || undefined,
      });
      setThread((prev) =>
        prev.map((p) =>
          p.jobId === jobId
            ? {
                ...p,
                creativeUrl: result.creativeUrl,
                creativeTemplate: result.creativeTemplate,
                creativeAspectRatio: result.creativeAspectRatio,
                creativeStatus: result.creativeStatus,
                creativeError: null,
                creativeUpdatedAt: result.creativeUpdatedAt,
              }
            : p,
        ),
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("creativeError"));
    } finally {
      setGeneratingCreativeJobId(null);
    }
  }

  const isGenerating = !!activeJob;
  const latestCompleted = [...thread].reverse().find((p) => p.status === "completed");
  const hasThread = thread.length > 0 || isGenerating;
  // The editor shows ONE evolving post: text refinements, image generation and
  // image edits all update this single latest post in place rather than piling
  // up a conversation thread. Falls back to the latest row (e.g. a failed first
  // generation) so error states still surface.
  const renderPosts = latestCompleted
    ? [latestCompleted]
    : thread.length > 0
      ? [thread[thread.length - 1]!]
      : [];
  const previewPostLive = previewPost
    ? (thread.find((post) => post.jobId === previewPost.jobId) ?? previewPost)
    : null;
  const previewCreativeUrl = getDisplayCreativeUrl(previewPostLive);
  const previewMediaUrl = previewCreativeUrl ?? previewPostLive?.imageUrl ?? null;
  const previewMediaLabel = previewCreativeUrl
    ? t("previewDesignedGraphic")
    : previewPostLive?.imageUrl
      ? t("previewGeneratedImage")
      : t("previewTextOnly");

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-50 p-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* â”€â”€ Initial form â”€â”€ */}
        {!hasThread && (
          <>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <form onSubmit={handleGenerate} className="space-y-4 rounded-lg bg-white p-6 shadow">
              {formError && (
                <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">
                  <p>{formError}</p>
                  {formError.includes("business profile") && (
                    <Link
                      href={`/${locale}/dashboard/setup`}
                      className="mt-1 inline-block font-medium underline"
                    >
                      {t("setupProfileLink")}
                    </Link>
                  )}
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="topic">
                  {t("topicLabel")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="topic"
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={t("topicPlaceholder")}
                  required
                  maxLength={200}
                  className="w-full rounded border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="highlights">
                  {t("highlightsLabel")}
                </label>
                <textarea
                  id="highlights"
                  value={highlights}
                  onChange={(e) => setHighlights(e.target.value)}
                  placeholder={t("highlightsPlaceholder")}
                  rows={3}
                  maxLength={500}
                  className="w-full resize-none rounded border px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !topic.trim()}
                className="w-full rounded bg-black py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? t("submitting") : t("generate")}
              </button>
            </form>
          </>
        )}

        {/* â”€â”€ Thread header â”€â”€ */}
        {hasThread && (
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{topic}</h1>
              {highlights && <p className="mt-0.5 text-sm text-gray-500">{highlights}</p>}
            </div>
            <button
              onClick={handleReset}
              className="rounded border px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              {t("newPost")}
            </button>
          </div>
        )}

        {hasThread && formError && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {formError}
          </div>
        )}

        {/* â”€â”€ The single evolving post â”€â”€ */}
        {renderPosts.map((post, idx) => (
          <div key={post.jobId} className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-medium text-white">
                AI
              </div>
              <div className="flex-1 space-y-3 rounded-lg bg-white p-4 shadow">
                {post.status === "completed" && post.generatedText && (
                  <>
                    {/* Generated image */}
                    {post.imageUrl && (
                      <div className="overflow-hidden rounded border border-gray-100">
                        <img
                          src={post.imageUrl}
                          alt={t("imageAlt")}
                          className="max-h-72 w-full object-cover"
                        />
                      </div>
                    )}

                    {/* Designed social graphic preview */}
                    {getDisplayCreativeUrl(post) && (
                      <div className="overflow-hidden rounded border border-gray-100">
                        <img
                          src={getDisplayCreativeUrl(post) ?? ""}
                          alt={t("creativeAlt")}
                          className="w-full object-cover"
                        />
                      </div>
                    )}

                    {/* Post text â€” editable */}
                    {editingTextJobId === post.jobId ? (
                      <div className="space-y-2">
                        <textarea
                          value={editTextValue}
                          onChange={(e) => setEditTextValue(e.target.value)}
                          rows={8}
                          maxLength={5000}
                          autoFocus
                          className="w-full resize-y rounded border px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {editTextError && (
                          <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600">
                            {editTextError}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => void saveTextEdit(post.jobId)}
                            disabled={savingTextJobId === post.jobId || !editTextValue.trim()}
                            className="rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
                          >
                            {savingTextJobId === post.jobId ? t("savingText") : t("saveTextEdit")}
                          </button>
                          <button
                            onClick={cancelTextEdit}
                            disabled={savingTextJobId === post.jobId}
                            className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                          >
                            {t("cancelTextEdit")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group relative">
                        <p className="whitespace-pre-wrap pr-16 text-sm leading-relaxed text-gray-900">
                          {post.generatedText}
                        </p>
                        <div className="absolute right-0 top-0 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {!isGenerating && !imageActivity && (
                            <button
                              onClick={() => openTextEdit(post)}
                              title={t("editText")}
                              className="rounded p-1 text-gray-300 transition-colors hover:text-gray-600"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleCopy(post.generatedText!, post.jobId)}
                            title={t("copyText")}
                            className="rounded p-1 text-gray-300 transition-colors hover:text-gray-600"
                          >
                            {copiedJobId === post.jobId ? (
                              <CheckIcon className="h-4 w-4 text-green-500" />
                            ) : (
                              <ClipboardIcon className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {idx === renderPosts.length - 1 && (
                      <div className="space-y-3">
                        {/* â”€â”€ Image section â”€â”€ */}
                        <div className="space-y-2">
                          {/* Image action buttons */}
                          <div className="flex flex-wrap gap-2">
                            {/* Generate image (when no image yet) */}
                            {!post.imageUrl &&
                              generatingImageJobId !== post.jobId &&
                              suggestingPromptJobId !== post.jobId && (
                                <button
                                  onClick={() => void openImagePrompt(post)}
                                  className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
                                >
                                  {t("generateImage")}
                                </button>
                              )}
                            {suggestingPromptJobId === post.jobId && (
                              <span className="animate-pulse px-3 py-1.5 text-xs text-gray-400">
                                {t("suggestingPrompt")}
                              </span>
                            )}
                            {generatingImageJobId === post.jobId && (
                              <span className="animate-pulse px-3 py-1.5 text-xs text-gray-400">
                                {t("generatingImage")}
                              </span>
                            )}

                            {/* Regenerate (when image exists) */}
                            {post.imageUrl &&
                              generatingImageJobId !== post.jobId &&
                              suggestingPromptJobId !== post.jobId &&
                              applyingEditJobId !== post.jobId && (
                                <>
                                  <button
                                    onClick={() => void openImagePrompt(post)}
                                    className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
                                  >
                                    {t("regenerateImage")}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditImageJobId(post.jobId);
                                      setEditAspectRatio("1:1");
                                      setEditInstruction("");
                                    }}
                                    className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
                                  >
                                    {t("editImage")}
                                  </button>
                                  <a
                                    href={post.imageUrl}
                                    download
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
                                  >
                                    {t("downloadImage")}
                                  </a>
                                </>
                              )}
                            {applyingEditJobId === post.jobId && (
                              <span className="animate-pulse px-3 py-1.5 text-xs text-gray-400">
                                {t("applyingEdit")}
                              </span>
                            )}
                          </div>

                          {/* Image prompt input (generate / regenerate) */}
                          {imagePromptJobId === post.jobId && (
                            <div className="space-y-2 rounded-lg border bg-gray-50 p-3">
                              <p className="text-xs text-gray-500">{t("imagePromptHint")}</p>
                              <textarea
                                value={imagePrompt}
                                onChange={(e) => setImagePrompt(e.target.value)}
                                placeholder={t("imagePlaceholder")}
                                rows={3}
                                maxLength={500}
                                className="w-full resize-none rounded border bg-white px-3 py-2 text-sm"
                              />
                              {/* Aspect ratio selector */}
                              <div className="flex flex-wrap gap-1">
                                {ASPECT_RATIOS.map((ar) => (
                                  <button
                                    key={ar.value}
                                    type="button"
                                    onClick={() => setAspectRatio(ar.value)}
                                    className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                                      aspectRatio === ar.value
                                        ? "border-black bg-black text-white"
                                        : "border-gray-200 hover:border-gray-400"
                                    }`}
                                  >
                                    {ar.label}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => void handleGenerateImage(post.jobId)}
                                  disabled={!imagePrompt.trim()}
                                  className="rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
                                >
                                  {t("generateImageSubmit")}
                                </button>
                                <button
                                  onClick={() => {
                                    setImagePromptJobId(null);
                                    setImagePrompt("");
                                  }}
                                  className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
                                >
                                  {t("cancelImagePrompt")}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Edit image input (img2img) */}
                          {editImageJobId === post.jobId && (
                            <div className="space-y-2 rounded-lg border bg-gray-50 p-3">
                              <p className="text-xs text-gray-500">{t("editImageHint")}</p>
                              <textarea
                                value={editInstruction}
                                onChange={(e) => setEditInstruction(e.target.value)}
                                placeholder={t("editImagePlaceholder")}
                                rows={2}
                                maxLength={500}
                                className="w-full resize-none rounded border bg-white px-3 py-2 text-sm"
                              />
                              {/* Aspect ratio selector */}
                              <div className="flex flex-wrap gap-1">
                                {ASPECT_RATIOS.map((ar) => (
                                  <button
                                    key={ar.value}
                                    type="button"
                                    onClick={() => setEditAspectRatio(ar.value)}
                                    className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                                      editAspectRatio === ar.value
                                        ? "border-black bg-black text-white"
                                        : "border-gray-200 hover:border-gray-400"
                                    }`}
                                  >
                                    {ar.label}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => void handleEditImage(post.jobId)}
                                  disabled={!editInstruction.trim()}
                                  className="rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
                                >
                                  {t("applyEdit")}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditImageJobId(null);
                                    setEditInstruction("");
                                  }}
                                  className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
                                >
                                  {t("cancelImagePrompt")}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* â”€â”€ Designed graphic + publish actions â”€â”€ */}
                        <div className="flex flex-wrap gap-2">
                          <div className="w-full space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold text-gray-900">
                                  {t("designedGraphic")}
                                </p>
                                <p className="text-xs text-gray-500">{t("designedGraphicHint")}</p>
                              </div>
                              {getDisplayCreativeUrl(post) && (
                                <a
                                  href={getDisplayCreativeUrl(post) ?? ""}
                                  download={`social-graphic-${post.jobId}.png`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                                >
                                  {t("downloadGraphic")}
                                </a>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {SOCIAL_GRAPHIC_ASPECT_RATIOS.map((ar) => (
                                <button
                                  key={ar.value}
                                  type="button"
                                  onClick={() => setCreativeAspectRatio(ar.value)}
                                  className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                                    creativeAspectRatio === ar.value
                                      ? "border-black bg-black text-white"
                                      : "border-gray-200 bg-white hover:border-gray-400"
                                  }`}
                                >
                                  {ar.label}
                                </button>
                              ))}
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {SOCIAL_GRAPHIC_TEMPLATES.map((tpl) => (
                                <button
                                  key={tpl.value}
                                  type="button"
                                  onClick={() => setCreativeTemplate(tpl.value)}
                                  className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                                    creativeTemplate === tpl.value
                                      ? "border-black bg-black text-white"
                                      : "border-gray-200 bg-white hover:border-gray-400"
                                  }`}
                                >
                                  {t(tpl.labelKey)}
                                </button>
                              ))}
                            </div>

                            <div className="space-y-1">
                              <label
                                htmlFor={`creative-direction-${post.jobId}`}
                                className="text-xs font-medium text-gray-700"
                              >
                                {t("creativeDirectionLabel")}
                              </label>
                              <textarea
                                id={`creative-direction-${post.jobId}`}
                                value={creativeDirection}
                                onChange={(e) => setCreativeDirection(e.target.value)}
                                placeholder={t("creativeDirectionPlaceholder")}
                                rows={2}
                                maxLength={600}
                                className="w-full resize-none rounded border bg-white px-3 py-2 text-xs"
                              />
                            </div>

                            <button
                              onClick={() => void handleGenerateCreative(post.jobId)}
                              disabled={
                                generatingCreativeJobId === post.jobId ||
                                post.creativeStatus === "pending"
                              }
                              className="rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
                            >
                              {generatingCreativeJobId === post.jobId ||
                              post.creativeStatus === "pending"
                                ? t("generatingGraphic")
                                : getDisplayCreativeUrl(post)
                                  ? t("regenerateGraphic")
                                  : t("generateGraphic")}
                            </button>
                            {post.creativeStatus === "failed" && (
                              <p className="text-xs text-red-600">
                                {post.creativeError ?? t("creativeError")}
                              </p>
                            )}
                          </div>

                          {/* Publish to Meta */}
                          <button
                            onClick={() => setPreviewPost(post)}
                            disabled={!post.generatedText}
                            className="rounded border bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                          >
                            {t("previewPost")}
                          </button>
                          {publishedJobIds.has(post.jobId) ? (
                            <span className="rounded border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-700">
                              {t("publishedToMeta")}
                            </span>
                          ) : (
                            <button
                              onClick={() => void handlePublishToMeta(post.jobId)}
                              disabled={publishingJobId === post.jobId}
                              className="rounded bg-[#1877f2] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[#1465d1] disabled:opacity-50"
                            >
                              {publishingJobId === post.jobId
                                ? t("publishingToMeta")
                                : t("publishToMeta")}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {post.status === "failed" && <p className="text-sm text-red-600">{t("failed")}</p>}
              </div>
            </div>
          </div>
        ))}

        {/* â”€â”€ Generating indicator â”€â”€ */}
        {isGenerating && (
          <div className="flex items-start gap-2">
            {activeJob?.instruction && (
              <div className="mb-2 flex w-full items-start gap-2">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium">
                  U
                </div>
                <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
                  {activeJob.instruction}
                </div>
              </div>
            )}
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-medium text-white">
              AI
            </div>
            <div className="flex-1 animate-pulse rounded-lg bg-white p-4 text-sm text-gray-400 shadow">
              {t("generatingMessage")}
            </div>
          </div>
        )}

        {/* â”€â”€ Conversational image activity indicator â”€â”€ */}
        {imageActivity && (
          <div>
            <div className="mb-2 flex w-full items-start gap-2">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium">
                U
              </div>
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
                {imageActivity.instruction}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-medium text-white">
                AI
              </div>
              <div className="flex-1 animate-pulse rounded-lg bg-white p-4 text-sm text-gray-400 shadow">
                {t("generatingImage")}
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€ Refinement input â”€â”€ */}
        {latestCompleted && !isGenerating && !imageActivity && (
          <div className="space-y-1.5">
            <form onSubmit={handleRefine} className="flex gap-2">
              <input
                type="text"
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                placeholder={t("refinePlaceholder")}
                maxLength={500}
                className="flex-1 rounded border px-3 py-2 text-sm"
                disabled={refining}
              />
              <button
                type="submit"
                disabled={refining || !refineText.trim()}
                className="shrink-0 rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {refining ? t("refining") : t("refine")}
              </button>
            </form>
            <p className="px-1 text-xs text-gray-400">{t("refineHint")}</p>
          </div>
        )}

        {previewPostLive && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={t("previewTitle")}
            onClick={() => setPreviewPost(null)}
          >
            <div
              className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-950">{t("previewTitle")}</h2>
                  <p className="text-xs text-gray-500">{previewMediaLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewPost(null)}
                  className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  {t("previewClose")}
                </button>
              </div>

              <div className="grid max-h-[calc(92vh-72px)] gap-0 overflow-y-auto md:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <div className="flex items-center justify-center bg-neutral-950 p-5">
                  <div className="w-full max-w-[430px] overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl">
                    <div className="flex items-center gap-2 border-b px-4 py-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-xs font-bold text-white">
                        AI
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-950">
                          {topic || t("resultTitle")}
                        </p>
                        <p className="text-xs text-gray-500">Facebook / Instagram</p>
                      </div>
                    </div>
                    {previewMediaUrl ? (
                      <img
                        src={previewMediaUrl}
                        alt={previewCreativeUrl ? t("creativeAlt") : t("imageAlt")}
                        className="max-h-[68vh] w-full bg-gray-100 object-contain"
                      />
                    ) : (
                      <div className="flex aspect-[4/5] items-center justify-center bg-gray-100 px-8 text-center text-sm text-gray-500">
                        {t("previewNoMedia")}
                      </div>
                    )}
                    <div className="space-y-2 px-4 py-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">
                        {previewPostLive.generatedText}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {t("previewCaptionLabel")}
                    </p>
                    <div className="max-h-72 overflow-y-auto rounded-lg border bg-gray-50 p-3">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">
                        {previewPostLive.generatedText}
                      </p>
                    </div>
                  </div>

                  {previewMediaUrl && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {previewMediaLabel}
                      </p>
                      <a
                        href={previewMediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        download={`social-preview-${previewPostLive.jobId}.png`}
                        className="inline-flex rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
                      >
                        {t("previewDownload")}
                      </a>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(previewPostLive.generatedText ?? "", previewPostLive.jobId)
                      }
                      disabled={!previewPostLive.generatedText}
                      className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                    >
                      {copiedJobId === previewPostLive.jobId ? t("copied") : t("previewCopy")}
                    </button>
                    {publishedJobIds.has(previewPostLive.jobId) ? (
                      <span className="rounded border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-700">
                        {t("publishedToMeta")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handlePublishToMeta(previewPostLive.jobId)}
                        disabled={publishingJobId === previewPostLive.jobId}
                        className="rounded bg-[#1877f2] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[#1465d1] disabled:opacity-50"
                      >
                        {publishingJobId === previewPostLive.jobId
                          ? t("publishingToMeta")
                          : t("previewPublish")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
