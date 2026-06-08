"use client";
import * as React from "react";
import { cn } from "../ui/cn";

// Multi-screen preview: shows a URL in a phone / tablet / desktop iframe.
// Used by the template gallery preview modal, the wizard variant picker, and the editor.
//
// Toggling between devices animates the iframe size; the iframe is real (not a screenshot).
// `transform: scale(...)` adapts the rendered viewport to whatever container width is available.

export type DevicePreset = "phone" | "tablet" | "desktop";

const DEVICE_DIMENSIONS: Record<DevicePreset, { width: number; height: number; label: string; icon: string }> = {
  phone:   { width: 375,  height: 812,  label: "Phone",   icon: "📱" },
  tablet:  { width: 768,  height: 1024, label: "Tablet",  icon: "📱" },
  desktop: { width: 1280, height: 800,  label: "Desktop", icon: "💻" },
};

type Props = {
  url: string;
  initialDevice?: DevicePreset;
  /** Container max height — iframe scales to fit. Defaults to 70vh. */
  maxHeight?: string;
  /** Compact UI for the editor sidebar; default for modal previews. */
  compact?: boolean;
};

export function DevicePreview({ url, initialDevice = "desktop", maxHeight = "70vh", compact = false }: Props) {
  const [device, setDevice] = React.useState<DevicePreset>(initialDevice);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = React.useState(1);

  // Compute the scale that fits the iframe into the container.
  const computeScale = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const dims = DEVICE_DIMENSIONS[device];
    const containerWidth = container.clientWidth - 24; // padding
    const containerHeight = container.clientHeight - 24;
    const scaleX = containerWidth / dims.width;
    const scaleY = containerHeight / dims.height;
    setScale(Math.min(scaleX, scaleY, 1));
  }, [device]);

  React.useEffect(() => {
    computeScale();
    const handler = () => computeScale();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [computeScale]);

  const dims = DEVICE_DIMENSIONS[device];

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className={cn("flex items-center justify-center gap-1 rounded-xl bg-gray-100 p-1 self-center", compact && "scale-90")}>
        {(Object.keys(DEVICE_DIMENSIONS) as DevicePreset[]).map((preset) => {
          const def = DEVICE_DIMENSIONS[preset];
          const active = device === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => setDevice(preset)}
              aria-pressed={active}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors",
                active
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-900",
              )}
            >
              <span aria-hidden>{def.icon}</span>
              {def.label}
              {active && (
                <span className="text-[10px] text-gray-400 font-mono ml-1">
                  {def.width}×{def.height}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Frame */}
      <div
        ref={containerRef}
        className="bg-gray-50 rounded-2xl p-3 overflow-hidden flex items-start justify-center"
        style={{ maxHeight, minHeight: 320 }}
      >
        <div
          style={{
            width: dims.width,
            height: dims.height,
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            transition: "width 0.25s ease, height 0.25s ease",
            borderRadius: device === "desktop" ? 12 : 28,
            boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            overflow: "hidden",
            background: "#fff",
            flexShrink: 0,
          }}
        >
          <iframe
            src={url}
            title="Template preview"
            style={{
              width: "100%",
              height: "100%",
              border: 0,
              display: "block",
            }}
            sandbox="allow-same-origin allow-scripts allow-forms"
          />
        </div>
      </div>
    </div>
  );
}
