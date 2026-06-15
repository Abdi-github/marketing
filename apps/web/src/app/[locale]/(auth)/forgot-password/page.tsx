"use client";

import React, { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

export default function ForgotPasswordPage() {
  const locale = useLocale();
  const t = useTranslations("Login");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    // Best-effort call; always show the same success message to avoid email enumeration.
    await fetch("/api/auth/forget-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        redirectTo: `/${locale}/login`,
      }),
      credentials: "include",
    }).catch(() => null);
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="w-full space-y-4">
      <h1 className="text-2xl font-bold">{t("forgotTitle")}</h1>

      {submitted ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {t("forgotSent")}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-600">{t("forgotIntro")}</p>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="email">
              {t("email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-black py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? t("submitting") : t("forgotSubmit")}
          </button>
        </form>
      )}

      <p className="text-center text-sm">
        <a href={`/${locale}/login`} className="text-gray-500 hover:text-gray-700">
          {t("backToLogin")}
        </a>
      </p>
    </div>
  );
}
