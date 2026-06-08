"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { trpc } from "../../../../../../lib/trpc";

type PostStatus = "pending" | "completed" | "failed";
type AspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";

type ThreadPost = {
  jobId: string;
  status: PostStatus;
  generatedText?: string | null;
  imageUrl?: string | null;
  refinementInstruction?: string | null;
  createdAt: string | Date;
};

type ActiveJob = {
  jobId: string;
  threadId: string | null;
  parentJobId: string | null;
  instruction: string | null;
};

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "1:1",  label: "1:1 Square" },
  { value: "4:3",  label: "4:3 Landscape" },
  { value: "3:4",  label: "3:4 Portrait" },
  { value: "16:9", label: "16:9 Wide" },
  { value: "9:16", label: "9:16 Story" },
];

// Inline SVG icons — no icon library needed.
function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function NewPostPage() {
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

  // Infographic card state (per job)
  const [cardJobIds, setCardJobIds] = useState<Set<string>>(new Set());

  // Copy state
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);

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
    trpc.content.listThread.query({ threadId: resolvedThreadId }).then((posts) => {
      const loaded = posts as ThreadPost[];
      setThread(loaded);
      const first = loaded[0];
      if (first?.promptInput && typeof first.promptInput === "object" && "topic" in first.promptInput) {
        setTopic(String((first.promptInput as { topic: string }).topic));
        const h = (first.promptInput as { highlights?: string }).highlights;
        if (h) setHighlights(h);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll activeJob until it completes, then refresh the thread.
  useEffect(() => {
    if (!activeJob) return;
    const { jobId } = activeJob;

    const interval = setInterval(async () => {
      try {
        const result = await trpc.content.jobStatus.query({ jobId });
        if (!result) return;

        if (result.status === "completed" || result.status === "failed") {
          clearInterval(interval);

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
        // Transient — keep polling.
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJob, threadId]);

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

      // ── Image path: generate a fresh image or edit the current one ──
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
          setThread((prev) =>
            prev.map((p) => (p.jobId === latestCompleted.jobId ? { ...p, imageUrl: res.url } : p)),
          );
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        } catch (err) {
          setFormError(err instanceof Error ? err.message : t("imageGenError"));
        } finally {
          setImageActivity(null);
        }
        return;
      }

      // ── Text path: existing refinement behaviour ──
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
      setThread((prev) => prev.map((p) => (p.jobId === jobId ? { ...p, imageUrl: result.url } : p)));
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
      setThread((prev) => prev.map((p) => (p.jobId === jobId ? { ...p, imageUrl: result.url } : p)));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("imageGenError"));
    } finally {
      setApplyingEditJobId(null);
      setEditInstruction("");
    }
  }

  const isGenerating = !!activeJob;
  const latestCompleted = [...thread].reverse().find((p) => p.status === "completed");
  const hasThread = thread.length > 0 || isGenerating;

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-50 p-8">
      <div className="w-full max-w-2xl space-y-6">

        {/* ── Initial form ── */}
        {!hasThread && (
          <>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <form onSubmit={handleGenerate} className="bg-white rounded-lg shadow p-6 space-y-4">
              {formError && (
                <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">
                  <p>{formError}</p>
                  {formError.includes("business profile") && (
                    <Link href={`/${locale}/dashboard/setup`} className="mt-1 inline-block underline font-medium">
                      {t("setupProfileLink")}
                    </Link>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="topic">
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
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="highlights">
                  {t("highlightsLabel")}
                </label>
                <textarea
                  id="highlights"
                  value={highlights}
                  onChange={(e) => setHighlights(e.target.value)}
                  placeholder={t("highlightsPlaceholder")}
                  rows={3}
                  maxLength={500}
                  className="w-full border rounded px-3 py-2 text-sm resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !topic.trim()}
                className="w-full bg-black text-white rounded py-2 text-sm font-medium disabled:opacity-50"
              >
                {submitting ? t("submitting") : t("generate")}
              </button>
            </form>
          </>
        )}

        {/* ── Thread header ── */}
        {hasThread && (
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{topic}</h1>
              {highlights && <p className="text-sm text-gray-500 mt-0.5">{highlights}</p>}
            </div>
            <button
              onClick={handleReset}
              className="text-xs text-gray-500 border rounded px-3 py-1.5 hover:bg-gray-50"
            >
              {t("newPost")}
            </button>
          </div>
        )}

        {/* ── Conversation thread ── */}
        {thread.map((post, idx) => (
          <div key={post.jobId} className="space-y-2">
            {post.refinementInstruction && (
              <div className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">U</div>
                <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-700 max-w-prose">
                  {post.refinementInstruction}
                </div>
              </div>
            )}

            <div className="flex gap-2 items-start">
              <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center text-xs font-medium text-white shrink-0 mt-0.5">AI</div>
              <div className={`bg-white rounded-lg shadow p-4 space-y-3 flex-1 ${idx < thread.length - 1 ? "opacity-60" : ""}`}>
                {post.status === "completed" && post.generatedText && (
                  <>
                    {/* Generated image */}
                    {post.imageUrl && (
                      <div className="rounded overflow-hidden border border-gray-100">
                        <img src={post.imageUrl} alt={t("imageAlt")} className="w-full object-cover max-h-72" />
                      </div>
                    )}

                    {/* Infographic card preview */}
                    {cardJobIds.has(post.jobId) && (
                      <div className="rounded overflow-hidden border border-gray-100">
                        <img src={`/api/og/${post.jobId}`} alt="Social media card" className="w-full object-cover" />
                      </div>
                    )}

                    {/* Post text with copy icon */}
                    <div className="relative group">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed pr-8">
                        {post.generatedText}
                      </p>
                      <button
                        onClick={() => handleCopy(post.generatedText!, post.jobId)}
                        title={t("copyText")}
                        className="absolute top-0 right-0 p-1 text-gray-300 hover:text-gray-600 transition-colors rounded opacity-0 group-hover:opacity-100"
                      >
                        {copiedJobId === post.jobId
                          ? <CheckIcon className="w-4 h-4 text-green-500" />
                          : <ClipboardIcon className="w-4 h-4" />
                        }
                      </button>
                    </div>

                    {/* Actions (latest post only) */}
                    {idx === thread.length - 1 && (
                      <div className="space-y-3">

                        {/* ── Image section ── */}
                        <div className="space-y-2">
                          {/* Image action buttons */}
                          <div className="flex gap-2 flex-wrap">
                            {/* Generate image (when no image yet) */}
                            {!post.imageUrl && generatingImageJobId !== post.jobId && suggestingPromptJobId !== post.jobId && (
                              <button
                                onClick={() => void openImagePrompt(post)}
                                className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                              >
                                {t("generateImage")}
                              </button>
                            )}
                            {suggestingPromptJobId === post.jobId && (
                              <span className="text-xs px-3 py-1.5 text-gray-400 animate-pulse">{t("suggestingPrompt")}</span>
                            )}
                            {generatingImageJobId === post.jobId && (
                              <span className="text-xs px-3 py-1.5 text-gray-400 animate-pulse">{t("generatingImage")}</span>
                            )}

                            {/* Regenerate (when image exists) */}
                            {post.imageUrl && generatingImageJobId !== post.jobId && suggestingPromptJobId !== post.jobId && applyingEditJobId !== post.jobId && (
                              <>
                                <button
                                  onClick={() => void openImagePrompt(post)}
                                  className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                                >
                                  {t("regenerateImage")}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditImageJobId(post.jobId);
                                    setEditAspectRatio("1:1");
                                    setEditInstruction("");
                                  }}
                                  className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                                >
                                  {t("editImage")}
                                </button>
                                <a
                                  href={post.imageUrl}
                                  download
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                                >
                                  {t("downloadImage")}
                                </a>
                              </>
                            )}
                            {applyingEditJobId === post.jobId && (
                              <span className="text-xs px-3 py-1.5 text-gray-400 animate-pulse">{t("applyingEdit")}</span>
                            )}
                          </div>

                          {/* Image prompt input (generate / regenerate) */}
                          {imagePromptJobId === post.jobId && (
                            <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
                              <p className="text-xs text-gray-500">{t("imagePromptHint")}</p>
                              <textarea
                                value={imagePrompt}
                                onChange={(e) => setImagePrompt(e.target.value)}
                                placeholder={t("imagePlaceholder")}
                                rows={3}
                                maxLength={500}
                                className="w-full border rounded px-3 py-2 text-sm resize-none bg-white"
                              />
                              {/* Aspect ratio selector */}
                              <div className="flex gap-1 flex-wrap">
                                {ASPECT_RATIOS.map((ar) => (
                                  <button
                                    key={ar.value}
                                    type="button"
                                    onClick={() => setAspectRatio(ar.value)}
                                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                                      aspectRatio === ar.value
                                        ? "bg-black text-white border-black"
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
                                  className="text-xs px-3 py-1.5 bg-black text-white rounded disabled:opacity-50"
                                >
                                  {t("generateImageSubmit")}
                                </button>
                                <button
                                  onClick={() => { setImagePromptJobId(null); setImagePrompt(""); }}
                                  className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                                >
                                  {t("cancelImagePrompt")}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Edit image input (img2img) */}
                          {editImageJobId === post.jobId && (
                            <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
                              <p className="text-xs text-gray-500">{t("editImageHint")}</p>
                              <textarea
                                value={editInstruction}
                                onChange={(e) => setEditInstruction(e.target.value)}
                                placeholder={t("editImagePlaceholder")}
                                rows={2}
                                maxLength={500}
                                className="w-full border rounded px-3 py-2 text-sm resize-none bg-white"
                              />
                              {/* Aspect ratio selector */}
                              <div className="flex gap-1 flex-wrap">
                                {ASPECT_RATIOS.map((ar) => (
                                  <button
                                    key={ar.value}
                                    type="button"
                                    onClick={() => setEditAspectRatio(ar.value)}
                                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                                      editAspectRatio === ar.value
                                        ? "bg-black text-white border-black"
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
                                  className="text-xs px-3 py-1.5 bg-black text-white rounded disabled:opacity-50"
                                >
                                  {t("applyEdit")}
                                </button>
                                <button
                                  onClick={() => { setEditImageJobId(null); setEditInstruction(""); }}
                                  className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                                >
                                  {t("cancelImagePrompt")}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ── Other actions ── */}
                        <div className="flex gap-2 flex-wrap">
                          {/* Infographic card */}
                          {!cardJobIds.has(post.jobId) ? (
                            <button
                              onClick={() => setCardJobIds((prev) => new Set([...prev, post.jobId]))}
                              className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                            >
                              {t("generateCard")}
                            </button>
                          ) : (
                            <a
                              href={`/api/og/${post.jobId}`}
                              download={`post-${post.jobId}.png`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                            >
                              {t("downloadCard")}
                            </a>
                          )}

                          {/* Publish to Meta */}
                          {publishedJobIds.has(post.jobId) ? (
                            <span className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded">
                              {t("publishedToMeta")}
                            </span>
                          ) : (
                            <button
                              onClick={() => void handlePublishToMeta(post.jobId)}
                              disabled={publishingJobId === post.jobId}
                              className="text-xs px-3 py-1.5 bg-[#1877f2] text-white rounded hover:bg-[#1465d1] disabled:opacity-50 transition-colors"
                            >
                              {publishingJobId === post.jobId ? t("publishingToMeta") : t("publishToMeta")}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {post.status === "failed" && (
                  <p className="text-sm text-red-600">{t("failed")}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* ── Generating indicator ── */}
        {isGenerating && (
          <div className="flex gap-2 items-start">
            {activeJob?.instruction && (
              <div className="mb-2 flex gap-2 items-start w-full">
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">U</div>
                <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-700">{activeJob.instruction}</div>
              </div>
            )}
            <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center text-xs font-medium text-white shrink-0 mt-0.5">AI</div>
            <div className="bg-white rounded-lg shadow p-4 flex-1 text-sm text-gray-400 animate-pulse">{t("generatingMessage")}</div>
          </div>
        )}

        {/* ── Conversational image activity indicator ── */}
        {imageActivity && (
          <div>
            <div className="mb-2 flex gap-2 items-start w-full">
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">U</div>
              <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-700">{imageActivity.instruction}</div>
            </div>
            <div className="flex gap-2 items-start">
              <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center text-xs font-medium text-white shrink-0 mt-0.5">AI</div>
              <div className="bg-white rounded-lg shadow p-4 flex-1 text-sm text-gray-400 animate-pulse">{t("generatingImage")}</div>
            </div>
          </div>
        )}

        {/* ── Refinement input ── */}
        {latestCompleted && !isGenerating && !imageActivity && (
          <div className="space-y-1.5">
            <form onSubmit={handleRefine} className="flex gap-2">
              <input
                type="text"
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                placeholder={t("refinePlaceholder")}
                maxLength={500}
                className="flex-1 border rounded px-3 py-2 text-sm"
                disabled={refining}
              />
              <button
                type="submit"
                disabled={refining || !refineText.trim()}
                className="bg-black text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50 shrink-0"
              >
                {refining ? t("refining") : t("refine")}
              </button>
            </form>
            <p className="text-xs text-gray-400 px-1">{t("refineHint")}</p>
          </div>
        )}

        {formError && hasThread && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{formError}</p>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
