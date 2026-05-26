"use client";

import React, { useState } from "react";

export default function SignupPage() {
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
      // Step 1: atomic signup via tRPC.
      const signupRes = await fetch("/api/trpc/auth.signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "0": { json: body } }),
      });
      if (!signupRes.ok) {
        const data = await signupRes.json().catch(() => ({}));
        throw new Error(data?.[0]?.error?.json?.message ?? "Signup failed");
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Welcome!</h1>
          <p className="text-gray-600">Your account is ready. <a href="/" className="underline">Go to dashboard</a></p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-lg shadow w-full max-w-md space-y-4"
      >
        <h1 className="text-2xl font-bold">Create your account</h1>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="password">
            Password (min. 8 characters)
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="businessName">
            Business name
          </label>
          <input
            id="businessName"
            name="businessName"
            type="text"
            required
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <a href="/login" className="underline">
            Log in
          </a>
        </p>
      </form>
    </div>
  );
}
