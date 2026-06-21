"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { trpc } from "../../../../../lib/trpc";

// UI language options — map to the URL locale prefix (e.g. /de/, /en/)
const UI_LOCALES = [
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
] as const;

// AI content language options — stored in business profile, used when generating copy
const CONTENT_LOCALES = [
  { value: "de-CH", label: "Deutsch (Schweiz)" },
  { value: "fr-CH", label: "Français (Suisse)" },
  { value: "it-CH", label: "Italiano (Ticino)" },
  { value: "en", label: "English" },
] as const;

type ProfileLocale = "de-CH" | "fr-CH" | "it-CH" | "en";
type UiLocale = "de" | "fr" | "it" | "en";
type LeadChannelPreference = "auto" | "email" | "whatsapp" | "sms";
type LeadCaptureSettings = {
  preferredConfirmationChannel?: LeadChannelPreference;
  autoAcknowledgementEnabled?: boolean;
  aiReplyAssistanceEnabled?: boolean;
  reservationConfirmationMessage?: string | null;
  callbackConfirmationMessage?: string | null;
  quoteConfirmationMessage?: string | null;
  genericConfirmationMessage?: string | null;
};

type InitialProfile = {
  businessName: string;
  vertical: string;
  locale: ProfileLocale;
  addressCity: string;
  leadCaptureSettings: LeadCaptureSettings;
} | null;

