import type { OfferSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";

type Props = { section: OfferSection; brandPrimary: string };

// ─── offer · banner-centered ──────────────────────────────────────────────────
// Brand color full-width banner with centered price and CTA.
export function OfferBannerCentered({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  return (
    <section style={{ padding:"6rem 1.5rem", background:brandPrimary, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:"-6rem", right:"-6rem", width:"28rem", height:"28rem", borderRadius:"50%", border:"4rem solid rgba(255,255,255,0.06)", pointerEvents:"none" }} />
      <div style={{ position:"absolute", bottom:"-4rem", left:"-4rem", width:"18rem", height:"18rem", borderRadius:"50%", border:"3rem solid rgba(255,255,255,0.06)", pointerEvents:"none" }} />
      <div style={{ maxWidth:700, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
        <p style={{ fontSize:"0.7rem", fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(255,255,255,0.6)", marginBottom:"1rem" }}>Special offer</p>
        <h2 style={{ fontFamily:"var(--font-heading,system-ui)", fontSize:"clamp(2rem,5.5vw,3.75rem)", fontWeight:900, color:"#fff", lineHeight:1.1, letterSpacing:"-0.02em", margin:"0 0 1rem" }}>{renderRich(heading)}</h2>
        {body && <p style={{ fontSize:"1.1rem", color:"rgba(255,255,255,0.78)", lineHeight:1.7, margin:"0 0 2.5rem" }}>{renderRich(body)}</p>}
        {(extras?.price ?? extras?.oldPrice) && (
          <div style={{ display:"flex", alignItems:"baseline", gap:"1.25rem", justifyContent:"center", margin:"0 0 2.5rem" }}>
            {extras?.price && <span style={{ fontSize:"clamp(3rem,9vw,5.5rem)", fontWeight:900, color:"#fff", lineHeight:1, letterSpacing:"-0.03em" }}>{extras.price}</span>}
            {extras?.oldPrice && <span style={{ fontSize:"1.75rem", color:"rgba(255,255,255,0.38)", textDecoration:"line-through" }}>{extras.oldPrice}</span>}
          </div>
        )}
        {extras?.validUntil && <p style={{ fontSize:"0.85rem", color:"rgba(255,255,255,0.5)", margin:"0 0 2rem" }}>Valid until: {extras.validUntil}</p>}
        {extras?.ctaText && (
          <a href={extras.ctaHref ?? "#contact"} style={{ display:"inline-flex", alignItems:"center", gap:"0.5rem", padding:"1.1rem 2.75rem", borderRadius:9999, background:"#fff", color:brandPrimary, fontWeight:700, fontSize:"1.05rem", textDecoration:"none", boxShadow:"0 8px 32px rgba(0,0,0,0.25)" }}>
            {extras.ctaText}
          </a>
        )}
      </div>
    </section>
  );
}

// ─── offer · split-image-price ────────────────────────────────────────────────
// Lifestyle image on left, price + features + CTA on right.
export function OfferSplitImagePrice({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  return (
    <>
      <style>{`
        .lp-osip { background:#fff; padding:6rem 0; }
        .lp-osip__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; display:flex; gap:4rem; align-items:center; }
        .lp-osip__image { flex:1 1 48%; border-radius:24px; overflow:hidden; position:relative; aspect-ratio:4/5; background:#f3f4f6; }
        .lp-osip__content { flex:1 1 48%; }
        @media(max-width:768px){ .lp-osip__inner{flex-direction:column;} .lp-osip__image{width:100%;min-height:280px;} }
        .lp-osip__badge { display:inline-block; font-size:0.7rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${brandPrimary}; background:${brandPrimary}14; padding:0.35rem 0.9rem; border-radius:9999px; margin-bottom:1.25rem; }
        .lp-osip__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.75rem); font-weight:800; color:#111827; line-height:1.15; letter-spacing:-0.02em; margin:0 0 1rem; }
        .lp-osip__body { font-size:1rem; color:#6b7280; line-height:1.8; margin:0 0 2rem; }
        .lp-osip__price-row { display:flex; align-items:baseline; gap:1rem; margin-bottom:2rem; }
        .lp-osip__price { font-size:clamp(2rem,6vw,3.5rem); font-weight:900; color:${brandPrimary}; line-height:1; letter-spacing:-0.02em; }
        .lp-osip__old-price { font-size:1.25rem; color:#d1d5db; text-decoration:line-through; }
        .lp-osip__valid { font-size:0.82rem; color:#9ca3af; margin:-1rem 0 2rem; }
        .lp-osip__cta { display:inline-flex; align-items:center; gap:0.5rem; padding:1rem 2.5rem; border-radius:9999px; background:${brandPrimary}; color:#fff; font-weight:700; font-size:1rem; text-decoration:none; box-shadow:0 6px 24px rgba(0,0,0,0.15); }
      `}</style>
      <section className="lp-osip">
        <div className="lp-osip__inner">
          <div className="lp-osip__image">
            <div style={{ position:"absolute", inset:0, background:`linear-gradient(135deg,${brandPrimary}16,${brandPrimary}06)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:"6rem", opacity:0.2 }}>🎁</span>
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
            {extras?.validUntil && <p className="lp-osip__valid">Valid until {extras.validUntil}</p>}
            {extras?.ctaText && (
              <a href={extras.ctaHref ?? "#contact"} className="lp-osip__cta">
                {extras.ctaText}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M2 8a.75.75 0 01.75-.75h8.69L8.22 4.03a.75.75 0 011.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06l3.22-3.22H2.75A.75.75 0 012 8z" clipRule="evenodd" /></svg>
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
  return (
    <>
      <style>{`
        .lp-ocb { background:#0f0c29; padding:6rem 1.5rem; position:relative; overflow:hidden; }
        .lp-ocb__deco { position:absolute; border-radius:50%; pointer-events:none; }
        .lp-ocb__inner { max-width:860px; margin:0 auto; text-align:center; position:relative; z-index:1; }
        .lp-ocb__label { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:1.25rem; }
        .lp-ocb__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(2rem,5vw,3.5rem); font-weight:900; color:#fff; line-height:1.1; letter-spacing:-0.02em; margin:0 0 1rem; }
        .lp-ocb__body { font-size:1.05rem; color:rgba(255,255,255,0.65); line-height:1.7; margin:0 0 3rem; }
        .lp-ocb__price-wrap { display:inline-flex; flex-direction:column; align-items:center; background:${brandPrimary}20; border:1px solid ${brandPrimary}40; border-radius:24px; padding:2.5rem 4rem; margin-bottom:2.5rem; }
        .lp-ocb__price { font-size:clamp(4rem,12vw,7rem); font-weight:900; color:#fff; line-height:1; letter-spacing:-0.04em; }
        .lp-ocb__old-price { font-size:1.5rem; color:rgba(255,255,255,0.3); text-decoration:line-through; margin-top:0.25rem; }
        .lp-ocb__valid { font-size:0.8rem; color:rgba(255,255,255,0.4); margin-bottom:2.5rem; }
        .lp-ocb__cta { display:inline-flex; align-items:center; gap:0.5rem; padding:1.1rem 3rem; border-radius:9999px; background:${brandPrimary}; color:#fff; font-weight:700; font-size:1.05rem; text-decoration:none; box-shadow:0 0 40px ${brandPrimary}60; }
      `}</style>
      <section className="lp-ocb">
        <div className="lp-ocb__deco" style={{ width:"36rem", height:"36rem", border:`4rem solid ${brandPrimary}10`, top:"-14rem", right:"-14rem" }} />
        <div className="lp-ocb__deco" style={{ width:"20rem", height:"20rem", border:`3rem solid ${brandPrimary}10`, bottom:"-8rem", left:"-8rem" }} />
        <div className="lp-ocb__inner">
          <p className="lp-ocb__label">🔥 Limited time</p>
          <h2 className="lp-ocb__h2">{renderRich(heading)}</h2>
          {body && <p className="lp-ocb__body">{renderRich(body)}</p>}
          <div className="lp-ocb__price-wrap">
            <span className="lp-ocb__price">{extras?.price ?? "—"}</span>
            {extras?.oldPrice && <span className="lp-ocb__old-price">{extras.oldPrice}</span>}
          </div>
          {extras?.validUntil && <p className="lp-ocb__valid">Offer expires: {extras.validUntil}</p>}
          {extras?.ctaText && (
            <a href={extras.ctaHref ?? "#contact"} className="lp-ocb__cta">
              {extras.ctaText}
            </a>
          )}
        </div>
      </section>
    </>
  );
}
