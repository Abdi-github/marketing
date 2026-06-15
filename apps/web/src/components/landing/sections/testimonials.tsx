import type { TestimonialsSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";

type Props = { section: TestimonialsSection; brandPrimary: string; darkMode?: boolean };
type Item = {
  quote: string;
  author: string;
  role?: string | null;
  avatarUrl?: string | null;
  rating?: number | null;
};

function Stars({ rating = 5, color }: { rating?: number | null; color: string }) {
  return (
    <div style={{ display: "flex", gap: "0.2rem", marginBottom: "1rem" }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill={s <= (rating ?? 5) ? color : "var(--lp-border,#e5e7eb)"}
          aria-hidden
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function Avatar({ item, color }: { item: Item; color: string }) {
  if (item.avatarUrl) {
    return (
      <img
        src={item.avatarUrl}
        alt={item.author}
        style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        flexShrink: 0,
        background: color,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: "1.1rem",
      }}
    >
      {item.author.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── testimonials · cards-3col ────────────────────────────────────────────────
export function TestimonialsCards3col({ section, brandPrimary, darkMode = false }: Props) {
  const items: Item[] = section.extras?.items ?? [];
  const dm = darkMode ? " lp-tc3--dark" : "";
  return (
    <>
      <style>{`
        .lp-tc3 { background:var(--lp-surface,#f9fafb); padding:6rem 0; }
        .lp-tc3__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; }
        .lp-tc3__header { text-align:center; max-width:580px; margin:0 auto 3.5rem; }
        .lp-tc3__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-tc3__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.15; letter-spacing:-0.02em; margin:0; }
        .lp-tc3__grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:1.5rem; }
        .lp-tc3__card { background:var(--lp-card,#fff); border-radius:20px; padding:2rem 1.75rem; border:1px solid var(--lp-border,#f0f0f0); box-shadow:0 2px 16px rgba(0,0,0,0.04); display:flex; flex-direction:column; }
        .lp-tc3__quote { font-family:Georgia,serif; font-size:3.5rem; line-height:1; color:${brandPrimary}; margin-bottom:0.25rem; opacity:0.65; }
        .lp-tc3__text { font-size:0.95rem; color:var(--lp-text-soft,#374151); line-height:1.8; font-style:italic; flex:1; margin:0; }
        .lp-tc3__footer { display:flex; align-items:center; gap:0.875rem; margin-top:1.75rem; }
        .lp-tc3__name { font-weight:700; font-size:0.875rem; color:var(--lp-text,#111827); margin:0; }
        .lp-tc3__role { font-size:0.75rem; color:var(--lp-muted,#9ca3af); margin:0.15rem 0 0; }
        /* dark mode */
        .lp-tc3--dark { background:var(--lp-dark-bg,#0b0f1a); }
        .lp-tc3--dark .lp-tc3__h2 { color:#fff; }
        .lp-tc3--dark .lp-tc3__card { background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.08); box-shadow:0 2px 24px rgba(0,0,0,0.4); }
        .lp-tc3--dark .lp-tc3__quote { opacity:0.25; }
        .lp-tc3--dark .lp-tc3__text { color:rgba(255,255,255,0.75); }
        .lp-tc3--dark .lp-tc3__name { color:#fff; }
        .lp-tc3--dark .lp-tc3__role { color:rgba(255,255,255,0.45); }
      `}</style>
      <section className={`lp-tc3${dm}`}>
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
export function TestimonialsLargeQuote({ section, brandPrimary, darkMode = false }: Props) {
  const items: Item[] = section.extras?.items ?? [];
  const featured = items[0];
  const dm = darkMode ? " lp-tlq--dark" : "";
  return (
    <>
      <style>{`
        .lp-tlq { background:var(--lp-card,#fff); padding:7rem 0; }
        .lp-tlq__inner { max-width:800px; margin:0 auto; padding:0 1.5rem; text-align:center; }
        .lp-tlq__mark { font-family:Georgia,serif; font-size:7rem; line-height:0.75; color:${brandPrimary}; opacity:0.15; display:block; margin-bottom:-1rem; }
        .lp-tlq__quote { font-family:var(--font-heading,system-ui); font-size:clamp(1.5rem,4vw,2.5rem); font-weight:700; color:var(--lp-text,#111827); line-height:1.4; letter-spacing:-0.015em; margin:0 0 2.5rem; font-style:italic; }
        .lp-tlq__divider { width:3rem; height:3px; background:${brandPrimary}; border-radius:2px; margin:0 auto 2rem; }
        .lp-tlq__author { display:flex; align-items:center; justify-content:center; gap:1rem; }
        .lp-tlq__name { font-weight:700; font-size:1rem; color:var(--lp-text,#111827); margin:0; }
        .lp-tlq__role { font-size:0.85rem; color:var(--lp-muted,#9ca3af); margin:0.2rem 0 0; }
        /* dark mode */
        .lp-tlq--dark { background:var(--lp-dark-bg,#0b0f1a); }
        .lp-tlq--dark .lp-tlq__mark { opacity:0.1; }
        .lp-tlq--dark .lp-tlq__quote { color:#fff; }
        .lp-tlq--dark .lp-tlq__name { color:#fff; }
        .lp-tlq--dark .lp-tlq__role { color:rgba(255,255,255,0.45); }
      `}</style>
      <section className={`lp-tlq${dm}`}>
        <div className="lp-tlq__inner">
          <span className="lp-tlq__mark">&ldquo;</span>
          <p className="lp-tlq__quote">{featured?.quote ?? section.body ?? section.heading}</p>
          <div className="lp-tlq__divider" />
          {featured && (
            <div className="lp-tlq__author">
              {featured.avatarUrl ? (
                <img
                  src={featured.avatarUrl}
                  alt={featured.author}
                  style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: brandPrimary,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: "1.3rem",
                  }}
                >
                  {featured.author.charAt(0)}
                </div>
              )}
              <div style={{ textAlign: "left" }}>
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
export function TestimonialsListWithAvatars({ section, brandPrimary, darkMode = false }: Props) {
  const items: Item[] = section.extras?.items ?? [];
  const dm = darkMode ? " lp-tla--dark" : "";
  return (
    <>
      <style>{`
        .lp-tla { background:var(--lp-surface,#f9fafb); padding:6rem 0; }
        .lp-tla__inner { max-width:760px; margin:0 auto; padding:0 1.5rem; }
        .lp-tla__header { text-align:center; margin-bottom:3.5rem; }
        .lp-tla__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-tla__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.15; letter-spacing:-0.02em; margin:0; }
        .lp-tla__list { display:flex; flex-direction:column; gap:1.25rem; }
        .lp-tla__item { background:var(--lp-card,#fff); border-radius:20px; padding:1.75rem 2rem; border:1px solid var(--lp-border,#f0f0f0); box-shadow:0 2px 12px rgba(0,0,0,0.04); display:flex; gap:1.5rem; align-items:flex-start; }
        @media(max-width:480px){ .lp-tla__item{flex-direction:column;gap:1rem;} }
        .lp-tla__avatar-lg { width:64px; height:64px; border-radius:50%; object-fit:cover; flex-shrink:0; }
        .lp-tla__avatar-init { width:64px; height:64px; border-radius:50%; background:${brandPrimary}; color:var(--lp-on-primary,#fff); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.5rem; flex-shrink:0; }
        .lp-tla__quote { font-size:0.97rem; color:var(--lp-text-soft,#374151); line-height:1.8; font-style:italic; margin:0 0 0.75rem; }
        .lp-tla__meta { font-size:0.82rem; color:var(--lp-muted,#9ca3af); }
        .lp-tla__meta strong { color:var(--lp-text,#111827); font-size:0.9rem; }
        /* dark mode */
        .lp-tla--dark { background:var(--lp-dark-bg,#0b0f1a); }
        .lp-tla--dark .lp-tla__h2 { color:#fff; }
        .lp-tla--dark .lp-tla__item { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.07); box-shadow:0 2px 20px rgba(0,0,0,0.4); }
        .lp-tla--dark .lp-tla__quote { color:rgba(255,255,255,0.75); }
        .lp-tla--dark .lp-tla__meta { color:rgba(255,255,255,0.4); }
        .lp-tla--dark .lp-tla__meta strong { color:#fff; }
      `}</style>
      <section className={`lp-tla${dm}`}>
        <div className="lp-tla__inner">
          <div className="lp-tla__header">
            <p className="lp-tla__eyebrow">What people say</p>
            <h2 className="lp-tla__h2">{renderRich(section.heading)}</h2>
          </div>
          {items.length > 0 && (
            <div className="lp-tla__list">
              {items.map((item, i) => (
                <div key={i} className="lp-tla__item">
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt={item.author} className="lp-tla__avatar-lg" />
                  ) : (
                    <div className="lp-tla__avatar-init">{item.author.charAt(0)}</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <Stars rating={item.rating} color={brandPrimary} />
                    <p className="lp-tla__quote">&ldquo;{item.quote}&rdquo;</p>
                    <p className="lp-tla__meta">
                      <strong>{item.author}</strong>
                      {item.role ? ` · ${item.role}` : ""}
                    </p>
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

// ─── testimonials · marquee ───────────────────────────────────────────────────
// Modern auto-scrolling marquee of review cards (duplicated track for a seamless
// loop). Pauses on hover; stops entirely under prefers-reduced-motion.
export function TestimonialsMarquee({ section, brandPrimary }: Props) {
  const items: Item[] = section.extras?.items ?? [];
  const loop = items.length > 0 ? [...items, ...items] : [];
  return (
    <>
      <style>{`
        .lp-tmq { background:var(--lp-dark-bg,#0b0b12); padding:5.5rem 0; overflow:hidden; }
        .lp-tmq__header { text-align:center; max-width:580px; margin:0 auto 3rem; padding:0 1.5rem; }
        .lp-tmq__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-tmq__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; color:#fff; line-height:1.15; letter-spacing:-0.02em; margin:0; }
        .lp-tmq__mask { position:relative; -webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent); mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent); }
        .lp-tmq__track { display:flex; gap:1.25rem; width:max-content; animation:lp-tmq-scroll 38s linear infinite; }
        .lp-tmq__mask:hover .lp-tmq__track { animation-play-state:paused; }
        .lp-tmq__card { flex:0 0 360px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:18px; padding:1.75rem; backdrop-filter:blur(6px); }
        .lp-tmq__text { font-size:0.95rem; color:rgba(255,255,255,0.82); line-height:1.7; margin:0 0 1.25rem; }
        .lp-tmq__foot { display:flex; align-items:center; gap:0.75rem; }
        .lp-tmq__av { width:38px; height:38px; border-radius:50%; object-fit:cover; }
        .lp-tmq__av-i { width:38px; height:38px; border-radius:50%; background:${brandPrimary}; color:var(--lp-on-primary,#fff); display:flex; align-items:center; justify-content:center; font-weight:800; }
        .lp-tmq__name { font-weight:700; font-size:0.85rem; color:#fff; margin:0; }
        .lp-tmq__role { font-size:0.72rem; color:rgba(255,255,255,0.5); margin:0.1rem 0 0; }
        @keyframes lp-tmq-scroll { from{transform:translateX(0);} to{transform:translateX(calc(-50% - 0.625rem));} }
        @media(prefers-reduced-motion:reduce){ .lp-tmq__track{ animation:none; flex-wrap:wrap; justify-content:center; width:auto; } }
      `}</style>
      <section className="lp-tmq">
        <div className="lp-tmq__header">
          <p className="lp-tmq__eyebrow">Reviews</p>
          <h2 className="lp-tmq__h2">{renderRich(section.heading)}</h2>
        </div>
        {loop.length > 0 && (
          <div className="lp-tmq__mask">
            <div className="lp-tmq__track">
              {loop.map((item, i) => (
                <div key={i} className="lp-tmq__card">
                  <Stars rating={item.rating} color={brandPrimary} />
                  <p className="lp-tmq__text">&ldquo;{item.quote}&rdquo;</p>
                  <div className="lp-tmq__foot">
                    {item.avatarUrl ? (
                      <img src={item.avatarUrl} alt={item.author} className="lp-tmq__av" />
                    ) : (
                      <span className="lp-tmq__av-i">{item.author.charAt(0).toUpperCase()}</span>
                    )}
                    <div>
                      <p className="lp-tmq__name">{item.author}</p>
                      {item.role && <p className="lp-tmq__role">{item.role}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
