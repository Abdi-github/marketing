"use client";

// FADP-compliant consent banner for public landing pages.
// Checks __tc cookie; if absent, shows a sticky bar.
// On accept: sets __tc=1, dispatches __tc_accepted event for track.js,
// and injects the tracker <script> tag.
import { useState, useEffect } from "react";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
  return m ? (m[2] ?? null) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function injectTracker(tenantSlug: string) {
  if (document.querySelector("script[data-tenant]")) return; // already loaded
  const s = document.createElement("script");
  s.src = "/track.js";
  s.defer = true;
  s.dataset["tenant"] = tenantSlug;
  document.head.appendChild(s);
}

export function ConsentBanner({
  tenantSlug,
  brandPrimary,
}: {
  tenantSlug: string;
  brandPrimary: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getCookie("__tc") === "1") {
      // Already consented — inject tracker immediately.
      injectTracker(tenantSlug);
    } else {
      setVisible(true);
    }
  }, [tenantSlug]);

  function accept() {
    setCookie("__tc", "1", 365);
    setVisible(false);
    injectTracker(tenantSlug);
    document.dispatchEvent(new Event("__tc_accepted"));
  }

  function decline() {
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--lp-dark-bg,#1f2937)",
        color: "var(--lp-dark-text,#f9fafb)",
        padding: "1rem 1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        fontSize: "0.85rem",
        zIndex: 9999,
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: 1, minWidth: 200 }}>
        Diese Seite verwendet anonyme Nutzungsstatistiken, um das Angebot zu verbessern. Es werden
        keine persönlichen Daten ohne Ihre Zustimmung gespeichert.
      </span>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button
          onClick={decline}
          style={{
            padding: "0.4rem 1rem",
            background: "transparent",
            color: "var(--lp-dark-muted,#9ca3af)",
            border: "1px solid var(--lp-dark-border,#4b5563)",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          Ablehnen
        </button>
        <button
          onClick={accept}
          style={{
            padding: "0.4rem 1rem",
            background: brandPrimary,
            color: "var(--lp-on-primary,#fff)",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: 500,
          }}
        >
          Akzeptieren
        </button>
      </div>
    </div>
  );
}
