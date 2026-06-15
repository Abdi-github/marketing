"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "../../../../../lib/trpc";

type SendingDomain = Awaited<ReturnType<typeof trpc.sequences.listSendingDomains.query>>[number];

function statusLabel(status: string): string {
  if (status === "verified") return "Verified";
  if (status === "failed") return "Failed";
  return "Pending DNS";
}

function statusClass(status: string): string {
  if (status === "verified") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "failed") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function EmailSettingsPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "en";
  const [domains, setDomains] = useState<SendingDomain[]>([]);
  const [domain, setDomain] = useState("");
  const [fromName, setFromName] = useState("MarketingAI CH");
  const [fromLocalPart, setFromLocalPart] = useState("hello");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadDomains() {
    const rows = await trpc.sequences.listSendingDomains.query();
    setDomains(rows);
  }

  useEffect(() => {
    loadDomains().catch((err) => setError(String(err)));
  }, []);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setMessage(null);
    setError(null);
    try {
      await fn();
      await loadDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function addDomain() {
    await run("add", async () => {
      await trpc.sequences.addSendingDomain.mutate({
        domain,
        fromName,
        fromLocalPart,
      });
      setDomain("");
      setMessage("Domain added. Add the TXT verification record, then click Verify.");
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">Automation</p>
          <h1 className="text-2xl font-bold text-gray-900">Email settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Verify sending domains and choose the sender address used by templates and sequences.
          </p>
        </div>
        <Link
          href={`/${locale}/emails`}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Back to templates
        </Link>
      </div>

      {(message || error) && (
        <div
          className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ?? message}
        </div>
      )}

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-900">Add sending domain</h2>
        <p className="mt-1 text-sm text-gray-500">
          Use a domain you control. We will ask you to add a TXT record before it can send.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-[1.3fr_1fr_0.7fr_auto]">
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Domain
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.ch"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            From name
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Mailbox
            <input
              value={fromLocalPart}
              onChange={(e) => setFromLocalPart(e.target.value)}
              placeholder="hello"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <button
            type="button"
            onClick={addDomain}
            disabled={busy !== null || domain.trim().length < 3}
            className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "add" ? "Adding..." : "Add"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Sending domains</h2>
          <p className="mt-1 text-sm text-gray-500">
            Verified primary domains are used as the sender for real email delivery.
          </p>
        </div>

        {domains.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-500">
            No sending domains yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {domains.map((item) => (
              <div key={item.id} className="grid gap-4 px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900">{item.domain}</h3>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(
                          item.status,
                        )}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                      {item.isPrimary && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      Sender: {item.fromName} &lt;{item.fromLocalPart}@{item.domain}&gt;
                    </p>
                    {item.lastDnsCheckError && (
                      <p className="mt-1 text-sm text-amber-700">{item.lastDnsCheckError}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        run(`verify:${item.id}`, async () => {
                          const result = await trpc.sequences.verifySendingDomain.mutate({
                            domainId: item.id,
                          });
                          setMessage(
                            result.ok
                              ? "Domain verified."
                              : "error" in result
                                ? (result.error ?? "DNS record not found yet.")
                                : "DNS record not found yet.",
                          );
                        })
                      }
                      disabled={busy !== null}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {busy === `verify:${item.id}` ? "Checking..." : "Verify"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        run(`primary:${item.id}`, () =>
                          trpc.sequences.setPrimarySendingDomain.mutate({ domainId: item.id }),
                        )
                      }
                      disabled={busy !== null || item.status !== "verified" || item.isPrimary}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Set primary
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        run(`remove:${item.id}`, () =>
                          trpc.sequences.removeSendingDomain.mutate({ domainId: item.id }),
                        )
                      }
                      disabled={busy !== null}
                      className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 rounded-lg bg-gray-50 p-4 text-sm md:grid-cols-3">
                  {Object.entries(item.dns).map(([key, record]) => (
                    <div key={key} className="grid gap-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {key}
                      </div>
                      <div className="font-medium text-gray-800">{record.type}</div>
                      <code className="break-all rounded bg-white px-2 py-1 text-xs text-gray-700">
                        {record.name}
                      </code>
                      <code className="break-all rounded bg-white px-2 py-1 text-xs text-gray-700">
                        {record.value}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
