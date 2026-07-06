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

export function HeroAgencyBento({
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
        .lp-hab { position:relative; overflow:hidden; background:var(--lp-dark-bg,#09090b); color:#fff; }
        .lp-hab::before { content:""; position:absolute; inset:-30% -15% auto -15%; height:70%; pointer-events:none; background:radial-gradient(circle at 20% 25%,${brandPrimary}55,transparent 34%),radial-gradient(circle at 78% 12%,rgba(255,255,255,0.14),transparent 28%); filter:blur(18px); }
        .lp-hab__grid { position:absolute; inset:0; opacity:0.12; background-image:linear-gradient(rgba(255,255,255,0.55) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.55) 1px,transparent 1px); background-size:72px 72px; mask-image:linear-gradient(to bottom,#000,transparent 82%); }
        .lp-hab__inner { position:relative; z-index:1; display:grid; grid-template-columns:minmax(0,1.02fr) minmax(340px,0.98fr); gap:3rem; align-items:center; min-height:92vh; max-width:1220px; margin:0 auto; padding:7rem max(1.5rem,4vw) 5.5rem; }
        .lp-hab__eyebrow { display:inline-flex; align-items:center; gap:0.55rem; width:max-content; padding:0.42rem 0.82rem; border:1px solid rgba(255,255,255,0.14); border-radius:999px; background:rgba(255,255,255,0.07); color:rgba(255,255,255,0.78); font-size:0.78rem; font-weight:700; margin:0 0 1.25rem; backdrop-filter:blur(12px); }
        .lp-hab__dot { width:0.48rem; height:0.48rem; border-radius:999px; background:${brandPrimary}; box-shadow:0 0 24px ${brandPrimary}; }
        .lp-hab__h1 { font-family:var(--font-heading,system-ui); font-size:clamp(2.65rem,6.8vw,5.7rem); line-height:0.98; letter-spacing:-0.035em; font-weight:900; margin:0 0 1.45rem; max-width:10.5ch; }
        .lp-hab__lead { color:rgba(255,255,255,0.72); font-size:clamp(1.02rem,1.7vw,1.25rem); line-height:1.75; max-width:560px; margin:0 0 2rem; }
        .lp-hab__actions { display:flex; flex-wrap:wrap; align-items:center; gap:0.9rem; margin-bottom:2.25rem; }
        .lp-hab__cta { display:inline-flex; align-items:center; gap:0.55rem; padding:0.98rem 1.35rem; border-radius:999px; background:#fff; color:var(--lp-dark-bg,#09090b); font-weight:800; text-decoration:none; box-shadow:0 18px 60px ${brandPrimary}40; }
        .lp-hab__ghost { color:rgba(255,255,255,0.72); font-weight:700; text-decoration:none; }
        .lp-hab__proof { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0.75rem; max-width:560px; }
        .lp-hab__proof-item { border:1px solid rgba(255,255,255,0.12); border-radius:var(--lp-radius-lg,16px); background:rgba(255,255,255,0.06); padding:0.9rem; backdrop-filter:blur(10px); }
        .lp-hab__num { display:block; font-size:1.25rem; font-weight:900; color:#fff; }
        .lp-hab__label { display:block; margin-top:0.2rem; font-size:0.76rem; color:rgba(255,255,255,0.58); line-height:1.35; }
        .lp-hab__board { display:grid; grid-template-columns:1fr 0.82fr; grid-template-rows:1fr 0.86fr; gap:0.9rem; min-height:520px; }
        .lp-hab__card { position:relative; overflow:hidden; border:1px solid rgba(255,255,255,0.12); border-radius:var(--lp-radius-xl,24px); background:linear-gradient(145deg,rgba(255,255,255,0.13),rgba(255,255,255,0.045)); box-shadow:0 24px 90px rgba(0,0,0,0.34); backdrop-filter:blur(18px); }
        .lp-hab__card--main { grid-row:span 2; padding:1.2rem; display:flex; flex-direction:column; justify-content:space-between; }
        .lp-hab__browser { border-radius:calc(var(--lp-radius-lg,16px) + 2px); overflow:hidden; background:#fff; color:#111827; min-height:270px; box-shadow:0 20px 52px rgba(0,0,0,0.26); }
        .lp-hab__bar { display:flex; gap:0.28rem; padding:0.75rem; border-bottom:1px solid rgba(17,24,39,0.08); }
        .lp-hab__bar span { width:0.48rem; height:0.48rem; border-radius:999px; background:#d1d5db; }
        .lp-hab__browser-body { padding:1.2rem; }
        .lp-hab__pill { width:max-content; max-width:100%; padding:0.34rem 0.62rem; border-radius:999px; background:${brandPrimary}14; color:${brandPrimary}; font-size:0.72rem; font-weight:800; }
        .lp-hab__line { height:0.62rem; border-radius:999px; background:#111827; margin-top:0.9rem; }
        .lp-hab__line--muted { background:#e5e7eb; }
        .lp-hab__mini-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:0.55rem; margin-top:1.1rem; }
        .lp-hab__tile { min-height:62px; border-radius:12px; background:linear-gradient(135deg,${brandPrimary}22,#f4f4f5); }
        .lp-hab__card--accent { padding:1.15rem; background:linear-gradient(145deg,${brandPrimary},color-mix(in srgb,${brandPrimary} 64%,#111827)); }
        .lp-hab__card--accent strong { display:block; font-size:2.4rem; letter-spacing:-0.04em; line-height:1; }
        .lp-hab__card--accent span { display:block; margin-top:0.55rem; color:rgba(255,255,255,0.78); font-size:0.88rem; line-height:1.45; }
        .lp-hab__card--list { padding:1rem; display:flex; flex-direction:column; justify-content:center; gap:0.7rem; }
        .lp-hab__task { display:flex; align-items:center; gap:0.55rem; font-size:0.86rem; color:rgba(255,255,255,0.76); }
        .lp-hab__check { width:1.25rem; height:1.25rem; border-radius:999px; background:rgba(255,255,255,0.12); display:inline-flex; align-items:center; justify-content:center; color:#fff; flex:0 0 auto; }
        @media(max-width:900px){ .lp-hab__inner{grid-template-columns:1fr;min-height:auto;padding-top:6rem;} .lp-hab__board{min-height:420px;} .lp-hab__h1{max-width:12ch;} }
        @media(max-width:640px){ .lp-hab__inner{padding-inline:1.1rem;} .lp-hab__proof{grid-template-columns:1fr;} .lp-hab__board{grid-template-columns:1fr;grid-template-rows:auto;min-height:auto;} .lp-hab__card--main{grid-row:auto;} }
      `}</style>
      <section className="lp-hab">
        <div className="lp-hab__grid" />
        <div className="lp-hab__inner">
          <div>
            <p className="lp-hab__eyebrow">
              <span className="lp-hab__dot" />
              Digital growth partner
            </p>
            <h1 className="lp-hab__h1">{renderRich(heading)}</h1>
            {body && <p className="lp-hab__lead">{renderRich(body)}</p>}
            <div className="lp-hab__actions">
              {extras?.ctaText && (
                <a
                  href={primaryHref}
                  className="lp-hab__cta"
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
              <a
                href="#lp-gallery"
                className="lp-hab__ghost"
                {...buildTrackedCtaProps({
                  label: "View work",
                  href: "#lp-gallery",
                  section: "hero",
                })}
              >
                View work
              </a>
            </div>
            <div className="lp-hab__proof" aria-label="Selected proof points">
              <div className="lp-hab__proof-item">
                <span className="lp-hab__num">3x</span>
                <span className="lp-hab__label">Faster launch cycles</span>
              </div>
              <div className="lp-hab__proof-item">
                <span className="lp-hab__num">24h</span>
                <span className="lp-hab__label">First response target</span>
              </div>
              <div className="lp-hab__proof-item">
                <span className="lp-hab__num">SEO</span>
                <span className="lp-hab__label">Built into every page</span>
              </div>
            </div>
          </div>
          <div className="lp-hab__board" aria-hidden="true">
            <div className="lp-hab__card lp-hab__card--main">
              <div className="lp-hab__browser">
                <div className="lp-hab__bar">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="lp-hab__browser-body">
                  <div className="lp-hab__pill">Brand system</div>
                  <div className="lp-hab__line" style={{ width: "82%" }} />
                  <div className="lp-hab__line lp-hab__line--muted" style={{ width: "62%" }} />
                  <div className="lp-hab__mini-grid">
                    <div className="lp-hab__tile" />
                    <div className="lp-hab__tile" />
                    <div className="lp-hab__tile" />
                    <div className="lp-hab__tile" />
                  </div>
                </div>
              </div>
              <div className="lp-hab__task">
                <span className="lp-hab__check">✓</span>
                Strategy, design, build, and conversion tracking
              </div>
            </div>
            <div className="lp-hab__card lp-hab__card--accent">
              <strong>+38%</strong>
              <span>Lead quality lift from clearer positioning and faster paths to enquiry.</span>
            </div>
            <div className="lp-hab__card lp-hab__card--list">
              <div className="lp-hab__task">
                <span className="lp-hab__check">✓</span>
                Campaign landing pages
              </div>
              <div className="lp-hab__task">
                <span className="lp-hab__check">✓</span>
                Website redesigns
              </div>
              <div className="lp-hab__task">
                <span className="lp-hab__check">✓</span>
                CRO and analytics
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function HeroPropertyShowcase({
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
  const carouselImages = getHeroCarouselImages(extras);
  const hasImage = Boolean(extras?.backgroundImageUrl);
  return (
    <>
      <style>{`
        .lp-hps { background:var(--lp-surface,#f8f7f3); color:var(--lp-text,#111827); }
        .lp-hps__inner { display:grid; grid-template-columns:minmax(0,0.86fr) minmax(380px,1.14fr); min-height:90vh; }
        .lp-hps__copy { display:flex; flex-direction:column; justify-content:center; padding:7rem max(1.5rem,5vw) 5rem; }
        .lp-hps__eyebrow { display:flex; align-items:center; gap:0.65rem; margin:0 0 1.35rem; color:${brandPrimary}; font-size:0.76rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; }
        .lp-hps__eyebrow::before { content:""; width:2.5rem; height:2px; background:${brandPrimary}; }
        .lp-hps__h1 { font-family:var(--font-heading,system-ui); font-size:clamp(2.45rem,6vw,5rem); line-height:1.02; letter-spacing:-0.035em; font-weight:850; max-width:11ch; margin:0 0 1.25rem; color:var(--lp-text,#111827); }
        .lp-hps__lead { color:var(--lp-muted,#5f6470); font-size:clamp(1rem,1.6vw,1.18rem); line-height:1.75; max-width:540px; margin:0 0 2rem; }
        .lp-hps__actions { display:flex; flex-wrap:wrap; align-items:center; gap:0.9rem; }
        .lp-hps__cta { display:inline-flex; align-items:center; justify-content:center; gap:0.55rem; padding:1rem 1.35rem; border-radius:var(--lp-radius-md,12px); background:${brandPrimary}; color:var(--lp-on-primary,#fff); font-weight:800; text-decoration:none; box-shadow:0 16px 46px ${brandPrimary}38; }
        .lp-hps__secondary { color:var(--lp-text,#111827); font-weight:800; text-decoration:none; }
        .lp-hps__stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0.8rem; margin-top:3rem; max-width:560px; }
        .lp-hps__stat { border-top:1px solid color-mix(in srgb,${brandPrimary} 22%,transparent); padding-top:0.9rem; }
        .lp-hps__stat strong { display:block; font-size:1.35rem; letter-spacing:-0.03em; color:var(--lp-text,#111827); }
        .lp-hps__stat span { display:block; margin-top:0.24rem; color:var(--lp-muted,#6b7280); font-size:0.78rem; line-height:1.35; }
        .lp-hps__media { position:relative; overflow:hidden; min-height:640px; background:linear-gradient(135deg,${brandPrimary}22,#d8d2c3); }
        .lp-hps__media::after { content:""; position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,0.48),transparent 52%),linear-gradient(to right,rgba(0,0,0,0.18),transparent 46%); pointer-events:none; }
        .lp-hps__fallback { position:absolute; inset:0; background:linear-gradient(135deg,color-mix(in srgb,${brandPrimary} 48%,#ffffff),#d7d1c2); }
        .lp-hps__panel { position:absolute; z-index:2; left:clamp(1rem,4vw,3rem); right:clamp(1rem,4vw,3rem); bottom:clamp(1rem,4vw,3rem); border:1px solid rgba(255,255,255,0.28); border-radius:var(--lp-radius-xl,24px); background:rgba(255,255,255,0.88); color:var(--lp-text,#111827); padding:1rem; box-shadow:0 24px 80px rgba(0,0,0,0.22); backdrop-filter:blur(16px); }
        .lp-hps__panel-top { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; border-bottom:1px solid rgba(17,24,39,0.09); padding-bottom:0.85rem; margin-bottom:0.85rem; }
        .lp-hps__panel-title { font-family:var(--font-heading,system-ui); margin:0; font-size:1.15rem; font-weight:850; line-height:1.25; }
        .lp-hps__tag { flex:0 0 auto; padding:0.36rem 0.6rem; border-radius:999px; background:${brandPrimary}14; color:${brandPrimary}; font-size:0.72rem; font-weight:850; }
        .lp-hps__features { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0.65rem; }
        .lp-hps__feature { border-radius:var(--lp-radius-md,12px); background:rgba(17,24,39,0.045); padding:0.72rem; }
        .lp-hps__feature strong { display:block; font-size:1rem; line-height:1; }
        .lp-hps__feature span { display:block; margin-top:0.25rem; font-size:0.72rem; color:var(--lp-muted,#6b7280); }
        @media(max-width:940px){ .lp-hps__inner{grid-template-columns:1fr;} .lp-hps__copy{padding-top:6rem;} .lp-hps__media{min-height:520px;} .lp-hps__h1{max-width:13ch;} }
        @media(max-width:640px){ .lp-hps__copy{padding-inline:1.1rem;} .lp-hps__stats{grid-template-columns:1fr;} .lp-hps__features{grid-template-columns:1fr;} .lp-hps__panel-top{flex-direction:column;} }
      `}</style>
      <section className="lp-hps">
        <div className="lp-hps__inner">
          <div className="lp-hps__copy">
            <p className="lp-hps__eyebrow">Property showcase</p>
            <h1 className="lp-hps__h1">{renderRich(heading)}</h1>
            {body && <p className="lp-hps__lead">{renderRich(body)}</p>}
            <div className="lp-hps__actions">
              {extras?.ctaText && (
                <a
                  href={primaryHref}
                  className="lp-hps__cta"
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
              <a
                href="#lp-gallery"
                className="lp-hps__secondary"
                {...buildTrackedCtaProps({
                  label: "View listings",
                  href: "#lp-gallery",
                  section: "hero",
                })}
              >
                View listings
              </a>
            </div>
            <div className="lp-hps__stats" aria-label="Property service highlights">
              <div className="lp-hps__stat">
                <strong>Local</strong>
                <span>Market expertise</span>
              </div>
              <div className="lp-hps__stat">
                <strong>Premium</strong>
                <span>Presentation</span>
              </div>
              <div className="lp-hps__stat">
                <strong>End-to-end</strong>
                <span>Buyer and seller care</span>
              </div>
            </div>
          </div>
          <div className="lp-hps__media">
            {hasImage ? (
              <HeroCarouselMedia
                images={carouselImages}
                settings={extras?.carousel}
                brandPrimary={brandPrimary}
                alt={heading}
              />
            ) : (
              <div className="lp-hps__fallback" />
            )}
            <div className="lp-hps__panel">
              <div className="lp-hps__panel-top">
                <p className="lp-hps__panel-title">Curated homes, clear next steps</p>
                <span className="lp-hps__tag">New opportunity</span>
              </div>
              <div className="lp-hps__features" aria-hidden="true">
                <div className="lp-hps__feature">
                  <strong>3</strong>
                  <span>Priority areas</span>
                </div>
                <div className="lp-hps__feature">
                  <strong>24h</strong>
                  <span>Viewing follow-up</span>
                </div>
                <div className="lp-hps__feature">
                  <strong>1:1</strong>
                  <span>Personal advice</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function HeroClinicTrust({
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
  const carouselImages = getHeroCarouselImages(extras);
  const hasImage = Boolean(extras?.backgroundImageUrl);
  return (
    <>
      <style>{`
        .lp-hct { position:relative; overflow:hidden; background:linear-gradient(135deg,var(--lp-surface,#f7fbf8),var(--lp-card,#ffffff)); color:var(--lp-text,#10201a); }
        .lp-hct::before { content:""; position:absolute; inset:auto -12% -28% auto; width:48rem; height:48rem; border-radius:999px; background:${brandPrimary}14; filter:blur(10px); pointer-events:none; }
        .lp-hct__inner { position:relative; z-index:1; display:grid; grid-template-columns:minmax(0,1fr) minmax(340px,0.92fr); gap:3rem; align-items:center; min-height:88vh; max-width:1180px; margin:0 auto; padding:7rem max(1.25rem,4vw) 5rem; }
        .lp-hct__eyebrow { display:inline-flex; align-items:center; gap:0.55rem; margin:0 0 1.2rem; padding:0.42rem 0.72rem; border-radius:999px; background:${brandPrimary}12; color:${brandPrimary}; font-size:0.76rem; font-weight:850; }
        .lp-hct__mark { width:1.15rem; height:1.15rem; border-radius:999px; background:${brandPrimary}; color:var(--lp-on-primary,#fff); display:inline-flex; align-items:center; justify-content:center; font-size:0.78rem; line-height:1; }
        .lp-hct__h1 { font-family:var(--font-heading,system-ui); font-size:clamp(2.35rem,5.6vw,4.8rem); line-height:1.05; letter-spacing:-0.03em; font-weight:850; margin:0 0 1.2rem; max-width:12ch; color:var(--lp-text,#10201a); }
        .lp-hct__lead { max-width:590px; color:var(--lp-muted,#5f6f67); font-size:clamp(1rem,1.5vw,1.18rem); line-height:1.78; margin:0 0 2rem; }
        .lp-hct__actions { display:flex; flex-wrap:wrap; gap:0.85rem; align-items:center; }
        .lp-hct__cta { display:inline-flex; align-items:center; justify-content:center; gap:0.55rem; padding:1rem 1.35rem; border-radius:var(--lp-radius-md,12px); background:${brandPrimary}; color:var(--lp-on-primary,#fff); font-weight:850; text-decoration:none; box-shadow:0 16px 46px ${brandPrimary}30; }
        .lp-hct__secondary { display:inline-flex; align-items:center; justify-content:center; padding:0.96rem 1.1rem; border-radius:var(--lp-radius-md,12px); border:1px solid color-mix(in srgb,${brandPrimary} 24%,transparent); color:var(--lp-text,#10201a); font-weight:800; text-decoration:none; background:rgba(255,255,255,0.62); }
        .lp-hct__trust { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0.8rem; max-width:620px; margin-top:2.6rem; }
        .lp-hct__trust-item { border:1px solid rgba(16,32,26,0.08); border-radius:var(--lp-radius-lg,16px); background:rgba(255,255,255,0.74); padding:0.9rem; box-shadow:0 10px 28px rgba(16,32,26,0.06); }
        .lp-hct__trust-item strong { display:block; color:var(--lp-text,#10201a); font-size:0.98rem; }
        .lp-hct__trust-item span { display:block; margin-top:0.28rem; color:var(--lp-muted,#60716a); font-size:0.78rem; line-height:1.35; }
        .lp-hct__visual { position:relative; min-height:560px; border-radius:var(--lp-radius-xl,26px); overflow:hidden; border:1px solid rgba(16,32,26,0.08); background:linear-gradient(145deg,${brandPrimary}18,#ffffff); box-shadow:0 24px 90px rgba(16,32,26,0.14); }
        .lp-hct__visual::after { content:""; position:absolute; inset:0; background:linear-gradient(to top,rgba(16,32,26,0.22),transparent 55%); pointer-events:none; }
        .lp-hct__fallback { position:absolute; inset:0; background:linear-gradient(135deg,#f3faf6,${brandPrimary}22); }
        .lp-hct__photo-card { position:absolute; z-index:2; left:1rem; right:1rem; bottom:1rem; border-radius:var(--lp-radius-lg,18px); background:rgba(255,255,255,0.9); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.68); padding:1rem; box-shadow:0 18px 54px rgba(16,32,26,0.18); }
        .lp-hct__photo-top { display:flex; align-items:center; gap:0.8rem; border-bottom:1px solid rgba(16,32,26,0.08); padding-bottom:0.8rem; margin-bottom:0.8rem; }
        .lp-hct__avatar { width:2.7rem; height:2.7rem; border-radius:999px; background:${brandPrimary}16; color:${brandPrimary}; display:flex; align-items:center; justify-content:center; font-weight:900; flex:0 0 auto; }
        .lp-hct__photo-title { margin:0; font-weight:850; font-size:1rem; color:var(--lp-text,#10201a); }
        .lp-hct__photo-sub { margin:0.18rem 0 0; color:var(--lp-muted,#60716a); font-size:0.78rem; }
        .lp-hct__slots { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0.62rem; }
        .lp-hct__slot { border-radius:var(--lp-radius-md,12px); background:${brandPrimary}0f; padding:0.72rem; color:var(--lp-text,#10201a); }
        .lp-hct__slot strong { display:block; font-size:0.86rem; }
        .lp-hct__slot span { display:block; margin-top:0.18rem; color:var(--lp-muted,#60716a); font-size:0.72rem; }
        @media(max-width:920px){ .lp-hct__inner{grid-template-columns:1fr;min-height:auto;padding-top:6rem;} .lp-hct__visual{min-height:480px;} .lp-hct__h1{max-width:13ch;} }
        @media(max-width:640px){ .lp-hct__inner{padding-inline:1.1rem;} .lp-hct__trust{grid-template-columns:1fr;} .lp-hct__slots{grid-template-columns:1fr;} }
      `}</style>
      <section className="lp-hct">
        <div className="lp-hct__inner">
          <div>
            <p className="lp-hct__eyebrow">
              <span className="lp-hct__mark">+</span>
              Trusted care
            </p>
            <h1 className="lp-hct__h1">{renderRich(heading)}</h1>
            {body && <p className="lp-hct__lead">{renderRich(body)}</p>}
            <div className="lp-hct__actions">
              {extras?.ctaText && (
                <a
                  href={primaryHref}
                  className="lp-hct__cta"
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
              <a
                href="#lp-contact"
                className="lp-hct__secondary"
                {...buildTrackedCtaProps({
                  label: "Contact the clinic",
                  href: "#lp-contact",
                  section: "hero",
                })}
              >
                Contact the clinic
              </a>
            </div>
            <div className="lp-hct__trust" aria-label="Care assurances">
              <div className="lp-hct__trust-item">
                <strong>Clear advice</strong>
                <span>Simple next steps before and after every visit.</span>
              </div>
              <div className="lp-hct__trust-item">
                <strong>Experienced team</strong>
                <span>Care delivered by qualified local professionals.</span>
              </div>
              <div className="lp-hct__trust-item">
                <strong>Flexible booking</strong>
                <span>Appointment paths for new and returning patients.</span>
              </div>
            </div>
          </div>
          <div className="lp-hct__visual">
            {hasImage ? (
              <HeroCarouselMedia
                images={carouselImages}
                settings={extras?.carousel}
                brandPrimary={brandPrimary}
                alt={heading}
              />
            ) : (
              <div className="lp-hct__fallback" />
            )}
            <div className="lp-hct__photo-card">
              <div className="lp-hct__photo-top">
                <div className="lp-hct__avatar">DR</div>
                <div>
                  <p className="lp-hct__photo-title">Appointments with care</p>
                  <p className="lp-hct__photo-sub">Fast follow-up and calm guidance</p>
                </div>
              </div>
              <div className="lp-hct__slots" aria-hidden="true">
                <div className="lp-hct__slot">
                  <strong>Today</strong>
                  <span>New patient inquiry</span>
                </div>
                <div className="lp-hct__slot">
                  <strong>This week</strong>
                  <span>Preventive consultation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
