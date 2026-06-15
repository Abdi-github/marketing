"use client";
import * as React from "react";
import { cn } from "./cn";

type TabsContextValue = {
  value: string;
  onChange: (value: string) => void;
  variant: "underline" | "pills";
};
const TabsCtx = React.createContext<TabsContextValue | null>(null);

type TabsProps = {
  value: string;
  onChange: (value: string) => void;
  variant?: "underline" | "pills";
  children: React.ReactNode;
};

export function Tabs({ value, onChange, variant = "underline", children }: TabsProps) {
  return (
    <TabsCtx.Provider value={{ value, onChange, variant }}>
      <div>{children}</div>
    </TabsCtx.Provider>
  );
}

type TabsListProps = React.HTMLAttributes<HTMLDivElement>;

export function TabsList({ className, ...rest }: TabsListProps) {
  const ctx = React.useContext(TabsCtx);
  if (!ctx) throw new Error("TabsList must be a child of <Tabs>");
  return (
    <div
      role="tablist"
      className={cn(
        ctx.variant === "underline"
          ? "flex items-center gap-1 overflow-x-auto border-b border-gray-200"
          : "inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1",
        className,
      )}
      {...rest}
    />
  );
}

type TabProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

export function Tab({ value, className, children, ...rest }: TabProps) {
  const ctx = React.useContext(TabsCtx);
  if (!ctx) throw new Error("Tab must be a child of <Tabs>");
  const active = ctx.value === value;

  const underline = active
    ? "border-black text-black font-medium"
    : "border-transparent text-gray-500 hover:text-gray-800";
  const pill = active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900";

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.onChange(value)}
      className={cn(
        "whitespace-nowrap transition-colors",
        ctx.variant === "underline"
          ? `border-b-2 px-3 py-2.5 text-sm ${underline}`
          : `rounded-lg px-3 py-1.5 text-sm ${pill}`,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

type TabPanelProps = React.HTMLAttributes<HTMLDivElement> & { value: string };

export function TabPanel({ value, className, ...rest }: TabPanelProps) {
  const ctx = React.useContext(TabsCtx);
  if (!ctx) throw new Error("TabPanel must be a child of <Tabs>");
  if (ctx.value !== value) return null;
  return <div role="tabpanel" className={className} {...rest} />;
}
