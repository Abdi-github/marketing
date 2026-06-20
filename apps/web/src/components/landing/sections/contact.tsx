import type { ContactSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";
import { buildTrackedCtaProps } from "../tracking";

type Props = { section: ContactSection; brandPrimary: string };

const DEFAULT_MAP_ADDRESS = "Neuchatel, Switzerland";

function mapEmbedUrlForAddress(address: string | null | undefined): string {
  const query = encodeURIComponent(address?.trim() || DEFAULT_MAP_ADDRESS);
  return `https://www.google.com/maps?q=${query}&output=embed`;
}

// ─── contact · split-map ──────────────────────────────────────────────────────
// Contact info on left, map iframe on right.
export function ContactSplitMap({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  const mapUrl = extras?.mapEmbedUrl || mapEmbedUrlForAddress(extras?.address);
  return (
    <>
      <style>{`
        .lp-csm { background:var(--lp-surface,#f9fafb); padding:6rem 0; }
        .lp-csm__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; display:flex; gap:4rem; align-items:flex-start; }
        .lp-csm__info { flex:1 1 40%; }
        .lp-csm__map { flex:1 1 55%; border-radius:24px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); min-height:400px; background:var(--lp-border,#e5e7eb); }
        @media(max-width:768px){ .lp-csm__inner{flex-direction:column;} .lp-csm__map{width:100%;min-height:280px;} }
        .lp-csm__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:1rem; }
        .lp-csm__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.15; letter-spacing:-0.02em; margin:0 0 1.25rem; }
        .lp-csm__body { font-size:0.95rem; color:var(--lp-muted,#6b7280); line-height:1.8; margin:0 0 2rem; }
        .lp-csm__contact-item { display:flex; align-items:center; gap:0.875rem; padding:0.85rem 0; border-bottom:1px solid var(--lp-border,#e5e7eb); text-decoration:none; color:var(--lp-text,#111827); font-size:0.95rem; }
        .lp-csm__contact-item:last-child { border-bottom:none; }
        .lp-csm__icon { width:38px; height:38px; border-radius:10px; background:${brandPrimary}12; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0; }
        .lp-csm-map { position:relative; height:400px; overflow:hidden; background:
          linear-gradient(90deg,rgba(17,24,39,0.06) 1px,transparent 1px),
          linear-gradient(0deg,rgba(17,24,39,0.06) 1px,transparent 1px),
          radial-gradient(circle at 28% 22%,${brandPrimary}22,transparent 28%),
          linear-gradient(135deg,var(--lp-card,#fff),var(--lp-surface,#f9fafb));
          background-size:56px 56px,56px 56px,100% 100%,100% 100%; }
        .lp-csm-map__route { position:absolute; height:10px; border-radius:999px; background:${brandPrimary}; opacity:0.22; transform-origin:left center; }
        .lp-csm-map__route--a { width:78%; left:8%; top:52%; transform:rotate(-13deg); }
        .lp-csm-map__route--b { width:52%; left:28%; top:32%; transform:rotate(29deg); opacity:0.16; }
        .lp-csm-map__pin { position:absolute; width:18px; height:18px; border-radius:50%; background:${brandPrimary}; box-shadow:0 0 0 9px ${brandPrimary}22,0 18px 40px rgba(0,0,0,0.18); }
        .lp-csm-map__pin--primary { left:54%; top:43%; }
        .lp-csm-map__pin--secondary { left:23%; top:61%; width:12px; height:12px; opacity:0.55; }
        .lp-csm-map__block { position:absolute; border-radius:18px; background:rgba(255,255,255,0.72); border:1px solid rgba(17,24,39,0.08); box-shadow:0 18px 45px rgba(15,23,42,0.08); }
        .lp-csm-map__block--a { width:122px; height:76px; right:12%; top:14%; }
        .lp-csm-map__block--b { width:92px; height:110px; left:10%; top:18%; }
        .lp-csm-map__block--c { width:138px; height:64px; right:20%; bottom:13%; }
        .lp-csm__map > div { position:relative; overflow:hidden; background:
          linear-gradient(90deg,rgba(17,24,39,0.06) 1px,transparent 1px),
          linear-gradient(0deg,rgba(17,24,39,0.06) 1px,transparent 1px),
          radial-gradient(circle at 28% 22%,${brandPrimary}22,transparent 28%),
          linear-gradient(135deg,var(--lp-card,#fff),var(--lp-surface,#f9fafb)) !important;
          background-size:56px 56px,56px 56px,100% 100%,100% 100% !important; }
        .lp-csm__map > div::before { content:""; position:absolute; width:78%; height:10px; left:8%; top:52%; border-radius:999px; background:${brandPrimary}; opacity:0.22; transform:rotate(-13deg); transform-origin:left center; }
        .lp-csm__map > div::after { content:""; position:absolute; left:54%; top:43%; width:18px; height:18px; border-radius:50%; background:${brandPrimary}; box-shadow:0 0 0 9px ${brandPrimary}22,0 18px 40px rgba(0,0,0,0.18); }
        .lp-csm__map > div > span { display:none; }
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
              <a
                href={`tel:${extras.phone}`}
                className="lp-csm__contact-item"
                {...buildTrackedCtaProps({
                  label: extras.phone,
                  href: `tel:${extras.phone}`,
                  section: "contact",
                })}
              >
                <span className="lp-csm__icon">📞</span>
                <span>{extras.phone}</span>
              </a>
            )}
            {extras?.email && (
              <a
                href={`mailto:${extras.email}`}
                className="lp-csm__contact-item"
                {...buildTrackedCtaProps({
                  label: extras.email,
                  href: `mailto:${extras.email}`,
                  section: "contact",
                })}
              >
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
            {mapUrl ? (
              <iframe
                src={mapUrl}
                title="Location"
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: 400,
                  border: 0,
                  display: "block",
                }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div
                style={{
                  height: 400,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `linear-gradient(135deg,${brandPrimary}12,${brandPrimary}04)`,
                }}
              >
                <span style={{ fontSize: "4rem", opacity: 0.25 }}>🗺️</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

// ─── contact · cards-row ──────────────────────────────────────────────────────
// Row of icon cards — great when no map embed is available.
export function ContactCardsRow({
  section,
  brandPrimary,
  darkMode = false,
}: Props & { darkMode?: boolean }) {
  const { heading, body, extras } = section;
  const mapUrl = extras?.mapEmbedUrl || mapEmbedUrlForAddress(extras?.address);
  const dm = darkMode ? " lp-ccr--dark" : "";
  const cards = [
    extras?.address
      ? { icon: "📍", label: "Address", value: extras.address, href: undefined }
      : null,
    extras?.phone
      ? { icon: "📞", label: "Phone", value: extras.phone, href: `tel:${extras.phone}` }
      : null,
    extras?.email
      ? { icon: "✉️", label: "Email", value: extras.email, href: `mailto:${extras.email}` }
      : null,
    extras?.openingHours
      ? { icon: "🕐", label: "Hours", value: extras.openingHours, href: undefined }
      : null,
  ].filter(Boolean) as { icon: string; label: string; value: string; href?: string }[];

  return (
    <>
      <style>{`
        .lp-ccr { background:var(--lp-card,#fff); padding:6rem 0; }
        .lp-ccr__inner { max-width:1000px; margin:0 auto; padding:0 1.5rem; }
        .lp-ccr__header { text-align:center; max-width:580px; margin:0 auto 3.5rem; }
        .lp-ccr__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-ccr__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.15; letter-spacing:-0.02em; margin:0 0 1rem; }
        .lp-ccr__body { font-size:1rem; color:var(--lp-muted,#6b7280); line-height:1.8; margin:0; }
        .lp-ccr__grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1.25rem; }
        .lp-ccr__card { background:var(--lp-surface,#f9fafb); border-radius:20px; padding:2rem 1.5rem; text-align:center; border:1px solid var(--lp-border,#f0f0f0); text-decoration:none; display:block; }
        .lp-ccr__icon { font-size:2rem; margin-bottom:0.875rem; }
        .lp-ccr__label { font-size:0.72rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.5rem; }
        .lp-ccr__value { font-size:0.95rem; color:var(--lp-text-soft,#374151); font-weight:500; line-height:1.5; }
        /* — dark modifier — */
        .lp-ccr--dark { background:var(--lp-dark-bg,#0b0f1a); }
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
            {cards.map((c, i) =>
              c.href ? (
                <a
                  key={i}
                  href={c.href}
                  className="lp-ccr__card"
                  {...buildTrackedCtaProps({
                    label: c.label,
                    href: c.href,
                    section: "contact",
                  })}
                  style={{ textDecoration: "none" }}
                >
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
              ),
            )}
          </div>
          {mapUrl && (
            <div
              style={{
                marginTop: "3rem",
                borderRadius: 20,
                overflow: "hidden",
                boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
              }}
            >
              <iframe
                src={mapUrl}
                title="Location map"
                style={{ width: "100%", height: 320, border: 0, display: "block" }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
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
  const mapUrl = extras?.mapEmbedUrl || mapEmbedUrlForAddress(extras?.address);
  return (
    <>
      <style>{`
        .lp-cfmo { position:relative; background:var(--lp-border,#e5e7eb); overflow:hidden; }
        .lp-cfmo__map { display:block; width:100%; height:520px; border:0; }
        .lp-cfmo__overlay { position:absolute; top:0; left:0; bottom:0; width:100%; display:flex; align-items:center; pointer-events:none; }
        .lp-cfmo__card { pointer-events:all; background:var(--lp-card,#fff); border-radius:24px; padding:2.5rem 2rem; width:380px; margin-left:max(2rem,6vw); box-shadow:0 20px 60px rgba(0,0,0,0.18); }
        @media(max-width:680px){ .lp-cfmo__map,.lp-cfmo > div:not(.lp-cfmo__overlay){height:700px;} .lp-cfmo__overlay{align-items:flex-start;padding-top:1.5rem;} .lp-cfmo__card{width:calc(100% - 3rem);margin:0 1.5rem;} }
        .lp-cfmo__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-cfmo__h2 { font-family:var(--font-heading,system-ui); font-size:1.65rem; font-weight:800; color:var(--lp-text,#111827); line-height:1.2; letter-spacing:-0.015em; margin:0 0 0.875rem; }
        .lp-cfmo__body { font-size:0.9rem; color:var(--lp-muted,#6b7280); line-height:1.75; margin:0 0 1.5rem; }
        .lp-cfmo__row { display:flex; align-items:center; gap:0.75rem; padding:0.6rem 0; border-bottom:1px solid var(--lp-subtle,#f3f4f6); font-size:0.9rem; color:var(--lp-text-soft,#374151); text-decoration:none; }
        .lp-cfmo__row:last-child { border-bottom:none; }
        .lp-cfmo > div:not(.lp-cfmo__overlay) { position:relative; overflow:hidden; background:
          linear-gradient(90deg,rgba(17,24,39,0.08) 1px,transparent 1px),
          linear-gradient(0deg,rgba(17,24,39,0.08) 1px,transparent 1px),
          radial-gradient(circle at 66% 26%,${brandPrimary}24,transparent 30%),
          radial-gradient(circle at 18% 82%,rgba(255,255,255,0.78),transparent 34%),
          linear-gradient(135deg,var(--lp-surface,#f7f7f5),var(--lp-card,#fff)) !important;
          background-size:70px 70px,70px 70px,100% 100%,100% 100%,100% 100% !important; }
        .lp-cfmo > div:not(.lp-cfmo__overlay)::before { content:""; position:absolute; width:72%; height:12px; left:18%; top:56%; border-radius:999px; background:${brandPrimary}; opacity:0.2; transform:rotate(-15deg); transform-origin:left center; }
        .lp-cfmo > div:not(.lp-cfmo__overlay)::after { content:""; position:absolute; left:65%; top:42%; width:22px; height:22px; border-radius:50%; background:${brandPrimary}; box-shadow:0 0 0 12px ${brandPrimary}22,0 24px 60px rgba(15,23,42,0.24); }
        .lp-cfmo > div:not(.lp-cfmo__overlay) > span { display:none; }
      `}</style>
      <section className="lp-cfmo">
        {mapUrl ? (
          <iframe
            src={mapUrl}
            title="Location map"
            className="lp-cfmo__map"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div
            style={{
              height: 520,
              background: `linear-gradient(135deg,${brandPrimary}12,${brandPrimary}04)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: "6rem", opacity: 0.2 }}>🗺️</span>
          </div>
        )}
        <div className="lp-cfmo__overlay">
          <div className="lp-cfmo__card">
            <p className="lp-cfmo__eyebrow">Visit us</p>
            <h2 className="lp-cfmo__h2">{renderRich(heading)}</h2>
            {body && <p className="lp-cfmo__body">{renderRich(body)}</p>}
            {extras?.address && (
              <div className="lp-cfmo__row">
                <span>📍</span>
                <span>{extras.address}</span>
              </div>
            )}
            {extras?.phone && (
              <a
                href={`tel:${extras.phone}`}
                className="lp-cfmo__row"
                {...buildTrackedCtaProps({
                  label: extras.phone,
                  href: `tel:${extras.phone}`,
                  section: "contact",
                })}
              >
                <span>📞</span>
                <span>{extras.phone}</span>
              </a>
            )}
            {extras?.email && (
              <a
                href={`mailto:${extras.email}`}
                className="lp-cfmo__row"
                {...buildTrackedCtaProps({
                  label: extras.email,
                  href: `mailto:${extras.email}`,
                  section: "contact",
                })}
              >
                <span>✉️</span>
                <span>{extras.email}</span>
              </a>
            )}
            {extras?.openingHours && (
              <div className="lp-cfmo__row">
                <span>🕐</span>
                <span>{extras.openingHours}</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
