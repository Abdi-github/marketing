"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "../../../../../lib/trpc";

type Channel = "email" | "sms" | "whatsapp";

type Thread = {
  contactId: string;
  channel: string;
  lastMessageAt: string;
  lastInboundAt: string | null;
  totalMessages: number;
  lastBody: string;
  lastDirection: string;
  lastStatus: string;
  lastMessageType: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

type ThreadKey = `${string}:${Channel}`;

type Message = {
  id: string;
  tenantId: string;
  contactId: string | null;
  channel: string;
  direction: string;
  fromAddress: string;
  toAddress: string;
  body: string;
  messageType: string;
  policyState: string | null;
  errorMessage: string | null;
  meta: Record<string, unknown>;
  status: string;
  externalId: string | null;
  occurredAt: string | Date;
};

type ThreadContext = Awaited<ReturnType<typeof trpc.inbox.getThreadContext.query>>;

type AutomationIssue = Awaited<ReturnType<typeof trpc.inbox.listAutomationIssues.query>>[number];

function threadKey(thread: Pick<Thread, "contactId" | "channel">): ThreadKey {
  return `${thread.contactId}:${thread.channel as Channel}`;
}

function threadMatchesSearch(thread: Thread, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    thread.contactName,
    thread.contactEmail,
    thread.contactPhone,
    thread.lastBody,
    thread.channel,
    thread.lastStatus,
    thread.lastMessageType,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function statusTone(status: string): string {
  if (status === "failed" || status === "undelivered") return "#dc2626";
  if (status === "queued") return "#b45309";
  if (status === "delivered" || status === "sent" || status === "read") return "#059669";
  return "#475569";
}

function ChannelBadge({ channel }: { channel: string }) {
  const color = channel === "whatsapp" ? "#25D366" : channel === "sms" ? "#3b82f6" : "#6b7280";
  const label = channel === "whatsapp" ? "WA" : channel === "sms" ? "SMS" : "MAIL";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.45rem",
        borderRadius: 999,
        background: color,
        color: "#fff",
        fontSize: "0.68rem",
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function TinyBadge({
  label,
  tone = "#475569",
  background,
}: {
  label: string;
  tone?: string;
  background?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "0.15rem 0.45rem",
        fontSize: "0.7rem",
        fontWeight: 700,
        color: tone,
        background: background ?? `${tone}18`,
        textTransform: "capitalize",
      }}
    >
      {label}
    </span>
  );
}

function formatWorkflowKind(kind: string | null | undefined): string {
  if (!kind) return "general";
  if (kind === "booking") return "reservation";
  return kind.replace(/_/g, " ");
}

function formatWorkflowState(state: string | null | undefined): string {
  if (!state) return "received";
  return state.replace(/_/g, " ");
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "n/a";
  return new Date(value).toLocaleString("de-CH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getFacts(context: ThreadContext | null): Array<{ label: string; value: string }> {
  const structured = context?.structuredData ?? {};
  const facts =
    structured["facts"] && typeof structured["facts"] === "object"
      ? (structured["facts"] as Record<string, unknown>)
      : {};

  const rows: Array<{ label: string; value: string }> = [];
  const reservationDate =
    typeof facts["reservationDate"] === "string" ? facts["reservationDate"] : null;
  const reservationTime =
    typeof facts["reservationTime"] === "string" ? facts["reservationTime"] : null;
  const partySize =
    typeof facts["partySize"] === "number" || typeof facts["partySize"] === "string"
      ? String(facts["partySize"])
      : null;
  const locationLabel = typeof facts["locationLabel"] === "string" ? facts["locationLabel"] : null;
  const customerName = typeof facts["customerName"] === "string" ? facts["customerName"] : null;
  const attachmentCount =
    typeof facts["attachmentCount"] === "number" ? String(facts["attachmentCount"]) : null;

  if (customerName) rows.push({ label: "Customer", value: customerName });
  if (reservationDate) rows.push({ label: "Date", value: reservationDate });
  if (reservationTime) rows.push({ label: "Time", value: reservationTime });
  if (partySize) rows.push({ label: "Party size", value: partySize });
  if (locationLabel) rows.push({ label: "Location", value: locationLabel });
  if (attachmentCount) rows.push({ label: "Attachments", value: attachmentCount });

  return rows;
}

function workflowButtonStyle(color: string): React.CSSProperties {
  return {
    border: "none",
    borderRadius: 8,
    background: color,
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.78rem",
    fontWeight: 700,
    padding: "0.45rem 0.7rem",
  };
}

function ThreadItem({
  thread,
  active,
  selected,
  deleting,
  onClick,
  onToggleSelected,
  onDelete,
}: {
  thread: Thread;
  active: boolean;
  selected: boolean;
  deleting: boolean;
  onClick: () => void;
  onToggleSelected: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "0.8rem 1rem",
        background: active ? "#eff6ff" : "#fff",
        borderBottom: "1px solid #f1f5f9",
        borderLeft: active ? "3px solid #2563eb" : "3px solid transparent",
        cursor: "pointer",
        display: "block",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.3rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", minWidth: 0 }}>
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select ${thread.contactName} ${thread.channel} conversation`}
            onChange={(event) => {
              event.stopPropagation();
              onToggleSelected();
            }}
            onClick={(event) => event.stopPropagation()}
            style={{ cursor: "pointer" }}
          />
          <ChannelBadge channel={thread.channel} />
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.88rem",
              color: "#111827",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {thread.contactName}
          </span>
        </div>
        <span style={{ fontSize: "0.7rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
          {formatDateTime(thread.lastMessageAt)}
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "0.78rem",
          color: "#64748b",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {thread.lastDirection === "outbound" ? "Sent: " : "Received: "}
        {thread.lastBody}
      </p>
      <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.45rem", flexWrap: "wrap" }}>
        <TinyBadge label={thread.lastStatus} tone={statusTone(thread.lastStatus)} />
        <TinyBadge label={thread.lastMessageType} tone="#7c3aed" />
        <span style={{ marginLeft: "auto" }}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            disabled={deleting}
            style={{
              border: "1px solid #fecaca",
              borderRadius: 999,
              background: "#fff",
              color: "#dc2626",
              cursor: deleting ? "not-allowed" : "pointer",
              fontSize: "0.68rem",
              fontWeight: 800,
              padding: "0.15rem 0.5rem",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            Delete
          </button>
        </span>
      </div>
    </div>
  );
}

function MessageBubble({ message, t }: { message: Message; t: (key: string) => string }) {
  const isOut = message.direction === "outbound";
  const bubbleTone = message.status === "failed" ? "#fef2f2" : isOut ? "#2563eb" : "#f3f4f6";
  const bubbleText = message.status === "failed" ? "#991b1b" : isOut ? "#fff" : "#111827";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isOut ? "flex-end" : "flex-start",
        marginBottom: "0.7rem",
      }}
    >
      <div
        style={{
          maxWidth: "72%",
          padding: "0.7rem 0.9rem",
          borderRadius: isOut ? "14px 14px 6px 14px" : "14px 14px 14px 6px",
          background: bubbleTone,
          color: bubbleText,
          fontSize: "0.875rem",
          lineHeight: 1.5,
          border: message.status === "failed" ? "1px solid #fecaca" : "none",
        }}
      >
        <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
          <TinyBadge label={message.messageType} tone={isOut ? "#dbeafe" : "#475569"} />
          {message.policyState ? (
            <TinyBadge label={message.policyState} tone={isOut ? "#dbeafe" : "#7c3aed"} />
          ) : null}
          {message.status !== "sent" ? (
            <TinyBadge
              label={message.status}
              tone={message.status === "failed" ? "#dc2626" : "#475569"}
            />
          ) : null}
        </div>
        <p style={{ margin: 0 }}>{message.body}</p>
        {message.errorMessage ? (
          <p style={{ margin: "0.45rem 0 0", fontSize: "0.72rem", color: "#b91c1c" }}>
            {message.errorMessage}
          </p>
        ) : null}
        <p
          style={{
            margin: "0.35rem 0 0",
            fontSize: "0.68rem",
            opacity: 0.8,
            textAlign: "right",
          }}
        >
          {isOut ? t("you") : "Lead"} {formatDateTime(message.occurredAt)}
        </p>
      </div>
    </div>
  );
}

export default function InboxPage() {
  const t = useTranslations("Inbox");
  const [channelFilter, setChannelFilter] = useState<Channel | undefined>(undefined);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [selectedThreadKeys, setSelectedThreadKeys] = useState<Set<ThreadKey>>(new Set());
  const [deletingThreadKeys, setDeletingThreadKeys] = useState<Set<ThreadKey>>(new Set());
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [threadContext, setThreadContext] = useState<ThreadContext | null>(null);
  const [issues, setIssues] = useState<AutomationIssue[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsError(false);
    try {
      const rows = await trpc.inbox.listThreads.query({
        channel: channelFilter,
        limit: 100,
        offset: 0,
      });
      setThreads(rows as Thread[]);
    } catch {
      setThreadsError(true);
    } finally {
      setThreadsLoading(false);
    }
  }, [channelFilter]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    trpc.inbox.listAutomationIssues
      .query({ limit: 8 })
      .then((rows) => setIssues(rows))
      .catch(() => setIssues([]));
  }, []);

  useEffect(() => {
    if (!activeThread) {
      setMessages([]);
      setThreadContext(null);
      return;
    }

    setMessagesLoading(true);
    setMessages([]);
    setThreadContext(null);

    Promise.all([
      trpc.inbox.getThread.query({
        contactId: activeThread.contactId,
        channel: activeThread.channel as Channel,
        limit: 100,
      }),
      trpc.inbox.getThreadContext.query({
        contactId: activeThread.contactId,
        channel: activeThread.channel as Channel,
      }),
    ])
      .then(([messageRows, context]) => {
        setMessages(messageRows as Message[]);
        setThreadContext(context);
      })
      .catch(() => {
        setMessages([]);
        setThreadContext(null);
      })
      .finally(() => setMessagesLoading(false));
  }, [activeThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const serviceWindowClosed =
    activeThread?.channel === "whatsapp" &&
    threadContext?.serviceWindow &&
    !threadContext.serviceWindow.open;
  const canReplyByChannel = activeThread?.channel === "whatsapp" || activeThread?.channel === "sms";
  const smsCharacterCount = replyText.trim().length;
  const smsSegmentCount =
    smsCharacterCount === 0 ? 0 : smsCharacterCount <= 160 ? 1 : Math.ceil(smsCharacterCount / 153);
  const smsTooLong = activeThread?.channel === "sms" && smsCharacterCount > 459;

  async function refreshActiveThread(thread = activeThread) {
    if (!thread) return;
    const [messageRows, context, issueRows] = await Promise.all([
      trpc.inbox.getThread.query({
        contactId: thread.contactId,
        channel: thread.channel as Channel,
        limit: 100,
      }),
      trpc.inbox.getThreadContext.query({
        contactId: thread.contactId,
        channel: thread.channel as Channel,
      }),
      trpc.inbox.listAutomationIssues.query({ limit: 8 }),
    ]);
    setMessages(messageRows as Message[]);
    setThreadContext(context);
    setIssues(issueRows);
  }

  async function updateWorkflowStatus(input: {
    status: "new" | "contacted" | "confirmed" | "qualified" | "archived";
    workflowState:
      | "received"
      | "missing_details"
      | "awaiting_confirmation"
      | "contacted"
      | "confirmed"
      | "declined"
      | "cancelled"
      | "manual_review";
  }) {
    if (!threadContext?.leadId) return;
    await trpc.inbox.updateLeadWorkflowStatus.mutate({
      leadId: threadContext.leadId,
      ...input,
    });
    await refreshActiveThread();
  }

  async function handleSend() {
    if (!activeThread || !replyText.trim() || !canReplyByChannel) return;
    if (activeThread.channel === "whatsapp" && serviceWindowClosed) {
      setSendError(
        "This thread is outside the 24-hour WhatsApp service window. Template sending is the next rollout step.",
      );
      return;
    }
    if (activeThread.channel === "sms" && smsTooLong) {
      setSendError("SMS replies are limited to 459 characters to avoid costly long messages.");
      return;
    }

    const phone = activeThread.contactPhone;
    if (!phone) return;

    setSending(true);
    setSendError(null);
    try {
      if (activeThread.channel === "whatsapp") {
        await trpc.inbox.sendWhatsApp.mutate({
          contactId: activeThread.contactId,
          toPhone: phone,
          text: replyText.trim(),
        });
      } else {
        await trpc.inbox.sendSms.mutate({
          contactId: activeThread.contactId,
          toPhone: phone,
          text: replyText.trim(),
        });
      }
      setReplyText("");
      await refreshActiveThread(activeThread);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }

  const channelTabs: Array<{ key: Channel | undefined; label: string }> = [
    { key: undefined, label: t("allChannels") },
    { key: "whatsapp", label: t("whatsapp") },
    { key: "sms", label: t("sms") },
    { key: "email", label: t("email") },
  ];

  const extractedFacts = useMemo(() => getFacts(threadContext), [threadContext]);
  const filteredThreads = useMemo(
    () => threads.filter((thread) => threadMatchesSearch(thread, threadSearch)),
    [threads, threadSearch],
  );
  const selectedThreads = useMemo(
    () => threads.filter((thread) => selectedThreadKeys.has(threadKey(thread))),
    [threads, selectedThreadKeys],
  );
  const failedThreadCount = threads.filter((thread) => thread.lastStatus === "failed").length;
  const waitingThreadCount = threads.filter(
    (thread) => thread.lastDirection === "inbound" || thread.lastStatus === "queued",
  ).length;

  function toggleThreadSelection(thread: Thread) {
    const key = threadKey(thread);
    setSelectedThreadKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllFilteredThreads() {
    setSelectedThreadKeys((current) => {
      const next = new Set(current);
      const allSelected =
        filteredThreads.length > 0 &&
        filteredThreads.every((thread) => next.has(threadKey(thread)));
      for (const thread of filteredThreads) {
        const key = threadKey(thread);
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  async function deleteConversations(targetThreads: Thread[]) {
    if (targetThreads.length === 0) return;
    const label =
      targetThreads.length === 1
        ? `${targetThreads[0]!.contactName} ${targetThreads[0]!.channel} conversation`
        : `${targetThreads.length} conversations`;
    if (
      !confirm(`Delete ${label}? This removes the Inbox messages only. The CRM contact remains.`)
    ) {
      return;
    }

    const keys = targetThreads.map(threadKey);
    setDeletingThreadKeys((current) => new Set([...current, ...keys]));
    setDeleteNotice(null);
    try {
      const result =
        targetThreads.length === 1
          ? await trpc.inbox.deleteThread.mutate({
              contactId: targetThreads[0]!.contactId,
              channel: targetThreads[0]!.channel as Channel,
            })
          : await trpc.inbox.deleteThreads.mutate({
              threads: targetThreads.map((thread) => ({
                contactId: thread.contactId,
                channel: thread.channel as Channel,
              })),
            });

      setDeleteNotice(
        `${targetThreads.length === 1 ? "Conversation" : "Conversations"} deleted. ${result.deletedCount} message${result.deletedCount === 1 ? "" : "s"} removed from Inbox.`,
      );
      setSelectedThreadKeys((current) => {
        const next = new Set(current);
        keys.forEach((key) => next.delete(key));
        return next;
      });
      if (activeThread && keys.includes(threadKey(activeThread))) {
        setActiveThread(null);
        setMessages([]);
        setThreadContext(null);
      }
      await Promise.all([
        loadThreads(),
        trpc.inbox.listAutomationIssues
          .query({ limit: 8 })
          .then((rows) => setIssues(rows))
          .catch(() => setIssues([])),
      ]);
    } finally {
      setDeletingThreadKeys((current) => {
        const next = new Set(current);
        keys.forEach((key) => next.delete(key));
        return next;
      });
    }
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>{t("title")}</h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        {t("subtitle")}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        {[
          { label: "Open conversations", value: threads.length, tone: "#2563eb" },
          { label: "Needs staff attention", value: waitingThreadCount, tone: "#b45309" },
          { label: "Failed messages", value: failedThreadCount, tone: "#dc2626" },
          { label: "Automation issues", value: issues.length, tone: "#7c3aed" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              background: "#fff",
              padding: "0.9rem 1rem",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div style={{ color: "#64748b", fontSize: "0.75rem", fontWeight: 700 }}>
              {item.label}
            </div>
            <div style={{ color: item.tone, fontSize: "1.45rem", fontWeight: 800 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          border: "1px solid #dbeafe",
          borderRadius: 10,
          background: "#eff6ff",
          color: "#1e3a8a",
          fontSize: "0.85rem",
          lineHeight: 1.55,
          marginBottom: "1rem",
          padding: "0.85rem 1rem",
        }}
      >
        The Inbox is where customer replies become staff work. Use it to answer SMS and WhatsApp
        messages, complete missing reservation details, and move a request toward confirmation.
      </div>

      {deleteNotice ? (
        <div
          style={{
            border: "1px solid #bbf7d0",
            borderRadius: 10,
            background: "#f0fdf4",
            color: "#166534",
            fontSize: "0.84rem",
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
          }}
        >
          {deleteNotice}
        </div>
      ) : null}

      {issues.length > 0 ? (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            background: "#fff",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
                Messaging automation attention
              </h2>
              <p style={{ color: "#64748b", fontSize: "0.82rem", margin: "0.3rem 0 0" }}>
                Leads waiting for confirmation, missing details, or failed WhatsApp/SMS replies.
              </p>
            </div>
            <TinyBadge label={`${issues.length} open`} tone="#b45309" />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "0.75rem",
              marginTop: "0.9rem",
            }}
          >
            {issues.map((issue) => (
              <button
                key={issue.id}
                onClick={() => {
                  if (!issue.contactId) return;
                  const thread = threads.find((item) => item.contactId === issue.contactId);
                  if (thread) setActiveThread(thread);
                }}
                style={{
                  textAlign: "left",
                  border: "1px solid #f1f5f9",
                  borderRadius: 8,
                  padding: "0.8rem",
                  background: "#fafafa",
                  cursor: issue.contactId ? "pointer" : "default",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "0.35rem",
                    flexWrap: "wrap",
                    marginBottom: "0.35rem",
                  }}
                >
                  <TinyBadge
                    label={
                      issue.type === "send_failed"
                        ? "send failed"
                        : formatWorkflowState(issue.workflowState)
                    }
                    tone={issue.type === "send_failed" ? "#dc2626" : "#b45309"}
                  />
                  {issue.workflowKind ? (
                    <TinyBadge label={formatWorkflowKind(issue.workflowKind)} tone="#7c3aed" />
                  ) : null}
                </div>
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#111827" }}>
                  {issue.contactName}
                </div>
                <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "0.2rem" }}>
                  {issue.detail}
                </div>
                <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.4rem" }}>
                  {formatDateTime(issue.occurredAt)}
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {channelTabs.map((tab) => (
            <button
              key={tab.key ?? "all"}
              onClick={() => {
                setChannelFilter(tab.key);
                setActiveThread(null);
                setSelectedThreadKeys(new Set());
              }}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: 999,
                border: "1px solid",
                borderColor: channelFilter === tab.key ? "#2563eb" : "#e5e7eb",
                background: channelFilter === tab.key ? "#eff6ff" : "#fff",
                color: channelFilter === tab.key ? "#2563eb" : "#334155",
                fontWeight: channelFilter === tab.key ? 800 : 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={threadSearch}
          onChange={(event) => setThreadSearch(event.target.value)}
          placeholder="Search customer, phone, email, or message..."
          style={{
            width: "min(100%, 340px)",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "0.55rem 0.75rem",
            fontSize: "0.84rem",
            outline: "none",
          }}
        />
      </div>

      {selectedThreadKeys.size > 0 ? (
        <div
          style={{
            alignItems: "center",
            background: "#111827",
            borderRadius: 12,
            color: "#fff",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            justifyContent: "space-between",
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
          }}
        >
          <strong style={{ fontSize: "0.85rem" }}>
            {selectedThreadKeys.size} conversation{selectedThreadKeys.size === 1 ? "" : "s"}{" "}
            selected
          </strong>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSelectedThreadKeys(new Set())}
              style={{
                background: "#374151",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                cursor: "pointer",
                fontSize: "0.78rem",
                fontWeight: 700,
                padding: "0.4rem 0.75rem",
              }}
            >
              Clear selection
            </button>
            <button
              type="button"
              onClick={() => void deleteConversations(selectedThreads)}
              disabled={deletingThreadKeys.size > 0}
              style={{
                background: "#dc2626",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                cursor: deletingThreadKeys.size > 0 ? "not-allowed" : "pointer",
                fontSize: "0.78rem",
                fontWeight: 800,
                padding: "0.4rem 0.75rem",
                opacity: deletingThreadKeys.size > 0 ? 0.65 : 1,
              }}
            >
              Delete selected
            </button>
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          gap: "1rem",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
          minHeight: 620,
          background: "#fff",
        }}
      >
        <div style={{ borderRight: "1px solid #e5e7eb", overflowY: "auto" }}>
          <div
            style={{
              alignItems: "center",
              background: "#f8fafc",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              gap: "0.6rem",
              justifyContent: "space-between",
              padding: "0.7rem 1rem",
              position: "sticky",
              top: 0,
              zIndex: 2,
            }}
          >
            <label
              style={{
                alignItems: "center",
                color: "#334155",
                display: "flex",
                fontSize: "0.78rem",
                fontWeight: 700,
                gap: "0.45rem",
              }}
            >
              <input
                type="checkbox"
                checked={
                  filteredThreads.length > 0 &&
                  filteredThreads.every((thread) => selectedThreadKeys.has(threadKey(thread)))
                }
                onChange={toggleAllFilteredThreads}
              />
              Select visible
            </label>
            <span style={{ color: "#64748b", fontSize: "0.74rem" }}>
              {filteredThreads.length} of {threads.length}
            </span>
          </div>
          {threadsLoading ? (
            <p style={{ padding: "1rem", color: "#6b7280", fontSize: "0.875rem" }}>
              {t("loading")}
            </p>
          ) : null}
          {threadsError ? (
            <p style={{ padding: "1rem", color: "#ef4444", fontSize: "0.875rem" }}>
              {t("loadError")}
            </p>
          ) : null}
          {!threadsLoading && !threadsError && filteredThreads.length === 0 ? (
            <div style={{ padding: "2rem 1rem", textAlign: "center" }}>
              <p style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                {threads.length === 0 ? t("empty") : "No conversations match your search"}
              </p>
              <p style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                {threads.length === 0
                  ? t("emptyHint")
                  : "Try another name, phone number, channel, or message keyword."}
              </p>
            </div>
          ) : null}
          {filteredThreads.map((thread) => (
            <ThreadItem
              key={`${thread.contactId}-${thread.channel}`}
              thread={thread}
              selected={selectedThreadKeys.has(threadKey(thread))}
              deleting={deletingThreadKeys.has(threadKey(thread))}
              active={
                activeThread?.contactId === thread.contactId &&
                activeThread?.channel === thread.channel
              }
              onClick={() => setActiveThread(thread)}
              onToggleSelected={() => toggleThreadSelection(thread)}
              onDelete={() => void deleteConversations([thread])}
            />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
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
              <div
                style={{
                  padding: "1rem",
                  borderBottom: "1px solid #e5e7eb",
                  background: "#fafafa",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <ChannelBadge channel={activeThread.channel} />
                      <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                        {activeThread.contactName}
                      </span>
                      {activeThread.contactPhone ? (
                        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                          {activeThread.contactPhone}
                        </span>
                      ) : null}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.35rem",
                        marginTop: "0.45rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {threadContext?.workflowKind ? (
                        <TinyBadge
                          label={formatWorkflowKind(threadContext.workflowKind)}
                          tone="#7c3aed"
                        />
                      ) : null}
                      {threadContext?.workflowState ? (
                        <TinyBadge
                          label={formatWorkflowState(threadContext.workflowState)}
                          tone="#b45309"
                        />
                      ) : null}
                      {threadContext?.sourceChannel ? (
                        <TinyBadge label={threadContext.sourceChannel} tone="#0f766e" />
                      ) : null}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.75rem", color: "#64748b" }}>
                    <div>Last automation: {formatDateTime(threadContext?.lastAutomationAt)}</div>
                    <div>Lead submitted: {formatDateTime(threadContext?.submittedAt)}</div>
                  </div>
                </div>

                {serviceWindowClosed && threadContext?.serviceWindow ? (
                  <div
                    style={{
                      marginTop: "0.8rem",
                      borderRadius: 8,
                      border: "1px solid #fed7aa",
                      background: "#fff7ed",
                      padding: "0.7rem 0.85rem",
                      color: "#9a3412",
                      fontSize: "0.8rem",
                    }}
                  >
                    This WhatsApp thread is outside the 24-hour service window. Plain text replies
                    are blocked until template sending is enabled. Window closed at{" "}
                    {formatDateTime(threadContext.serviceWindow.closesAt)}.
                  </div>
                ) : null}

                {threadContext?.lastFailureMessage ? (
                  <div
                    style={{
                      marginTop: "0.8rem",
                      borderRadius: 8,
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      padding: "0.7rem 0.85rem",
                      color: "#991b1b",
                      fontSize: "0.8rem",
                    }}
                  >
                    Last automation issue: {threadContext.lastFailureMessage}
                  </div>
                ) : null}

                {extractedFacts.length > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                      gap: "0.6rem",
                      marginTop: "0.8rem",
                    }}
                  >
                    {extractedFacts.map((fact) => (
                      <div
                        key={`${fact.label}-${fact.value}`}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          background: "#fff",
                          padding: "0.55rem 0.65rem",
                        }}
                      >
                        <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700 }}>
                          {fact.label}
                        </div>
                        <div
                          style={{ fontSize: "0.82rem", color: "#111827", marginTop: "0.15rem" }}
                        >
                          {fact.value}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {threadContext?.leadId ? (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                      marginTop: "0.85rem",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        void updateWorkflowStatus({
                          status: "contacted",
                          workflowState: "contacted",
                        })
                      }
                      style={workflowButtonStyle("#2563eb")}
                    >
                      Mark contacted
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void updateWorkflowStatus({
                          status: "confirmed",
                          workflowState: "confirmed",
                        })
                      }
                      style={workflowButtonStyle("#16a34a")}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void updateWorkflowStatus({
                          status: "archived",
                          workflowState: "declined",
                        })
                      }
                      style={workflowButtonStyle("#b45309")}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void updateWorkflowStatus({
                          status: "archived",
                          workflowState: "cancelled",
                        })
                      }
                      style={workflowButtonStyle("#64748b")}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "1rem",
                  minHeight: 380,
                  maxHeight: 460,
                }}
              >
                {messagesLoading ? (
                  <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>{t("loading")}</p>
                ) : null}
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} t={t} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {canReplyByChannel ? (
                <div
                  style={{
                    padding: "0.9rem 1rem",
                    borderTop: "1px solid #e5e7eb",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ display: "flex", gap: "0.6rem" }}>
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void handleSend()}
                      placeholder={
                        activeThread.channel === "sms"
                          ? "Write a short SMS reply..."
                          : t("sendPlaceholder")
                      }
                      disabled={sending || Boolean(serviceWindowClosed)}
                      style={{
                        flex: 1,
                        padding: "0.6rem 0.8rem",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        fontSize: "0.875rem",
                        outline: "none",
                        background: serviceWindowClosed ? "#f8fafc" : "#fff",
                      }}
                    />
                    <button
                      onClick={() => void handleSend()}
                      disabled={
                        sending || !replyText.trim() || Boolean(serviceWindowClosed) || smsTooLong
                      }
                      style={{
                        padding: "0.6rem 1rem",
                        borderRadius: 8,
                        background: serviceWindowClosed
                          ? "#94a3b8"
                          : activeThread.channel === "sms"
                            ? "#2563eb"
                            : "#25D366",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        border: "none",
                        cursor:
                          sending || !replyText.trim() || Boolean(serviceWindowClosed) || smsTooLong
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          sending || !replyText.trim() || Boolean(serviceWindowClosed) || smsTooLong
                            ? 0.7
                            : 1,
                      }}
                    >
                      {sending ? t("sending") : t("send")}
                    </button>
                  </div>
                  {activeThread.channel === "sms" ? (
                    <p
                      style={{
                        margin: "0.55rem 0 0",
                        color: smsTooLong ? "#dc2626" : "#64748b",
                        fontSize: "0.76rem",
                      }}
                    >
                      {smsCharacterCount}/459 characters, {smsSegmentCount} SMS segment
                      {smsSegmentCount === 1 ? "" : "s"}. Keep it short for cost and clarity.
                    </p>
                  ) : null}
                  {sendError ? (
                    <p style={{ margin: "0.55rem 0 0", color: "#dc2626", fontSize: "0.76rem" }}>
                      {sendError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
