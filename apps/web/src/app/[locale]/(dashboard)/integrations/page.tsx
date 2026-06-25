"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "../../../../lib/trpc";

type Connection = Awaited<ReturnType<typeof trpc.integrations.list.query>>[number];
type SyncRun = Awaited<ReturnType<typeof trpc.integrations.listSyncRuns.query>>[number];
type MetaWhatsappHealth = Awaited<ReturnType<typeof trpc.integrations.getMetaWhatsappHealth.query>>;
type SmsHealth = Awaited<ReturnType<typeof trpc.integrations.getSmsHealth.query>>;
type BusinessSmsSettings = Awaited<ReturnType<typeof trpc.sms.getBusinessSmsSettings.query>>;

const PROVIDER_META: Record<
  string,
  { label: string; description: string; vertical: string; hasWebhook: boolean; isOAuth?: boolean }
> = {
  meta: {
    label: "Meta (Facebook & Instagram)",
    description: "Publish posts directly to your Facebook page and Instagram account.",
    vertical: "All verticals",
    hasWebhook: false,
    isOAuth: true,
  },
  gastrofix: {
    label: "Gastrofix",
    description: "POS system for restaurants — reservations & menu sync.",
    vertical: "Restaurant / Café",
    hasWebhook: true,
  },
  lightspeed_ch: {
    label: "Lightspeed CH",
    description: "iKentoo-based POS for Switzerland — product catalogue import.",
    vertical: "Restaurant / Café",
    hasWebhook: false,
  },
  eversports: {
    label: "Eversports",
    description: "Booking system for fitness studios — class schedule sync.",
    vertical: "Fitness / Yoga",
    hasWebhook: true,
  },
};

const STATUS_COLOR: Record<Connection["status"], string> = {
  connected: "#22c55e",
  disconnected: "#9ca3af",
  error: "#ef4444",
  token_expired: "#f59e0b",
};

const STATUS_LABEL: Record<Connection["status"], string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
  token_expired: "Token expired",
};

export default function IntegrationsPage() {
  return (
    <Suspense fallback={null}>
      <IntegrationsPageContent />
    </Suspense>
  );
}

