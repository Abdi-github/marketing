import type { CSSProperties, ReactElement } from "react";
import type { SocialCreativePlan } from "./social-creative";

type BrandSnapshot = {
  logoUrl?: string | null;
  colorPrimary?: string | null;
  colorSecondary?: string | null;
  fontHeading?: string | null;
  fontBody?: string | null;
};

type RenderSocialCreativeInput = {
  plan: SocialCreativePlan;
  imageUrl?: string | null;
  businessName: string;
  brand?: BrandSnapshot | null;
};

export function renderSocialCreative(input: RenderSocialCreativeInput): ReactElement {
  const primary = normalizeHex(input.brand?.colorPrimary, "#111827");
  const secondary = normalizeHex(input.brand?.colorSecondary, "#f59e0b");
  const colors = palette(primary, secondary);
  const motif = input.plan.visualMotif ?? input.plan.visualCue;
  const common = {
    width: "100%",
    height: "100%",
    display: "flex",
    position: "relative",
    overflow: "hidden",
    fontFamily: input.brand?.fontBody || "Inter, Arial, sans-serif",
    color: colors.ink,
  } satisfies CSSProperties;

  if (input.plan.backgroundImageUrl && input.imageUrl) {
    return renderFullBleedCreative({
      common,
      plan: input.plan,
      imageUrl: input.imageUrl,
      businessName: input.businessName,
      logoUrl: input.brand?.logoUrl,
      colors,
    });
  }

  if (input.plan.template === "retail-offer") {
    return renderRetailOfferCreative({ common, input, motif, colors });
  }

  if (input.plan.template === "product-hero") {
    return renderProductHeroCreative({ common, input, motif, colors });
  }

  if (input.plan.template === "testimonial-proof") {
    return renderTestimonialCreative({ common, input, colors });
  }

  if (input.plan.template === "carousel-cover") {
    return renderCarouselCoverCreative({ common, input, motif, colors });
  }

  if (input.plan.template === "promo-badge") {
    return (
      <div style={{ ...common, background: colors.soft, padding: 72, alignItems: "stretch" }}>
        {backgroundPattern(colors)}
        <div style={{ display: "flex", flexDirection: "column", width: "100%", zIndex: 1 }}>
          {brandRow(input.businessName, input.brand?.logoUrl, colors)}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 54 }}>
            {imagePanel(input.imageUrl, colors, "52%", input.plan, motif)}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 30 }}>
              <div style={burstStyle(colors)}>
                <span style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.02 }}>
                  {input.plan.badge}
                </span>
              </div>
              <div style={headlineStyle(input.plan, 76, colors)}>{input.plan.headline}</div>
              <div style={subheadStyle(colors)}>{input.plan.subheading}</div>
            </div>
          </div>
          {footerRow(input.plan.footer, input.plan.cta, colors)}
        </div>
      </div>
    );
  }

  if (input.plan.template === "event-poster") {
    return (
      <div
        style={{
          ...common,
          background: `linear-gradient(155deg, ${colors.ink} 0%, ${primary} 52%, ${colors.hot} 100%)`,
          padding: 70,
          color: "#ffffff",
        }}
      >
        <div style={{ position: "absolute", inset: 0, opacity: 0.32, display: "flex" }}>
          <div
            style={{
              position: "absolute",
              left: -120,
              bottom: -220,
              width: 680,
              height: 680,
              borderRadius: 999,
              border: "22px solid rgba(255,255,255,0.28)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: -260,
              top: -180,
              width: 760,
              height: 760,
              borderRadius: 999,
              border: "2px solid rgba(255,255,255,0.28)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 260,
              top: 150,
              width: 900,
              height: 3,
              background: "rgba(255,255,255,0.55)",
              transform: "rotate(-22deg)",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", zIndex: 1 }}>
          {brandRow(input.businessName, input.brand?.logoUrl, {
            ...colors,
            ink: "#ffffff",
            muted: "#ffffff",
          })}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 34,
            }}
          >
            <div
              style={{
                fontSize: 38,
                fontWeight: 900,
                color: colors.sun,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {input.plan.badge}
            </div>
            <div
              style={{
                fontSize: 118,
                lineHeight: 0.92,
                fontWeight: 950,
                letterSpacing: 0,
                textTransform: "uppercase",
              }}
            >
              {input.plan.headline}
            </div>
            <div
              style={{
                maxWidth: 780,
                fontSize: 42,
                lineHeight: 1.16,
                fontWeight: 650,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {input.plan.subheading}
            </div>
          </div>
          {footerRow(input.plan.footer, input.plan.cta, {
            ...colors,
            ink: "#ffffff",
            muted: "rgba(255,255,255,0.82)",
          })}
        </div>
      </div>
    );
  }

  if (input.plan.template === "story-card") {
    return (
      <div style={{ ...common, background: colors.paper, padding: 54, flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            gap: 34,
          }}
        >
          {imageUrlHero(input.imageUrl, colors, input.plan, motif)}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
              }}
            >
              <div style={badgeStyle(colors)}>{input.plan.badge}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: colors.muted }}>
                {input.businessName}
              </div>
            </div>
            <div style={headlineStyle(input.plan, 72, colors)}>{input.plan.headline}</div>
            <div style={subheadStyle(colors)}>{input.plan.subheading}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
            {footerRow(input.plan.footer, input.plan.cta, colors)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...common, background: "#ffffff", padding: 78 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 80% 18%, ${colors.soft} 0, transparent 33%)`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", width: "100%", zIndex: 1 }}>
        {brandRow(input.businessName, input.brand?.logoUrl, colors)}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 42 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 34,
                minHeight: 320,
              }}
            >
              {decorativeToken(input.plan, 1, colors)}
              {decorativeToken(input.plan, 2, colors)}
              {decorativeToken(input.plan, 3, colors)}
            </div>
            <div
              style={{
                maxWidth: 840,
                textAlign: "center",
                fontSize: 70,
                lineHeight: 1.02,
                fontWeight: 900,
                letterSpacing: 0,
              }}
            >
              {input.plan.headline}
            </div>
            <div
              style={{
                maxWidth: 740,
                textAlign: "center",
                fontSize: 34,
                lineHeight: 1.22,
                color: colors.muted,
                fontWeight: 600,
              }}
            >
              {input.plan.subheading}
            </div>
          </div>
        </div>
        {footerRow(input.plan.footer, input.plan.cta, colors)}
      </div>
    </div>
  );
}

function renderRetailOfferCreative(input: {
  common: CSSProperties;
  input: RenderSocialCreativeInput;
  motif: string;
  colors: ReturnType<typeof palette>;
}): ReactElement {
  return (
    <div
      style={{
        ...input.common,
        background: `linear-gradient(135deg, ${input.colors.paper} 0%, ${input.colors.soft} 48%, ${input.colors.sun} 100%)`,
        padding: 62,
      }}
    >
      {backgroundPattern(input.colors)}
      <div style={{ position: "relative", zIndex: 1, display: "flex", width: "100%", gap: 42 }}>
        <div style={{ width: "54%", display: "flex", flexDirection: "column", gap: 28 }}>
          {brandRow(input.input.businessName, input.input.brand?.logoUrl, input.colors)}
          <div
            style={{
              flex: 1,
              borderRadius: 54,
              overflow: "hidden",
              border: `5px solid ${input.colors.ink}`,
              boxShadow: "0 34px 0 rgba(15,23,42,0.12)",
            }}
          >
            {imagePanel(input.input.imageUrl, input.colors, "100%", input.input.plan, input.motif)}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 34,
          }}
        >
          <div style={{ ...burstStyle(input.colors), width: 250, height: 250 }}>
            <span style={{ fontSize: 68, fontWeight: 950, lineHeight: 0.9 }}>
              {input.input.plan.badge}
            </span>
          </div>
          <div style={headlineStyle(input.input.plan, 88, input.colors)}>
            {input.input.plan.headline}
          </div>
          <div style={subheadStyle(input.colors)}>{input.input.plan.subheading}</div>
          {footerRow(input.input.plan.footer, input.input.plan.cta, input.colors)}
        </div>
      </div>
    </div>
  );
}

function renderProductHeroCreative(input: {
  common: CSSProperties;
  input: RenderSocialCreativeInput;
  motif: string;
  colors: ReturnType<typeof palette>;
}): ReactElement {
  return (
    <div style={{ ...input.common, background: input.colors.ink, color: "#fff", padding: 68 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 72% 28%, ${input.colors.hot} 0, transparent 34%), radial-gradient(circle at 22% 76%, ${input.colors.sun} 0, transparent 28%)`,
          opacity: 0.72,
        }}
      />
      <div style={{ position: "relative", zIndex: 1, display: "flex", width: "100%", gap: 54 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {brandRow(input.input.businessName, input.input.brand?.logoUrl, {
            ...input.colors,
            ink: "#fff",
            muted: "rgba(255,255,255,0.82)",
          })}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ color: input.colors.sun, fontSize: 36, fontWeight: 950 }}>
              {input.input.plan.badge}
            </div>
            <div
              style={{
                fontSize: 104,
                lineHeight: 0.92,
                fontWeight: 950,
                letterSpacing: 0,
                color: "#fff",
              }}
            >
              {input.input.plan.headline}
            </div>
            <div
              style={{
                fontSize: 38,
                lineHeight: 1.16,
                color: "rgba(255,255,255,0.86)",
                fontWeight: 700,
              }}
            >
              {input.input.plan.subheading}
            </div>
          </div>
          {footerRow(input.input.plan.footer, input.input.plan.cta, {
            ...input.colors,
            ink: "#fff",
            muted: "rgba(255,255,255,0.76)",
            paper: input.colors.ink,
            line: "rgba(255,255,255,0.26)",
          })}
        </div>
        <div style={{ width: "42%", display: "flex", alignItems: "center" }}>
          {imagePanel(input.input.imageUrl, input.colors, "100%", input.input.plan, input.motif)}
        </div>
      </div>
    </div>
  );
}

