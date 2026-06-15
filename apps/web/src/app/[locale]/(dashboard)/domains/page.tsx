"use client";

// step-32+: Custom domains dashboard.
// List, add, verify, promote-to-primary, and remove domains for the current tenant.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "../../../../lib/trpc";

type DnsInstructions = {
  txt: { name: string; value: string };
  a: { name: string; value: string; ttl: number };
  cname: { name: string; value: string; ttl: number };
  /** Which of A or CNAME we suggest as the primary record. */
  recommended: "a" | "cname";
};

type Domain = {
  id: string;
  hostname: string;
  status: "pending_verification" | "verified" | "cert_pending" | "live" | "failed" | "removed";
  certIssuedAt: string | null;
  certExpiresAt: string | null;
  lastDnsCheckAt: string | null;
  lastDnsCheckError: string | null;
  isPrimary: boolean;
  createdAt: string;
  verifyToken: string;
};

const STATUS_META: Record<Domain["status"], { label: string; tone: string; description: string }> =
  {
    pending_verification: {
      label: "Pending DNS",
      tone: "bg-amber-50 text-amber-700 border-amber-200",
      description: "Waiting for you to add the TXT record.",
    },
    verified: {
      label: "Verified",
      tone: "bg-blue-50 text-blue-700 border-blue-200",
      description: "DNS confirmed. Provisioning HTTPS…",
    },
    cert_pending: {
      label: "Issuing HTTPS",
      tone: "bg-blue-50 text-blue-700 border-blue-200",
      description: "Requesting Let's Encrypt certificate.",
    },
    live: {
      label: "Live",
      tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
      description: "Visitors can reach your pages on this domain.",
    },
    failed: {
      label: "Failed",
      tone: "bg-red-50 text-red-700 border-red-200",
      description: "Something went wrong. Remove and re-add to retry.",
    },
    removed: {
      label: "Removed",
      tone: "bg-gray-100 text-gray-500 border-gray-200",
      description: "Soft-deleted.",
    },
  };

