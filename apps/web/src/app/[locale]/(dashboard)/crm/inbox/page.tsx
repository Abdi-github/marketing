"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "../../../../../lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = "email" | "sms" | "whatsapp";

type Thread = {
  contactId: string;
  channel: string;
  lastMessageAt: string;
  totalMessages: number;
  lastBody: string;
  lastDirection: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

type Message = {
  id: string;
  tenantId: string;
  contactId: string | null;
  channel: string;
  direction: string;
  fromAddress: string;
  toAddress: string;
  body: string;
  status: string;
  externalId: string | null;
  occurredAt: string | Date;
};

// ─── Channel icon ─────────────────────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: string }) {
  const color = channel === "whatsapp" ? "#25D366" : channel === "sms" ? "#3b82f6" : "#6b7280";
  const label = channel === "whatsapp" ? "WA" : channel === "sms" ? "SMS" : "✉";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.4rem",
        borderRadius: 4,
        background: color,
        color: "#fff",
        fontSize: "0.65rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {label}
    </span>
  );
}

// ─── Thread list item ─────────────────────────────────────────────────────────

function ThreadItem({
  thread,
  active,
  onClick,
}: {
  thread: Thread;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "0.75rem 1rem",
        background: active ? "#eff6ff" : "transparent",
        borderBottom: "1px solid #f3f4f6",
        cursor: "pointer",
        borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent",
        display: "block",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.25rem" }}
      >
        <ChannelBadge channel={thread.channel} />
        <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#111827" }}>
          {thread.contactName}
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "0.75rem",
          color: "#6b7280",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 220,
        }}
      >
        {thread.lastDirection === "outbound" ? "↑ " : "↓ "}
        {thread.lastBody}
      </p>
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, t }: { message: Message; t: (key: string) => string }) {
  const isOut = message.direction === "outbound";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isOut ? "flex-end" : "flex-start",
        marginBottom: "0.5rem",
      }}
    >
      <div
        style={{
          maxWidth: "70%",
          padding: "0.6rem 0.9rem",
          borderRadius: isOut ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
          background: isOut ? "#3b82f6" : "#f3f4f6",
          color: isOut ? "#fff" : "#111827",
          fontSize: "0.875rem",
          lineHeight: 1.5,
        }}
      >
        <p style={{ margin: 0 }}>{message.body}</p>
        <p
          style={{
            margin: "0.25rem 0 0",
            fontSize: "0.65rem",
            opacity: 0.7,
            textAlign: "right",
          }}
        >
          {isOut ? t("you") : ""}{" "}
          {new Date(message.occurredAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const t = useTranslations("Inbox");

  const [channelFilter, setChannelFilter] = useState<Channel | undefined>(undefined);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState(false);

  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load threads.
  useEffect(() => {
    setThreadsLoading(true);
    setThreadsError(false);
    trpc.inbox.listThreads
      .query({ channel: channelFilter, limit: 50, offset: 0 })
      .then((rows) => setThreads(rows as unknown as Thread[]))
      .catch(() => setThreadsError(true))
      .finally(() => setThreadsLoading(false));
  }, [channelFilter]);

  // Load thread messages when active thread changes.
  useEffect(() => {
    if (!activeThread) return;
    setMessagesLoading(true);
    setMessages([]);
    trpc.inbox.getThread
      .query({
        contactId: activeThread.contactId,
        channel: activeThread.channel as Channel,
        limit: 100,
      })
      .then((rows) => setMessages(rows as unknown as Message[]))
      .catch(() => {})
      .finally(() => setMessagesLoading(false));
  }, [activeThread]);

  // Scroll to latest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!activeThread || !replyText.trim() || activeThread.channel !== "whatsapp") return;
    const phone = activeThread.contactPhone;
    if (!phone) return;
    setSending(true);
    setSendError(false);
    try {
      await trpc.inbox.sendWhatsApp.mutate({
        contactId: activeThread.contactId,
        toPhone: phone,
        text: replyText.trim(),
      });
      setReplyText("");
      // Refresh messages.
      const rows = await trpc.inbox.getThread.query({
        contactId: activeThread.contactId,
        channel: "whatsapp",
        limit: 100,
      });
      setMessages(rows as unknown as Message[]);
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  }

  const CHANNEL_TABS: Array<{ key: Channel | undefined; label: string }> = [
    { key: undefined, label: t("allChannels") },
    { key: "whatsapp", label: t("whatsapp") },
    { key: "sms", label: t("sms") },
    { key: "email", label: t("email") },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>{t("title")}</h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        {t("subtitle")}
      </p>

      {/* Channel filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        {CHANNEL_TABS.map((tab) => (
          <button
            key={tab.key ?? "all"}
            onClick={() => {
              setChannelFilter(tab.key);
              setActiveThread(null);
            }}
            style={{
              padding: "0.375rem 0.875rem",
              borderRadius: 6,
              border: "1px solid",
              borderColor: channelFilter === tab.key ? "#3b82f6" : "#e5e7eb",
              background: channelFilter === tab.key ? "#eff6ff" : "#fff",
              color: channelFilter === tab.key ? "#3b82f6" : "#374151",
              fontWeight: channelFilter === tab.key ? 600 : 400,
              fontSize: "0.825rem",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Two-panel layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: "1rem",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          overflow: "hidden",
          minHeight: 560,
        }}
      >
        {/* Thread list */}
        <div style={{ borderRight: "1px solid #e5e7eb", overflowY: "auto" }}>
          {threadsLoading && (
            <p style={{ padding: "1rem", color: "#6b7280", fontSize: "0.875rem" }}>
              {t("loading")}
            </p>
          )}
          {threadsError && (
            <p style={{ padding: "1rem", color: "#ef4444", fontSize: "0.875rem" }}>
              {t("loadError")}
            </p>
          )}
          {!threadsLoading && !threadsError && threads.length === 0 && (
            <div style={{ padding: "2rem 1rem", textAlign: "center" }}>
              <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{t("empty")}</p>
              <p style={{ color: "#6b7280", fontSize: "0.8rem" }}>{t("emptyHint")}</p>
            </div>
          )}
          {threads.map((thread) => (
            <ThreadItem
              key={`${thread.contactId}-${thread.channel}`}
              thread={thread}
              active={
                activeThread?.contactId === thread.contactId &&
                activeThread?.channel === thread.channel
              }
              onClick={() => setActiveThread(thread)}
            />
          ))}
        </div>

        {/* Message panel */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {!activeThread ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
                fontSize: "0.875rem",
              }}
            >
              {t("noThreadSelected")}
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "#fafafa",
                }}
              >
                <ChannelBadge channel={activeThread.channel} />
                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  {activeThread.contactName}
                </span>
                {activeThread.contactPhone && (
                  <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                    {activeThread.contactPhone}
                  </span>
                )}
              </div>

              {/* Messages */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "1rem",
                  minHeight: 400,
                  maxHeight: 460,
                }}
              >
                {messagesLoading && (
                  <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>{t("loading")}</p>
                )}
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} t={t} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply box — only WhatsApp supports manual send for now */}
              {activeThread.channel === "whatsapp" && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    borderTop: "1px solid #e5e7eb",
                    display: "flex",
                    gap: "0.5rem",
                    background: "#fafafa",
                  }}
                >
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void handleSend()}
                    placeholder={t("sendPlaceholder")}
                    disabled={sending}
                    style={{
                      flex: 1,
                      padding: "0.5rem 0.75rem",
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                      fontSize: "0.875rem",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={sending || !replyText.trim()}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: 6,
                      background: "#25D366",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "0.825rem",
                      border: "none",
                      cursor: sending || !replyText.trim() ? "not-allowed" : "pointer",
                      opacity: sending || !replyText.trim() ? 0.6 : 1,
                    }}
                  >
                    {sending ? t("sending") : t("send")}
                  </button>
                </div>
              )}
              {sendError && (
                <p style={{ padding: "0 1rem 0.5rem", color: "#ef4444", fontSize: "0.75rem" }}>
                  {t("sendError")}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