function renderTestimonialCreative(input: {
  common: CSSProperties;
  input: RenderSocialCreativeInput;
  colors: ReturnType<typeof palette>;
}): ReactElement {
  return (
    <div style={{ ...input.common, background: input.colors.paper, padding: 76 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(90deg, ${input.colors.soft} 0 38%, transparent 38% 100%)`,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          width: "100%",
          gap: 48,
        }}
      >
        {brandRow(input.input.businessName, input.input.brand?.logoUrl, input.colors)}
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 58 }}>
          <div
            style={{
              width: 260,
              height: 260,
              borderRadius: 52,
              background: input.colors.ink,
              color: input.colors.paper,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontSize: 58,
              fontWeight: 950,
              transform: "rotate(-5deg)",
            }}
          >
            {input.input.plan.badge}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 30 }}>
            <div
              style={{ fontSize: 92, lineHeight: 0.94, fontWeight: 950, color: input.colors.ink }}
            >
              “{input.input.plan.headline}”
            </div>
            <div style={subheadStyle(input.colors)}>{input.input.plan.subheading}</div>
          </div>
        </div>
        {footerRow(input.input.plan.footer, input.input.plan.cta, input.colors)}
      </div>
    </div>
  );
}

function renderCarouselCoverCreative(input: {
  common: CSSProperties;
  input: RenderSocialCreativeInput;
  motif: string;
  colors: ReturnType<typeof palette>;
}): ReactElement {
  return (
    <div style={{ ...input.common, background: input.colors.paper, padding: 64 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(160deg, ${input.colors.ink} 0 52%, ${input.colors.hot} 52% 100%)`,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          width: "100%",
          color: "#fff",
        }}
      >
        {brandRow(input.input.businessName, input.input.brand?.logoUrl, {
          ...input.colors,
          ink: "#fff",
          muted: "rgba(255,255,255,0.82)",
        })}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 46,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 30 }}>
            <div style={{ color: input.colors.sun, fontSize: 34, fontWeight: 950 }}>
              {input.input.plan.badge}
            </div>
            <div style={{ fontSize: 92, lineHeight: 0.94, fontWeight: 950, letterSpacing: 0 }}>
              {input.input.plan.headline}
            </div>
            <div style={{ fontSize: 37, lineHeight: 1.16, fontWeight: 700, opacity: 0.9 }}>
              {input.input.plan.subheading}
            </div>
          </div>
          <div style={{ width: 330, display: "flex", flexDirection: "column", gap: 18 }}>
            {motifTokens(input.motif, input.input.plan).map((token, index) => (
              <div
                key={`${token}-${index}`}
                style={{
                  padding: "24px 30px",
                  borderRadius: 34,
                  background: index === 1 ? input.colors.sun : "rgba(255,255,255,0.16)",
                  color: index === 1 ? input.colors.ink : "#fff",
                  fontSize: 34,
                  fontWeight: 950,
                  transform: `rotate(${index === 0 ? -4 : index === 1 ? 3 : -2}deg)`,
                }}
              >
                {token}
              </div>
            ))}
          </div>
        </div>
        {footerRow(input.input.plan.footer, input.input.plan.cta, {
          ...input.colors,
          ink: "#fff",
          muted: "rgba(255,255,255,0.82)",
          paper: input.colors.ink,
          line: "rgba(255,255,255,0.24)",
        })}
      </div>
    </div>
  );
}

