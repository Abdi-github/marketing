import type { TestimonialsSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";

type Props = { section: TestimonialsSection; brandPrimary: string };
type Item = { quote: string; author: string; role?: string | null; avatarUrl?: string | null; rating?: number | null };

function Stars({ rating = 5, color }: { rating?: number | null; color: string }) {
  return (
    <div style={{ display:"flex", gap:"0.2rem", marginBottom:"1rem" }}>
      {[1,2,3,4,5].map((s) => (
        <svg key={s} width="14" height="14" viewBox="0 0 20 20" fill={s <= (rating ?? 5) ? color : "#e5e7eb"} aria-hidden>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function Avatar({ item, color }: { item: Item; color: string }) {
  if (item.avatarUrl) {
    return <img src={item.avatarUrl} alt={item.author} style={{ width:44, height:44, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />;
  }
  return (
    <div style={{ width:44, height:44, borderRadius:"50%", flexShrink:0, background:color, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"1.1rem" }}>
      {item.author.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── testimonials · cards-3col ────────────────────────────────────────────────
export function TestimonialsCards3col({ section, brandPrimary }: Props) {
  const items: Item[] = section.extras?.items ?? [];
  return (
    <>
      <style>{`
        .lp-tc3 { background:#f9fafb; padding:6rem 0; }
        .lp-tc3__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; }
        .lp-tc3__header { text-align:center; max-width:580px; margin:0 auto 3.5rem; }
        .lp-tc3__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-tc3__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; color:#111827; line-height:1.15; letter-spacing:-0.02em; margin:0; }
        .lp-tc3__grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:1.5rem; }
        .lp-tc3__card { background:#fff; border-radius:20px; padding:2rem 1.75rem; border:1px solid #f0f0f0; box-shadow:0 2px 16px rgba(0,0,0,0.04); display:flex; flex-direction:column; }
        .lp-tc3__quote { font-family:Georgia,serif; font-size:3.5rem; line-height:1; color:${brandPrimary}; margin-bottom:0.25rem; opacity:0.65; }
        .lp-tc3__text { font-size:0.95rem; color:#374151; line-height:1.8; font-style:italic; flex:1; margin:0; }
        .lp-tc3__footer { display:flex; align-items:center; gap:0.875rem; margin-top:1.75rem; }
        .lp-tc3__name { font-weight:700; font-size:0.875rem; color:#111827; margin:0; }
        .lp-tc3__role { font-size:0.75rem; color:#9ca3af; margin:0.15rem 0 0; }
      `}</style>
      <section className="lp-tc3">
        <div className="lp-tc3__inner">
          <div className="lp-tc3__header">
            <p className="lp-tc3__eyebrow">Reviews</p>
            <h2 className="lp-tc3__h2">{renderRich(section.heading)}</h2>
          </div>
          {items.length > 0 && (
            <div className="lp-tc3__grid">
              {items.map((item, i) => (
                <div key={i} className="lp-tc3__card">
                  <Stars rating={item.rating} color={brandPrimary} />
                  <div className="lp-tc3__quote">&ldquo;</div>
                  <p className="lp-tc3__text">{item.quote}</p>
                  <div className="lp-tc3__footer">
                    <Avatar item={item} color={brandPrimary} />
                    <div>
                      <p className="lp-tc3__name">{item.author}</p>
                      {item.role && <p className="lp-tc3__role">{item.role}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ─── testimonials · large-quote ───────────────────────────────────────────────
// Single prominent centered quote — great for a brand statement.
export function TestimonialsLargeQuote({ section, brandPrimary }: Props) {
  const items: Item[] = section.extras?.items ?? [];
  const featured = items[0];
  return (
    <>
      <style>{`
        .lp-tlq { background:#fff; padding:7rem 0; }
        .lp-tlq__inner { max-width:800px; margin:0 auto; padding:0 1.5rem; text-align:center; }
        .lp-tlq__mark { font-family:Georgia,serif; font-size:7rem; line-height:0.75; color:${brandPrimary}; opacity:0.15; display:block; margin-bottom:-1rem; }
        .lp-tlq__quote { font-family:var(--font-heading,system-ui); font-size:clamp(1.5rem,4vw,2.5rem); font-weight:700; color:#111827; line-height:1.4; letter-spacing:-0.015em; margin:0 0 2.5rem; font-style:italic; }
        .lp-tlq__divider { width:3rem; height:3px; background:${brandPrimary}; border-radius:2px; margin:0 auto 2rem; }
        .lp-tlq__author { display:flex; align-items:center; justify-content:center; gap:1rem; }
        .lp-tlq__name { font-weight:700; font-size:1rem; color:#111827; margin:0; }
        .lp-tlq__role { font-size:0.85rem; color:#9ca3af; margin:0.2rem 0 0; }
      `}</style>
      <section className="lp-tlq">
        <div className="lp-tlq__inner">
          <span className="lp-tlq__mark">&ldquo;</span>
          <p className="lp-tlq__quote">{featured?.quote ?? section.body ?? section.heading}</p>
          <div className="lp-tlq__divider" />
          {featured && (
            <div className="lp-tlq__author">
              {featured.avatarUrl
                ? <img src={featured.avatarUrl} alt={featured.author} style={{ width:52, height:52, borderRadius:"50%", objectFit:"cover" }} />
                : <div style={{ width:52, height:52, borderRadius:"50%", background:brandPrimary, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"1.3rem" }}>{featured.author.charAt(0)}</div>
              }
              <div style={{ textAlign:"left" }}>
                <p className="lp-tlq__name">{featured.author}</p>
                {featured.role && <p className="lp-tlq__role">{featured.role}</p>}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ─── testimonials · list-with-avatars ─────────────────────────────────────────
// Vertical list, large avatar on left, quote text on right.
export function TestimonialsListWithAvatars({ section, brandPrimary }: Props) {
  const items: Item[] = section.extras?.items ?? [];
  return (
    <>
      <style>{`
        .lp-tla { background:#f9fafb; padding:6rem 0; }
        .lp-tla__inner { max-width:760px; margin:0 auto; padding:0 1.5rem; }
        .lp-tla__header { text-align:center; margin-bottom:3.5rem; }
        .lp-tla__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-tla__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; color:#111827; line-height:1.15; letter-spacing:-0.02em; margin:0; }
        .lp-tla__list { display:flex; flex-direction:column; gap:1.25rem; }
        .lp-tla__item { background:#fff; border-radius:20px; padding:1.75rem 2rem; border:1px solid #f0f0f0; box-shadow:0 2px 12px rgba(0,0,0,0.04); display:flex; gap:1.5rem; align-items:flex-start; }
        @media(max-width:480px){ .lp-tla__item{flex-direction:column;gap:1rem;} }
        .lp-tla__avatar-lg { width:64px; height:64px; border-radius:50%; object-fit:cover; flex-shrink:0; }
        .lp-tla__avatar-init { width:64px; height:64px; border-radius:50%; background:${brandPrimary}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.5rem; flex-shrink:0; }
        .lp-tla__quote { font-size:0.97rem; color:#374151; line-height:1.8; font-style:italic; margin:0 0 0.75rem; }
        .lp-tla__meta { font-size:0.82rem; color:#9ca3af; }
        .lp-tla__meta strong { color:#111827; font-size:0.9rem; }
      `}</style>
      <section className="lp-tla">
        <div className="lp-tla__inner">
          <div className="lp-tla__header">
            <p className="lp-tla__eyebrow">What people say</p>
            <h2 className="lp-tla__h2">{renderRich(section.heading)}</h2>
          </div>
          {items.length > 0 && (
            <div className="lp-tla__list">
              {items.map((item, i) => (
                <div key={i} className="lp-tla__item">
                  {item.avatarUrl
                    ? <img src={item.avatarUrl} alt={item.author} className="lp-tla__avatar-lg" />
                    : <div className="lp-tla__avatar-init">{item.author.charAt(0)}</div>
                  }
                  <div style={{ flex:1 }}>
                    <Stars rating={item.rating} color={brandPrimary} />
                    <p className="lp-tla__quote">&ldquo;{item.quote}&rdquo;</p>
                    <p className="lp-tla__meta"><strong>{item.author}</strong>{item.role ? ` · ${item.role}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
