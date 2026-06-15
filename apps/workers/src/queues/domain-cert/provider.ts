import { createHmac } from "node:crypto";
import { env } from "@marketing/shared";

export type DomainCertProviderName = "stub" | "fly" | "webhook" | "manual";

export type DomainCertProvisionInput = {
  domainId: string;
  tenantId: string;
  hostname: string;
  action: "issue" | "renew";
};

export type DomainCertProvisionResult = {
  issuedAt?: Date;
  expiresAt?: Date;
};

export type DomainCertProvider = {
  provision(input: DomainCertProvisionInput): Promise<DomainCertProvisionResult>;
};

export type DomainCertProviderConfig = {
  provider: DomainCertProviderName;
  nodeEnv: "development" | "test" | "production";
  allowStub: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  flyApiToken?: string;
  flyAppName?: string;
  flyAppId?: string;
};

type FetchLike = typeof fetch;

function defaultExpiry(from = new Date()): Date {
  return new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000);
}

function providerConfigFromEnv(): DomainCertProviderConfig {
  return {
    provider: env.DOMAIN_CERT_PROVIDER,
    nodeEnv: env.NODE_ENV,
    allowStub: env.DOMAIN_CERT_ALLOW_STUB === "true",
    webhookUrl: env.DOMAIN_CERT_WEBHOOK_URL,
    webhookSecret: env.DOMAIN_CERT_WEBHOOK_SECRET,
    flyApiToken: env.FLY_API_TOKEN,
    flyAppName: env.FLY_APP_NAME,
    flyAppId: env.FLY_APP_ID,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function createStubProvider(config: DomainCertProviderConfig): DomainCertProvider {
  return {
    async provision() {
      if (config.nodeEnv === "production" && !config.allowStub) {
        throw new Error(
          "DOMAIN_CERT_PROVIDER=stub is disabled in production. Configure fly or webhook, or set DOMAIN_CERT_ALLOW_STUB=true only for a controlled migration.",
        );
      }
      const issuedAt = new Date();
      return { issuedAt, expiresAt: defaultExpiry(issuedAt) };
    },
  };
}

function createWebhookProvider(
  config: DomainCertProviderConfig,
  fetchFn: FetchLike,
): DomainCertProvider {
  return {
    async provision(input) {
      if (!config.webhookUrl) {
        throw new Error("DOMAIN_CERT_WEBHOOK_URL is required when DOMAIN_CERT_PROVIDER=webhook");
      }

      const body = JSON.stringify(input);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (config.webhookSecret) {
        headers["x-marketing-signature"] = createHmac("sha256", config.webhookSecret)
          .update(body)
          .digest("hex");
      }

      const response = await fetchFn(config.webhookUrl, {
        method: "POST",
        headers,
        body,
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(
          `Domain cert webhook failed with ${response.status}: ${JSON.stringify(payload)}`,
        );
      }

      const result = payload as { issuedAt?: string; expiresAt?: string } | null;
      return {
        issuedAt: result?.issuedAt ? new Date(result.issuedAt) : new Date(),
        expiresAt: result?.expiresAt ? new Date(result.expiresAt) : undefined,
      };
    },
  };
}

async function flyGraphql<T>(
  fetchFn: FetchLike,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetchFn("https://api.fly.io/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await readJson(response)) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  } | null;
  if (!response.ok || payload?.errors?.length) {
    const message =
      payload?.errors?.map((error) => error.message).join("; ") || response.statusText;
    throw new Error(`Fly certificate API failed: ${message}`);
  }
  if (!payload?.data) {
    throw new Error("Fly certificate API returned no data");
  }
  return payload.data;
}

function createFlyProvider(
  config: DomainCertProviderConfig,
  fetchFn: FetchLike,
): DomainCertProvider {
  return {
    async provision(input) {
      if (!config.flyApiToken) {
        throw new Error("FLY_API_TOKEN is required when DOMAIN_CERT_PROVIDER=fly");
      }

      let appId = config.flyAppId;
      if (!appId) {
        if (!config.flyAppName) {
          throw new Error("FLY_APP_ID or FLY_APP_NAME is required when DOMAIN_CERT_PROVIDER=fly");
        }
        const data = await flyGraphql<{ app?: { id?: string } }>(
          fetchFn,
          config.flyApiToken,
          `query ResolveApp($name: String!) { app(name: $name) { id } }`,
          { name: config.flyAppName },
        );
        appId = data.app?.id;
      }

      if (!appId) {
        throw new Error("Could not resolve Fly app id for domain certificate provisioning");
      }

      await flyGraphql(
        fetchFn,
        config.flyApiToken,
        `mutation AddCertificate($appId: ID!, $hostname: String!) {
          addCertificate(appId: $appId, hostname: $hostname) {
            certificate {
              id
              hostname
              configured
              certificateAuthority
            }
          }
        }`,
        { appId, hostname: input.hostname },
      );

      const issuedAt = new Date();
      return { issuedAt, expiresAt: defaultExpiry(issuedAt) };
    },
  };
}

function createManualProvider(): DomainCertProvider {
  return {
    async provision() {
      throw new Error(
        "DOMAIN_CERT_PROVIDER=manual. Certificate provisioning is not configured for this deployment.",
      );
    },
  };
}

export function createDomainCertProvider(
  config: DomainCertProviderConfig = providerConfigFromEnv(),
  fetchFn: FetchLike = fetch,
): DomainCertProvider {
  switch (config.provider) {
    case "stub":
      return createStubProvider(config);
    case "fly":
      return createFlyProvider(config, fetchFn);
    case "webhook":
      return createWebhookProvider(config, fetchFn);
    case "manual":
      return createManualProvider();
    default:
      return createManualProvider();
  }
}