function renderFullBleedCreative(input: {
  common: CSSProperties;
  plan: SocialCreativePlan;
  imageUrl: string;
  businessName: string;
  logoUrl: string | null | undefined;
  colors: ReturnType<typeof palette>;
}): ReactElement {
  const isTall = input.plan.aspectRatio === "9:16";
  return (
    <div
      style={{
        ...input.common,
        background: input.colors.ink,
        color: "#ffffff",
        padding: isTall ? 58 : 64,
        alignItems: "stretch",
      }}
    >
      <img
        src={input.imageUrl}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.16) 40%, rgba(0,0,0,0.68) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
        }}
      >
        {brandRow(input.businessName, input.logoUrl, {
          ...input.colors,
          ink: "#ffffff",
          muted: "rgba(255,255,255,0.86)",
        })}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            gap: isTall ? 28 : 34,
            maxWidth: isTall ? 840 : 920,
            paddingBottom: isTall ? 38 : 22,
          }}
        >
          <div
            style={{
              width: isTall ? 220 : 240,
              height: isTall ? 220 : 240,
              borderRadius: 999,
              background: `linear-gradient(145deg, ${input.colors.sun}, #ffffff 46%, ${input.colors.hot})`,
              color: input.colors.ink,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontSize: isTall ? 58 : 64,
              lineHeight: 0.95,
              fontWeight: 950,
              transform: "rotate(-9deg)",
              boxShadow: "0 26px 0 rgba(0,0,0,0.22), 0 36px 80px rgba(0,0,0,0.34)",
              border: "8px solid rgba(255,255,255,0.86)",
            }}
          >
            {input.plan.badge}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              padding: isTall ? 34 : 40,
              borderRadius: 42,
              background: "rgba(0,0,0,0.48)",
              border: "2px solid rgba(255,255,255,0.22)",
            }}
          >
            <div
              style={{
                fontSize: isTall ? 82 : 90,
                lineHeight: 0.96,
                fontWeight: 950,
                letterSpacing: 0,
                color: "#ffffff",
                textTransform: input.plan.template === "promo-badge" ? "uppercase" : "none",
              }}
            >
              {input.plan.headline}
            </div>
            <div
              style={{
                maxWidth: 760,
                color: "rgba(255,255,255,0.9)",
                fontSize: isTall ? 36 : 38,
                lineHeight: 1.18,
                fontWeight: 700,
              }}
            >
              {input.plan.subheading}
            </div>
          </div>
        </div>
        {footerRow(input.plan.footer, input.plan.cta, {
          ...input.colors,
          ink: "#ffffff",
          muted: "rgba(255,255,255,0.82)",
          paper: input.colors.ink,
          line: "rgba(255,255,255,0.26)",
        })}
      </div>
    </div>
  );
}

