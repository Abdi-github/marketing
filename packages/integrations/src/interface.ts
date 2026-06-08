import type { TenantContext } from "@marketing/tenancy";

// ─── Connection status ────────────────────────────────────────────────────────

export type ConnectionStatus = "connected" | "disconnected" | "error" | "token_expired";

// ─── Stored connection row (mirrors the DB shape) ────────────────────────────

export interface IntegrationConnection {
  id: string;
  tenantId: string;
  provider: string;
  externalAccountId: string;
  /** Encrypted blob — do not read directly; use decrypt(conn.oauthTokens) */
  oauthTokens: string;
  scopes: string[];
  status: ConnectionStatus;
  meta: Record<string, unknown>;
  connectedAt: Date;
  lastSyncAt: Date | null;
  updatedAt: Date;
}

// ─── Credentials supplied by the user when connecting ────────────────────────

export interface ConnectCredentials {
  apiKey?: string;
  externalAccountId?: string;
  /** OAuth: the authorization code from the provider redirect */
  authorizationCode?: string;
  /** OAuth: PKCE verifier or CSRF state */
  state?: string;
}

// ─── Result of a sync operation ──────────────────────────────────────────────

export type SyncOutcome = "ok" | "partial" | "noop" | "error";

export interface SyncResult {
  outcome: SyncOutcome;
  recordsProcessed: number;
  errorMessage?: string;
}

// ─── Webhook event row (mirrors the DB shape from billing.webhookEvents) ──────

export interface WebhookEvent {
  id: string;
  tenantId: string | null;
  provider: string;
  eventId: string;
  eventType: string;
  signature: string | null;
  payload: unknown;
  receivedAt: Date;
  processedAt: Date | null;
}

// ─── Connector contract ───────────────────────────────────────────────────────

export interface IIntegrationAdapter {
  /** Stable identifier, matches the DB `provider` column. */
  readonly provider: string;

  /** 'api_key' adapters use ConnectCredentials.apiKey; 'oauth2' use the redirect flow. */
  readonly authType: "api_key" | "oauth2";

  /**
   * Store credentials and create (or update) the integration_connections row.
   * For API-key providers this is synchronous. For OAuth providers, the
   * authorization code is exchanged for tokens here.
   */
  connect(ctx: TenantContext, creds: ConnectCredentials): Promise<IntegrationConnection>;

  /** Mark the connection as disconnected and clear tokens. */
  disconnect(ctx: TenantContext, connectionId: string): Promise<void>;

  /**
   * Pull data from the external provider and persist it. Must be idempotent.
   * Called by a scheduled worker and by the UI's "Sync now" button.
   */
  sync(ctx: TenantContext, connection: IntegrationConnection): Promise<SyncResult>;

  /**
   * Return true if the raw body + signature are valid for this provider's
   * HMAC scheme. Called by the webhook receiver BEFORE parsing the body.
   * Only implement on providers that send webhooks.
   */
  verifyWebhook?(rawBody: string, signature: string, secret: string): boolean;

  /**
   * Process a single webhook event idempotently. Called by the BullMQ worker.
   * The event row already exists in `webhook_events`; mark `processed_at` on success.
   */
  processWebhookEvent?(ctx: TenantContext, event: WebhookEvent): Promise<void>;
}
