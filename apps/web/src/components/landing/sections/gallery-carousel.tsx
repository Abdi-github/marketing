"use client";

// Interactive horizontal carousel for the gallery "carousel-strip" variant.
// The strip is CSS-scrollable, but a mouse user has no obvious way to scroll a
// horizontal overflow — so we add visible prev/next arrows and click-drag panning.
// Keyboard/trackpad/touch scrolling keep working as before.

import React, { useRef, useState, useCallback, useEffect } from "react";

export function GalleryCarousel({
  brandPrimary,
  settings,
  children,
}: {
  brandPrimary: string;
  settings?: {
    enabled?: boolean;
    mode?: "auto" | "manual";
    delayMs?: number;
    effect?: "fade" | "slide";
  };
  children: React.ReactNode;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = stripRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  const scrollByDir = useCallback((dir: 1 | -1) => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(320, el.clientWidth * 0.8), behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!settings?.enabled || settings.mode !== "auto") return undefined;
    const delayMs = Math.min(15000, Math.max(1000, settings.delayMs ?? 4500));
    const timer = window.setInterval(() => {
      const el = stripRef.current;
      if (!el) return;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
      if (atEnd) {
        el.scrollTo({ left: 0, behavior: settings.effect === "fade" ? "auto" : "smooth" });
      } else {
        scrollByDir(1);
      }
    }, delayMs);
    return () => window.clearInterval(timer);
  }, [scrollByDir, settings?.delayMs, settings?.effect, settings?.enabled, settings?.mode]);

  // Click-drag to pan (desktop mouse).
  const drag = useRef<{ down: boolean; startX: number; startScroll: number; moved: boolean }>({
    down: false,
    startX: 0,
    startScroll: 0,
    moved: false,
  });
  const onPointerDown = (e: React.PointerEvent) => {
    const el = stripRef.current;
    if (!el) return;
    drag.current = { down: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = stripRef.current;
    if (!el || !drag.current.down) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  };
  const endDrag = () => {
    drag.current.down = false;
  };
  // Suppress click (e.g. opening a lightbox) right after a drag.
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  const arrowStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    background: "var(--lp-card,#fff)",
    color: brandPrimary,
    boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollByDir(-1)}
        style={{
          ...arrowStyle,
          left: -6,
          opacity: canLeft ? 1 : 0,
          pointerEvents: canLeft ? "auto" : "none",
          transition: "opacity 0.2s",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div
        ref={stripRef}
        className="lp-gcs__strip"
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollByDir(1)}
        style={{
          ...arrowStyle,
          right: -6,
          opacity: canRight ? 1 : 0,
          pointerEvents: canRight ? "auto" : "none",
          transition: "opacity 0.2s",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