function brandRow(
  name: string,
  logoUrl: string | null | undefined,
  colors: ReturnType<typeof palette>,
): ReactElement {
  return (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            width={58}
            height={58}
            style={{ borderRadius: 14, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 16,
              background: colors.ink,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 900,
            }}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ fontSize: 27, fontWeight: 850, color: colors.ink }}>{name}</div>
      </div>
      <div style={{ width: 78, height: 8, borderRadius: 999, background: colors.hot }} />
    </div>
  );
}

function footerRow(footer: string, cta: string, colors: ReturnType<typeof palette>): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        borderTop: `2px solid ${colors.line}`,
        paddingTop: 28,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 750, color: colors.muted }}>{footer}</div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 900,
          color: colors.paper,
          background: colors.ink,
          padding: "15px 26px",
          borderRadius: 999,
        }}
      >
        {cta}
      </div>
    </div>
  );
}

function imagePanel(
  imageUrl: string | null | undefined,
  colors: ReturnType<typeof palette>,
  width: string,
  plan: SocialCreativePlan,
  motif: string,
): ReactElement {
  return (
    <div
      style={{
        width,
        aspectRatio: "1 / 1.12",
        borderRadius: 42,
        overflow: "hidden",
        background: colors.paper,
        border: `4px solid ${colors.line}`,
        boxShadow: "0 32px 70px rgba(17,24,39,0.20)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <ProductScene plan={plan} motif={motif} colors={colors} compact={false} />
      )}
    </div>
  );
}

