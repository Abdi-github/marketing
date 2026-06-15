import type { AboutSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";
import { LpImage } from "../lp-image";

type Props = { section: AboutSection; brandPrimary: string; darkMode?: boolean };

// ─── about · text-image-split ─────────────────────────────────────────────────
// Text + value points on left, tall image on right.
export function AboutTextImageSplit({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  const members = extras?.teamMembers ?? [];
  // Prefer a dedicated about image; fall back to the first team member photo (legacy).
  const img = extras?.imageUrl ?? members[0]?.photoUrl ?? null;
  return (
    <>
      <style>{`
        .lp-ati { background:var(--lp-card,#fff); padding:6rem 0; }
        .lp-ati__inner { max-width:1080px; margin:0 auto; padding:0 1.5rem; display:flex; align-items:center; gap:5rem; }
        .lp-ati__text { flex:1 1 50%; }
        .lp-ati__image { flex:1 1 46%; border-radius:24px; overflow:hidden; position:relative; aspect-ratio:4/5; background:var(--lp-subtle,#f3f4f6); }
        @media(max-width:768px){ .lp-ati__inner{flex-direction:column;gap:2.5rem;} .lp-ati__image{width:100%;min-height:300px;} }
        .lp-ati__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:1rem; }
        .lp-ati__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.75rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.15; letter-spacing:-0.02em; margin:0 0 1.25rem; }
        .lp-ati__body { font-size:1rem; color:var(--lp-muted,#6b7280); line-height:1.8; margin:0 0 2rem; }
        .lp-ati__checks { display:flex; flex-direction:column; gap:0.75rem; }
        .lp-ati__check { display:flex; align-items:flex-start; gap:0.75rem; font-size:0.95rem; color:var(--lp-text-soft,#374151); }
        .lp-ati__check-icon { width:20px; height:20px; flex-shrink:0; margin-top:1px; border-radius:50%; background:${brandPrimary}18; display:flex; align-items:center; justify-content:center; }
      `}</style>
      <section className="lp-ati">
        <div className="lp-ati__inner">
          <div className="lp-ati__text">
            <p className="lp-ati__eyebrow">About us</p>
            <h2 className="lp-ati__h2">{renderRich(heading)}</h2>
            {body && <p className="lp-ati__body">{renderRich(body)}</p>}
            <ul className="lp-ati__checks" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {(
                extras?.values ?? ["Quality craftsmanship", "Swiss reliability", "Personal service"]
              )
                .slice(0, 4)
                .map((v, i) => (
                  <li key={i} className="lp-ati__check">
                    <span className="lp-ati__check-icon">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill={brandPrimary}
                        aria-hidden
                      >
                        <path d="M8.5 2L4 7 1.5 4.5l-1 1L4 9 9.5 3z" />
                      </svg>
                    </span>
                    {v}
                  </li>
                ))}
            </ul>
          </div>
          <div className="lp-ati__image">
            <LpImage
              src={img}
              alt={typeof heading === "string" ? heading : ""}
              brandPrimary={brandPrimary}
              emoji="🏢"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
        </div>
      </section>
    </>
  );
}

// ─── about · team-grid ────────────────────────────────────────────────────────
// Centered heading + body, then a 3-4 column team member card grid.
export function AboutTeamGrid({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  const members = extras?.teamMembers ?? [];
  return (
    <>
      <style>{`
        .lp-atg { background:var(--lp-surface,#f9fafb); padding:6rem 0; }
        .lp-atg__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; }
        .lp-atg__header { text-align:center; max-width:640px; margin:0 auto 3.5rem; }
        .lp-atg__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-atg__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.75rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.15; letter-spacing:-0.02em; margin:0 0 1rem; }
        .lp-atg__body { font-size:1rem; color:var(--lp-muted,#6b7280); line-height:1.8; margin:0; }
        .lp-atg__grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:1.5rem; }
        .lp-atg__card { background:var(--lp-card,#fff); border-radius:20px; padding:2rem 1.5rem; text-align:center; border:1px solid var(--lp-border,#f0f0f0); box-shadow:0 2px 12px rgba(0,0,0,0.04); }
        .lp-atg__avatar { width:80px; height:80px; border-radius:50%; object-fit:cover; margin:0 auto 1rem; display:block; }
        .lp-atg__avatar-initial { width:80px; height:80px; border-radius:50%; background:${brandPrimary}; color:var(--lp-on-primary,#fff); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.75rem; margin:0 auto 1rem; }
        .lp-atg__name { font-weight:700; font-size:1rem; color:var(--lp-text,#111827); margin:0 0 0.25rem; }
        .lp-atg__role { font-size:0.8rem; color:var(--lp-muted,#9ca3af); margin:0; }
      `}</style>
      <section className="lp-atg">
        <div className="lp-atg__inner">
          <div className="lp-atg__header">
            <p className="lp-atg__eyebrow">Our team</p>
            <h2 className="lp-atg__h2">{renderRich(heading)}</h2>
            {body && <p className="lp-atg__body">{renderRich(body)}</p>}
          </div>
          {members.length > 0 && (
            <div className="lp-atg__grid">
              {members.map((m, i) => (
                <div key={i} className="lp-atg__card">
                  {m.photoUrl ? (
                    <img src={m.photoUrl} alt={m.name} className="lp-atg__avatar" />
                  ) : (
                    <div className="lp-atg__avatar-initial">{m.name.charAt(0).toUpperCase()}</div>
                  )}
                  <p className="lp-atg__name">{m.name}</p>
                  {m.role && <p className="lp-atg__role">{m.role}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ─── about · values-3col ──────────────────────────────────────────────────────
// Three feature columns: icon + title + body — great for "why choose us".
const VALUE_ICONS = ["⭐", "🛡️", "⚡", "🎯", "💡", "🤝"];
export function AboutValues3col({ section, brandPrimary, darkMode = false }: Props) {
  const { heading, body, extras } = section;
  const values = extras?.values ?? ["Exceptional quality", "Swiss reliability", "Personal service"];
  const dm = darkMode ? " lp-av3--dark" : "";
  return (
    <>
      <style>{`
        .lp-av3 { background:var(--lp-card,#fff); padding:6rem 0; }
        .lp-av3__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; }
        .lp-av3__header { text-align:center; max-width:640px; margin:0 auto 4rem; }
        .lp-av3__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; }
        .lp-av3__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.75rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.15; letter-spacing:-0.02em; margin:0 0 1rem; }
        .lp-av3__body { font-size:1rem; color:var(--lp-muted,#6b7280); line-height:1.8; margin:0; }
        .lp-av3__grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:2rem; }
        .lp-av3__item { padding:2rem; border-radius:20px; border:1px solid var(--lp-border,#f0f0f0); background:var(--lp-surface,#fafafa); }
        .lp-av3__icon { font-size:2.25rem; margin-bottom:1.25rem; }
        .lp-av3__title { font-family:var(--font-heading,system-ui); font-size:1.1rem; font-weight:700; color:var(--lp-text,#111827); margin:0; }
        /* dark mode */
        .lp-av3--dark { background:var(--lp-dark-bg,#0b0f1a); }
        .lp-av3--dark .lp-av3__h2 { color:#fff; }
        .lp-av3--dark .lp-av3__body { color:rgba(255,255,255,0.55); }
        .lp-av3--dark .lp-av3__item { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.08); }
        .lp-av3--dark .lp-av3__title { color:#fff; }
      `}</style>
      <section className={`lp-av3${dm}`}>
        <div className="lp-av3__inner">
          <div className="lp-av3__header">
            <p className="lp-av3__eyebrow">Why us</p>
            <h2 className="lp-av3__h2">{renderRich(heading)}</h2>
            {body && <p className="lp-av3__body">{renderRich(body)}</p>}
          </div>
          <div className="lp-av3__grid">
            {values.slice(0, 6).map((v, i) => (
              <div key={i} className="lp-av3__item">
                <div className="lp-av3__icon">{VALUE_ICONS[i % VALUE_ICONS.length]}</div>
                <p className="lp-av3__title">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
