import type { OfferSection } from "@marketing/ai-router";
import { isLeadActionLabel, normalizeLandingCtaHref } from "../cta-targets";
import { renderRich } from "../rich-text";
import { buildTrackedCtaProps } from "../tracking";

type Props = { section: OfferSection; brandPrimary: string };

// ─── offer · banner-centered ──────────────────────────────────────────────────
// Default: light bg with brand accents.
// accentMode (assigned by rhythm engine for this variant): brand-color bg, white text, inverted CTA.
export function OfferBannerCentered({
  section,
  brandPrimary,
  accentMode = false,
}: Props & { accentMode?: boolean }) {
  const { heading, body, extras } = section;
  const ctaHref = normalizeLandingCtaHref(extras?.ctaHref, {
    preferLeadForContact: isLeadActionLabel(extras?.ctaText),
  });
  const am = accentMode ? " lp-obc--accent" : "";
  return (
    <>
      <style>{`
        .lp-obc { background:var(--lp-surface,#f9fafb); padding:6rem 1.5rem; position:relative; overflow:hidden; }
        .lp-obc__deco { position:absolute; border-radius:50%; pointer-events:none; }
        .lp-obc__inner { max-width:700px; margin:0 auto; text-align:center; position:relative; z-index:1; }
        .lp-obc__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:1rem; }
        .lp-obc__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(2rem,5.5vw,3.75rem); font-weight:900; color:var(--lp-text,#111827); line-height:1.1; letter-spacing:-0.02em; margin:0 0 1rem; }
        .lp-obc__body { font-size:1.1rem; color:var(--lp-muted,#6b7280); line-height:1.7; margin:0 0 2.5rem; }
        .lp-obc__price-row { display:flex; align-items:baseline; gap:1.25rem; justify-content:center; margin:0 0 2.5rem; }
        .lp-obc__price { font-size:clamp(3rem,9vw,5.5rem); font-weight:900; color:${brandPrimary}; line-height:1; letter-spacing:-0.03em; }
        .lp-obc__old-price { font-size:1.75rem; color:var(--lp-border,#d1d5db); text-decoration:line-through; }
        .lp-obc__valid { font-size:0.85rem; color:var(--lp-muted,#9ca3af); margin:0 0 2rem; }
        .lp-obc__cta { display:inline-flex; align-items:center; gap:0.5rem; padding:1.1rem 2.75rem; border-radius:9999px; background:${brandPrimary}; color:var(--lp-on-primary,#fff); font-weight:700; font-size:1.05rem; text-decoration:none; box-shadow:0 8px 32px rgba(0,0,0,0.15); }
        /* — accent modifier (rhythm engine assigns for banner-centered) — */
        .lp-obc--accent { background:${brandPrimary}; }
        .lp-obc--accent .lp-obc__eyebrow { color:rgba(255,255,255,0.6); }
        .lp-obc--accent .lp-obc__h2 { color:#fff; }
        .lp-obc--accent .lp-obc__body { color:rgba(255,255,255,0.85); }
        .lp-obc--accent .lp-obc__price { color:#fff; }
        .lp-obc--accent .lp-obc__old-price { color:rgba(255,255,255,0.38); }
        .lp-obc--accent .lp-obc__valid { color:rgba(255,255,255,0.5); }
        .lp-obc--accent .lp-obc__cta { background:var(--lp-card,#fff); color:${brandPrimary}; box-shadow:0 8px 32px rgba(0,0,0,0.25); }
      `}</style>
      <section className={`lp-obc${am}`}>
        <div
          className="lp-obc__deco"
          style={{
            top: "-6rem",
            right: "-6rem",
            width: "28rem",
            height: "28rem",
            border: `4rem solid ${accentMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}`,
          }}
        />
        <div
          className="lp-obc__deco"
          style={{
            bottom: "-4rem",
            left: "-4rem",
            width: "18rem",
            height: "18rem",
            border: `3rem solid ${accentMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}`,
          }}
        />
        <div className="lp-obc__inner">
          <p className="lp-obc__eyebrow">Special offer</p>
          <h2 className="lp-obc__h2">{renderRich(heading)}</h2>
          {body && <p className="lp-obc__body">{renderRich(body)}</p>}
          {(extras?.price ?? extras?.oldPrice) && (
            <div className="lp-obc__price-row">
              {extras?.price && <span className="lp-obc__price">{extras.price}</span>}
              {extras?.oldPrice && <span className="lp-obc__old-price">{extras.oldPrice}</span>}
            </div>
          )}
          {extras?.validUntil && <p className="lp-obc__valid">Valid until: {extras.validUntil}</p>}
          {extras?.ctaText && (
            <a
              href={ctaHref}
              className="lp-obc__cta"
              {...buildTrackedCtaProps({
                label: extras.ctaText,
                href: ctaHref,
                section: "offer",
              })}
            >
              {extras.ctaText}
            </a>
          )}
        </div>
      </section>
    </>
  );
}

