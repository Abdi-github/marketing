import type { GallerySection } from "@marketing/ai-router";
import { renderRich } from "../rich-text";
import { LpImage } from "../lp-image";
import { GalleryCarousel } from "./gallery-carousel";

type Props = { section: GallerySection; brandPrimary: string };
type ImgItem = { url: string; caption?: string | null };

function GalleryHeader({ section, brandPrimary }: Props) {
  return (
    <>
      <p style={{ fontSize:"0.7rem", fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:brandPrimary, marginBottom:"0.75rem", textAlign:"center" }}>Gallery</p>
      <h2 style={{ fontFamily:"var(--font-heading,system-ui)", fontSize:"clamp(1.75rem,4vw,2.75rem)", fontWeight:800, color:"#111827", lineHeight:1.15, letterSpacing:"-0.02em", margin:"0 0 1rem", textAlign:"center" }}>{renderRich(section.heading)}</h2>
      {section.body && <p style={{ fontSize:"1rem", color:"#6b7280", lineHeight:1.8, maxWidth:580, margin:"0 auto 3rem", textAlign:"center" }}>{renderRich(section.body)}</p>}
    </>
  );
}

// ─── gallery · masonry-3 ─────────────────────────────────────────────────────
export function GalleryMasonry3({ section, brandPrimary }: Props) {
  const images: ImgItem[] = (section.extras?.images ?? []).filter((i) => i.url);
  return (
    <>
      <style>{`
        .lp-gm3 { background:#fff; padding:6rem 0; }
        .lp-gm3__inner { max-width:1200px; margin:0 auto; padding:0 1.5rem; }
        .lp-gm3__masonry { columns:3; column-gap:0.875rem; }
        @media(max-width:768px){ .lp-gm3__masonry{columns:2;} }
        @media(max-width:480px){ .lp-gm3__masonry{columns:1;} }
        .lp-gm3__item { break-inside:avoid; margin-bottom:0.875rem; border-radius:16px; overflow:hidden; background:#f3f4f6; }
        .lp-gm3__item img { width:100%; display:block; object-fit:cover; }
      `}</style>
      <section className="lp-gm3">
        <div className="lp-gm3__inner">
          <GalleryHeader section={section} brandPrimary={brandPrimary} />
          {images.length > 0 ? (
            <div className="lp-gm3__masonry">
              {images.map((img, i) => (
                <figure key={i} className="lp-gm3__item" style={{ margin:"0 0 0.875rem" }}>
                  <LpImage src={img.url} alt={img.caption ?? ""} brandPrimary={brandPrimary} emoji="📷" style={{ width:"100%", display:"block", objectFit:"cover", minHeight:200 }} />
                  {img.caption && <figcaption style={{ padding:"0.5rem 0.875rem", fontSize:"0.75rem", color:"#6b7280" }}>{img.caption}</figcaption>}
                </figure>
              ))}
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.875rem" }}>
              {[280, 340, 260, 320, 290, 310].map((h, i) => (
                <div key={i} style={{ height:h, borderRadius:16, background:`linear-gradient(135deg,${brandPrimary}12,${brandPrimary}06)` }} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ─── gallery · grid-2x2 ──────────────────────────────────────────────────────
export function GalleryGrid2x2({ section, brandPrimary }: Props) {
  const images: ImgItem[] = (section.extras?.images ?? []).filter((i) => i.url).slice(0, 4);
  return (
    <>
      <style>{`
        .lp-gg2 { background:#f9fafb; padding:6rem 0; }
        .lp-gg2__inner { max-width:1000px; margin:0 auto; padding:0 1.5rem; }
        .lp-gg2__grid { display:grid; grid-template-columns:repeat(2,1fr); gap:1rem; }
        @media(max-width:480px){ .lp-gg2__grid{grid-template-columns:1fr;} }
        .lp-gg2__tile { aspect-ratio:4/3; border-radius:20px; overflow:hidden; position:relative; background:#e5e7eb; }
      `}</style>
      <section className="lp-gg2">
        <div className="lp-gg2__inner">
          <GalleryHeader section={section} brandPrimary={brandPrimary} />
          <div className="lp-gg2__grid">
            {images.length > 0
              ? images.map((img, i) => (
                  <div key={i} className="lp-gg2__tile">
                    <LpImage src={img.url} alt={img.caption ?? ""} brandPrimary={brandPrimary} emoji="📷" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
                    {img.caption && <figcaption style={{ position:"absolute", inset:"auto 0 0", background:"linear-gradient(transparent,rgba(0,0,0,0.55))", color:"#fff", fontSize:"0.78rem", padding:"1.25rem 1rem 0.625rem" }}>{img.caption}</figcaption>}
                  </div>
                ))
              : [0,1,2,3].map((i) => (
                  <div key={i} className="lp-gg2__tile" style={{ background:`linear-gradient(135deg,${brandPrimary}14,${brandPrimary}06)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontSize:"3rem", opacity:0.25 }}>📷</span>
                  </div>
                ))
            }
          </div>
        </div>
      </section>
    </>
  );
}

// ─── gallery · carousel-strip ─────────────────────────────────────────────────
export function GalleryCarouselStrip({ section, brandPrimary }: Props) {
  const images: ImgItem[] = (section.extras?.images ?? []).filter((i) => i.url);
  return (
    <>
      <style>{`
        .lp-gcs { background:#fff; padding:6rem 0; }
        .lp-gcs__inner { max-width:1200px; margin:0 auto; padding:0 1.5rem; }
        .lp-gcs__strip { display:flex; gap:1rem; overflow-x:auto; padding-bottom:0.75rem; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; }
        .lp-gcs__strip::-webkit-scrollbar { height:4px; }
        .lp-gcs__strip::-webkit-scrollbar-thumb { background:${brandPrimary}40; border-radius:2px; }
        .lp-gcs__slide { flex:0 0 340px; height:260px; border-radius:20px; overflow:hidden; position:relative; background:#f3f4f6; scroll-snap-align:start; }
        @media(max-width:480px){ .lp-gcs__slide{flex:0 0 85vw;} }
      `}</style>
      <section className="lp-gcs">
        <div className="lp-gcs__inner">
          <GalleryHeader section={section} brandPrimary={brandPrimary} />
          <GalleryCarousel brandPrimary={brandPrimary}>
            {images.length > 0
              ? images.map((img, i) => (
                  <div key={i} className="lp-gcs__slide">
                    <LpImage src={img.url} alt={img.caption ?? ""} brandPrimary={brandPrimary} emoji="📷" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
                    {img.caption && <p style={{ position:"absolute", bottom:0, left:0, right:0, margin:0, padding:"0.75rem 1rem", background:"linear-gradient(transparent,rgba(0,0,0,0.55))", color:"#fff", fontSize:"0.78rem" }}>{img.caption}</p>}
                  </div>
                ))
              : [1,2,3,4,5].map((i) => (
                  <div key={i} className="lp-gcs__slide" style={{ background:`linear-gradient(135deg,${brandPrimary}14,${brandPrimary}06)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontSize:"3rem", opacity:0.25 }}>📷</span>
                  </div>
                ))
            }
          </GalleryCarousel>
        </div>
      </section>
    </>
  );
}

// ─── gallery · feature-side ───────────────────────────────────────────────────
export function GalleryFeatureSide({ section, brandPrimary }: Props) {
  const images: ImgItem[] = (section.extras?.images ?? []).filter((i) => i.url);
  const [feature, ...thumbs] = images;
  return (
    <>
      <style>{`
        .lp-gfs { background:#f9fafb; padding:6rem 0; }
        .lp-gfs__inner { max-width:1200px; margin:0 auto; padding:0 1.5rem; }
        .lp-gfs__layout { display:grid; grid-template-columns:3fr 1fr; gap:1rem; }
        @media(max-width:768px){ .lp-gfs__layout{grid-template-columns:1fr;} }
        .lp-gfs__feature { position:relative; border-radius:20px; overflow:hidden; aspect-ratio:16/9; background:#e5e7eb; }
        .lp-gfs__thumbs { display:flex; flex-direction:column; gap:1rem; }
        @media(max-width:768px){ .lp-gfs__thumbs{flex-direction:row;} }
        .lp-gfs__thumb { flex:1; border-radius:16px; overflow:hidden; position:relative; background:#e5e7eb; min-height:120px; }
      `}</style>
      <section className="lp-gfs">
        <div className="lp-gfs__inner">
          <GalleryHeader section={section} brandPrimary={brandPrimary} />
          <div className="lp-gfs__layout">
            <div className="lp-gfs__feature">
              <LpImage src={feature?.url} alt={feature?.caption ?? ""} brandPrimary={brandPrimary} emoji="📷" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
            </div>
            <div className="lp-gfs__thumbs">
              {(thumbs.length > 0 ? thumbs.slice(0, 3) : [null, null]).map((img, i) => (
                <div key={i} className="lp-gfs__thumb">
                  <LpImage src={img?.url} alt={img?.caption ?? ""} brandPrimary={brandPrimary} emoji="📷" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
