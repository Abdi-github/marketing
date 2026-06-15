"use client";
import * as React from "react";
import { cn } from "./cn";

type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
};

export function Switch({ checked, onChange, label, hint, disabled, id }: SwitchProps) {
  const fallbackId = React.useId();
  const switchId = id ?? fallbackId;

  return (
    <label
      htmlFor={switchId}
      className={cn(
        "flex cursor-pointer items-start gap-3",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30",
          checked ? "bg-black" : "bg-gray-300",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
      {(label || hint) && (
        <div className="flex flex-col">
          {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
          {hint && <span className="text-xs text-gray-500">{hint}</span>}
        </div>
      )}
    </label>
  );
}