// ─── offer · split-image-price ────────────────────────────────────────────────
// Lifestyle image on left, price + features + CTA on right.
export function OfferSplitImagePrice({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  const ctaHref = normalizeLandingCtaHref(extras?.ctaHref, {
    preferLeadForContact: isLeadActionLabel(extras?.ctaText),
  });
  return (
    <>
      <style>{`
        .lp-osip { background:var(--lp-card,#fff); padding:6rem 0; }
        .lp-osip__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; display:flex; gap:4rem; align-items:center; }
        .lp-osip__image { flex:1 1 48%; border-radius:24px; overflow:hidden; position:relative; aspect-ratio:4/5; background:var(--lp-subtle,#f3f4f6); }
        .lp-osip__content { flex:1 1 48%; }
        @media(max-width:768px){ .lp-osip__inner{flex-direction:column;} .lp-osip__image{width:100%;min-height:280px;} }
        .lp-osip__badge { display:inline-block; font-size:0.7rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${brandPrimary}; background:${brandPrimary}14; padding:0.35rem 0.9rem; border-radius:9999px; margin-bottom:1.25rem; }
        .lp-osip__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.75rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.15; letter-spacing:-0.02em; margin:0 0 1rem; }
        .lp-osip__body { font-size:1rem; color:var(--lp-muted,#6b7280); line-height:1.8; margin:0 0 2rem; }
        .lp-osip__price-row { display:flex; align-items:baseline; gap:1rem; margin-bottom:2rem; }
        .lp-osip__price { font-size:clamp(2rem,6vw,3.5rem); font-weight:900; color:${brandPrimary}; line-height:1; letter-spacing:-0.02em; }
        .lp-osip__old-price { font-size:1.25rem; color:var(--lp-border,#d1d5db); text-decoration:line-through; }
        .lp-osip__valid { font-size:0.82rem; color:var(--lp-muted,#9ca3af); margin:-1rem 0 2rem; }
        .lp-osip__cta { display:inline-flex; align-items:center; gap:0.5rem; padding:1rem 2.5rem; border-radius:9999px; background:${brandPrimary}; color:var(--lp-on-primary,#fff); font-weight:700; font-size:1rem; text-decoration:none; box-shadow:0 6px 24px rgba(0,0,0,0.15); }
      `}</style>
      <section className="lp-osip">
        <div className="lp-osip__inner">
          <div className="lp-osip__image">
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(135deg,${brandPrimary}16,${brandPrimary}06)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: "6rem", opacity: 0.2 }}>🎁</span>
            </div>
          </div>
          <div className="lp-osip__content">
            <span className="lp-osip__badge">Limited offer</span>
            <h2 className="lp-osip__h2">{renderRich(heading)}</h2>
            {body && <p className="lp-osip__body">{renderRich(body)}</p>}
            {(extras?.price ?? extras?.oldPrice) && (
              <div className="lp-osip__price-row">
                {extras?.price && <span className="lp-osip__price">{extras.price}</span>}
                {extras?.oldPrice && <span className="lp-osip__old-price">{extras.oldPrice}</span>}
              </div>
            )}
            {extras?.validUntil && (
              <p className="lp-osip__valid">Valid until {extras.validUntil}</p>
            )}
            {extras?.ctaText && (
              <a
                href={ctaHref}
                className="lp-osip__cta"
                {...buildTrackedCtaProps({
                  label: extras.ctaText,
                  href: ctaHref,
                  section: "offer",
                })}
              >
                {extras.ctaText}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M2 8a.75.75 0 01.75-.75h8.69L8.22 4.03a.75.75 0 011.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06l3.22-3.22H2.75A.75.75 0 012 8z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

// ─── offer · countdown-bold ───────────────────────────────────────────────────
// Dark dramatic design with large price display — high urgency feel.
export function OfferCountdownBold({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  const ctaHref = normalizeLandingCtaHref(extras?.ctaHref, {
    preferLeadForContact: isLeadActionLabel(extras?.ctaText),
  });
  return (
    <>
      <style>{`
        .lp-ocb { background:var(--lp-dark-bg,#0f0c29); padding:6rem 1.5rem; position:relative; overflow:hidden; }
        .lp-ocb__deco { position:absolute; border-radius:50%; pointer-events:none; }
        .lp-ocb__inner { max-width:860px; margin:0 auto; text-align:center; position:relative; z-index:1; }
        .lp-ocb__label { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:1.25rem; }
        .lp-ocb__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(2rem,5vw,3.5rem); font-weight:900; color:#fff; line-height:1.1; letter-spacing:-0.02em; margin:0 0 1rem; }
        .lp-ocb__body { font-size:1.05rem; color:rgba(255,255,255,0.65); line-height:1.7; margin:0 0 3rem; }
        .lp-ocb__price-wrap { display:inline-flex; flex-direction:column; align-items:center; background:${brandPrimary}20; border:1px solid ${brandPrimary}40; border-radius:24px; padding:2.5rem 4rem; margin-bottom:2.5rem; }
        .lp-ocb__price { font-size:clamp(4rem,12vw,7rem); font-weight:900; color:#fff; line-height:1; letter-spacing:-0.04em; }
        .lp-ocb__old-price { font-size:1.5rem; color:rgba(255,255,255,0.3); text-decoration:line-through; margin-top:0.25rem; }
        .lp-ocb__valid { font-size:0.8rem; color:rgba(255,255,255,0.4); margin-bottom:2.5rem; }
        .lp-ocb__cta { display:inline-flex; align-items:center; gap:0.5rem; padding:1.1rem 3rem; border-radius:9999px; background:${brandPrimary}; color:var(--lp-on-primary,#fff); font-weight:700; font-size:1.05rem; text-decoration:none; box-shadow:0 0 40px ${brandPrimary}60; }
      `}</style>
      <section className="lp-ocb">
        <div
          className="lp-ocb__deco"
          style={{
            width: "36rem",
            height: "36rem",
            border: `4rem solid ${brandPrimary}10`,
            top: "-14rem",
            right: "-14rem",
          }}
        />
        <div
          className="lp-ocb__deco"
          style={{
            width: "20rem",
            height: "20rem",
            border: `3rem solid ${brandPrimary}10`,
            bottom: "-8rem",
            left: "-8rem",
          }}
        />
        <div className="lp-ocb__inner">
          <p className="lp-ocb__label">🔥 Limited time</p>
          <h2 className="lp-ocb__h2">{renderRich(heading)}</h2>
          {body && <p className="lp-ocb__body">{renderRich(body)}</p>}
          <div className="lp-ocb__price-wrap">
            <span className="lp-ocb__price">{extras?.price ?? "—"}</span>
            {extras?.oldPrice && <span className="lp-ocb__old-price">{extras.oldPrice}</span>}
          </div>
          {extras?.validUntil && (
            <p className="lp-ocb__valid">Offer expires: {extras.validUntil}</p>
          )}
          {extras?.ctaText && (
            <a
              href={ctaHref}
              className="lp-ocb__cta"
              {...buildTrackedCtaProps({
                label: extras.ctaText,
                href: ctaHref,
                section: "offer",
              })}
            >
              {extras.ctaText}
            </a>
          )}
        </div>
      </section>
    </>
  );
}

export function OfferQuotePath({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  const ctaHref = normalizeLandingCtaHref(extras?.ctaHref, {
    preferLeadForContact: isLeadActionLabel(extras?.ctaText),
  });
  const steps = [
    {
      title: "Choose the right path",
      body: "Start with the service, property, treatment, or project you need.",
    },
    {
      title: "Share the essentials",
      body: "Send the key details so the team can qualify the request quickly.",
    },
    {
      title: "Get a clear next step",
      body: "Receive a practical reply, appointment option, or tailored quote.",
    },
  ];
  return (
    <>
      <style>{`
        .lp-oqp { position:relative; overflow:hidden; background:var(--lp-surface,#f9fafb); padding:6.5rem 0; }
        .lp-oqp::before { content:""; position:absolute; inset:0; pointer-events:none; background:radial-gradient(circle at 18% 8%, ${brandPrimary}14, transparent 32%), radial-gradient(circle at 90% 20%, ${brandPrimary}0f, transparent 28%); }
        .lp-oqp__inner { position:relative; z-index:1; max-width:1160px; margin:0 auto; padding:0 1.5rem; }
        .lp-oqp__top { display:grid; grid-template-columns:minmax(0,0.86fr) minmax(280px,0.46fr); gap:2rem; align-items:end; margin-bottom:2.25rem; }
        .lp-oqp__eyebrow { font-size:0.72rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin:0 0 1rem; }
        .lp-oqp__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(2rem,4.8vw,3.8rem); font-weight:850; color:var(--lp-text,#111827); line-height:1.03; letter-spacing:-0.035em; margin:0; max-width:12ch; }
        .lp-oqp__body { color:var(--lp-muted,#6b7280); font-size:1.02rem; line-height:1.75; margin:0; }
        .lp-oqp__grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0.9rem; }
        .lp-oqp__card { position:relative; min-height:250px; display:flex; flex-direction:column; justify-content:space-between; border:1px solid var(--lp-border,rgba(17,24,39,0.1)); border-radius:var(--lp-radius-xl,24px); background:var(--lp-card,#fff); padding:1.15rem; box-shadow:var(--lp-shadow-card,0 18px 46px rgba(17,24,39,0.08)); overflow:hidden; }
        .lp-oqp__card::before { content:""; position:absolute; inset:auto -28% -38% auto; width:12rem; height:12rem; border-radius:999px; background:${brandPrimary}10; }
        .lp-oqp__num { position:relative; z-index:1; width:2.25rem; height:2.25rem; border-radius:999px; display:flex; align-items:center; justify-content:center; background:${brandPrimary}; color:var(--lp-on-primary,#fff); font-weight:900; box-shadow:0 12px 30px ${brandPrimary}30; }
        .lp-oqp__title { position:relative; z-index:1; font-family:var(--font-heading,system-ui); color:var(--lp-text,#111827); font-size:1.25rem; line-height:1.18; letter-spacing:-0.02em; font-weight:850; margin:1.5rem 0 0.65rem; }
        .lp-oqp__copy { position:relative; z-index:1; color:var(--lp-muted,#6b7280); font-size:0.94rem; line-height:1.65; margin:0; }
        .lp-oqp__footer { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:1rem; margin-top:1rem; border:1px solid var(--lp-border,rgba(17,24,39,0.1)); border-radius:var(--lp-radius-xl,24px); background:var(--lp-card,#fff); padding:1rem; box-shadow:var(--lp-shadow-card,0 18px 46px rgba(17,24,39,0.07)); }
        .lp-oqp__deal { display:flex; align-items:baseline; gap:0.7rem; min-width:0; }
        .lp-oqp__price { color:var(--lp-text,#111827); font-weight:900; font-size:1.35rem; letter-spacing:-0.03em; }
        .lp-oqp__old { color:var(--lp-muted,#9ca3af); text-decoration:line-through; font-weight:700; }
        .lp-oqp__valid { color:var(--lp-muted,#6b7280); font-size:0.82rem; }
        .lp-oqp__cta { display:inline-flex; align-items:center; justify-content:center; gap:0.55rem; padding:0.96rem 1.25rem; border-radius:999px; background:${brandPrimary}; color:var(--lp-on-primary,#fff); font-weight:850; text-decoration:none; box-shadow:0 14px 38px ${brandPrimary}35; }
        @media(max-width:900px){ .lp-oqp__top{grid-template-columns:1fr;} .lp-oqp__h2{max-width:14ch;} .lp-oqp__grid{grid-template-columns:1fr;} .lp-oqp__card{min-height:210px;} }
        @media(max-width:640px){ .lp-oqp{padding:5rem 0;} .lp-oqp__inner{padding:0 1rem;} .lp-oqp__footer{align-items:stretch;flex-direction:column;} .lp-oqp__cta{width:100%;} }
      `}</style>
      <section className="lp-oqp">
        <div className="lp-oqp__inner">
          <div className="lp-oqp__top">
            <div>
              <p className="lp-oqp__eyebrow">Start here</p>
              <h2 className="lp-oqp__h2">{renderRich(heading)}</h2>
            </div>
            {body && <p className="lp-oqp__body">{renderRich(body)}</p>}
          </div>
          <div className="lp-oqp__grid">
            {steps.map((step, index) => (
              <article key={step.title} className="lp-oqp__card">
                <div>
                  <div className="lp-oqp__num">{index + 1}</div>
                  <h3 className="lp-oqp__title">{step.title}</h3>
                  <p className="lp-oqp__copy">{step.body}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="lp-oqp__footer">
            <div className="lp-oqp__deal">
              {extras?.price ? (
                <span className="lp-oqp__price">{extras.price}</span>
              ) : (
                <span className="lp-oqp__price">Tailored next step</span>
              )}
              {extras?.oldPrice && <span className="lp-oqp__old">{extras.oldPrice}</span>}
              {extras?.validUntil && (
                <span className="lp-oqp__valid">Until {extras.validUntil}</span>
              )}
            </div>
            {extras?.ctaText && (
              <a
                href={ctaHref}
                className="lp-oqp__cta"
                {...buildTrackedCtaProps({
                  label: extras.ctaText,
                  href: ctaHref,
                  section: "offer",
                })}
              >
                {extras.ctaText}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M2 8a.75.75 0 01.75-.75h8.69L8.22 4.03a.75.75 0 011.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06l3.22-3.22H2.75A.75.75 0 012 8z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
