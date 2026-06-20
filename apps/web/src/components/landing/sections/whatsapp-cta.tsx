import type { WhatsappCtaSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";
import { buildTrackedCtaProps } from "../tracking";

type Props = { section: WhatsappCtaSection; brandPrimary: string };

const WA_GREEN = "#25D366";
const WA_DARK = "#128C7E";

function waHref(section: WhatsappCtaSection): string {
  const phone = section.extras?.phoneNumber ?? "";
  const text = section.extras?.prefillText ? encodeURIComponent(section.extras.prefillText) : "";
  if (!phone) return "#";
  return `https://wa.me/${phone.replace(/\D/g, "")}${text ? `?text=${text}` : ""}`;
}

function WAIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ─── whatsapp_cta · centered-button ───────────────────────────────────────────
// Centered layout with large WhatsApp button — welcoming and clear.
export function WhatsAppCtaCenteredButton({ section }: Props) {
  const buttonText = section.extras?.buttonText ?? "Chat on WhatsApp";
  return (
    <section style={{ padding: "6rem 1.5rem", background: "var(--lp-surface,#f0fdf4)" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: WA_GREEN,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
            boxShadow: `0 8px 32px ${WA_GREEN}50`,
          }}
        >
          <WAIcon />
        </div>
        <h2
          style={{
            fontFamily: "var(--font-heading,system-ui)",
            fontSize: "clamp(1.75rem,4vw,2.5rem)",
            fontWeight: 800,
            color: "var(--lp-text,#111827)",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            margin: "0 0 1rem",
          }}
        >
          {renderRich(section.heading)}
        </h2>
        {section.body && (
          <p
            style={{
              fontSize: "1.05rem",
              color: "var(--lp-text-soft,#374151)",
              lineHeight: 1.75,
              margin: "0 0 2.5rem",
            }}
          >
            {renderRich(section.body)}
          </p>
        )}
        <a
          href={waHref(section)}
          target="_blank"
          rel="noopener noreferrer"
          {...buildTrackedCtaProps({
            label: buttonText,
            href: waHref(section),
            section: "whatsapp_cta",
          })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "1.1rem 2.5rem",
            borderRadius: 9999,
            background: WA_GREEN,
            color: "#fff",
            fontWeight: 700,
            fontSize: "1.1rem",
            textDecoration: "none",
            boxShadow: `0 8px 32px ${WA_GREEN}40`,
          }}
        >
          <WAIcon />
          {buttonText}
        </a>
        <p style={{ fontSize: "0.8rem", color: "var(--lp-muted,#9ca3af)", marginTop: "1.5rem" }}>
          We usually reply within a few minutes.
        </p>
      </div>
    </section>
  );
}

// ─── whatsapp_cta · banner-strip ──────────────────────────────────────────────
// Slim full-width dark-green banner with button on right — subtle and unobtrusive.
export function WhatsAppCtaBannerStrip({ section }: Props) {
  const buttonText = section.extras?.buttonText ?? "Chat now";
  return (
    <section style={{ background: WA_DARK, padding: "1.75rem 0" }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "2rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ color: "#fff", opacity: 0.9, flexShrink: 0 }}>
            <WAIcon />
          </div>
          <div>
            <p
              style={{
                fontWeight: 700,
                fontSize: "1rem",
                color: "#fff",
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {renderRich(section.heading)}
            </p>
            {section.body && (
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "rgba(255,255,255,0.7)",
                  margin: "0.2rem 0 0",
                  lineHeight: 1.5,
                }}
              >
                {renderRich(section.body)}
              </p>
            )}
          </div>
        </div>
        <a
          href={waHref(section)}
          target="_blank"
          rel="noopener noreferrer"
          {...buildTrackedCtaProps({
            label: buttonText,
            href: waHref(section),
            section: "whatsapp_cta",
          })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1.75rem",
            minHeight: "44px",
            borderRadius: 9999,
            background: "var(--lp-card,#fff)",
            color: WA_DARK,
            fontWeight: 700,
            fontSize: "0.95rem",
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {buttonText}
        </a>
      </div>
    </section>
  );
}
