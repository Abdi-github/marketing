import type { ReactNode } from "react";
import type { LandingPageSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";

type Props = { section: LandingPageSection; brandPrimary: string; formContent: ReactNode };

// ─── lead_form · card-centered ────────────────────────────────────────────────
// Centered white card with form — clean, trust-building layout.
export function LeadFormCardCentered({ section, brandPrimary, formContent }: Props) {
  return (
    <section style={{ padding: "6rem 0", background: "var(--lp-card,#fff)" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 1.5rem" }}>
        <p
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: brandPrimary,
            marginBottom: "0.75rem",
            textAlign: "center",
          }}
        >
          Get in touch
        </p>
        <h2
          style={{
            fontFamily: "var(--font-heading,system-ui)",
            fontSize: "clamp(1.75rem,4vw,2.5rem)",
            fontWeight: 800,
            color: "var(--lp-text,#111827)",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            margin: "0 0 1rem",
            textAlign: "center",
          }}
        >
          {renderRich(section.heading)}
        </h2>
        {section.body && (
          <p
            style={{
              fontSize: "1rem",
              color: "var(--lp-muted,#6b7280)",
              lineHeight: 1.8,
              textAlign: "center",
              maxWidth: 500,
              margin: "0 auto 2.5rem",
            }}
          >
            {renderRich(section.body)}
          </p>
        )}
        <div
          style={{
            background: "var(--lp-surface,#f9fafb)",
            borderRadius: 24,
            padding: "2.5rem",
            border: "1px solid var(--lp-subtle,#f3f4f6)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
            marginTop: section.body ? 0 : "3rem",
          }}
        >
          {formContent}
        </div>
      </div>
    </section>
  );
}

// ─── lead_form · split-side-image ─────────────────────────────────────────────
// Lifestyle image on left, form card on right — more visual engagement.
export function LeadFormSplitSideImage({ section, brandPrimary, formContent }: Props) {
  return (
    <>
      <style>{`
        .lp-lfs { background:var(--lp-surface,#f9fafb); padding:6rem 0; }
        .lp-lfs__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; display:flex; gap:4rem; align-items:center; }
        .lp-lfs__image { flex:1 1 48%; border-radius:24px; overflow:hidden; position:relative; min-height:480px; background:linear-gradient(135deg,var(--lp-dark-bg,#0f0c29),var(--brand-primary,#4f46e5)); }
        .lp-lfs__form { flex:1 1 48%; }
        @media(max-width:768px){ .lp-lfs__inner{flex-direction:column;} .lp-lfs__image{width:100%;min-height:260px;} }
        .lp-lfs__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-lfs__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.15; letter-spacing:-0.02em; margin:0 0 1rem; }
        .lp-lfs__body { font-size:0.95rem; color:var(--lp-muted,#6b7280); line-height:1.8; margin:0 0 2rem; }
        .lp-lfs__card { background:var(--lp-card,#fff); border-radius:24px; padding:2.5rem; box-shadow:0 4px 24px rgba(0,0,0,0.06); border:1px solid var(--lp-border,#f0f0f0); }
      `}</style>
      <section className="lp-lfs">
        <div className="lp-lfs__inner">
          <div className="lp-lfs__image">
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(135deg,${brandPrimary}dd,var(--lp-dark-bg,#0f0c29))`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "2.5rem",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-heading,system-ui)",
                  fontSize: "clamp(1.5rem,3vw,2.25rem)",
                  fontWeight: 800,
                  color: "#fff",
                  lineHeight: 1.25,
                  margin: "0 0 1rem",
                }}
              >
                {renderRich(section.heading)}
              </p>
              {section.body && (
                <p
                  style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.72)", lineHeight: 1.75 }}
                >
                  {renderRich(section.body)}
                </p>
              )}
              <div
                style={{
                  marginTop: "2rem",
                  display: "flex",
                  gap: "1.5rem",
                  justifyContent: "center",
                }}
              >
                {["✓ Free", "✓ Fast", "✓ No spam"].map((tag) => (
                  <span
                    key={tag}
                    style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.7)", fontWeight: 600 }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="lp-lfs__form">
            <div className="lp-lfs__card">
              <p className="lp-lfs__eyebrow">Contact us</p>
              <h2 className="lp-lfs__h2">Let&apos;s talk</h2>
              <p className="lp-lfs__body">
                Fill in your details and we&apos;ll get back to you within 24 hours.
              </p>
              {formContent}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ─── lead_form · full-width-bar ───────────────────────────────────────────────
// Full-width bar with heading on left and inline form on right.
// accentMode (assigned by rhythm engine for this variant): brand-color bg, white text.
export function LeadFormFullWidthBar({
  section,
  brandPrimary,
  formContent,
  accentMode = false,
}: Props & { accentMode?: boolean }) {
  const am = accentMode ? " lp-lfb--accent" : "";
  return (
    <>
      <style>{`
        .lp-lfb { background:var(--lp-surface,#f9fafb); padding:4rem 0; }
        .lp-lfb__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; display:flex; align-items:center; gap:3rem; }
        .lp-lfb__text { flex:1 1 40%; }
        .lp-lfb__form { flex:1 1 56%; }
        @media(max-width:768px){ .lp-lfb__inner{flex-direction:column;gap:2rem;} }
        .lp-lfb__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.5rem,3vw,2.25rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.2; letter-spacing:-0.02em; margin:0 0 0.5rem; }
        .lp-lfb__body { font-size:0.95rem; color:var(--lp-muted,#6b7280); line-height:1.65; margin:0; }
        .lp-lfb__card { background:var(--lp-card,#fff); border-radius:18px; padding:1.75rem; border:1px solid var(--lp-border,#f0f0f0); box-shadow:0 2px 12px rgba(0,0,0,0.04); }
        /* — accent modifier (rhythm engine assigns for full-width-bar) — */
        .lp-lfb--accent { background:${brandPrimary}; }
        .lp-lfb--accent .lp-lfb__h2 { color:#fff; }
        .lp-lfb--accent .lp-lfb__body { color:rgba(255,255,255,0.85); }
        .lp-lfb--accent .lp-lfb__card { border:none; box-shadow:0 8px 32px rgba(0,0,0,0.15); }
      `}</style>
      <section className={`lp-lfb${am}`}>
        <div className="lp-lfb__inner">
          <div className="lp-lfb__text">
            <h2 className="lp-lfb__h2">{renderRich(section.heading)}</h2>
            {section.body && <p className="lp-lfb__body">{renderRich(section.body)}</p>}
          </div>
          <div className="lp-lfb__form">
            <div className="lp-lfb__card">{formContent}</div>
          </div>
        </div>
      </section>
    </>
  );
}
