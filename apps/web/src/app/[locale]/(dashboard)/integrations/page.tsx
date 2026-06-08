"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "../../../../lib/trpc";

type Connection = Awaited<ReturnType<typeof trpc.integrations.list.query>>[number];

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
    description: "Kassensystem für Restaurants — Reservierungen & Menü-Sync.",
    vertical: "Restaurant / Café",
    hasWebhook: true,
  },
  lightspeed_ch: {
    label: "Lightspeed CH",
    description: "iKentoo-basiertes POS für die Schweiz — Artikel-Katalog-Import.",
    vertical: "Restaurant / Café",
    hasWebhook: false,
  },
  eversports: {
    label: "Eversports",
    description: "Buchungssystem für Fitnessstudios — Kursplan-Sync.",
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
  const t = useTranslations("Integrations");
  const searchParams = useSearchParams();
  const metaParam = searchParams.get("meta");

  const verticalLabel = (v: string): string => {
    if (v === "All verticals") return t("vertical_all");
    if (v === "Restaurant / Café") return t("vertical_restaurant");
    if (v === "Fitness / Yoga") return t("vertical_fitness");
    return v;
  };

  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(
    metaParam === "denied" ? "Meta connection was cancelled."
    : metaParam === "error" ? `Meta connection failed: ${searchParams.get("reason") ?? "unknown"}`
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

  const loadConnections = useCallback(async () => {
    try {
      const data = await trpc.integrations.list.query();
      setConnections(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

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
    try {
      const result = await trpc.integrations.sync.mutate({ connectionId });
      if (result.outcome === "error") {
        setError(`Sync error: ${result.errorMessage ?? "unknown"}`);
      }
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncingId(null);
    }
  }

  const connectedProviders = new Set(
    connections.filter((c) => c.status === "connected").map((c) => c.provider),
  );

  if (loading) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        {t("title")}
      </h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem", fontSize: "0.9rem" }}>
        {t("subtitle")}
      </p>

      {success && (
        <p style={{ color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "0.6rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          {success}
        </p>
      )}

      {error && (
        <p style={{ color: "#ef4444", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</p>
      )}

      {/* Provider cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
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
                    <button
                      onClick={() => setConnectProvider(key)}
                      style={btnStyle("#3b82f6")}
                    >
                      {t("connect")}
                    </button>
                  )
                ) : (
                  <>
                    {!meta.isOAuth && (
                      <button
                        onClick={() => void handleSync(connection!.id)}
                        disabled={syncingId === connection!.id}
                        style={btnStyle(syncingId === connection!.id ? "#9ca3af" : "#6366f1")}
                      >
                        {syncingId === connection!.id ? "Sync…" : "Sync"}
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