function daysUntil(date: Date, now = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export default function DomainsPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params.locale;
  const t = useTranslations("Domains");

  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [dnsModal, setDnsModal] = useState<{
    hostname: string;
    dns: DnsInstructions;
    domainId: string;
  } | null>(null);

  const loadDomains = useCallback(async () => {
    try {
      const data = await trpc.domains.list.query();
      setDomains(data.domains as Domain[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load domains");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  // Poll while any domain is mid-flight (pending or cert_pending) so the UI
  // reflects the worker's progress without the user clicking refresh.
  useEffect(() => {
    const inFlight = domains.some(
      (d) => d.status === "pending_verification" || d.status === "cert_pending",
    );
    if (!inFlight) return;
    const interval = setInterval(() => {
      void loadDomains();
    }, 5000);
    return () => clearInterval(interval);
  }, [domains, loadDomains]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            {t.rich("description", { code: (c) => <span className="font-mono">{c}</span> })}
          </p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
        >
          {t("addDomain")}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">{t("loading")}</div>
      ) : domains.length === 0 ? (
        <EmptyState onAdd={() => setAddModalOpen(true)} />
      ) : (
        <div className="space-y-3">
          {domains.map((d) => (
            <DomainRow
              key={d.id}
              domain={d}
              onShowDns={async () => {
                try {
                  const r = await trpc.domains.getDnsInstructions.query({ domainId: d.id });
                  setDnsModal({
                    hostname: r.hostname,
                    dns: r.dns as DnsInstructions,
                    domainId: d.id,
                  });
                } catch (e) {
                  setDnsModal({ hostname: d.hostname, dns: buildLocalDns(d), domainId: d.id });
                  setError(e instanceof Error ? e.message : "Failed to load DNS instructions");
                }
              }}
              onVerify={async () => {
                try {
                  const r = await trpc.domains.verify.mutate({ domainId: d.id });
                  if (r.status === "cert_pending" || r.status === "live") {
                    // Optimistic: poll loop will catch up
                  } else {
                    setError(r.message);
                  }
                  await loadDomains();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Verification failed");
                }
              }}
              onSetPrimary={async () => {
                try {
                  await trpc.domains.setPrimary.mutate({ domainId: d.id });
                  await loadDomains();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to set primary");
                }
              }}
              onRemove={async () => {
                if (!confirm(`Remove ${d.hostname}? This will stop traffic on this domain.`))
                  return;
                try {
                  await trpc.domains.remove.mutate({ domainId: d.id });
                  await loadDomains();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Remove failed");
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Sidebar info card */}
      <aside className="mt-12 rounded-xl border border-gray-200 bg-gray-50 p-5">
        <p className="mb-2 text-sm font-semibold text-gray-900">{t("howItWorksTitle")}</p>
        <ol className="list-inside list-decimal space-y-1.5 text-sm leading-relaxed text-gray-600">
          <li>{t("howItWorks1")}</li>
          <li>{t("howItWorks2")}</li>
          <li>{t("howItWorks3")}</li>
          <li>{t("howItWorks4")}</li>
        </ol>
      </aside>

      {/* Add domain modal */}
      {addModalOpen && (
        <AddDomainModal
          onClose={() => setAddModalOpen(false)}
          onAdded={async (hostname, dns, domainId) => {
            setAddModalOpen(false);
            setDnsModal({ hostname, dns, domainId });
            await loadDomains();
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* DNS instructions modal */}
      {dnsModal && (
        <DnsInstructionsModal
          hostname={dnsModal.hostname}
          dns={dnsModal.dns}
          domainId={dnsModal.domainId}
          onClose={() => setDnsModal(null)}
          onVerify={async () => {
            try {
              const r = await trpc.domains.verify.mutate({ domainId: dnsModal.domainId });
              await loadDomains();
              if (r.status === "cert_pending" || r.status === "live") {
                setDnsModal(null);
              } else {
                setError(r.message);
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "Verification failed");
            }
          }}
        />
      )}

      <button
        onClick={() => router.push(`/${locale}/landing-pages`)}
        className="mt-8 text-sm text-gray-500 hover:text-gray-700"
      >
        {t("backToLandingPages")}
      </button>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function buildLocalDns(d: Domain): DnsInstructions {
  // Mirror of the server's buildDnsInstructions — used when re-opening the
  // modal for an existing domain without a round-trip. The placeholder IP /
  // CNAME values are overridden by `getDnsInstructions` when the user actually
  // opens the modal (we just want a synchronous initial render).
  const isSubdomain = d.hostname.split(".").length >= 3;
  return {
    txt: { name: `_marketing-verify.${d.hostname}`, value: `marketing-verify=${d.verifyToken}` },
    a: { name: d.hostname, value: "185.199.108.153", ttl: 3600 },
    cname: { name: d.hostname, value: "proxy.marketing.app", ttl: 3600 },
    recommended: isSubdomain ? "cname" : "a",
  };
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations("Domains");
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-20 text-center">
      <div className="mb-4 text-5xl">🌐</div>
      <h2 className="mb-2 text-lg font-bold text-gray-900">{t("emptyTitle")}</h2>
      <p className="mx-auto mb-6 max-w-md text-sm text-gray-500">
        {t.rich("emptyBody", { code: (c) => <span className="font-mono">{c}</span> })}
      </p>
      <button
        onClick={onAdd}
        className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
      >
        {t("addFirstDomain")}
      </button>
    </div>
  );
}

function DomainRow({
  domain,
  onShowDns,
  onVerify,
  onSetPrimary,
  onRemove,
}: {
  domain: Domain;
  onShowDns: () => void;
  onVerify: () => void | Promise<void>;
  onSetPrimary: () => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  const meta = STATUS_META[domain.status];
  const isLive = domain.status === "live";
  const needsAction = domain.status === "pending_verification" || domain.status === "failed";
  const certDaysRemaining =
    domain.certExpiresAt !== null ? daysUntil(new Date(domain.certExpiresAt)) : null;
  const certExpiresSoon = isLive && certDaysRemaining !== null && certDaysRemaining <= 14;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="truncate font-mono font-semibold text-gray-900">{domain.hostname}</h3>
            <span className={`rounded border px-2 py-0.5 text-xs font-medium ${meta.tone}`}>
              {meta.label}
            </span>
            {domain.isPrimary && (
              <span className="rounded border border-purple-200 bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                ★ Primary
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{meta.description}</p>
          {isLive && (
            <a
              href={`https://${domain.hostname}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-blue-600 hover:underline"
            >
              https://{domain.hostname} ↗
            </a>
          )}
          {domain.lastDnsCheckError && needsAction && (
            <p className="mt-2 text-xs text-red-600">{domain.lastDnsCheckError}</p>
          )}
          {isLive && domain.lastDnsCheckError && !needsAction && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              Certificate renewal warning: {domain.lastDnsCheckError}
            </p>
          )}
          {certExpiresSoon && !domain.lastDnsCheckError && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              Certificate expires in {certDaysRemaining} day{certDaysRemaining === 1 ? "" : "s"}.
              Renewal is scheduled automatically.
            </p>
          )}
          {isLive && domain.certExpiresAt && (
            <p className="mt-1 text-xs text-gray-400">
              Certificate renews automatically · expires{" "}
              {new Date(domain.certExpiresAt).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {needsAction && (
            <>
              <button
                onClick={onShowDns}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
              >
                DNS instructions
              </button>
              <button
                onClick={onVerify}
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Verify now
              </button>
            </>
          )}
          {isLive && !domain.isPrimary && (
            <button
              onClick={onSetPrimary}
              className="rounded-lg border border-purple-300 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-50"
            >
              Set as primary
            </button>
          )}
          <button
            onClick={onRemove}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function AddDomainModal({
  onClose,
  onAdded,
  onError,
}: {
  onClose: () => void;
  onAdded: (hostname: string, dns: DnsInstructions, domainId: string) => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [hostname, setHostname] = useState("");
  const [adding, setAdding] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900">Add a custom domain</h2>
          <p className="mt-1 text-sm text-gray-500">
            Enter the hostname you own. We&apos;ll show you the DNS records to add at your
            registrar.
          </p>
        </div>
        <form
          className="p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (adding || !hostname.trim()) return;
            setAdding(true);
            try {
              const r = await trpc.domains.add.mutate({ hostname: hostname.trim() });
              await onAdded(r.hostname, r.dns as DnsInstructions, r.id);
            } catch (err) {
              onError(err instanceof Error ? err.message : "Failed to add domain");
            } finally {
              setAdding(false);
            }
          }}
        >
          <label className="mb-2 block text-sm font-medium text-gray-700">Hostname</label>
          <input
            type="text"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="cafebern.ch  or  cafe.swiftapp.ch"
            autoFocus
            className="w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 font-mono text-sm focus:border-gray-900 focus:outline-none"
          />
          <div className="mt-2 space-y-1">
            <p className="text-xs text-gray-500">
              No <span className="font-mono">https://</span>, no trailing slash — just the hostname.
            </p>
            <p className="text-xs text-gray-500">
              Works with <span className="font-medium">root domains</span> (
              <span className="font-mono">cafebern.ch</span>),
              <span className="font-medium"> www subdomains</span> (
              <span className="font-mono">www.cafebern.ch</span>), and{" "}
              <span className="font-medium">custom subdomains</span> of a domain you already own (
              <span className="font-mono">cafe.swiftapp.ch</span>).
            </p>
            <p className="text-xs text-gray-500">
              You can add multiple hostnames — each one gets its own DNS records.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adding || !hostname.trim()}
              className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
            >
              {adding ? "Adding…" : "Add domain"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DnsInstructionsModal({
  hostname,
  dns,
  onClose,
  onVerify,
}: {
  hostname: string;
  dns: DnsInstructions;
  domainId: string;
  onClose: () => void;
  onVerify: () => void | Promise<void>;
}) {
  const [verifying, setVerifying] = useState(false);
  const [showAlternative, setShowAlternative] = useState(false);

  const isSubdomainRec = dns.recommended === "cname";
  const recommendedRecord = dns.recommended === "cname" ? dns.cname : dns.a;
  const alternativeRecord = dns.recommended === "cname" ? dns.a : dns.cname;
  const recommendedType = dns.recommended === "cname" ? "CNAME" : "A";
  const alternativeType = dns.recommended === "cname" ? "A" : "CNAME";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900">
            DNS records for <span className="font-mono">{hostname}</span>
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Add these two records at your registrar (Hostpoint, Infomaniak, Cyon, Switch). They
            usually take a few minutes to propagate.
          </p>
          {isSubdomainRec && (
            <p className="mt-3 inline-block rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs text-purple-700">
              📍 This looks like a subdomain — we recommend a CNAME record below.
            </p>
          )}
        </div>

        <div className="space-y-5 p-6">
          <DnsRecordBlock
            title="1. Verification record"
            description="Proves you own this domain. We check this before issuing the certificate."
            type="TXT"
            name={dns.txt.name}
            value={dns.txt.value}
            ttl="3600 (1 hour)"
          />
          <DnsRecordBlock
            title="2. Traffic record"
            description={
              isSubdomainRec
                ? "Sends visitors to our edge. CNAMEs auto-follow our IP if it ever changes — best practice for subdomains."
                : "Sends visitors to our edge so we can serve your pages."
            }
            type={recommendedType}
            name={recommendedRecord.name}
            value={recommendedRecord.value}
            ttl={`${recommendedRecord.ttl} (1 hour)`}
            badge="Recommended"
          />

          <div>
            <button
              onClick={() => setShowAlternative((v) => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <span className="font-mono">{showAlternative ? "▾" : "▸"}</span>
              {showAlternative ? "Hide" : "Show"} {alternativeType} alternative
              <span className="ml-1 text-gray-400">
                (
                {alternativeType === "CNAME"
                  ? "for subdomains, if your registrar prefers it"
                  : "if your registrar doesn't support CNAMEs at this name"}
                )
              </span>
            </button>
            {showAlternative && (
              <div className="mt-3">
                <DnsRecordBlock
                  title={`Alternative: ${alternativeType} record`}
                  description={
                    alternativeType === "CNAME"
                      ? "Use this if your registrar nudges you toward CNAMEs (typical for subdomains)."
                      : "Use this if your registrar doesn't allow CNAMEs at this hostname (typical for root domains)."
                  }
                  type={alternativeType}
                  name={alternativeRecord.name}
                  value={alternativeRecord.value}
                  ttl={`${alternativeRecord.ttl} (1 hour)`}
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="mb-1 font-semibold">💡 Tip</p>
            <p className="leading-relaxed">
              If you don&apos;t manage your DNS, email these records to your web admin or hosting
              provider. They&apos;ll know what to do.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-6">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            I&apos;ll do this later
          </button>
          <button
            onClick={async () => {
              setVerifying(true);
              await onVerify();
              setVerifying(false);
            }}
            disabled={verifying}
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {verifying ? "Checking DNS…" : "I've added them — verify now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DnsRecordBlock({
  title,
  description,
  type,
  name,
  value,
  ttl,
  badge,
}: {
  title: string;
  description: string;
  type: string;
  name: string;
  value: string;
  ttl: string;
  /** Optional badge shown next to the title (e.g., "Recommended"). */
  badge?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {badge && (
            <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          <Row label="Type" value={type} fieldKey="type" onCopy={copy} copied={copied} />
          <Row label="Name" value={name} fieldKey="name" onCopy={copy} copied={copied} />
          <Row label="Value" value={value} fieldKey="value" onCopy={copy} copied={copied} />
          <Row label="TTL" value={ttl} fieldKey="ttl" onCopy={copy} copied={copied} />
        </tbody>
      </table>
    </div>
  );
}

function Row({
  label,
  value,
  fieldKey,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  fieldKey: string;
  onCopy: (k: string, v: string) => void;
  copied: string | null;
}) {
  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="w-24 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </td>
      <td className="break-all px-4 py-2.5 font-mono text-sm text-gray-900">{value}</td>
      <td className="w-20 px-2 py-2.5">
        <button
          onClick={() => onCopy(fieldKey, value)}
          className="text-xs text-blue-600 hover:underline"
        >
          {copied === fieldKey ? "Copied ✓" : "Copy"}
        </button>
      </td>
    </tr>
  );
}
