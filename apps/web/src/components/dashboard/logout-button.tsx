"use client";

import { useState } from "react";

type Props = {
  label: string;
  locale: string;
};

export function LogoutButton({ label, locale }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort sign-out; cookies expire either way.
    } finally {
      window.location.href = `/${locale}/login`;
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
    >
      {loading ? "…" : label}
    </button>
  );
}
