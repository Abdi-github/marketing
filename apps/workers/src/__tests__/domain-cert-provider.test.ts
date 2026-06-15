import { describe, expect, it, vi } from "vitest";
import {
  createDomainCertProvider,
  type DomainCertProviderConfig,
} from "../queues/domain-cert/provider";

const BASE_CONFIG: DomainCertProviderConfig = {
  provider: "stub",
  nodeEnv: "development",
  allowStub: false,
};

const BASE_INPUT = {
  domainId: "00000000-0000-4000-8000-000000000001",
  tenantId: "00000000-0000-4000-8000-000000000002",
  hostname: "example.ch",
  action: "issue" as const,
};

describe("domain cert provider", () => {
  it("allows stub certificates outside production", async () => {
    const provider = createDomainCertProvider(BASE_CONFIG);

    const result = await provider.provision(BASE_INPUT);

    expect(result.issuedAt).toBeInstanceOf(Date);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("rejects stub certificates in production unless explicitly allowed", async () => {
    const provider = createDomainCertProvider({
      ...BASE_CONFIG,
      nodeEnv: "production",
    });

    await expect(provider.provision(BASE_INPUT)).rejects.toThrow(
      "DOMAIN_CERT_PROVIDER=stub is disabled in production",
    );
  });

  it("posts signed webhook provisioning requests", async () => {
    const fetchFn = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ): Promise<Response> => {
        return new Response(
          JSON.stringify({
            issuedAt: "2026-06-15T10:00:00.000Z",
            expiresAt: "2026-09-13T10:00:00.000Z",
          }),
          { status: 200 },
        );
      },
    );
    const provider = createDomainCertProvider(
      {
        ...BASE_CONFIG,
        provider: "webhook",
        webhookUrl: "https://edge.example.test/domain-cert",
        webhookSecret: "secret",
      },
      fetchFn as unknown as typeof fetch,
    );

    const result = await provider.provision(BASE_INPUT);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calls = fetchFn.mock.calls as Array<
      [Parameters<typeof fetch>[0], Parameters<typeof fetch>[1] | undefined]
    >;
    const [url, init] = calls[0]!;
    expect(url).toBe("https://edge.example.test/domain-cert");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["x-marketing-signature"]).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(result.expiresAt?.toISOString()).toBe("2026-09-13T10:00:00.000Z");
  });

  it("fails visibly when provider is manual", async () => {
    const provider = createDomainCertProvider({ ...BASE_CONFIG, provider: "manual" });

    await expect(provider.provision(BASE_INPUT)).rejects.toThrow(
      "Certificate provisioning is not configured",
    );
  });
});
