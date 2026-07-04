"use client";

import { useEffect } from "react";

export default function PublicLandingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Public landing page render failed", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "#fff7f8",
        color: "#3f0a1a",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <section
        style={{
          width: "min(100%, 520px)",
          borderRadius: 18,
          background: "#ffffff",
          border: "1px solid #f4cdd5",
          boxShadow: "0 24px 70px rgba(80, 7, 31, 0.12)",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: "0 0 0.75rem",
            fontSize: "0.78rem",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#be123c",
          }}
        >
          Page temporarily unavailable
        </p>
        <h1 style={{ margin: 0, fontSize: "1.75rem", lineHeight: 1.15 }}>
          Please try opening this page again.
        </h1>
        <p style={{ margin: "1rem 0 1.5rem", color: "#7f1d1d", lineHeight: 1.6 }}>
          We could not load the request page correctly. Your browser can retry now, or you can
          contact the business directly if the page keeps showing this message.
        </p>
        <div
          style={{ display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}
        >
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 999,
              background: "#be123c",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 800,
              padding: "0.8rem 1.25rem",
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: "1px solid #f4cdd5",
              borderRadius: 999,
              background: "#ffffff",
              color: "#881337",
              cursor: "pointer",
              fontWeight: 800,
              padding: "0.8rem 1.25rem",
            }}
          >
            Reload page
          </button>
        </div>
      </section>
    </main>
  );
}
