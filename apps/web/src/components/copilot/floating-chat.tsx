"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingAction = {
  id: string;
  type: string;
  label: string;
  args: Record<string, unknown>;
  requiresConfirm: boolean;
};

type CopilotMessage = {
  id: string;
  role: string;
  content: string;
  pendingActions: PendingAction[] | null;
  actionResults: Record<string, unknown> | null;
  confirmed: boolean | null;
  createdAt: string | Date;
};

// ─── Pending action card ──────────────────────────────────────────────────────

function ActionCard({
  action,
  messageId,
  onConfirmed,
}: {
  action: PendingAction;
  messageId: string;
  onConfirmed: () => void;
}) {
  const t = useTranslations("Copilot");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  async function handleConfirm() {
    setRunning(true);
    setError(false);
    try {
      await trpc.copilot.executeAction.mutate({ messageId, actionId: action.id });
      setDone(true);
      onConfirmed();
    } catch {
      setError(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
      <p className="font-medium text-purple-800">{action.label}</p>
      {!done && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={running}
            className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {running ? t("confirming") : t("confirm")}
          </button>
        </div>
      )}
      {done && <p className="mt-1 text-xs text-green-600">✓ {t("actionDone")}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{t("actionFailed")}</p>}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onActionConfirmed,
}: {
  msg: CopilotMessage;
  onActionConfirmed: () => void;
}) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-purple-600 text-white"
            : "border border-gray-200 bg-white text-gray-800 shadow-sm"
        }`}
      >
        <p className="whitespace-pre-wrap">{msg.content}</p>
        {!isUser && msg.pendingActions && msg.confirmed !== true && (
          <div className="mt-1">
            {msg.pendingActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                messageId={msg.id}
                onConfirmed={onActionConfirmed}
              />
            ))}
          </div>
        )}
        {!isUser && msg.confirmed === true && (
          <p className="mt-1 text-xs text-green-600 opacity-80">✓ Action completed</p>
        )}
      </div>
    </div>
  );
}

// ─── Main floating chat ───────────────────────────────────────────────────────

export function FloatingChat() {
  const t = useTranslations("Copilot");
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load thread messages when threadId is available.
  const loadThread = useCallback(async (tid: string) => {
    try {
      const data = await trpc.copilot.getThread.query({ threadId: tid });
      setMessages(data as CopilotMessage[]);
    } catch {
      // Silently ignore — thread may not exist yet.
    }
  }, []);

  useEffect(() => {
    if (threadId) void loadThread(threadId);
  }, [threadId, loadThread]);

  // Scroll to bottom when messages change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cmd+K / Ctrl+K toggle.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    // Optimistic user message.
    const tmpId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tmpId,
        role: "user",
        content: text,
        pendingActions: null,
        actionResults: null,
        confirmed: null,
        createdAt: new Date(),
      },
    ]);

    try {
      const data = await trpc.copilot.sendMessage.mutate({ threadId, message: text });
      setThreadId(data.threadId);
      // Reload full thread to get proper server-assigned IDs + assistant reply.
      await loadThread(data.threadId);
    } catch {
      // Replace optimistic message with error notice.
      setMessages((prev) =>
        prev.map((m) => (m.id === tmpId ? { ...m, id: `err-${Date.now()}`, content: text } : m)),
      );
    } finally {
      setSending(false);
    }
  }, [input, threadId, sending, loadThread]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("openCopilot")}
        title={`${t("openCopilot")} (⌘K)`}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
      >
        {open ? (
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.346A2 2 0 0113.586 19H10.414a2 2 0 01-1.414-.586l-.347-.346z"
            />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-purple-600 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">{t("title")}</p>
              <p className="text-xs text-purple-200">{t("subtitle")}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-purple-200 hover:text-white"
              aria-label={t("close")}
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
                <svg
                  className="mb-3 h-8 w-8 opacity-40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.346A2 2 0 0113.586 19H10.414a2 2 0 01-1.414-.586l-.347-.346z"
                  />
                </svg>
                <p className="text-sm">{t("emptyState")}</p>
                <p className="mt-1 text-xs opacity-70">{t("emptyStateHint")}</p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onActionConfirmed={() => {
                  if (threadId) void loadThread(threadId);
                }}
              />
            ))}
            {sending && (
              <div className="mb-3 flex justify-start">
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-purple-400 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-purple-400 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-purple-400" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-gray-200 bg-white px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("inputPlaceholder")}
                rows={1}
                className="max-h-28 flex-1 resize-none overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                style={{ minHeight: "38px" }}
              />
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || sending}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("send")}
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 text-center text-xs text-gray-400">{t("keyboardHint")}</p>
          </div>
        </div>
      )}
    </>
  );
}
