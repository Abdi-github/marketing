// step-32+: Custom domains tRPC router.
// Owns the full life-cycle: add → verify (DNS check) → cert (stubbed) → live.
// Tenant scoped via tenantProcedure → RLS handles isolation.
import { db } from "@marketing/db";
import { customDomains } from "@marketing/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requires, tenantProcedure, router } from "../trpc";
import { env } from "@marketing/shared";
import { enqueueDomainCertJob } from "../../queues/domain-cert";

// ─── Validation ──────────────────────────────────────────────────────────────

// Hostname rules:
// - lowercase
// - 3-253 chars
// - labels separated by dots, each label 1-63 chars, alphanumeric + hyphens
// - no leading/trailing dot, no consecutive dots
// Examples accepted:  cafebern.ch, www.cafebern.ch, pages.cafe-bern.example.com
// Examples rejected:  CAFEBERN.CH, .cafebern.ch, café.ch (unicode TLDs out of scope v1),
//                     localhost, 1.2.3.4, marketing.app (the platform's own host)
const HOSTNAME_REGEX =
  /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

function normalizeHostname(input: string): string {
  // Strip protocol + trailing slash + leading "www." we ask user to enter the root + optionally www separately.
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

// Platform's own hostname — never claimable as a "custom" domain.
// Read from env; falls back to the development hostname.
function platformHostnames(): Set<string> {
  const host = (env.APP_URL ?? "http://localhost:3000")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return new Set([host, `www.${host}`, "localhost"]);
}

// ─── DNS instructions builder ────────────────────────────────────────────────

/**
 * Decide whether a hostname looks like a subdomain we should recommend a CNAME for.
 *
 * Heuristic: 3+ labels (e.g., cafe.swiftapp.ch) → subdomain → CNAME recommended.
 * 2 labels (e.g., swiftapp.ch) → root domain → A record recommended.
 *
 * This misclassifies compound-TLD apex domains (app.co.uk has 3 labels but is
 * effectively a root). That's why we always return BOTH records — the
 * `recommended` flag just nudges the user toward the conventional choice.
 *
 * Properly handling the Public Suffix List is doable but heavy; the trade-off
 * is acceptable because the user can always fall back to the other record.
 */
function isLikelySubdomain(hostname: string): boolean {
  return hostname.split(".").length >= 3;
}

export type DnsInstructions = {
  txt: { name: string; value: string };
  a: { name: string; value: string; ttl: number };
  cname: { name: string; value: string; ttl: number };
  /** Which of `a` / `cname` we suggest as the primary record for this hostname. */
  recommended: "a" | "cname";
};

function buildDnsInstructions(hostname: string, verifyToken: string): DnsInstructions {
  // The A record IP is the platform's edge IP. In production this would be
  // either Fly's anycast IP for the app or a dedicated TLS-terminating proxy.
  const edgeIp = env.PLATFORM_EDGE_IP ?? "185.199.108.153";
  // The CNAME target is a stable platform hostname. Set per deploy target.
  // Falls back to a placeholder so the UI still demonstrates the flow in dev.
  const edgeCname = env.PLATFORM_EDGE_CNAME ?? "proxy.marketing.app";
  return {
    txt: {
      name: `_marketing-verify.${hostname}`,
      value: `marketing-verify=${verifyToken}`,
    },
    a: {
      name: hostname,
      value: edgeIp,
      ttl: 3600,
    },
    cname: {
      name: hostname,
      value: edgeCname,
      ttl: 3600,
    },
    recommended: isLikelySubdomain(hostname) ? "cname" : "a",
  };
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const domainsRouter = router({
  // List this tenant's custom domains, newest first.
  list: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const rows = await db
      .select({
        id: customDomains.id,
        hostname: customDomains.hostname,
        status: customDomains.status,
        certIssuedAt: customDomains.certIssuedAt,
        certExpiresAt: customDomains.certExpiresAt,
        lastDnsCheckAt: customDomains.lastDnsCheckAt,
        lastDnsCheckError: customDomains.lastDnsCheckError,
        isPrimary: customDomains.isPrimary,
        createdAt: customDomains.createdAt,
        verifyToken: customDomains.verifyToken,
      })
      .from(customDomains)
      .where(and(eq(customDomains.tenantId, tenantId), ne(customDomains.status, "removed")))
      .orderBy(desc(customDomains.createdAt));
    return { domains: rows };
  }),

  // Add a new custom domain. Generates a verify token; the domain starts in
  // `pending_verification` until the user adds the TXT record and we confirm it.
  add: requires("admin")
    .input(z.object({ hostname: z.string().min(3).max(253) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const hostname = normalizeHostname(input.hostname);

      if (!HOSTNAME_REGEX.test(hostname)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid hostname. Use a format like 'cafebern.ch' or 'pages.cafebern.ch'.",
        });
      }
      if (platformHostnames().has(hostname)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't claim the platform's own hostname as a custom domain.",
        });
      }

      // Global uniqueness check — surface a friendly error instead of letting
      // the unique-constraint pop up as a DB exception.
      const [taken] = await db
        .select({
          id: customDomains.id,
          tenantId: customDomains.tenantId,
          status: customDomains.status,
        })
        .from(customDomains)
        .where(eq(customDomains.hostname, hostname));

      if (taken && taken.status !== "removed") {
        if (taken.tenantId === tenantId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You've already added this domain.",
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This domain is already claimed by another account. If you own it, contact support.",
        });
      }

      const verifyToken = crypto.randomUUID();
      const [row] = await db
        .insert(customDomains)
        .values({
          tenantId,
          hostname,
          verifyToken,
          status: "pending_verification",
        })
        .returning({
          id: customDomains.id,
          hostname: customDomains.hostname,
          verifyToken: customDomains.verifyToken,
        });

      return {
        id: row!.id,
        hostname: row!.hostname,
        dns: buildDnsInstructions(row!.hostname, row!.verifyToken),
      };
    }),

  // Re-fetch DNS instructions for an existing domain (e.g., user closed the modal).
  getDnsInstructions: tenantProcedure
    .input(z.object({ domainId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [row] = await db
        .select({ hostname: customDomains.hostname, verifyToken: customDomains.verifyToken })
        .from(customDomains)
        .where(and(eq(customDomains.tenantId, tenantId), eq(customDomains.id, input.domainId)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { hostname: row.hostname, dns: buildDnsInstructions(row.hostname, row.verifyToken) };
    }),

  // Trigger a one-shot DNS verification. Looks up the TXT record at
  // `_marketing-verify.<hostname>` and matches the expected token.
  // On success, moves the domain to `verified` and schedules cert issuance (stubbed).
  // Background worker also polls every 5 min, this is the synchronous "I added it now" button.
  verify: requires("admin")
    .input(z.object({ domainId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [row] = await db
        .select({
          id: customDomains.id,
          hostname: customDomains.hostname,
          verifyToken: customDomains.verifyToken,
          status: customDomains.status,
        })
        .from(customDomains)
        .where(and(eq(customDomains.tenantId, tenantId), eq(customDomains.id, input.domainId)));

      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status === "live") return { status: "live" as const, message: "Already live." };
      if (row.status === "cert_pending") {
        return {
          status: "cert_pending" as const,
          message: "HTTPS provisioning is already in progress.",
        };
      }

      const dnsResult = await checkVerifyToken(row.hostname, row.verifyToken);

      if (!dnsResult.ok) {
        await db
          .update(customDomains)
          .set({
            lastDnsCheckAt: new Date(),
            lastDnsCheckError: dnsResult.error ?? "DNS lookup failed",
            updatedAt: new Date(),
          })
          .where(eq(customDomains.id, row.id));
        return {
          status: "pending_verification" as const,
          message:
            dnsResult.error ??
            "Could not find the verification record yet. DNS sometimes takes up to 24h to propagate.",
        };
      }

      // DNS verified — flip status and enqueue cert issuance.
      await db
        .update(customDomains)
        .set({
          status: "cert_pending",
          lastDnsCheckAt: new Date(),
          lastDnsCheckError: null,
          updatedAt: new Date(),
        })
        .where(eq(customDomains.id, row.id));

      try {
        await enqueueDomainCertJob({
          domainId: row.id,
          tenantId,
          hostname: row.hostname,
          action: "issue",
          idempotencyKey: `${row.id}:issue`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(customDomains)
          .set({
            status: "failed",
            lastDnsCheckError: `Could not start HTTPS provisioning: ${message}`,
            updatedAt: new Date(),
          })
          .where(eq(customDomains.id, row.id));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DNS verified, but HTTPS provisioning could not be started. Please try again.",
        });
      }

      return {
        status: "cert_pending" as const,
        message: "Domain verified. Provisioning HTTPS — this usually takes under a minute.",
      };
    }),

  // Promote a verified domain to primary — drives canonical URLs + SEO tags.
  setPrimary: requires("admin")
    .input(z.object({ domainId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [target] = await db
        .select({ status: customDomains.status })
        .from(customDomains)
        .where(and(eq(customDomains.tenantId, tenantId), eq(customDomains.id, input.domainId)));
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.status !== "live") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only live domains can be set as primary.",
        });
      }
      // Clear any other primary in a single transaction.
      await db.transaction(async (tx) => {
        await tx
          .update(customDomains)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(customDomains.tenantId, tenantId), eq(customDomains.isPrimary, true)));
        await tx
          .update(customDomains)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(and(eq(customDomains.tenantId, tenantId), eq(customDomains.id, input.domainId)));
      });
      return { ok: true };
    }),

  // Soft-delete a domain. Releases the global uniqueness slot so the hostname
  // can be re-added later (or by another tenant if they own it).
  remove: requires("admin")
    .input(z.object({ domainId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      // Hard delete (rather than soft) so the hostname's UNIQUE slot is freed.
      // History is kept via outbox / audit log if needed (out of scope here).
      const result = await db
        .delete(customDomains)
        .where(and(eq(customDomains.tenantId, tenantId), eq(customDomains.id, input.domainId)));
      void result;
      return { ok: true };
    }),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Look up the TXT record at `_marketing-verify.<hostname>` and check whether
 * any of the returned strings exactly equals `marketing-verify=<verifyToken>`.
 * Returns `{ ok: true }` on match, otherwise `{ ok: false, error }`.
 */
async function checkVerifyToken(
  hostname: string,
  verifyToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const expected = `marketing-verify=${verifyToken}`;
  try {
    // Use Node's `dns/promises` — server-only, fine inside tRPC handler.
    const { resolveTxt } = await import("dns/promises");
    const records = await resolveTxt(`_marketing-verify.${hostname}`);
    // Each record is an array of strings (TXT records can be chunked).
    for (const record of records) {
      if (record.join("") === expected) return { ok: true };
    }
    return {
      ok: false,
      error: "Verification TXT record not found yet. It may take a few minutes after you add it.",
    };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return {
        ok: false,
        error:
          "Couldn't find any DNS records for that name yet. Check the TXT record and try again in a few minutes.",
      };
    }
    return { ok: false, error: `DNS lookup failed: ${String(err)}` };
  }
}
