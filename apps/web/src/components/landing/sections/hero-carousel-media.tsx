"use client";

import React, { useEffect, useMemo, useState } from "react";

type CarouselSettings = {
  enabled?: boolean;
  mode?: "auto" | "manual";
  delayMs?: number;
  effect?: "fade" | "slide";
};

export function HeroCarouselMedia({
  images,
  settings,
  brandPrimary,
  alt,
  objectPosition = "center",
  opacity = 1,
  fallback,
}: {
  images: Array<{ url: string; caption?: string | null }>;
  settings?: CarouselSettings;
  brandPrimary: string;
  alt: string;
  objectPosition?: string;
  opacity?: number;
  fallback?: React.ReactNode;
}) {
  const slides = useMemo(() => images.filter((image) => image.url), [images]);
  const enabled = settings?.enabled && slides.length > 1;
  const mode = settings?.mode ?? "auto";
  const effect = settings?.effect ?? "fade";
  const delayMs = Math.min(15000, Math.max(1000, settings?.delayMs ?? 4500));
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!enabled || mode !== "auto") return undefined;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % slides.length);
    }, delayMs);
    return () => window.clearInterval(timer);
  }, [delayMs, enabled, mode, slides.length]);

  if (slides.length === 0) return <>{fallback ?? null}</>;

  const go = (dir: 1 | -1) => {
    setActive((current) => (current + dir + slides.length) % slides.length);
  };

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: effect === "slide" && enabled ? "flex" : "block",
          transform: effect === "slide" && enabled ? `translateX(-${active * 100}%)` : undefined,
          transition: "transform 700ms ease",
        }}
      >
        {slides.map((image, index) => (
          <img
            key={`${image.url}-${index}`}
            src={image.url}
            alt={index === active ? alt : ""}
            style={{
              position: effect === "slide" && enabled ? "relative" : "absolute",
              inset: effect === "slide" && enabled ? undefined : 0,
              flex: "0 0 100%",
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition,
              opacity: effect === "fade" && enabled ? (index === active ? opacity : 0) : opacity,
              transition: "opacity 700ms ease",
            }}
          />
        ))}
      </div>
      {enabled && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={() => go(-1)}
            style={arrowStyle("left", brandPrimary)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={() => go(1)}
            style={arrowStyle("right", brandPrimary)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 18,
              transform: "translateX(-50%)",
              display: "flex",
              gap: 7,
              zIndex: 3,
            }}
          >
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Show image ${index + 1}`}
                onClick={() => setActive(index)}
                style={{
                  width: index === active ? 22 : 8,
                  height: 8,
                  borderRadius: 999,
                  border: 0,
                  background: index === active ? "#fff" : "rgba(255,255,255,0.45)",
                  cursor: "pointer",
                  transition: "all 180ms ease",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function arrowStyle(side: "left" | "right", brandPrimary: string): React.CSSProperties {
  return {
    position: "absolute",
    [side]: 18,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 3,
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: 0,
    background: "rgba(255,255,255,0.92)",
    color: brandPrimary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
    cursor: "pointer",
  };
}
