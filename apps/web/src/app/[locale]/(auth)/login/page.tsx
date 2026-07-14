"use client";

import React, { Suspense, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

type LoginErrorKind = "invalid" | "session" | "server";

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function classifySignInFailure(res: Response): Promise<LoginErrorKind> {
  const text = await res.text().catch(() => "");
  const normalized = text.toLowerCase();

  if (
    res.status === 400 ||
    res.status === 401 ||
    res.status === 403 ||
    normalized.includes("invalid") ||
    normalized.includes("credential") ||
    normalized.includes("password")
  ) {
    return "invalid";
  }

  return "server";
}

function LoginForm() {
  const locale = useLocale();
  const t = useTranslations("Login");
  const searchParams = useSearchParams();
  const initialError = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    initialError === "invalid"
      ? t("invalidCredentials")
      : initialError === "server"
        ? t("genericError")
        : null,
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      const res = await fetchWithTimeout("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          email,
          password,
        }),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(await classifySignInFailure(res));
      }

      const sessionCheck = await fetchWithTimeout("/api/session/check", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      if (sessionCheck.ok) {
        window.location.href = `/${locale}/dashboard`;
        return;
      }

      setError(t("sessionUnavailable"));
      window.location.href = `/${locale}/dashboard`;
    } catch (err) {
      if (err instanceof Error && err.message === "invalid") {
        setError(t("invalidCredentials"));
        return;
      }

      if (err instanceof Error && err.message === "session") {
        setError(t("sessionUnavailable"));
        return;
      }

      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      action="/api/auth/login"
      method="post"
      onSubmit={handleSubmit}
      className="w-full space-y-4"
    >
      <input type="hidden" name="locale" value={locale} />
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {error && (
        <p
          aria-live="polite"
          className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600"
        >
          {error}
        </p>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-80 w-full animate-pulse bg-gray-50" />}>
      <LoginForm />
    </Suspense>
  );
}
