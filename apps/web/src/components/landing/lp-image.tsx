"use client";

// Resilient landing-page image. Renders a normal <img> (SSR-friendly, good for SEO),
// but if the source fails to load (404, removed Unsplash photo, typo'd URL, hot-link block)
// it swaps to a soft branded placeholder instead of the browser's broken-image icon.
//
// This is the single safeguard that keeps any template from ever showing a broken image —
// curated photo IDs can rot over time, and user-pasted URLs can be wrong. Use this in place
// of a raw <img> in every section that renders content images.

import React, { useState } from "react";

export function LpImage({
  src,
  alt,
  brandPrimary = "#9ca3af",
  emoji = "🖼️",
  className,
  style,
}: {
  src?: string | null;
  alt?: string;
  brandPrimary?: string;
  emoji?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        aria-hidden
        className={className}
        style={{
          ...style,
          background: `linear-gradient(135deg, ${brandPrimary}1f, ${brandPrimary}0a)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: "clamp(2rem, 6vw, 4rem)", opacity: 0.25 }}>{emoji}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      style={style}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
