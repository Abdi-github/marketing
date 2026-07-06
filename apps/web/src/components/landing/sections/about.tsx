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

export function AboutTrustProof({ section, brandPrimary }: Props) {
  const { heading, body, extras } = section;
  const values = (
    extras?.values ?? ["Clear communication", "Reliable follow-up", "Experienced local team"]
  ).slice(0, 4);
  const members = extras?.teamMembers ?? [];
  const leadMember = members[0];
  const proofItems = [
    { value: "24h", label: "Typical response window" },
    { value: "1:1", label: "Personal guidance" },
    { value: "Local", label: "Swiss SME care" },
  ];
  return (
    <>
      <style>{`
        .lp-atp { background:var(--lp-surface,#f9fafb); padding:6.5rem 0; overflow:hidden; }
        .lp-atp__inner { max-width:1120px; margin:0 auto; padding:0 1.5rem; display:grid; grid-template-columns:minmax(0,0.92fr) minmax(340px,0.72fr); gap:2.5rem; align-items:center; }
        .lp-atp__eyebrow { font-size:0.72rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin:0 0 1rem; }
        .lp-atp__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(2rem,4.6vw,3.6rem); font-weight:850; color:var(--lp-text,#111827); line-height:1.04; letter-spacing:-0.035em; margin:0 0 1.25rem; max-width:12ch; }
        .lp-atp__body { color:var(--lp-muted,#6b7280); font-size:1.05rem; line-height:1.8; margin:0 0 2rem; max-width:620px; }
        .lp-atp__values { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0.8rem; margin:0; padding:0; list-style:none; }
        .lp-atp__value { display:flex; gap:0.75rem; align-items:flex-start; border:1px solid var(--lp-border,rgba(17,24,39,0.1)); border-radius:var(--lp-radius-lg,16px); background:var(--lp-card,#fff); padding:0.9rem; box-shadow:var(--lp-shadow-card,0 10px 28px rgba(17,24,39,0.06)); color:var(--lp-text-soft,#374151); font-weight:700; line-height:1.35; }
        .lp-atp__check { flex:0 0 auto; width:1.35rem; height:1.35rem; border-radius:999px; background:${brandPrimary}14; color:${brandPrimary}; display:flex; align-items:center; justify-content:center; margin-top:0.02rem; }
        .lp-atp__panel { position:relative; border:1px solid var(--lp-border,rgba(17,24,39,0.1)); border-radius:var(--lp-radius-xl,24px); background:var(--lp-card,#fff); padding:1rem; box-shadow:0 24px 80px rgba(17,24,39,0.1); }
        .lp-atp__panel::before { content:""; position:absolute; inset:-3rem -2rem auto auto; width:12rem; height:12rem; border-radius:999px; background:${brandPrimary}14; z-index:0; }
        .lp-atp__card { position:relative; z-index:1; border-radius:calc(var(--lp-radius-xl,24px) - 8px); background:linear-gradient(135deg,${brandPrimary}10,var(--lp-subtle,#f3f4f6)); padding:1.2rem; min-height:320px; display:flex; flex-direction:column; justify-content:space-between; }
        .lp-atp__person { display:flex; align-items:center; gap:0.85rem; }
        .lp-atp__avatar { width:3.4rem; height:3.4rem; border-radius:999px; object-fit:cover; background:${brandPrimary}; color:var(--lp-on-primary,#fff); display:flex; align-items:center; justify-content:center; font-weight:900; font-size:1.2rem; flex:0 0 auto; overflow:hidden; }
        .lp-atp__name { margin:0; color:var(--lp-text,#111827); font-weight:850; }
        .lp-atp__role { margin:0.2rem 0 0; color:var(--lp-muted,#6b7280); font-size:0.82rem; }
        .lp-atp__proof { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0.6rem; }
        .lp-atp__proof-item { border-radius:var(--lp-radius-md,12px); background:rgba(255,255,255,0.72); padding:0.8rem; border:1px solid rgba(255,255,255,0.74); }
        .lp-atp__proof-item strong { display:block; color:var(--lp-text,#111827); font-size:1.1rem; line-height:1; letter-spacing:-0.03em; }
        .lp-atp__proof-item span { display:block; margin-top:0.3rem; color:var(--lp-muted,#6b7280); font-size:0.72rem; line-height:1.25; }
        .lp-atp__note { margin:1rem 0 0; color:var(--lp-muted,#6b7280); font-size:0.88rem; line-height:1.55; }
        @media(max-width:900px){ .lp-atp__inner{grid-template-columns:1fr;} .lp-atp__h2{max-width:14ch;} }
        @media(max-width:640px){ .lp-atp{padding:5rem 0;} .lp-atp__inner{padding:0 1rem;} .lp-atp__values{grid-template-columns:1fr;} .lp-atp__proof{grid-template-columns:1fr;} }
      `}</style>
      <section className="lp-atp">
        <div className="lp-atp__inner">
          <div>
            <p className="lp-atp__eyebrow">Trust built in</p>
            <h2 className="lp-atp__h2">{renderRich(heading)}</h2>
            {body && <p className="lp-atp__body">{renderRich(body)}</p>}
            <ul className="lp-atp__values">
              {values.map((value, i) => (
                <li key={i} className="lp-atp__value">
                  <span className="lp-atp__check" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M10.3 2.7 4.8 8.2 2 5.4.9 6.5l3.9 3.9 6.6-6.6z" />
                    </svg>
                  </span>
                  <span>{value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-atp__panel">
            <div className="lp-atp__card">
              <div>
                <div className="lp-atp__person">
                  <div className="lp-atp__avatar">
                    {leadMember?.photoUrl ? (
                      <img
                        src={leadMember.photoUrl}
                        alt={leadMember.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      (leadMember?.name ?? "SME").slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div>
                    <p className="lp-atp__name">{leadMember?.name ?? "Local specialist team"}</p>
                    <p className="lp-atp__role">
                      {leadMember?.role ?? "Advice, service, follow-up"}
                    </p>
                  </div>
                </div>
                <p className="lp-atp__note">
                  A clear process helps visitors understand what happens after they enquire, book,
                  or request a quote.
                </p>
              </div>
              <div className="lp-atp__proof" aria-label="Proof points">
                {proofItems.map((item) => (
                  <div key={item.label} className="lp-atp__proof-item">
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
