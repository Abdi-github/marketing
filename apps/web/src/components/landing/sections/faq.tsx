import type { FaqSection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";

type Props = { section: FaqSection; brandPrimary: string };
type FaqItem = { question: string; answer: string };

// ─── faq · accordion ──────────────────────────────────────────────────────────
// Interactive details/summary accordion — clean and minimal.
export function FAQAccordion({
  section,
  brandPrimary,
  darkMode = false,
}: Props & { darkMode?: boolean }) {
  const items: FaqItem[] = section.extras?.items ?? [];
  const dm = darkMode ? " lp-faq--dark" : "";
  return (
    <>
      <style>{`
        .lp-faq { background:var(--lp-card,#fff); padding:6rem 0; }
        .lp-faq__inner { max-width:720px; margin:0 auto; padding:0 1.5rem; }
        .lp-faq__eyebrow { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${brandPrimary}; margin-bottom:0.75rem; text-align:center; }
        .lp-faq__h2 { font-family:var(--font-heading,system-ui); font-size:clamp(1.75rem,4vw,2.75rem); font-weight:800; color:var(--lp-text,#111827); line-height:1.15; letter-spacing:-0.02em; margin:0 0 1rem; text-align:center; }
        .lp-faq__body { font-size:1rem; color:var(--lp-muted,#6b7280); line-height:1.8; text-align:center; max-width:540px; margin:0 auto; }
        .lp-faq__list { display:flex; flex-direction:column; gap:0.625rem; margin-top:3rem; }
        .lp-faq__item { border-radius:14px; border:1px solid var(--lp-border,#e5e7eb); overflow:hidden; }
        .lp-faq__summary { padding:1.25rem 1.5rem; font-weight:600; font-size:0.975rem; color:var(--lp-text,#111827); cursor:pointer; display:flex; justify-content:space-between; align-items:center; list-style:none; background:var(--lp-card,#fff); user-select:none; }
        .lp-faq__plus { color:${brandPrimary}; flex-shrink:0; margin-left:1rem; font-size:1.4rem; line-height:1; }
        .lp-faq__answer-wrap { padding:0.875rem 1.5rem 1.5rem; background:var(--lp-surface,#fafafa); border-top:1px solid var(--lp-subtle,#f3f4f6); }
        .lp-faq__answer { font-size:0.95rem; color:var(--lp-text-soft,#4b5563); line-height:1.8; margin:0; }
        /* — dark modifier — */
        .lp-faq--dark { background:var(--lp-dark-bg,#0b0f1a); }
        .lp-faq--dark .lp-faq__h2 { color:#fff; }
        .lp-faq--dark .lp-faq__body { color:rgba(255,255,255,0.75); }
        .lp-faq--dark .lp-faq__item { border:1px solid rgba(255,255,255,0.08); }
        .lp-faq--dark .lp-faq__summary { background:rgba(255,255,255,0.05); color:#fff; }
        .lp-faq--dark .lp-faq__answer-wrap { background:rgba(255,255,255,0.03); border-top:1px solid rgba(255,255,255,0.06); }
        .lp-faq--dark .lp-faq__answer { color:rgba(255,255,255,0.75); }
      `}</style>
      <section className={`lp-faq${dm}`}>
        <div className="lp-faq__inner">
          <p className="lp-faq__eyebrow">FAQ</p>
          <h2 className="lp-faq__h2">{renderRich(section.heading)}</h2>
          {section.body && !items.length && (
            <p className="lp-faq__body">{renderRich(section.body)}</p>
          )}
          {items.length > 0 && (
            <div className="lp-faq__list">
              {items.map((item, i) => (
                <details key={i} className="lp-faq__item">
                  <summary className="lp-faq__summary">
                    {item.question}
                    <span className="lp-faq__plus">+</span>
                  </summary>
                  <div className="lp-faq__answer-wrap">
                    <p className="lp-faq__answer">{item.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
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
        .lp-f2c { background:var(--lp-surface,#f9fafb); padding:6rem 0; }
        .lp-f2c__inner { max-width:1100px; margin:0 auto; padding:0 1.5rem; }
        .lp-f2c__cols { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-top:3rem; }
        @media(max-width:680px){ .lp-f2c__cols{grid-template-columns:1fr;} }
        .lp-f2c__item { background:var(--lp-card,#fff); border-radius:16px; padding:1.5rem; border:1px solid var(--lp-border,#f0f0f0); }
        .lp-f2c__q { font-weight:700; font-size:0.975rem; color:var(--lp-text,#111827); margin:0 0 0.625rem; display:flex; gap:0.75rem; }
        .lp-f2c__num { font-weight:800; color:${brandPrimary}; font-size:1rem; flex-shrink:0; }
        .lp-f2c__a { font-size:0.9rem; color:var(--lp-muted,#6b7280); line-height:1.75; margin:0; }
      `}</style>
      <section className="lp-f2c">
        <div className="lp-f2c__inner">
          <p
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: brandPrimary,
              marginBottom: "0.75rem",
              textAlign: "center",
            }}
          >
            FAQ
          </p>
          <h2
            style={{
              fontFamily: "var(--font-heading,system-ui)",
              fontSize: "clamp(1.75rem,4vw,2.75rem)",
              fontWeight: 800,
              color: "var(--lp-text,#111827)",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              margin: "0 0 1rem",
              textAlign: "center",
            }}
          >
            {renderRich(section.heading)}
          </h2>
          {items.length > 0 && (
            <div className="lp-f2c__cols">
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {col1.map((item, i) => (
                  <div key={i} className="lp-f2c__item">
                    <p className="lp-f2c__q">
                      <span className="lp-f2c__num">{String(i + 1).padStart(2, "0")}</span>
                      {item.question}
                    </p>
                    <p className="lp-f2c__a">{item.answer}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {col2.map((item, i) => (
                  <div key={i} className="lp-f2c__item">
                    <p className="lp-f2c__q">
                      <span className="lp-f2c__num">{String(half + i + 1).padStart(2, "0")}</span>
                      {item.question}
                    </p>
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
    <section style={{ padding: "6rem 0", background: "var(--lp-card,#fff)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 1.5rem" }}>
        <p
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: brandPrimary,
            marginBottom: "0.75rem",
            textAlign: "center",
          }}
        >
          FAQ
        </p>
        <h2
          style={{
            fontFamily: "var(--font-heading,system-ui)",
            fontSize: "clamp(1.75rem,4vw,2.75rem)",
            fontWeight: 800,
            color: "var(--lp-text,#111827)",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            margin: "0 0 1rem",
            textAlign: "center",
          }}
        >
          {renderRich(section.heading)}
        </h2>
        {items.length > 0 && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "2.5rem", marginTop: "3.5rem" }}
          >
            {items.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
                <span
                  style={{
                    fontWeight: 900,
                    fontSize: "2rem",
                    color: brandPrimary,
                    lineHeight: 1,
                    flexShrink: 0,
                    opacity: 0.3,
                    width: "2.5rem",
                    textAlign: "center",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex: 1, paddingTop: "0.15rem" }}>
                  <p
                    style={{
                      fontWeight: 700,
                      fontSize: "1.05rem",
                      color: "var(--lp-text,#111827)",
                      margin: "0 0 0.5rem",
                      lineHeight: 1.4,
                    }}
                  >
                    {item.question}
                  </p>
                  <p
                    style={{
                      fontSize: "0.95rem",
                      color: "var(--lp-muted,#6b7280)",
                      lineHeight: 1.8,
                      margin: 0,
                    }}
                  >
                    {item.answer}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