function imageUrlHero(
  imageUrl: string | null | undefined,
  colors: ReturnType<typeof palette>,
  plan: SocialCreativePlan,
  motif: string,
): ReactElement {
  return (
    <div
      style={{
        height: "54%",
        borderRadius: 46,
        overflow: "hidden",
        background: colors.soft,
        border: `3px solid ${colors.line}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <ProductScene plan={plan} motif={motif} colors={colors} compact />
      )}
    </div>
  );
}

function ProductScene({
  plan,
  motif,
  colors,
  compact,
}: {
  plan: SocialCreativePlan;
  motif: string;
  colors: ReturnType<typeof palette>;
  compact?: boolean;
}): ReactElement {
  const tokens = motifTokens(motif, plan);
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(145deg, ${colors.soft}, ${colors.paper} 48%, ${mix(
          colors.hot,
          "#ffffff",
          0.72,
        )})`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: compact ? -90 : -120,
          top: compact ? -80 : -90,
          width: compact ? 260 : 340,
          height: compact ? 260 : 340,
          borderRadius: 999,
          background: colors.sun,
          opacity: 0.82,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: compact ? -120 : -150,
          bottom: compact ? -120 : -150,
          width: compact ? 360 : 460,
          height: compact ? 360 : 460,
          borderRadius: 999,
          background: colors.hot,
          opacity: 0.2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "12%",
          bottom: "14%",
          width: compact ? 160 : 220,
          height: compact ? 160 : 220,
          borderRadius: 44,
          background: colors.ink,
          transform: "rotate(-10deg)",
          opacity: 0.94,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "12%",
          top: "16%",
          width: compact ? 145 : 190,
          height: compact ? 145 : 190,
          borderRadius: 999,
          border: `16px solid ${colors.hot}`,
          transform: "rotate(12deg)",
          opacity: 0.72,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: compact ? 14 : 22,
          width: "78%",
          minHeight: compact ? 260 : 360,
          padding: compact ? 28 : 44,
          borderRadius: compact ? 36 : 52,
          background: "rgba(255,255,255,0.88)",
          border: `4px solid ${colors.line}`,
          boxShadow: "0 28px 64px rgba(17,24,39,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: compact ? "10px 18px" : "14px 24px",
            borderRadius: 999,
            background: colors.sun,
            color: colors.ink,
            fontSize: compact ? 28 : 38,
            fontWeight: 950,
          }}
        >
          {plan.badge}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: compact ? 10 : 16,
          }}
        >
          {tokens.map((token, index) => (
            <div
              key={`${token}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: compact ? 112 : 146,
                padding: compact ? "14px 16px" : "18px 22px",
                borderRadius: index === 1 ? 24 : 999,
                background: index === 1 ? colors.ink : colors.soft,
                color: index === 1 ? colors.paper : colors.ink,
                fontSize: compact ? 24 : 32,
                fontWeight: 900,
                transform: `rotate(${index === 0 ? -8 : index === 1 ? 3 : 9}deg)`,
              }}
            >
              {token}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            maxWidth: compact ? 520 : 640,
            textAlign: "center",
            color: colors.muted,
            fontSize: compact ? 25 : 32,
            lineHeight: 1.15,
            fontWeight: 750,
          }}
        >
          {motif}
        </div>
      </div>
    </div>
  );
}

function backgroundPattern(colors: ReturnType<typeof palette>): ReactElement {
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 0.34, display: "flex" }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 150 + (i % 3) * 38,
            height: 150 + (i % 3) * 38,
            borderRadius: 999,
            border: `9px solid ${i % 2 === 0 ? colors.hot : colors.sun}`,
            left: `${(i * 23) % 96}%`,
            top: `${(i * 31) % 92}%`,
            transform: `translate(-50%, -50%) rotate(${i * 13}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function decorativeToken(
  plan: SocialCreativePlan,
  index: number,
  colors: ReturnType<typeof palette>,
): ReactElement {
  const labels: Record<string, string[]> = {
    table: ["Fresh", "Local", "Taste"],
    product: ["Pick", "Style", "Gift"],
    movement: ["Move", "Train", "Feel"],
    care: ["Care", "Trust", "Calm"],
    brand: ["Now", "Local", "New"],
    photo: ["Look", "Feel", "Try"],
  };
  const motif = plan.visualMotif ?? plan.visualCue;
  const motifLabels = motifTokens(motif, plan);
  const label =
    motifLabels[index - 1] ?? labels[plan.visualCue]?.[index - 1] ?? labels["brand"]![index - 1]!;
  return (
    <div
      style={{
        width: 230,
        height: 230,
        borderRadius: index === 2 ? 40 : 999,
        background: index === 2 ? colors.ink : colors.soft,
        color: index === 2 ? colors.paper : colors.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 36,
        fontWeight: 900,
        transform: `rotate(${index === 1 ? -9 : index === 2 ? 4 : 11}deg)`,
        boxShadow: "0 22px 52px rgba(17,24,39,0.12)",
      }}
    >
      {label}
    </div>
  );
}

function motifTokens(motif: string, plan: SocialCreativePlan): string[] {
  const text = `${motif} ${plan.headline} ${plan.subheading}`.toLowerCase();
  if (/vegetable|gemuese|gemüse|legume|verdura/.test(text)) return ["Fresh", plan.badge, "Veg"];
  if (/fruit|frucht|obst|frutta/.test(text)) return ["Juicy", plan.badge, "Fruit"];
  if (/coffee|kaffee|cafe|café|espresso/.test(text)) return ["Coffee", plan.badge, "Today"];
  if (/dish|menu|pizza|pasta|plate|gericht/.test(text)) return ["Taste", plan.badge, "Menu"];
  if (/product|shop|retail|boutique|fashion|mode/.test(text)) return ["Pick", plan.badge, "Shop"];
  if (/fitness|gym|training|yoga|movement/.test(text)) return ["Move", plan.badge, "Feel"];
  if (/clinic|care|health|therapy|medical/.test(text)) return ["Care", plan.badge, "Trust"];
  return ["Local", plan.badge, "Now"];
}

function headlineStyle(
  plan: SocialCreativePlan,
  baseSize: number,
  colors: ReturnType<typeof palette>,
): CSSProperties {
  const long = plan.headline.length > 42;
  return {
    fontSize: long ? baseSize - 12 : baseSize,
    lineHeight: 1.02,
    fontWeight: 950,
    letterSpacing: 0,
    color: colors.ink,
    textTransform: plan.template === "promo-badge" ? "uppercase" : "none",
  };
}

function subheadStyle(colors: ReturnType<typeof palette>): CSSProperties {
  return {
    fontSize: 34,
    lineHeight: 1.18,
    fontWeight: 650,
    color: colors.muted,
  };
}

function badgeStyle(colors: ReturnType<typeof palette>): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px 22px",
    borderRadius: 999,
    background: colors.sun,
    color: colors.ink,
    fontSize: 26,
    fontWeight: 900,
  };
}

function burstStyle(colors: ReturnType<typeof palette>): CSSProperties {
  return {
    width: 200,
    height: 200,
    borderRadius: 999,
    background: colors.sun,
    color: colors.ink,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    transform: "rotate(-8deg)",
    boxShadow: "0 24px 54px rgba(17,24,39,0.18)",
  };
}

function palette(primary: string, secondary: string) {
  return {
    ink: primary,
    hot: secondary,
    sun: "#ffe66d",
    paper: "#ffffff",
    soft: mix(secondary, "#ffffff", 0.86),
    muted: "#475569",
    line: "rgba(15,23,42,0.12)",
  };
}

function normalizeHex(value: string | null | undefined, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? value! : fallback;
}

function mix(hex: string, other: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(other);
  const r = Math.round(a.r * (1 - amount) + b.r * amount);
  const g = Math.round(a.g * (1 - amount) + b.g * amount);
  const blue = Math.round(a.b * (1 - amount) + b.b * amount);
  return `rgb(${r}, ${g}, ${blue})`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}