export function SetupForm({
  initialProfile,
  locale,
}: {
  initialProfile: InitialProfile;
  locale: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [businessName, setBusinessName] = useState(initialProfile?.businessName ?? "");
  const [vertical, setVertical] = useState(initialProfile?.vertical ?? "");
  const [profileLocale, setProfileLocale] = useState<ProfileLocale>(initialProfile?.locale ?? "en");
  const [addressCity, setAddressCity] = useState(initialProfile?.addressCity ?? "");
  const [preferredChannel, setPreferredChannel] = useState<LeadChannelPreference>(
    initialProfile?.leadCaptureSettings.preferredConfirmationChannel ?? "auto",
  );
  const [autoAcknowledgementEnabled, setAutoAcknowledgementEnabled] = useState(
    initialProfile?.leadCaptureSettings.autoAcknowledgementEnabled ?? true,
  );
  const [aiReplyAssistanceEnabled, setAiReplyAssistanceEnabled] = useState(
    initialProfile?.leadCaptureSettings.aiReplyAssistanceEnabled ?? true,
  );
  const [reservationConfirmationMessage, setReservationConfirmationMessage] = useState(
    initialProfile?.leadCaptureSettings.reservationConfirmationMessage ?? "",
  );
  const [callbackConfirmationMessage, setCallbackConfirmationMessage] = useState(
    initialProfile?.leadCaptureSettings.callbackConfirmationMessage ?? "",
  );
  const [quoteConfirmationMessage, setQuoteConfirmationMessage] = useState(
    initialProfile?.leadCaptureSettings.quoteConfirmationMessage ?? "",
  );
  const [genericConfirmationMessage, setGenericConfirmationMessage] = useState(
    initialProfile?.leadCaptureSettings.genericConfirmationMessage ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function switchUiLocale(newLocale: UiLocale) {
    if (newLocale === locale) return;
    const segments = pathname.split("/");
    segments[1] = newLocale;
    router.push(segments.join("/"));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await trpc.tenancy.upsertBusinessProfile.mutate({
        businessName: businessName.trim(),
        vertical: vertical.trim(),
        locale: profileLocale,
        addressCity: addressCity.trim() || undefined,
        leadCaptureSettings: {
          preferredConfirmationChannel: preferredChannel,
          autoAcknowledgementEnabled,
          aiReplyAssistanceEnabled,
          reservationConfirmationMessage: reservationConfirmationMessage.trim() || undefined,
          callbackConfirmationMessage: callbackConfirmationMessage.trim() || undefined,
          quoteConfirmationMessage: quoteConfirmationMessage.trim() || undefined,
          genericConfirmationMessage: genericConfirmationMessage.trim() || undefined,
        },
      });
      router.push(`/${locale}/dashboard/posts/new`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-50 p-8">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure your business profile and interface preferences.
          </p>
        </div>

        {/* Interface language — changes the URL locale, takes effect immediately */}
        <div className="space-y-3 rounded-lg bg-white p-6 shadow">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Interface Language</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Changes the language of the dashboard UI.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {UI_LOCALES.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => switchUiLocale(l.value as UiLocale)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  locale === l.value
                    ? "border-black bg-black text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-500"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Business profile */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Business Profile</h2>
            <p className="-mt-2 mb-3 text-xs text-gray-400">
              Used by the AI to generate posts and landing pages for your business.
            </p>
          </div>

          {error && (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="businessName">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              id="businessName"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Café Central, Pixel Agency, Studio Alpina…"
              required
              maxLength={200}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="vertical">
              Industry <span className="text-red-500">*</span>
            </label>
            <input
              id="vertical"
              type="text"
              list="vertical-suggestions"
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              placeholder="e.g. Restaurant, Web Design Agency, Tattoo Studio…"
              required
              minLength={2}
              maxLength={100}
              className="w-full rounded border px-3 py-2 text-sm"
            />
            <datalist id="vertical-suggestions">
              <option value="Restaurant" />
              <option value="Café / Bakery" />
              <option value="Gym / Fitness" />
              <option value="Hair Salon / Beauty" />
              <option value="Web Design Agency" />
              <option value="Software Company" />
              <option value="Retail" />
              <option value="Tattoo Studio" />
              <option value="Physiotherapy" />
              <option value="Yoga Studio" />
              <option value="Driving School" />
              <option value="Cleaning Service" />
            </datalist>
            <p className="mt-1 text-xs text-gray-400">
              Type your industry freely or pick a suggestion.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="profileLocale">
              AI Content Language
            </label>
            <select
              id="profileLocale"
              value={profileLocale}
              onChange={(e) => setProfileLocale(e.target.value as ProfileLocale)}
              className="w-full rounded border bg-white px-3 py-2 text-sm"
            >
              {CONTENT_LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Language used by AI when generating your posts and page copy. Does not affect the
              dashboard UI.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="addressCity">
              City
            </label>
            <input
              id="addressCity"
              type="text"
              value={addressCity}
              onChange={(e) => setAddressCity(e.target.value)}
              placeholder="e.g. Zurich, Bern, Lugano…"
              maxLength={100}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Lead Follow-up Automation</h3>
              <p className="mt-1 text-xs text-gray-500">
                Choose how confirmations are sent after a form or WhatsApp lead is captured, and
                optionally override the default wording.
              </p>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium" htmlFor="preferredChannel">
                Preferred confirmation channel
              </label>
              <select
                id="preferredChannel"
                value={preferredChannel}
                onChange={(e) => setPreferredChannel(e.target.value as LeadChannelPreference)}
                className="w-full rounded border bg-white px-3 py-2 text-sm"
              >
                <option value="auto">Auto (email, then WhatsApp, then SMS)</option>
                <option value="email">Email first</option>
                <option value="whatsapp">WhatsApp first</option>
                <option value="sms">SMS first</option>
              </select>
            </div>

            <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-white p-3">
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={autoAcknowledgementEnabled}
                  onChange={(e) => setAutoAcknowledgementEnabled(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-gray-800">
                    Send automatic acknowledgements
                  </span>
                  <span className="text-xs text-gray-500">
                    Capture the lead, create staff work, and immediately send a safe confirmation
                    when the selected channel allows it.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={aiReplyAssistanceEnabled}
                  onChange={(e) => setAiReplyAssistanceEnabled(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-gray-800">
                    Use AI assistance for generic WhatsApp replies
                  </span>
                  <span className="text-xs text-gray-500">
                    AI can draft friendly replies for general questions. Reservations and business
                    commitments stay staff-controlled.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Reservation confirmation wording
                </span>
                <textarea
                  value={reservationConfirmationMessage}
                  onChange={(e) => setReservationConfirmationMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Optional custom text for restaurant bookings or appointments."
                  className="w-full rounded border bg-white px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Callback confirmation wording
                </span>
                <textarea
                  value={callbackConfirmationMessage}
                  onChange={(e) => setCallbackConfirmationMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Optional custom text for call-back leads."
                  className="w-full rounded border bg-white px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Quote confirmation wording
                </span>
                <textarea
                  value={quoteConfirmationMessage}
                  onChange={(e) => setQuoteConfirmationMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Optional custom text for quote or service inquiries."
                  className="w-full rounded border bg-white px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  General confirmation wording
                </span>
                <textarea
                  value={genericConfirmationMessage}
                  onChange={(e) => setGenericConfirmationMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Optional custom text for generic leads."
                  className="w-full rounded border bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || !businessName.trim() || !vertical.trim()}
            className="w-full rounded bg-black py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : initialProfile ? "Save changes" : "Create profile & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
