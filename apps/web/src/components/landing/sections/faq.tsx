import type { FaqSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";

type Props = { section: FaqSection; brandPrimary: string };
type FaqItem = { question: string; answer: string };

// ─── faq · accordion ──────────────────────────────────────────────────────────
// Interactive details/summary accordion — clean and minimal.
export function FAQAccordion({ section, brandPrimary }: Props) {
  const items: FaqItem[] = section.extras?.items ?? [];
  return (
    <section style={{ padding:"6rem 0", background:"#fff" }}>
      <div style={{ maxWidth:720, margin:"0 auto", padding:"0 1.5rem" }}>
        <p style={{ fontSize:"0.7rem", fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:brandPrimary, marginBottom:"0.75rem", textAlign:"center" }}>FAQ</p>
        <h2 style={{ fontFamily:"var(--font-heading,system-ui)", fontSize:"clamp(1.75rem,4vw,2.75rem)", fontWeight:800, color:"#111827", lineHeight:1.15, letterSpacing:"-0.02em", margin:"0 0 1rem", textAlign:"center" }}>{renderRich(section.heading)}</h2>
        {section.body && !items.length && <p style={{ fontSize:"1rem", color:"#6b7280", lineHeight:1.8, textAlign:"center", maxWidth:540, margin:"0 auto" }}>{renderRich(section.body)}</p>}
        {items.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:"0.625rem", marginTop:"3rem" }}>
            {items.map((item, i) => (
              <details key={i} style={{ borderRadius:14, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                <summary style={{ padding:"1.25rem 1.5rem", fontWeight:600, fontSize:"0.975rem", color:"#111827", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", listStyle:"none", background:"#fff", userSelect:"none" }}>
                  {item.question}
                  <span style={{ color:brandPrimary, flexShrink:0, marginLeft:"1rem", fontSize:"1.4rem", lineHeight:1 }}>+</span>
                </summary>
                <div style={{ padding:"0.875rem 1.5rem 1.5rem", background:"#fafafa", borderTop:"1px solid #f3f4f6" }}>
                  <p style={{ fontSize:"0.95rem", color:"#4b5563", lineHeight:1.8, margin:0 }}>{item.answer}</p>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── faq · two-column ─────────────────────────────────────────────────────────
// Questions split into two columns — efficient use of horizontal space.
export function FAQTwoColumn({ section, brandPrimary }: Props) {
  const items: FaqItem[] = section.extras?.items ?? [];
  const half = Math.ceil(items.length / 2);
  const col1 = items.slice(0, half);
  const col2 = items.slice(half);
  return (
    <>
      <style>{`
        .lp-f2c { background:#f9fafb; padding:6rem 0; }
        .lp-f2c__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; }
        .lp-f2c__cols { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-top:3rem; }
        @media(max-width:680px){ .lp-f2c__cols{grid-template-columns:1fr;} }
        .lp-f2c__item { background:#fff; border-radius:16px; padding:1.5rem; border:1px solid #f0f0f0; }
        .lp-f2c__q { font-weight:700; font-size:0.975rem; color:#111827; margin:0 0 0.625rem; display:flex; gap:0.75rem; }
        .lp-f2c__num { font-weight:800; color:${brandPrimary}; font-size:1rem; flex-shrink:0; }
        .lp-f2c__a { font-size:0.9rem; color:#6b7280; line-height:1.75; margin:0; }
      `}</style>
      <section className="lp-f2c">
        <div className="lp-f2c__inner">
          <p style={{ fontSize:"0.7rem", fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:brandPrimary, marginBottom:"0.75rem", textAlign:"center" }}>FAQ</p>
          <h2 style={{ fontFamily:"var(--font-heading,system-ui)", fontSize:"clamp(1.75rem,4vw,2.75rem)", fontWeight:800, color:"#111827", lineHeight:1.15, letterSpacing:"-0.02em", margin:"0 0 1rem", textAlign:"center" }}>{renderRich(section.heading)}</h2>
          {items.length > 0 && (
            <div className="lp-f2c__cols">
              <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
                {col1.map((item, i) => (
                  <div key={i} className="lp-f2c__item">
                    <p className="lp-f2c__q"><span className="lp-f2c__num">{String(i + 1).padStart(2, "0")}</span>{item.question}</p>
                    <p className="lp-f2c__a">{item.answer}</p>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
                {col2.map((item, i) => (
                  <div key={i} className="lp-f2c__item">
                    <p className="lp-f2c__q"><span className="lp-f2c__num">{String(half + i + 1).padStart(2, "0")}</span>{item.question}</p>
                    <p className="lp-f2c__a">{item.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ─── faq · numbered-list ──────────────────────────────────────────────────────
// All Q&A visible, numbered, brand accent on numbers — clean and readable.
export function FAQNumberedList({ section, brandPrimary }: Props) {
  const items: FaqItem[] = section.extras?.items ?? [];
  return (
    <section style={{ padding:"6rem 0", background:"#fff" }}>
      <div style={{ maxWidth:760, margin:"0 auto", padding:"0 1.5rem" }}>
        <p style={{ fontSize:"0.7rem", fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:brandPrimary, marginBottom:"0.75rem", textAlign:"center" }}>FAQ</p>
        <h2 style={{ fontFamily:"var(--font-heading,system-ui)", fontSize:"clamp(1.75rem,4vw,2.75rem)", fontWeight:800, color:"#111827", lineHeight:1.15, letterSpacing:"-0.02em", margin:"0 0 1rem", textAlign:"center" }}>{renderRich(section.heading)}</h2>
        {items.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:"2.5rem", marginTop:"3.5rem" }}>
            {items.map((item, i) => (
              <div key={i} style={{ display:"flex", gap:"1.5rem", alignItems:"flex-start" }}>
                <span style={{ fontWeight:900, fontSize:"2rem", color:brandPrimary, lineHeight:1, flexShrink:0, opacity:0.3, width:"2.5rem", textAlign:"center" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex:1, paddingTop:"0.15rem" }}>
                  <p style={{ fontWeight:700, fontSize:"1.05rem", color:"#111827", margin:"0 0 0.5rem", lineHeight:1.4 }}>{item.question}</p>
                  <p style={{ fontSize:"0.95rem", color:"#6b7280", lineHeight:1.8, margin:0 }}>{item.answer}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
