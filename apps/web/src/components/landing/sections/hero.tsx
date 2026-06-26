import type { HeroSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";
import { isLeadActionLabel, normalizeLandingCtaHref } from "../cta-targets";
import { buildTrackedCtaProps } from "../tracking";
import { HeroCarouselMedia } from "./hero-carousel-media";
import { getHeroCarouselImages } from "./hero-carousel-utils";

// ─── hero · centered ──────────────────────────────────────────────────────────
// Dark gradient background, large centered headline, white pill CTA.
export function HeroCentered({
  section,
  brandPrimary,
}: {
  section: HeroSection;
  brandPrimary: string;
}) {
  const { heading, body, extras } = section;
  const primaryHref = normalizeLandingCtaHref(extras?.ctaHref, {
    preferLeadForContact: isLeadActionLabel(extras?.ctaText),
  });
  const bgImg = extras?.backgroundImageUrl;
  const carouselImages = getHeroCarouselImages(extras);
  return (
    <>
      <style>{`
        .lp-hc { position:relative; min-height:92vh; display:flex; align-items:center; justify-content:center; overflow:hidden; background:${bgImg ? "#000" : `linear-gradient(135deg,var(--lp-dark-bg,#0f0c29) 0%,${brandPrimary} 60%,var(--lp-dark-bg,#1a1a2e) 100%)`}; }
        .lp-hc__deco { position:absolute; border-radius:50%; pointer-events:none; }
        .lp-hc__inner { position:relative; z-index:1; text-align:center; max-width:900px; margin:0 auto; padding:7rem 1.5rem; }
        .lp-hc__h1 { font-family:var(--font-heading,system-ui); font-size:clamp(2.75rem,7vw,5.5rem); font-weight:900; color:#fff; line-height:1.05; letter-spacing:-0.03em; margin:0 0 1.5rem; }
        .lp-hc__lead { font-size:clamp(1.05rem,2.5vw,1.3rem); color:rgba(255,255,255,0.82); max-width:600px; margin:0 auto 2.75rem; line-height:1.75; }
        .lp-hc__cta { display:inline-flex; align-items:center; gap:0.5rem; padding:1.1rem 2.75rem; border-radius:9999px; background:var(--lp-card,#fff); color:${brandPrimary}; font-weight:700; font-size:1.05rem; text-decoration:none; box-shadow:0 8px 40px rgba(0,0,0,0.28); letter-spacing:0.01em; }
      `}</style>
      <section className="lp-hc">
        {bgImg && (
          <HeroCarouselMedia
            images={carouselImages}
            settings={extras?.carousel}
            brandPrimary={brandPrimary}
            alt={heading}
            opacity={0.5}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: bgImg
              ? "linear-gradient(to bottom,rgba(0,0,0,0.15),rgba(0,0,0,0.65))"
              : undefined,
          }}
        />
        <div
          className="lp-hc__deco"
          style={{
            width: "40rem",
            height: "40rem",
            border: "4rem solid rgba(255,255,255,0.04)",
            top: "-10rem",
            right: "-10rem",
          }}
        />
        <div
          className="lp-hc__deco"
          style={{
            width: "22rem",
            height: "22rem",
            border: "3rem solid rgba(255,255,255,0.04)",
            bottom: "-5rem",
            left: "-5rem",
          }}
        />
        <div className="lp-hc__inner">
          <h1 className="lp-hc__h1">{renderRich(heading)}</h1>
          {body && <p className="lp-hc__lead">{renderRich(body)}</p>}
          {extras?.ctaText && (
            <a
              href={primaryHref}
              className="lp-hc__cta"
              {...buildTrackedCtaProps({
                label: extras.ctaText,
                href: primaryHref,
                section: "hero",
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
        <div
          style={{
            position: "absolute",
            bottom: "2rem",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.3rem",
            opacity: 0.4,
          }}
        >
          <div style={{ width: 1.5, height: 40, background: "rgba(255,255,255,0.7)" }} />
        </div>
      </section>
    </>
  );
}

// ─── hero · image-bg-overlay ─────────────────────────────────────────────────
// Full-bleed image, dual gradient overlay, left-aligned headline at bottom.
export function HeroImageBgOverlay({
  section,
  brandPrimary,
}: {
  section: HeroSection;
  brandPrimary: string;
}) {
  const { heading, body, extras } = section;
  const primaryHref = normalizeLandingCtaHref(extras?.ctaHref, {
    preferLeadForContact: isLeadActionLabel(extras?.ctaText),
  });
  const bgImg = extras?.backgroundImageUrl;
  const carouselImages = getHeroCarouselImages(extras);
  // Scrim opacity adapts to brand luminance: lighter brand palettes → stronger scrim so white
  // text stays legible over bright Unsplash photos; darker brands need a lighter touch.
  const h = brandPrimary.replace("#", "");
  const lum =
    h.length >= 6
      ? 0.299 * (parseInt(h.slice(0, 2), 16) / 255) +
        0.587 * (parseInt(h.slice(2, 4), 16) / 255) +
        0.114 * (parseInt(h.slice(4, 6), 16) / 255)
      : 0.3;
  const scrimBot = lum > 0.55 ? 0.88 : 0.72;
  const scrimMid = lum > 0.55 ? 0.44 : 0.3;
  const scrimTop = lum > 0.55 ? 0.2 : 0.07;
  return (
    <>
      <style>{`
        .lp-hio { position:relative; min-height:88vh; display:flex; align-items:flex-end; overflow:hidden; background:linear-gradient(135deg,var(--lp-dark-bg,#1a1a2e),${brandPrimary}); }
        .lp-hio__inner { position:relative; z-index:2; padding:5rem 2rem 4rem; max-width:1100px; margin:0 auto; width:100%; }
        .lp-hio__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:rgba(255,255,255,0.6); margin-bottom:1.25rem; }
        .lp-hio__h1 { font-family:var(--font-heading,system-ui); font-size:clamp(2.5rem,6.5vw,5rem); font-weight:900; color:#fff; line-height:1.06; letter-spacing:-0.03em; max-width:780px; margin:0 0 1.5rem; }
        .lp-hio__lead { font-size:1.1rem; color:rgba(255,255,255,0.78); line-height:1.75; max-width:520px; margin:0 0 2.5rem; }
        .lp-hio__cta { display:inline-flex; align-items:center; gap:0.5rem; padding:1rem 2.5rem; border-radius:9999px; background:${brandPrimary}; color:var(--lp-on-primary,#fff); font-weight:700; font-size:1.05rem; text-decoration:none; box-shadow:0 8px 32px rgba(0,0,0,0.3); }
      `}</style>
      <section className="lp-hio">
        {bgImg && (
          <HeroCarouselMedia
            images={carouselImages}
            settings={extras?.carousel}
            brandPrimary={brandPrimary}
            alt={heading}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(to top,rgba(0,0,0,${scrimBot}) 0%,rgba(0,0,0,${scrimMid}) 55%,rgba(0,0,0,${scrimTop}) 100%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to right,rgba(0,0,0,0.45) 0%,transparent 60%)",
          }}
        />
        <div className="lp-hio__inner">
          <p className="lp-hio__eyebrow">Welcome</p>
          <h1 className="lp-hio__h1">{renderRich(heading)}</h1>
          {body && <p className="lp-hio__lead">{renderRich(body)}</p>}
          {extras?.ctaText && (
            <a
              href={primaryHref}
              className="lp-hio__cta"
              {...buildTrackedCtaProps({
                label: extras.ctaText,
                href: primaryHref,
                section: "hero",
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
      </section>
    </>
  );
}

// ─── hero · split-image-right ─────────────────────────────────────────────────
// Clean white background, 50/50 split: text left, full-height image right.
export function HeroSplitImageRight({
  section,
  brandPrimary,
}: {
  section: HeroSection;
  brandPrimary: string;
}) {
  const { heading, body, extras } = section;
  const primaryHref = normalizeLandingCtaHref(extras?.ctaHref, {
    preferLeadForContact: isLeadActionLabel(extras?.ctaText),
  });
  const img = extras?.backgroundImageUrl;
  const carouselImages = getHeroCarouselImages(extras);
  return (
    <>
      <style>{`
        .lp-hsi { min-height:88vh; display:flex; align-items:stretch; background:var(--lp-card,#fff); }
        .lp-hsi__content { flex:1 1 52%; display:flex; flex-direction:column; justify-content:center; padding:5rem 4rem 5rem max(3rem,6vw); }
        .lp-hsi__image { flex:1 1 48%; position:relative; overflow:hidden; background:var(--lp-subtle,#f3f4f6); min-height:380px; border-radius:16px 0 0 16px; }
        @media(max-width:768px){ .lp-hsi{flex-direction:column-reverse;} .lp-hsi__content{padding:3.5rem 1.5rem;} .lp-hsi__image{min-height:280px;flex:0 0 280px;border-radius:0 0 16px 16px;} }
        .lp-hsi__chip { display:inline-flex; align-items:center; gap:0.4rem; font-size:0.7rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${brandPrimary}; background:${brandPrimary}18; padding:0.35rem 0.9rem; border-radius:9999px; margin-bottom:1.5rem; width:fit-content; }
        .lp-hsi__h1 { font-family:var(--font-heading,system-ui); font-size:clamp(2.25rem,5vw,3.75rem); font-weight:900; color:var(--lp-text,#111827); line-height:1.1; letter-spacing:-0.025em; margin:0 0 1.25rem; }
        .lp-hsi__lead { font-size:1.05rem; color:var(--lp-muted,#6b7280); line-height:1.8; margin:0 0 2.5rem; max-width:440px; }
        .lp-hsi__cta { display:inline-flex; align-items:center; gap:0.5rem; padding:1rem 2.25rem; border-radius:9999px; background:${brandPrimary}; color:var(--lp-on-primary,#fff); font-weight:700; font-size:1rem; text-decoration:none; width:fit-content; box-shadow:0 6px 24px rgba(0,0,0,0.15); }
      `}</style>
      <section className="lp-hsi">
        <div className="lp-hsi__content">
          <span className="lp-hsi__chip">★ Trusted quality</span>
          <h1 className="lp-hsi__h1">{renderRich(heading)}</h1>
          {body && <p className="lp-hsi__lead">{renderRich(body)}</p>}
          {extras?.ctaText && (
            <a
              href={primaryHref}
              className="lp-hsi__cta"
              {...buildTrackedCtaProps({
                label: extras.ctaText,
                href: primaryHref,
                section: "hero",
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
        <div className="lp-hsi__image">
          {img ? (
            <HeroCarouselMedia
              images={carouselImages}
              settings={extras?.carousel}
              brandPrimary={brandPrimary}
              alt={heading}
              objectPosition="center top"
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(135deg,${brandPrimary}18,${brandPrimary}08)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: "5rem", opacity: 0.25 }}>🖼️</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ─── hero · split-form-right ──────────────────────────────────────────────────
// Brand gradient left with headline, floating white form card on the right.
export function HeroSplitFormRight({
  section,
  brandPrimary,
}: {
  section: HeroSection;
  brandPrimary: string;
}) {
  const { heading, body, extras } = section;
  const primaryHref = normalizeLandingCtaHref(extras?.ctaHref, {
    preferLeadForContact: isLeadActionLabel(extras?.ctaText),
  });
  return (
    <>
      <style>{`
        .lp-hsf { min-height:88vh; display:flex; align-items:stretch; background:linear-gradient(135deg,var(--lp-dark-bg,#0f0c29) 0%,${brandPrimary} 100%); }
        .lp-hsf__content { flex:1 1 55%; display:flex; flex-direction:column; justify-content:center; padding:5rem max(2rem,3vw) 5rem max(3rem,6vw); }
        .lp-hsf__panel { flex:1 1 45%; display:flex; align-items:center; justify-content:center; padding:3rem 4vw 3rem 2rem; }
        @media(max-width:768px){ .lp-hsf{flex-direction:column;} .lp-hsf__content{padding:4rem 1.5rem 2rem;} .lp-hsf__panel{padding:0 1.5rem 3rem;} }
        .lp-hsf__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.5); margin-bottom:1.25rem; }
        .lp-hsf__h1 { font-family:var(--font-heading,system-ui); font-size:clamp(2rem,4.5vw,3.5rem); font-weight:900; color:#fff; line-height:1.1; letter-spacing:-0.025em; margin:0 0 1.25rem; }
        .lp-hsf__lead { font-size:1.05rem; color:rgba(255,255,255,0.75); line-height:1.75; margin:0 0 2rem; max-width:440px; }
        .lp-hsf__card { background:var(--lp-card,#fff); border-radius:24px; padding:2.5rem 2rem; width:100%; max-width:400px; box-shadow:0 24px 80px rgba(0,0,0,0.32); }
        .lp-hsf__card-title { font-family:var(--font-heading,system-ui); font-size:1.45rem; font-weight:800; color:var(--lp-text,#111827); margin:0 0 0.4rem; }
        .lp-hsf__card-sub { font-size:0.88rem; color:var(--lp-muted,#9ca3af); margin:0 0 1.5rem; line-height:1.5; }
        .lp-hsf__points { display:flex; flex-direction:column; gap:0.7rem; margin-bottom:1.2rem; }
        .lp-hsf__point { display:flex; align-items:flex-start; gap:0.7rem; color:var(--lp-text-soft,#374151); font-size:0.92rem; line-height:1.55; }
        .lp-hsf__point-icon { width:1.4rem; height:1.4rem; border-radius:999px; background:${brandPrimary}14; color:${brandPrimary}; display:inline-flex; align-items:center; justify-content:center; flex:0 0 1.4rem; margin-top:0.1rem; }
        .lp-hsf__submit { display:block; width:100%; padding:1rem; border-radius:10px; background:${brandPrimary}; color:var(--lp-on-primary,#fff); font-weight:700; font-size:1rem; text-align:center; text-decoration:none; margin-top:0.75rem; box-sizing:border-box; }
        .lp-hsf__subcta { display:inline-flex; align-items:center; justify-content:center; width:100%; margin-top:0.8rem; color:var(--lp-text-soft,#4b5563); text-decoration:none; font-size:0.9rem; font-weight:600; }
      `}</style>
      <section className="lp-hsf">
        <div className="lp-hsf__content">
          <p className="lp-hsf__eyebrow">Now open</p>
          <h1 className="lp-hsf__h1">{renderRich(heading)}</h1>
          {body && <p className="lp-hsf__lead">{renderRich(body)}</p>}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              color: "rgba(255,255,255,0.6)",
              fontSize: "0.85rem",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.46 5.46l-4 4a.75.75 0 01-1.06 0l-2-2a.75.75 0 111.06-1.06L7 7.94l3.46-3.46a.75.75 0 111.06 1.06z" />
            </svg>
            500+ happy customers
          </div>
        </div>
        <div className="lp-hsf__panel">
          <div className="lp-hsf__card">
            <p className="lp-hsf__card-title">{extras?.ctaText ?? "Get in touch"}</p>
            <p className="lp-hsf__card-sub">
              Use the live request form below to send your inquiry. Free and non-binding.
            </p>
            <div className="lp-hsf__points">
              <div className="lp-hsf__point">
                <span className="lp-hsf__point-icon">1</span>
                <span>Tell us what you need in a few clicks.</span>
              </div>
              <div className="lp-hsf__point">
                <span className="lp-hsf__point-icon">2</span>
                <span>Your request is saved straight into the business CRM.</span>
              </div>
              <div className="lp-hsf__point">
                <span className="lp-hsf__point-icon">3</span>
                <span>The team can follow up without losing the lead.</span>
              </div>
            </div>
            <a
              href={primaryHref}
              className="lp-hsf__submit"
              {...buildTrackedCtaProps({
                label: extras?.ctaText ?? "Send request",
                href: primaryHref,
                section: "hero",
              })}
            >
              {extras?.ctaText ?? "Send request"}
            </a>
            <a
              href="#lp-contact"
              className="lp-hsf__subcta"
              {...buildTrackedCtaProps({
                label: "Prefer phone or email? See contact details",
                href: "#lp-contact",
                section: "hero",
              })}
            >
              Prefer phone or email? See contact details
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

// ─── hero · editorial-bold ────────────────────────────────────────────────────
// Oversized asymmetric editorial headline on a light canvas. Big type, lots of
// whitespace, a thin accent rule. Modern magazine feel.
export function HeroEditorialBold({
  section,
  brandPrimary,
}: {
  section: HeroSection;
  brandPrimary: string;
}) {
  const { heading, body, extras } = section;
  const primaryHref = normalizeLandingCtaHref(extras?.ctaHref, {
    preferLeadForContact: isLeadActionLabel(extras?.ctaText),
  });
  return (
    <>
      <style>{`
        .lp-heb { background:var(--lp-surface,#fafaf9); padding:7rem 0 6rem; overflow:hidden; }
        .lp-heb__inner { max-width:1200px; margin:0 auto; padding:0 max(1.5rem,5vw); }
        .lp-heb__eyebrow { display:inline-flex; align-items:center; gap:0.65rem; font-size:0.72rem; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:2.25rem; }
        .lp-heb__eyebrow::before { content:""; width:2.75rem; height:2px; background:${brandPrimary}; }
        .lp-heb__h1 { font-family:var(--font-heading,system-ui); font-size:clamp(2.75rem,8.5vw,6.5rem); font-weight:900; line-height:0.97; letter-spacing:-0.04em; color:var(--lp-text,#0a0a0a); margin:0; max-width:15ch; }
        .lp-heb__row { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:2rem; margin-top:3rem; }
        .lp-heb__lead { font-size:1.15rem; color:var(--lp-muted,#52525b); line-height:1.7; max-width:44ch; margin:0; }
        .lp-heb__cta { display:inline-flex; align-items:center; gap:0.6rem; padding:1.05rem 2.4rem; border-radius:9999px; background:var(--lp-text,#0a0a0a); color:#fff; font-weight:700; font-size:1.02rem; text-decoration:none; white-space:nowrap; }
        @media(max-width:640px){ .lp-heb__row{flex-direction:column;align-items:flex-start;} }
      `}</style>
      <section className="lp-heb">
        <div className="lp-heb__inner">
          <p className="lp-heb__eyebrow">Welcome</p>
          <h1 className="lp-heb__h1">{renderRich(heading)}</h1>
          <div className="lp-heb__row">
            {body && <p className="lp-heb__lead">{renderRich(body)}</p>}
            {extras?.ctaText && (
              <a
                href={primaryHref}
                className="lp-heb__cta"
                {...buildTrackedCtaProps({
                  label: extras.ctaText,
                  href: primaryHref,
                  section: "hero",
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

// ─── hero · gradient-spotlight ────────────────────────────────────────────────
// Dark canvas with a soft radial gradient-mesh glow in the brand colour, a glass
// pill chip, centered headline, white CTA. Contemporary SaaS / product feel.
export function HeroGradientSpotlight({
  section,
  brandPrimary,
}: {
  section: HeroSection;
  brandPrimary: string;
}) {
  const { heading, body, extras } = section;
  const primaryHref = normalizeLandingCtaHref(extras?.ctaHref, {
    preferLeadForContact: isLeadActionLabel(extras?.ctaText),
  });
  const bg = extras?.backgroundImageUrl;
  const carouselImages = getHeroCarouselImages(extras);
  return (
    <>
      <style>{`
        .lp-hgs { position:relative; min-height:90vh; display:flex; align-items:center; justify-content:center; overflow:hidden; background:var(--lp-dark-bg,#08080c); }
        .lp-hgs__mesh { position:absolute; inset:-25%; pointer-events:none; background:
            radial-gradient(38% 46% at 22% 22%, ${brandPrimary}66, transparent 70%),
            radial-gradient(40% 48% at 80% 28%, ${brandPrimary}3a, transparent 72%),
            radial-gradient(55% 52% at 50% 102%, ${brandPrimary}55, transparent 72%);
          filter:blur(24px); }
        .lp-hgs__grid { position:absolute; inset:0; pointer-events:none; opacity:0.12; background-image:linear-gradient(rgba(255,255,255,0.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.6) 1px,transparent 1px); background-size:64px 64px; mask-image:radial-gradient(circle at 50% 40%,#000,transparent 75%); }
        .lp-hgs__inner { position:relative; z-index:2; text-align:center; max-width:880px; padding:8rem 1.5rem; }
        .lp-hgs__chip { display:inline-flex; align-items:center; gap:0.5rem; padding:0.45rem 1.05rem; border-radius:9999px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.16); color:rgba(255,255,255,0.85); font-size:0.78rem; font-weight:600; margin-bottom:1.85rem; backdrop-filter:blur(8px); }
        .lp-hgs__h1 { font-family:var(--font-heading,system-ui); font-size:clamp(2.75rem,7vw,5.5rem); font-weight:800; line-height:1.04; letter-spacing:-0.03em; color:#fff; margin:0 0 1.5rem; }
        .lp-hgs__lead { font-size:clamp(1.05rem,2vw,1.3rem); color:rgba(255,255,255,0.7); line-height:1.7; max-width:580px; margin:0 auto 2.5rem; }
        .lp-hgs__cta { display:inline-flex; align-items:center; gap:0.5rem; padding:1.05rem 2.5rem; border-radius:9999px; background:var(--lp-card,#fff); color:var(--lp-dark-bg,#08080c); font-weight:700; font-size:1.05rem; text-decoration:none; box-shadow:0 8px 44px ${brandPrimary}55; }
      `}</style>
      <section className="lp-hgs">
        <div className="lp-hgs__mesh" />
        <div className="lp-hgs__grid" />
        {bg && (
          <HeroCarouselMedia
            images={carouselImages}
            settings={extras?.carousel}
            brandPrimary={brandPrimary}
            alt={heading}
            opacity={0.22}
          />
        )}
        <div className="lp-hgs__inner">
          <span className="lp-hgs__chip">✦ Now open</span>
          <h1 className="lp-hgs__h1">{renderRich(heading)}</h1>
          {body && <p className="lp-hgs__lead">{renderRich(body)}</p>}
          {extras?.ctaText && (
            <a
              href={primaryHref}
              className="lp-hgs__cta"
              {...buildTrackedCtaProps({
                label: extras.ctaText,
                href: primaryHref,
                section: "hero",
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
      </section>
    </>
  );
}
