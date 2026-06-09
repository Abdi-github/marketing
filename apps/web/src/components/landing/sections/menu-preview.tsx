import type { MenuPreviewSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";

type Props = { section: MenuPreviewSection; brandPrimary: string };
type MenuItem = { name: string; description?: string | null; price?: string | null; imageUrl?: string | null };

function SectionHeader({ heading, body, eyebrow, brandPrimary, centered = true }: { heading: string; body?: string | null; eyebrow?: string; brandPrimary: string; centered?: boolean }) {
  return (
    <div style={{ textAlign: centered ? "center" : "left", marginBottom: "3rem" }}>
      <p style={{ fontSize:"0.7rem", fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:brandPrimary, marginBottom:"0.75rem" }}>{eyebrow ?? "Menu"}</p>
      <h2 style={{ fontFamily:"var(--font-heading,system-ui)", fontSize:"clamp(1.75rem,4vw,2.75rem)", fontWeight:800, color:"#111827", lineHeight:1.15, letterSpacing:"-0.02em", margin:"0 0 1rem" }}>{renderRich(heading)}</h2>
      {body && <p style={{ fontSize:"1rem", color:"#6b7280", lineHeight:1.8, margin:0, maxWidth:centered ? 540 : undefined, marginLeft: centered ? "auto" : undefined, marginRight: centered ? "auto" : undefined }}>{renderRich(body)}</p>}
    </div>
  );
}

// ─── menu_preview · list-borders ──────────────────────────────────────────────
// Clean list with dividers, price badge on the right.
export function MenuPreviewListBorders({ section, brandPrimary }: Props) {
  const items: MenuItem[] = section.extras?.items ?? [];
  return (
    <section style={{ padding:"6rem 0", background:"#f9fafb" }}>
      <div style={{ maxWidth:840, margin:"0 auto", padding:"0 1.5rem" }}>
        <SectionHeader heading={section.heading} body={section.body} brandPrimary={brandPrimary} />
        {items.length > 0 && (
          <div style={{ background:"#fff", borderRadius:20, overflow:"hidden", boxShadow:"0 2px 20px rgba(0,0,0,0.06)", border:"1px solid #f0f0f0" }}>
            {items.map((item, i) => (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"1.5rem", padding:"1.35rem 1.75rem", borderBottom: i < items.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:700, fontSize:"1rem", margin:"0 0 0.25rem", color:"#111827" }}>{item.name}</p>
                  {item.description && <p style={{ fontSize:"0.875rem", color:"#6b7280", margin:0, lineHeight:1.6 }}>{item.description}</p>}
                </div>
                {item.price && (
                  <span style={{ fontWeight:800, fontSize:"0.95rem", color:brandPrimary, whiteSpace:"nowrap", flexShrink:0, background:`${brandPrimary}10`, padding:"0.3rem 0.85rem", borderRadius:8, border:`1px solid ${brandPrimary}25` }}>
                    {item.price}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── menu_preview · cards-grid ────────────────────────────────────────────────
// Each menu item as a product card with optional image.
export function MenuPreviewCardsGrid({ section, brandPrimary }: Props) {
  const items: MenuItem[] = section.extras?.items ?? [];
  return (
    <>
      <style>{`
        .lp-mcg { background:#fff; padding:6rem 0; }
        .lp-mcg__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; }
        .lp-mcg__grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:1.25rem; }
        .lp-mcg__card { border-radius:18px; overflow:hidden; border:1px solid #f0f0f0; box-shadow:0 2px 12px rgba(0,0,0,0.04); background:#fff; }
        .lp-mcg__img { aspect-ratio:16/9; position:relative; background:#f3f4f6; overflow:hidden; }
        .lp-mcg__body { padding:1.25rem; }
        .lp-mcg__name { font-weight:700; font-size:1rem; color:#111827; margin:0 0 0.35rem; }
        .lp-mcg__desc { font-size:0.85rem; color:#6b7280; line-height:1.6; margin:0 0 1rem; }
        .lp-mcg__foot { display:flex; align-items:center; justify-content:space-between; }
        .lp-mcg__price { font-weight:800; font-size:1.05rem; color:${brandPrimary}; }
      `}</style>
      <section className="lp-mcg">
        <div className="lp-mcg__inner">
          <SectionHeader heading={section.heading} body={section.body} brandPrimary={brandPrimary} />
          {items.length > 0 && (
            <div className="lp-mcg__grid">
              {items.map((item, i) => (
                <div key={i} className="lp-mcg__card">
                  <div className="lp-mcg__img">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
                      : <div style={{ position:"absolute", inset:0, background:`linear-gradient(135deg,${brandPrimary}12,${brandPrimary}04)`, display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:"2.5rem", opacity:0.3 }}>🍽️</span></div>
                    }
                  </div>
                  <div className="lp-mcg__body">
                    <p className="lp-mcg__name">{item.name}</p>
                    {item.description && <p className="lp-mcg__desc">{item.description}</p>}
                    {item.price && (
                      <div className="lp-mcg__foot">
                        <span className="lp-mcg__price">{item.price}</span>
                      </div>
                    )}
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

// ─── menu_preview · split-image ───────────────────────────────────────────────
// Left: feature lifestyle image; Right: menu list with prices.
export function MenuPreviewSplitImage({ section, brandPrimary }: Props) {
  const items: MenuItem[] = section.extras?.items ?? [];
  const heroImg = items.find((i) => i.imageUrl)?.imageUrl ?? null;
  return (
    <>
      <style>{`
        .lp-msi { background:#f9fafb; padding:6rem 0; }
        .lp-msi__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; display:flex; gap:4rem; align-items:center; }
        .lp-msi__image { flex:1 1 42%; border-radius:24px; overflow:hidden; position:relative; aspect-ratio:3/4; background:#e5e7eb; }
        .lp-msi__menu { flex:1 1 54%; }
        @media(max-width:768px){ .lp-msi__inner{flex-direction:column;} .lp-msi__image{width:100%;min-height:260px;} }
        .lp-msi__item { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; padding:1.1rem 0; border-bottom:1px solid #e5e7eb; }
        .lp-msi__item:last-child { border-bottom:none; }
        .lp-msi__item-name { font-weight:700; font-size:1rem; color:#111827; margin:0 0 0.25rem; }
        .lp-msi__item-desc { font-size:0.85rem; color:#9ca3af; margin:0; line-height:1.5; }
        .lp-msi__price { font-weight:800; color:${brandPrimary}; font-size:0.95rem; white-space:nowrap; flex-shrink:0; }
      `}</style>
      <section className="lp-msi">
        <div className="lp-msi__inner">
          <div className="lp-msi__image">
            {heroImg
              ? <img src={heroImg} alt={section.heading} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
              : <div style={{ position:"absolute", inset:0, background:`linear-gradient(135deg,${brandPrimary}18,${brandPrimary}06)`, display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:"5rem", opacity:0.25 }}>🍽️</span></div>
            }
          </div>
          <div className="lp-msi__menu">
            <SectionHeader heading={section.heading} body={section.body} brandPrimary={brandPrimary} centered={false} />
            {items.map((item, i) => (
              <div key={i} className="lp-msi__item">
                <div>
                  <p className="lp-msi__item-name">{item.name}</p>
                  {item.description && <p className="lp-msi__item-desc">{item.description}</p>}
                </div>
                {item.price && <span className="lp-msi__price">{item.price}</span>}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