function IntegrationsPageContent() {
  const t = useTranslations("Integrations");
  const searchParams = useSearchParams();
  const params = useParams();
  const locale = typeof params.locale === "string" ? params.locale : "en";
  const metaParam = searchParams.get("meta");

  const verticalLabel = (v: string): string => {
    if (v === "All verticals") return t("vertical_all");
    if (v === "Restaurant / Café") return t("vertical_restaurant");
    if (v === "Fitness / Yoga") return t("vertical_fitness");
    return v;
  };

  const [connections, setConnections] = useState<Connection[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [metaWhatsappHealth, setMetaWhatsappHealth] = useState<MetaWhatsappHealth | null>(null);
  const [smsHealth, setSmsHealth] = useState<SmsHealth | null>(null);
  const [businessSmsSettings, setBusinessSmsSettings] = useState<BusinessSmsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(
    metaParam === "denied"
      ? "Meta connection was cancelled."
      : metaParam === "error"
        ? `Meta connection failed: ${searchParams.get("reason") ?? "unknown"}`
        : null,
  );
  const [success, setSuccess] = useState<string | null>(
    metaParam === "connected" ? "Facebook page connected successfully!" : null,
  );

  // Connect form state
  const [connectProvider, setConnectProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [accountIdInput, setAccountIdInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [metaConnecting, setMetaConnecting] = useState(false);
  const [whatsappTestPhone, setWhatsappTestPhone] = useState("");
  const [whatsappTesting, setWhatsappTesting] = useState(false);
  const [whatsappTestResult, setWhatsappTestResult] = useState<string | null>(null);
  const [smsTestPhone, setSmsTestPhone] = useState("");
  const [smsTesting, setSmsTesting] = useState(false);
  const [smsTestResult, setSmsTestResult] = useState<string | null>(null);
  const [businessPhoneInput, setBusinessPhoneInput] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [phoneVerificationBusy, setPhoneVerificationBusy] = useState(false);

  const loadConnections = useCallback(async () => {
    try {
      const [data, runs, metaHealth, sms, smsSettings] = await Promise.allSettled([
        trpc.integrations.list.query(),
        trpc.integrations.listSyncRuns.query({ limit: 20 }),
        trpc.integrations.getMetaWhatsappHealth.query(),
        trpc.integrations.getSmsHealth.query(),
        trpc.sms.getBusinessSmsSettings.query(),
      ]);
      setConnections(data.status === "fulfilled" ? data.value : []);
      setSyncRuns(runs.status === "fulfilled" ? runs.value : []);
      setMetaWhatsappHealth(metaHealth.status === "fulfilled" ? metaHealth.value : null);
      setSmsHealth(sms.status === "fulfilled" ? sms.value : null);
      setBusinessSmsSettings(smsSettings.status === "fulfilled" ? smsSettings.value : null);
    } catch (err) {
      setError(err instanceof Error ? friendlyIntegrationError(err.message) : "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    if (!syncRuns.some((run) => run.status === "queued" || run.status === "running")) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadConnections();
    }, 2500);

    return () => window.clearInterval(timer);
  }, [loadConnections, syncRuns]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!connectProvider || !apiKeyInput.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      const providerEnum = connectProvider as "gastrofix" | "lightspeed_ch" | "eversports";
      await trpc.integrations.connect.mutate({
        provider: providerEnum,
        apiKey: apiKeyInput,
        externalAccountId: accountIdInput || undefined,
      });
      setConnectProvider(null);
      setApiKeyInput("");
      setAccountIdInput("");
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindung fehlgeschlagen.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect(connectionId: string) {
    setError(null);
    try {
      await trpc.integrations.disconnect.mutate({ connectionId });
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed.");
    }
  }

  async function handleMetaConnect() {
    setMetaConnecting(true);
    setError(null);
    try {
      const { url } = await trpc.integrations.getMetaOAuthUrl.query();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Meta connection.");
      setMetaConnecting(false);
    }
  }

  async function handleSync(connectionId: string) {
    setSyncingId(connectionId);
    setError(null);
    setSuccess(null);
    try {
      const result = await trpc.integrations.sync.mutate({ connectionId });
      setSuccess(`Sync queued for ${PROVIDER_META[result.provider]?.label ?? result.provider}.`);
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncingId(null);
    }
  }

  async function handleWhatsappTest(e: React.FormEvent) {
    e.preventDefault();
    if (!whatsappTestPhone.trim()) return;
    setWhatsappTesting(true);
    setWhatsappTestResult(null);
    setError(null);
    try {
      const result = await trpc.integrations.sendWhatsappTestMessage.mutate({
        toPhone: whatsappTestPhone.trim(),
      });
      setWhatsappTestResult(`Test message sent to +${result.toPhone}.`);
      await loadConnections();
    } catch (err) {
      setWhatsappTestResult(null);
      setError(
        err instanceof Error ? friendlyIntegrationError(err.message) : "WhatsApp test failed.",
      );
    } finally {
      setWhatsappTesting(false);
    }
  }

  async function handleSmsTest(e: React.FormEvent) {
    e.preventDefault();
    if (!smsTestPhone.trim()) return;
    setSmsTesting(true);
    setSmsTestResult(null);
    setError(null);
    try {
      const result = await trpc.integrations.sendSmsTestMessage.mutate({
        toPhone: smsTestPhone.trim(),
      });
      setSmsTestResult(
        result.sandbox
          ? `Sandbox test recorded for ${result.toPhone}.`
          : `Test SMS queued for ${result.toPhone} through ${result.provider}. Delivery will update shortly.`,
      );
      await loadConnections();
    } catch (err) {
      setSmsTestResult(null);
      setError(err instanceof Error ? friendlyIntegrationError(err.message) : "SMS test failed.");
      await loadConnections();
    } finally {
      setSmsTesting(false);
    }
  }

  async function handleStartPhoneVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!businessPhoneInput.trim()) return;
    setPhoneVerificationBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await trpc.sms.startBusinessPhoneVerification.mutate({
        phone: businessPhoneInput.trim(),
      });
      setSuccess(`Verification code sent to ${result.phone}.`);
      await loadConnections();
    } catch (err) {
      setError(
        err instanceof Error ? friendlyIntegrationError(err.message) : "Phone verification failed.",
      );
    } finally {
      setPhoneVerificationBusy(false);
    }
  }

  async function handleConfirmPhoneVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!verificationCode.trim()) return;
    setPhoneVerificationBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await trpc.sms.confirmBusinessPhoneVerification.mutate({
        code: verificationCode.trim(),
      });
      setVerificationCode("");
      setBusinessPhoneInput("");
      setSuccess(`Business phone ${result.phone} verified.`);
      await loadConnections();
    } catch (err) {
      setError(
        err instanceof Error ? friendlyIntegrationError(err.message) : "Phone confirmation failed.",
      );
    } finally {
      setPhoneVerificationBusy(false);
    }
  }

  const connectedProviders = new Set(
    connections.filter((c) => c.status === "connected").map((c) => c.provider),
  );
  const smsConfigured = smsHealth?.configured ?? businessSmsSettings?.entitlement?.allowed ?? false;
  const smsPlan = smsHealth?.plan ?? businessSmsSettings?.plan ?? "trial";
  const smsVerifiedBusinessPhone =
    smsHealth?.verifiedBusinessPhone ?? businessSmsSettings?.businessPhone ?? null;
  const activeSyncConnectionIds = new Set(
    syncRuns
      .filter((run) => run.status === "queued" || run.status === "running")
      .map((run) => run.connectionId),
  );
  const connectedCount = connections.filter((c) => c.status === "connected").length;
  const attentionCount = connections.filter(
    (c) => c.status === "error" || c.status === "token_expired",
  ).length;
  const lastSyncRun = syncRuns[0];

  if (loading) {
    return (
      <div
        style={{
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>{t("title")}</h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem", fontSize: "0.9rem" }}>{t("subtitle")}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        <HealthCard label="Connected channels" value={String(connectedCount)} tone="#16a34a" />
        <HealthCard
          label="Needs attention"
          value={String(attentionCount)}
          tone={attentionCount > 0 ? "#dc2626" : "#64748b"}
        />
        <HealthCard
          label="Last sync"
          value={
            lastSyncRun
              ? formatDate(lastSyncRun.completedAt ?? lastSyncRun.createdAt)
              : "No sync yet"
          }
          tone="#4f46e5"
        />
      </div>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fff",
          padding: "1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: "#ecfdf5",
                  color: "#047857",
                  fontWeight: 900,
                  fontSize: "1rem",
                }}
              >
                W
              </span>
              <div>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>WhatsApp Business</h2>
                <p style={{ color: "#6b7280", fontSize: "0.82rem", margin: "0.2rem 0 0" }}>
                  Capture WhatsApp enquiries, save them to CRM, and send automatic replies.
                </p>
              </div>
            </div>
          </div>
          <span style={whatsappStatusBadgeStyle(metaWhatsappHealth)}>
            {formatWhatsappBusinessStatus(metaWhatsappHealth)}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#f8fafc",
              padding: "1rem",
            }}
          >
            <div
              style={{
                color: "#0f172a",
                fontSize: "0.85rem",
                fontWeight: 750,
                marginBottom: "0.7rem",
              }}
            >
              What this does for your business
            </div>
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <WhatsAppCapability
                label="New WhatsApp messages become CRM leads"
                enabled={metaWhatsappHealth ? metaWhatsappHealth.status !== "disconnected" : false}
              />
              <WhatsAppCapability
                label="Reservation, quote, and callback requests are classified"
                enabled={metaWhatsappHealth ? metaWhatsappHealth.status !== "disconnected" : false}
              />
              <WhatsAppCapability
                label="Automatic acknowledgements are sent when Meta accepts the token"
                enabled={
                  metaWhatsappHealth
                    ? metaWhatsappHealth.status === "connected" ||
                      metaWhatsappHealth.status === "test_mode"
                    : false
                }
              />
              <WhatsAppCapability
                label="Staff can review and reply from the Inbox"
                enabled={metaWhatsappHealth ? metaWhatsappHealth.status !== "disconnected" : false}
              />
            </div>
          </div>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#fff",
              padding: "1rem",
            }}
          >
            <div
              style={{
                color: "#0f172a",
                fontSize: "0.85rem",
                fontWeight: 750,
                marginBottom: "0.65rem",
              }}
            >
              Next best action
            </div>
            <p style={{ color: "#64748b", fontSize: "0.8rem", lineHeight: 1.45, marginTop: 0 }}>
              {getWhatsappNextAction(metaWhatsappHealth)}
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <a href={`/${locale}/crm/inbox`} style={linkButtonStyle("#047857")}>
                Open inbox
              </a>
              <a href={`/${locale}/dashboard/setup`} style={linkButtonStyle("#475569")}>
                Automation settings
              </a>
            </div>
          </div>
        </div>

        {metaWhatsappHealth ? (
          <form
            onSubmit={(event) => void handleWhatsappTest(event)}
            style={{
              marginTop: "1rem",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#fff",
              padding: "1rem",
            }}
          >
            <label
              style={{
                display: "grid",
                gap: "0.35rem",
                color: "#0f172a",
                fontSize: "0.85rem",
                fontWeight: 750,
              }}
            >
              Send a test WhatsApp
              <span style={{ color: "#64748b", fontSize: "0.78rem", fontWeight: 500 }}>
                Use an approved Meta test recipient in international format, for example
                +41761234567.
              </span>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <input
                  value={whatsappTestPhone}
                  onChange={(event) => setWhatsappTestPhone(event.target.value)}
                  placeholder="+41761234567"
                  style={{ ...inputStyle, maxWidth: 260 }}
                />
                <button
                  type="submit"
                  disabled={whatsappTesting || !whatsappTestPhone.trim()}
                  style={btnStyle(
                    whatsappTesting || !whatsappTestPhone.trim() ? "#9ca3af" : "#047857",
                  )}
                >
                  {whatsappTesting ? "Sending..." : "Send test"}
                </button>
              </div>
            </label>
            {whatsappTestResult ? (
              <p style={{ color: "#15803d", fontSize: "0.8rem", margin: "0.65rem 0 0" }}>
                {whatsappTestResult}
              </p>
            ) : null}
          </form>
        ) : null}

        {metaWhatsappHealth?.channelMode === "demo_test_number" ? (
          <div
            style={{
              marginTop: "0.9rem",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              background: "#eff6ff",
              color: "#1e3a8a",
              padding: "0.75rem 0.85rem",
              fontSize: "0.8rem",
              lineHeight: 1.45,
            }}
          >
            Demo mode is active. You can show the WhatsApp workflow with approved test numbers.
            Connect a real WhatsApp Business number before using automation with real customers.
          </div>
        ) : null}

        {metaWhatsappHealth?.lastFailureMessage ? (
          <div
            style={{
              marginTop: "0.9rem",
              border: "1px solid #fecaca",
              borderRadius: 8,
              background: "#fef2f2",
              color: "#991b1b",
              padding: "0.75rem 0.85rem",
              fontSize: "0.8rem",
              lineHeight: 1.45,
            }}
          >
            Last reply problem: {metaWhatsappHealth.lastFailureMessage}
          </div>
        ) : null}

        {metaWhatsappHealth ? (
          <details
            style={{
              marginTop: "0.9rem",
              borderTop: "1px solid #e2e8f0",
              paddingTop: "0.9rem",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                color: "#475569",
                fontSize: "0.8rem",
                fontWeight: 700,
              }}
            >
              Advanced connection details
            </summary>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.75rem",
                marginTop: "0.8rem",
              }}
            >
              <HealthCard
                label="Channel mode"
                value={formatWhatsappChannelMode(metaWhatsappHealth.channelMode)}
                tone="#0f766e"
              />
              <HealthCard
                label="Token source"
                value={formatWhatsappTokenSource(metaWhatsappHealth.tokenSource)}
                tone="#475569"
              />
              <HealthCard
                label="Expiry state"
                value={metaWhatsappHealth.expiresState}
                tone={metaWhatsappHealth.expiresState === "expired" ? "#dc2626" : "#475569"}
              />
              <HealthCard
                label="Phone number ID"
                value={metaWhatsappHealth.phoneNumberId ?? "Not set"}
                tone="#4f46e5"
              />
              <HealthCard
                label="Last inbound"
                value={
                  metaWhatsappHealth.lastInboundAt
                    ? formatDate(metaWhatsappHealth.lastInboundAt)
                    : "No inbound yet"
                }
                tone="#0369a1"
              />
              <HealthCard
                label="Last outbound"
                value={
                  metaWhatsappHealth.lastOutboundAt
                    ? formatDate(metaWhatsappHealth.lastOutboundAt)
                    : "No outbound yet"
                }
                tone="#7c3aed"
              />
              <HealthCard
                label="Last delivery status"
                value={
                  metaWhatsappHealth.lastStatusAt
                    ? formatDate(metaWhatsappHealth.lastStatusAt)
                    : "No status yet"
                }
                tone="#475569"
              />
            </div>
          </details>
        ) : null}
      </section>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fff",
          padding: "1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 8,
                background: "#eff6ff",
                color: "#2563eb",
                fontWeight: 900,
                fontSize: "0.9rem",
              }}
            >
              SMS
            </span>
            <div>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>SMS automation</h2>
              <p style={{ color: "#6b7280", fontSize: "0.82rem", margin: "0.2rem 0 0" }}>
                Send short lead acknowledgements and staff replies through the platform-managed SMS
                sender.
              </p>
            </div>
          </div>
          <span style={smsStatusBadgeStyle(smsHealth)}>{formatSmsStatus(smsHealth)}</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#f8fafc",
              padding: "1rem",
            }}
          >
            <div style={{ color: "#0f172a", fontSize: "0.85rem", fontWeight: 750 }}>
              Tenant workflow
            </div>
            <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.7rem" }}>
              <WhatsAppCapability
                label="Phone-only leads can receive acknowledgement"
                enabled={smsConfigured}
              />
              <WhatsAppCapability
                label="Staff can reply by SMS from CRM Inbox"
                enabled={smsConfigured}
              />
              <WhatsAppCapability
                label="Business phone is verified for trust and contact details"
                enabled={Boolean(smsVerifiedBusinessPhone)}
              />
              <WhatsAppCapability
                label="Failed SMS sends appear in automation attention"
                enabled={true}
              />
              <WhatsAppCapability
                label="Long messages are capped to avoid costly multi-part sends"
                enabled={true}
              />
            </div>
          </div>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#fff",
              padding: "1rem",
            }}
          >
            <div style={{ color: "#0f172a", fontSize: "0.85rem", fontWeight: 750 }}>
              Operational summary
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "0.65rem",
                marginTop: "0.75rem",
              }}
            >
              <MiniMetric label="Plan" value={smsPlan} />
              <MiniMetric
                label="Automation"
                value={businessSmsSettings?.enabled === false ? "Paused" : "Enabled"}
              />
              <MiniMetric
                label="Monthly limit"
                value={String(smsHealth?.entitlement.monthlyLimit ?? 0)}
              />
              <MiniMetric
                label="Remaining"
                value={String(smsHealth?.entitlement.remainingMonthly ?? 0)}
              />
              <MiniMetric
                label="Business phone"
                value={smsVerifiedBusinessPhone ?? "Not verified"}
              />
              <MiniMetric label="Sender" value={smsHealth?.originator ?? "Platform sender"} />
              <MiniMetric label="Failed" value={String(smsHealth?.failedSends ?? 0)} />
            </div>
            <p style={{ color: "#64748b", fontSize: "0.8rem", lineHeight: 1.45 }}>
              {getSmsNextAction(smsHealth)}
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <a href={`/${locale}/crm/inbox`} style={linkButtonStyle("#2563eb")}>
                Open SMS inbox
              </a>
              <a href={`/${locale}/dashboard/setup`} style={linkButtonStyle("#475569")}>
                Channel preference
              </a>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "1rem",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            background: "#fff",
            padding: "1rem",
          }}
        >
          <div style={{ color: "#0f172a", fontSize: "0.85rem", fontWeight: 750 }}>
            Verify your business phone
          </div>
          <p style={{ color: "#64748b", fontSize: "0.78rem", lineHeight: 1.45 }}>
            This proves the phone number belongs to your business. SMS messages still come from the
            platform sender, but your verified phone is used for contact details, trust, and staff
            workflow.
          </p>
          {smsVerifiedBusinessPhone ? (
            <p style={{ color: "#15803d", fontSize: "0.85rem", fontWeight: 750 }}>
              Verified: {smsVerifiedBusinessPhone}
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <form
                onSubmit={(event) => void handleStartPhoneVerification(event)}
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
              >
                <input
                  value={businessPhoneInput}
                  onChange={(event) => setBusinessPhoneInput(event.target.value)}
                  placeholder="+41761234567"
                  inputMode="tel"
                  style={{ ...inputStyle, maxWidth: 260 }}
                />
                <button
                  type="submit"
                  disabled={phoneVerificationBusy || !businessPhoneInput.trim() || !smsConfigured}
                  style={btnStyle(
                    phoneVerificationBusy || !businessPhoneInput.trim() || !smsConfigured
                      ? "#9ca3af"
                      : "#2563eb",
                  )}
                >
                  {phoneVerificationBusy ? "Sending..." : "Send code"}
                </button>
              </form>
              <form
                onSubmit={(event) => void handleConfirmPhoneVerification(event)}
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
              >
                <input
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  maxLength={6}
                  style={{ ...inputStyle, maxWidth: 180 }}
                />
                <button
                  type="submit"
                  disabled={
                    phoneVerificationBusy ||
                    !verificationCode.trim() ||
                    smsHealth?.phoneVerificationStatus !== "pending"
                  }
                  style={btnStyle(
                    phoneVerificationBusy ||
                      !verificationCode.trim() ||
                      smsHealth?.phoneVerificationStatus !== "pending"
                      ? "#9ca3af"
                      : "#0f172a",
                  )}
                >
                  Confirm code
                </button>
              </form>
            </div>
          )}
        </div>

        <form
          onSubmit={(event) => void handleSmsTest(event)}
          style={{
            marginTop: "1rem",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            background: "#fff",
            padding: "1rem",
          }}
        >
          <label
            style={{
              display: "grid",
              gap: "0.35rem",
              color: "#0f172a",
              fontSize: "0.85rem",
              fontWeight: 750,
            }}
          >
            Send a test SMS
            <span style={{ color: "#64748b", fontSize: "0.78rem", fontWeight: 500 }}>
              Use an international number, for example +41761234567. This sends one real SMS from
              the platform sender and counts toward the monthly plan limit.
            </span>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input
                value={smsTestPhone}
                onChange={(event) => setSmsTestPhone(event.target.value)}
                placeholder="+41761234567"
                inputMode="tel"
                style={{ ...inputStyle, maxWidth: 260 }}
              />
              <button
                type="submit"
                disabled={smsTesting || !smsTestPhone.trim() || !smsConfigured}
                style={btnStyle(
                  smsTesting || !smsTestPhone.trim() || !smsConfigured ? "#9ca3af" : "#2563eb",
                )}
              >
                {smsTesting ? "Sending..." : "Send test"}
              </button>
            </div>
          </label>
          {smsTestResult ? (
            <p style={{ color: "#15803d", fontSize: "0.8rem", margin: "0.65rem 0 0" }}>
              {smsTestResult}
            </p>
          ) : null}
        </form>

        {smsHealth?.lastFailureMessage ? (
          <div
            style={{
              marginTop: "0.9rem",
              border: "1px solid #fecaca",
              borderRadius: 8,
              background: "#fef2f2",
              color: "#991b1b",
              padding: "0.75rem 0.85rem",
              fontSize: "0.8rem",
              lineHeight: 1.45,
            }}
          >
            Last SMS problem: {smsHealth.lastFailureMessage}
          </div>
        ) : null}

        <div
          style={{
            marginTop: "0.9rem",
            borderTop: "1px solid #e2e8f0",
            paddingTop: "0.9rem",
          }}
        >
          <h3
            style={{
              color: "#475569",
              fontSize: "0.8rem",
              fontWeight: 700,
              margin: 0,
            }}
          >
            SMS delivery health
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginTop: "0.8rem",
            }}
          >
            <HealthCard
              label="Automation"
              value={smsConfigured ? "Available" : "Needs attention"}
              tone={smsConfigured ? "#16a34a" : "#dc2626"}
            />
            <HealthCard
              label="Last message"
              value={
                smsHealth?.lastOutboundAt ? formatDate(smsHealth.lastOutboundAt) : "No SMS yet"
              }
              tone="#2563eb"
            />
            <HealthCard
              label="Last status"
              value={smsHealth?.lastOutboundStatus ?? "No status yet"}
              tone={smsHealth?.lastOutboundStatus === "failed" ? "#dc2626" : "#475569"}
            />
            <HealthCard
              label="Last customer"
              value={smsHealth?.lastRecipient ?? "None"}
              tone="#475569"
            />
          </div>
          <p style={{ color: "#64748b", fontSize: "0.78rem", lineHeight: 1.45 }}>
            SMS is handled by the platform. Verify the business phone, keep an eye on monthly usage,
            and review failed messages here when customer follow-up needs attention.
          </p>
        </div>
      </section>

      {success && (
        <p
          style={{
            color: "#16a34a",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 6,
            padding: "0.6rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.9rem",
          }}
        >
          {success}
        </p>
      )}

      {error && (
        <p style={{ color: "#ef4444", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</p>
      )}

      {/* Provider cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        {Object.entries(PROVIDER_META).map(([key, meta]) => {
          const connection = connections.find((c) => c.provider === key);
          const isConnected = connectedProviders.has(key as Connection["provider"]);

          return (
            <div
              key={key}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "1.25rem",
                background: "#fff",
              }}
            >
              {connection && activeSyncConnectionIds.has(connection.id) && (
                <div
                  style={{
                    height: 3,
                    background: "#e0e7ff",
                    borderRadius: 999,
                    overflow: "hidden",
                    margin: "-1.25rem -1.25rem 1rem",
                  }}
                >
                  <div style={{ width: "55%", height: "100%", background: "#6366f1" }} />
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "0.5rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>{meta.label}</div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: 2 }}>
                    {verticalLabel(meta.vertical)}
                  </div>
                </div>
                {connection && (
                  <span
                    style={{
                      background: STATUS_COLOR[connection.status],
                      color: "#fff",
                      borderRadius: 4,
                      padding: "2px 8px",
                      fontSize: "0.75rem",
                    }}
                  >
                    {STATUS_LABEL[connection.status]}
                  </span>
                )}
              </div>

              <p style={{ color: "#6b7280", fontSize: "0.85rem", marginBottom: "1rem" }}>
                {meta.description}
              </p>

              {connection && (
                <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "0.75rem" }}>
                  {key === "meta" && connection.meta
                    ? `Page: ${(connection.meta as { pageName?: string }).pageName ?? connection.externalAccountId}${(connection.meta as { igConnected?: boolean }).igConnected ? " · Instagram linked" : ""}`
                    : connection.lastSyncAt
                      ? `Letzter Sync: ${new Date(connection.lastSyncAt).toLocaleString("de-CH")}`
                      : "Noch nicht synchronisiert"}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {!isConnected ? (
                  meta.isOAuth ? (
                    <button
                      onClick={() => void handleMetaConnect()}
                      disabled={metaConnecting}
                      style={btnStyle(metaConnecting ? "#9ca3af" : "#1877f2")}
                    >
                      {metaConnecting ? "…" : t("connectMeta")}
                    </button>
                  ) : (
                    <button onClick={() => setConnectProvider(key)} style={btnStyle("#3b82f6")}>
                      {t("connect")}
                    </button>
                  )
                ) : (
                  <>
                    {!meta.isOAuth && (
                      <button
                        onClick={() => void handleSync(connection!.id)}
                        disabled={
                          syncingId === connection!.id ||
                          activeSyncConnectionIds.has(connection!.id)
                        }
                        style={btnStyle(
                          syncingId === connection!.id ||
                            activeSyncConnectionIds.has(connection!.id)
                            ? "#9ca3af"
                            : "#6366f1",
                        )}
                      >
                        {syncingId === connection!.id || activeSyncConnectionIds.has(connection!.id)
                          ? "Sync queued"
                          : "Sync now"}
                      </button>
                    )}
                    {meta.isOAuth && (
                      <button
                        onClick={() => void handleSync(connection!.id)}
                        disabled={
                          syncingId === connection!.id ||
                          activeSyncConnectionIds.has(connection!.id)
                        }
                        style={btnStyle(
                          syncingId === connection!.id ||
                            activeSyncConnectionIds.has(connection!.id)
                            ? "#9ca3af"
                            : "#6366f1",
                        )}
                      >
                        {syncingId === connection!.id || activeSyncConnectionIds.has(connection!.id)
                          ? "Testing..."
                          : "Test"}
                      </button>
                    )}
                    <button
                      onClick={() => void handleDisconnect(connection!.id)}
                      style={btnStyle("#ef4444")}
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fff",
          padding: "1.25rem",
          marginBottom: "2rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Sync history</h2>
            <p style={{ color: "#6b7280", fontSize: "0.82rem", margin: "0.25rem 0 0" }}>
              Recent channel checks and data syncs run safely in the worker.
            </p>
          </div>
          <button onClick={() => void loadConnections()} style={btnStyle("#475569")}>
            Refresh
          </button>
        </div>
        {syncRuns.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>No sync runs yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {syncRuns.slice(0, 8).map((run) => (
              <div
                key={run.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "1rem",
                  border: "1px solid #f1f5f9",
                  borderRadius: 8,
                  padding: "0.75rem",
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
                    <strong style={{ fontSize: "0.88rem" }}>
                      {PROVIDER_META[run.provider]?.label ?? run.provider}
                    </strong>
                    <span style={runBadgeStyle(run.status)}>{run.status}</span>
                  </div>
                  {run.errorMessage ? (
                    <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: "0.3rem" }}>
                      {run.errorMessage}
                    </div>
                  ) : (
                    <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: "0.3rem" }}>
                      {run.recordsProcessed} records processed
                    </div>
                  )}
                </div>
                <time style={{ color: "#94a3b8", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                  {formatDate(run.completedAt ?? run.startedAt ?? run.createdAt)}
                </time>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Connect modal */}
      {connectProvider && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setConnectProvider(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: "2rem",
              width: 400,
              maxWidth: "90vw",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.25rem" }}>
              {PROVIDER_META[connectProvider]?.label} verbinden
            </h2>
            <form onSubmit={handleConnect}>
              <label style={labelStyleObj}>
                API-Schlüssel *
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="Füge deinen API-Key ein…"
                />
              </label>
              <label style={labelStyleObj}>
                Standort-ID (optional)
                <input
                  type="text"
                  value={accountIdInput}
                  onChange={(e) => setAccountIdInput(e.target.value)}
                  style={inputStyle}
                  placeholder="Nur bei mehreren Standorten"
                />
              </label>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
                <button
                  type="submit"
                  disabled={connecting || !apiKeyInput.trim()}
                  style={btnStyle(connecting ? "#9ca3af" : "#22c55e")}
                >
                  {connecting ? "Verbinde…" : "Verbinden"}
                </button>
                <button
                  type="button"
                  onClick={() => setConnectProvider(null)}
                  style={btnStyle("#6b7280")}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function HealthCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", padding: "1rem" }}
    >
      <div
        style={{ color: "#64748b", fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.35rem" }}
      >
        {label}
      </div>
      <div style={{ color: tone, fontSize: "1.2rem", fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #f1f5f9",
        borderRadius: 8,
        padding: "0.65rem",
        background: "#fafafa",
      }}
    >
      <div style={{ color: "#64748b", fontSize: "0.72rem", fontWeight: 700 }}>{label}</div>
      <div
        style={{
          color: "#111827",
          fontSize: "0.9rem",
          fontWeight: 800,
          marginTop: "0.2rem",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function WhatsAppCapability({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem" }}>
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: 999,
          background: enabled ? "#dcfce7" : "#f1f5f9",
          color: enabled ? "#15803d" : "#94a3b8",
          fontSize: "0.72rem",
          fontWeight: 900,
          flex: "0 0 auto",
        }}
      >
        {enabled ? "OK" : "-"}
      </span>
      <span style={{ color: enabled ? "#334155" : "#94a3b8" }}>{label}</span>
    </div>
  );
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleString("de-CH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatWhatsappBusinessStatus(health: MetaWhatsappHealth | null): string {
  if (!health) return "Setup needed";
  if (health.status === "connected") return "Connected";
  if (health.status === "test_mode") return "Demo mode";
  if (health.status === "token_expired") return "Needs token refresh";
  if (health.status === "error") return "Needs attention";
  return "Not connected";
}

function formatWhatsappChannelMode(mode: MetaWhatsappHealth["channelMode"]): string {
  if (mode === "demo_test_number") return "Demo test number";
  if (mode === "tenant_cloud_api") return "Tenant Cloud API";
  return "Disabled";
}

function formatWhatsappTokenSource(source: MetaWhatsappHealth["tokenSource"]): string {
  if (source === "demo_test_number") return "Meta test token";
  if (source === "tenant_cloud_api") return "Tenant token";
  return "None";
}

function getWhatsappNextAction(health: MetaWhatsappHealth | null): string {
  if (!health) {
    return "Ask an account admin to review WhatsApp setup, or enable demo mode for approved test recipients.";
  }
  if (health.status === "connected") {
    return "Open the inbox to review conversations, or adjust automatic acknowledgement wording in setup.";
  }
  if (health.status === "test_mode") {
    return "Use demo mode for approved test numbers. Refresh the Meta test token if outgoing replies fail.";
  }
  if (health.status === "token_expired") {
    return "Refresh the Meta token, then restart the app and worker so automatic replies can be sent again.";
  }
  if (health.status === "error") {
    return "Check the latest delivery issue below, then refresh the connection after fixing the Meta settings.";
  }
  return "Connect WhatsApp Business or enable demo mode before using WhatsApp automation with leads.";
}

function whatsappStatusBadgeStyle(health: MetaWhatsappHealth | null): React.CSSProperties {
  const color = !health
    ? "#64748b"
    : health.status === "connected"
      ? "#16a34a"
      : health.status === "test_mode"
        ? "#2563eb"
        : health.status === "token_expired" || health.status === "error"
          ? "#dc2626"
          : "#64748b";

  return {
    borderRadius: 999,
    background: `${color}18`,
    color,
    fontSize: "0.75rem",
    fontWeight: 800,
    padding: "0.25rem 0.6rem",
    whiteSpace: "nowrap",
  };
}

function formatSmsStatus(health: SmsHealth | null): string {
  if (!health) return "Setup needed";
  if (health.status === "upgrade_required") return "Upgrade required";
  if (health.configured && !health.verifiedBusinessPhone) return "Verify phone";
  if (health.status === "ready") return "Ready";
  if (health.status === "attention") return "Needs attention";
  return "Not configured";
}

function getSmsNextAction(health: SmsHealth | null): string {
  if (health?.status === "upgrade_required") {
    if (health.entitlement.reason === "monthly_limit_reached") {
      return "The monthly SMS limit is reached. Upgrade the plan or wait until the next billing month.";
    }
    return "SMS automation is available on paid plans. Upgrade to Starter or Growth to enable real SMS.";
  }
  if (!health || !health.configured) {
    const missing = health?.missing?.length ? ` Missing: ${health.missing.join(", ")}.` : "";
    return `The platform SMS provider is not ready yet.${missing}`;
  }
  if (!health.verifiedBusinessPhone) {
    return "Verify your business phone number so customers and staff can trust the SMS workflow.";
  }
  if (health.status === "attention") {
    return "Review the failed SMS in the Inbox, then confirm the recipient number and platform sender state.";
  }
  return "SMS is ready. Use it for phone-only leads, reservation confirmations, and short staff replies from the Inbox.";
}

function smsStatusBadgeStyle(health: SmsHealth | null): React.CSSProperties {
  const color = !health
    ? "#64748b"
    : health.status === "ready"
      ? "#16a34a"
      : health.status === "attention"
        ? "#dc2626"
        : "#64748b";

  return {
    borderRadius: 999,
    background: `${color}18`,
    color,
    fontSize: "0.75rem",
    fontWeight: 800,
    padding: "0.25rem 0.6rem",
    whiteSpace: "nowrap",
  };
}

function friendlyIntegrationError(message: string): string {
  if (message.toUpperCase().includes("UNAUTHORIZED")) {
    return "Some integration details are only available to account admins.";
  }
  return message;
}

function runBadgeStyle(status: SyncRun["status"]): React.CSSProperties {
  const color =
    status === "success" || status === "noop"
      ? "#16a34a"
      : status === "partial" || status === "queued" || status === "running"
        ? "#f59e0b"
        : "#dc2626";

  return {
    borderRadius: 999,
    background: `${color}18`,
    color,
    fontSize: "0.72rem",
    fontWeight: 700,
    padding: "0.15rem 0.45rem",
    textTransform: "capitalize",
  };
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: "0.4rem 1rem",
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: "0.85rem",
    cursor: bg === "#9ca3af" ? "not-allowed" : "pointer",
    fontFamily: "inherit",
  };
}

function linkButtonStyle(bg: string): React.CSSProperties {
  return {
    ...btnStyle(bg),
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    lineHeight: 1.2,
  };
}

const labelStyleObj: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  marginBottom: "1rem",
  fontSize: "0.9rem",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: "0.9rem",
  boxSizing: "border-box",
};
