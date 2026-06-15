"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

export default function SignupPage() {
  const locale = useLocale();
  const t = useTranslations("Signup");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get("name") as string,
      email: form.get("email") as string,
      password: form.get("password") as string,
      businessName: form.get("businessName") as string,
    };

    try {
      // Step 1: atomic signup via tRPC (non-batch: plain input body).
      const signupRes = await fetch("/api/trpc/auth.signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!signupRes.ok) {
        const data = await signupRes.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? data?.[0]?.error?.json?.message ?? "Signup failed");
      }

      // Step 2: sign in via Better-Auth to issue the session cookie.
      const loginRes = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: body.email, password: body.password }),
        credentials: "include",
      });
      if (!loginRes.ok) {
        throw new Error("Signup succeeded but login failed — please log in manually.");
      }

      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">{t("welcomeTitle")}</h1>
        <p className="text-gray-600">
          {t("welcomeBody")}{" "}
          <a href={`/${locale}/dashboard`} className="underline">
            {t("goToDashboard")}
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">{error}</p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="name">
          {t("name")}
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

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
        <label className="mb-1 block text-sm font-medium" htmlFor="password">
          {t("password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="businessName">
          {t("businessName")}
        </label>
        <input
          id="businessName"
          name="businessName"
          type="text"
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
        {t("haveAccount")}{" "}
        <Link href={`/${locale}/login`} className="font-medium text-gray-700 underline">
          {t("loginLink")}
        </Link>
      </p>
    </form>
  );
}
