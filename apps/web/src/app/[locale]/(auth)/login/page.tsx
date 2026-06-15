"use client";

import React, { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

export default function LoginPage() {
  const locale = useLocale();
  const t = useTranslations("Login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("invalid");
      }

      window.location.href = `/${locale}/dashboard`;
    } catch (err) {
      setError(
        err instanceof Error && err.message === "invalid"
          ? t("invalidCredentials")
          : t("genericError"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">{error}</p>
      )}

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

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label className="block text-sm font-medium" htmlFor="password">
            {t("password")}
          </label>
          <a
            href={`/${locale}/forgot-password`}
            className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
          >
            {t("forgotPassword")}
          </a>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-black py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? t("submitting") : t("submit")}
      </button>

      <p className="text-center text-sm text-gray-500">
        {t("noAccount")}{" "}
        <a href={`/${locale}/signup`} className="font-medium text-gray-700 underline">
          {t("signupLink")}
        </a>
      </p>
    </form>
  );
}
