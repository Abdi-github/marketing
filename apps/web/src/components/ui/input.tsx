import * as React from "react";
import { cn } from "./cn";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftAddon, rightAddon, className, id, ...rest },
  ref,
) {
  const fallbackId = React.useId();
  const inputId = id ?? fallbackId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex items-center rounded-lg border bg-white transition-colors focus-within:ring-2 focus-within:ring-black/10",
          error
            ? "border-red-400 focus-within:ring-red-200"
            : "border-gray-300 focus-within:border-gray-400",
        )}
      >
        {leftAddon && <span className="pl-3 text-sm text-gray-400">{leftAddon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "flex-1 bg-transparent px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none disabled:text-gray-400",
            className,
          )}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={hint || error ? `${inputId}-desc` : undefined}
          {...rest}
        />
        {rightAddon && <span className="pr-3 text-sm text-gray-400">{rightAddon}</span>}
      </div>
      {(hint || error) && (
        <p
          id={`${inputId}-desc`}
          className={cn("text-xs", error ? "text-red-600" : "text-gray-500")}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const fallbackId = React.useId();
  const inputId = id ?? fallbackId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          "resize-none rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:ring-2",
          error
            ? "border-red-400 focus:border-red-400 focus:ring-red-200"
            : "border-gray-300 focus:border-gray-400 focus:ring-black/10",
          className,
        )}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? `${inputId}-desc` : undefined}
        {...rest}
      />
      {(hint || error) && (
        <p
          id={`${inputId}-desc`}
          className={cn("text-xs", error ? "text-red-600" : "text-gray-500")}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, className, id, ...rest },
  ref,
) {
  const fallbackId = React.useId();
  const selectId = id ?? fallbackId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          "rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:ring-2",
          error
            ? "border-red-400 focus:border-red-400 focus:ring-red-200"
            : "border-gray-300 focus:border-gray-400 focus:ring-black/10",
          className,
        )}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {(hint || error) && (
        <p className={cn("text-xs", error ? "text-red-600" : "text-gray-500")}>{error ?? hint}</p>
      )}
    </div>
  );
});
