import type { ContactSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";

type Props = { section: ContactSection; brandPrimary: string };

// ─── contact · split-map ──────────────────────────────────────────────────────
// Contact info on left, map iframe on right.
export function ContactSplitMap({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  return (
    <>
      <style>{`
        .lp-csm { background:#f9fafb; padding:6rem 0; }
        .lp-csm__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; display:flex; gap:4rem; align-items:flex-start; }
        .lp-csm__info { flex:1 1 40%; }
        .lp-csm__map { flex:1 1 55%; border-radius:24px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); min-height:400px; background:#e5e7eb; }
        @media(max-width:768px){ .lp-csm__inner{flex-direction:column;} .lp-csm__map{width:100%;min-height:280px;} }
        .lp-csm__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:1rem; }
        .lp-csm__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; color:#111827; line-height:1.15; letter-spacing:-0.02em; margin:0 0 1.25rem; }
        .lp-csm__body { font-size:0.95rem; color:#6b7280; line-height:1.8; margin:0 0 2rem; }
        .lp-csm__contact-item { display:flex; align-items:center; gap:0.875rem; padding:0.85rem 0; border-bottom:1px solid #e5e7eb; text-decoration:none; color:#111827; font-size:0.95rem; }
        .lp-csm__contact-item:last-child { border-bottom:none; }
        .lp-csm__icon { width:38px; height:38px; border-radius:10px; background:${brandPrimary}12; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0; }
      `}</style>
      <section className="lp-csm">
        <div className="lp-csm__inner">
          <div className="lp-csm__info">
            <p className="lp-csm__eyebrow">Find us</p>
            <h2 className="lp-csm__h2">{renderRich(heading)}</h2>
            {body && <p className="lp-csm__body">{renderRich(body)}</p>}
            {extras?.address && (
              <div className="lp-csm__contact-item">
                <span className="lp-csm__icon">📍</span>
                <span>{extras.address}</span>
              </div>
            )}
            {extras?.phone && (
              <a href={`tel:${extras.phone}`} className="lp-csm__contact-item">
                <span className="lp-csm__icon">📞</span>
                <span>{extras.phone}</span>
              </a>
            )}
            {extras?.email && (
              <a href={`mailto:${extras.email}`} className="lp-csm__contact-item">
                <span className="lp-csm__icon">✉️</span>
                <span>{extras.email}</span>
              </a>
            )}
            {extras?.openingHours && (
              <div className="lp-csm__contact-item">
                <span className="lp-csm__icon">🕐</span>
                <span>{extras.openingHours}</span>
              </div>
            )}
          </div>
          <div className="lp-csm__map">
            {extras?.mapEmbedUrl
              ? <iframe src={extras.mapEmbedUrl} title="Location" style={{ width:"100%", height:"100%", minHeight:400, border:0, display:"block" }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              : <div style={{ height:400, display:"flex", alignItems:"center", justifyContent:"center", background:`linear-gradient(135deg,${brandPrimary}12,${brandPrimary}04)` }}><span style={{ fontSize:"4rem", opacity:0.25 }}>🗺️</span></div>
            }
          </div>
        </div>
      </section>
    </>
  );
}

// ─── contact · cards-row ──────────────────────────────────────────────────────
// Row of icon cards — great when no map embed is available.
export function ContactCardsRow({ section, brandPrimary, darkMode = false }: Props & { darkMode?: boolean }) {
  const { heading, body, extras } = section;
  const dm = darkMode ? " lp-ccr--dark" : "";
  const cards = [
    extras?.address ? { icon: "📍", label: "Address", value: extras.address, href: undefined } : null,
    extras?.phone   ? { icon: "📞", label: "Phone",   value: extras.phone,   href: `tel:${extras.phone}` } : null,
    extras?.email   ? { icon: "✉️", label: "Email",   value: extras.email,   href: `mailto:${extras.email}` } : null,
    extras?.openingHours ? { icon: "🕐", label: "Hours", value: extras.openingHours, href: undefined } : null,
  ].filter(Boolean) as { icon: string; label: string; value: string; href?: string }[];

  return (
    <>
      <style>{`
        .lp-ccr { background:#fff; padding:6rem 0; }
        .lp-ccr__inner { max-width:1000px; margin:0 auto; padding:0 1.5rem; }
        .lp-ccr__header { text-align:center; max-width:580px; margin:0 auto 3.5rem; }
        .lp-ccr__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-ccr__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; color:#111827; line-height:1.15; letter-spacing:-0.02em; margin:0 0 1rem; }
        .lp-ccr__body { font-size:1rem; color:#6b7280; line-height:1.8; margin:0; }
        .lp-ccr__grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1.25rem; }
        .lp-ccr__card { background:#f9fafb; border-radius:20px; padding:2rem 1.5rem; text-align:center; border:1px solid #f0f0f0; text-decoration:none; display:block; }
        .lp-ccr__icon { font-size:2rem; margin-bottom:0.875rem; }
        .lp-ccr__label { font-size:0.72rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.5rem; }
        .lp-ccr__value { font-size:0.95rem; color:#374151; font-weight:500; line-height:1.5; }
        /* — dark modifier — */
        .lp-ccr--dark { background:#0b0f1a; }
        .lp-ccr--dark .lp-ccr__h2 { color:#fff; }
        .lp-ccr--dark .lp-ccr__body { color:rgba(255,255,255,0.75); }
        .lp-ccr--dark .lp-ccr__card { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); }
        .lp-ccr--dark .lp-ccr__value { color:rgba(255,255,255,0.75); }
      `}</style>
      <section className={`lp-ccr${dm}`}>
        <div className="lp-ccr__inner">
          <div className="lp-ccr__header">
            <p className="lp-ccr__eyebrow">Contact</p>
            <h2 className="lp-ccr__h2">{renderRich(heading)}</h2>
            {body && <p className="lp-ccr__body">{renderRich(body)}</p>}
          </div>
          <div className="lp-ccr__grid">
            {cards.map((c, i) => (
              c.href
                ? (
                  <a key={i} href={c.href} className="lp-ccr__card" style={{ textDecoration:"none" }}>
                    <p className="lp-ccr__icon">{c.icon}</p>
                    <p className="lp-ccr__label">{c.label}</p>
                    <p className="lp-ccr__value">{c.value}</p>
                  </a>
                ) : (
                  <div key={i} className="lp-ccr__card">
                    <p className="lp-ccr__icon">{c.icon}</p>
                    <p className="lp-ccr__label">{c.label}</p>
                    <p className="lp-ccr__value">{c.value}</p>
                  </div>
                )
            ))}
          </div>
          {extras?.mapEmbedUrl && (
            <div style={{ marginTop:"3rem", borderRadius:20, overflow:"hidden", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
              <iframe src={extras.mapEmbedUrl} title="Location map" style={{ width:"100%", height:320, border:0, display:"block" }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ─── contact · full-map-overlay ───────────────────────────────────────────────
// Full-width map with a floating contact card overlaid.
export function ContactFullMapOverlay({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  return (
    <>
      <style>{`
        .lp-cfmo { position:relative; background:#e5e7eb; overflow:hidden; }
        .lp-cfmo__map { display:block; width:100%; height:520px; border:0; }
        .lp-cfmo__overlay { position:absolute; top:0; left:0; bottom:0; width:100%; display:flex; align-items:center; pointer-events:none; }
        .lp-cfmo__card { pointer-events:all; background:#fff; border-radius:24px; padding:2.5rem 2rem; width:380px; margin-left:max(2rem,6vw); box-shadow:0 20px 60px rgba(0,0,0,0.18); }
        @media(max-width:680px){ .lp-cfmo__map{height:700px;} .lp-cfmo__overlay{align-items:flex-start;padding-top:1.5rem;} .lp-cfmo__card{width:calc(100%-3rem);margin:0 1.5rem;} }
        .lp-cfmo__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-cfmo__h2 { font-family:var(--font-heading,system-ui); font-size:1.65rem; font-weight:800; color:#111827; line-height:1.2; letter-spacing:-0.015em; margin:0 0 0.875rem; }
        .lp-cfmo__body { font-size:0.9rem; color:#6b7280; line-height:1.75; margin:0 0 1.5rem; }
        .lp-cfmo__row { display:flex; align-items:center; gap:0.75rem; padding:0.6rem 0; border-bottom:1px solid #f3f4f6; font-size:0.9rem; color:#374151; text-decoration:none; }
        .lp-cfmo__row:last-child { border-bottom:none; }
      `}</style>
      <section className="lp-cfmo">
        {extras?.mapEmbedUrl
          ? <iframe src={extras.mapEmbedUrl} title="Location map" className="lp-cfmo__map" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          : <div style={{ height:520, background:`linear-gradient(135deg,${brandPrimary}12,${brandPrimary}04)`, display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:"6rem", opacity:0.2 }}>🗺️</span></div>
        }
        <div className="lp-cfmo__overlay">
          <div className="lp-cfmo__card">
            <p className="lp-cfmo__eyebrow">Visit us</p>
            <h2 className="lp-cfmo__h2">{renderRich(heading)}</h2>
            {body && <p className="lp-cfmo__body">{renderRich(body)}</p>}
            {extras?.address && <div className="lp-cfmo__row"><span>📍</span><span>{extras.address}</span></div>}
            {extras?.phone && <a href={`tel:${extras.phone}`} className="lp-cfmo__row"><span>📞</span><span>{extras.phone}</span></a>}
            {extras?.email && <a href={`mailto:${extras.email}`} className="lp-cfmo__row"><span>✉️</span><span>{extras.email}</span></a>}
            {extras?.openingHours && <div className="lp-cfmo__row"><span>🕐</span><span>{extras.openingHours}</span></div>}
          </div>
        </div>
      </section>
    </>
  );
}
