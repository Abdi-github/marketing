import * as React from "react";
import { cn } from "./cn";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Visual weight. */
  elevation?: "flat" | "raised" | "floating";
  /** Internal padding scale. */
  padding?: "none" | "sm" | "md" | "lg";
  /** Make the card behave like a link (hover lift). */
  interactive?: boolean;
};

const ELEVATION = {
  flat: "border border-gray-200 bg-white",
  raised: "border border-gray-100 bg-white shadow-sm",
  floating: "border border-gray-100 bg-white shadow-md",
};

const PADDING = {
  none: "p-0",
  sm: "p-3",
  md: "p-5",
  lg: "p-7",
};

export function Card({
  elevation = "flat",
  padding = "md",
  interactive,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl",
        ELEVATION[elevation],
        PADDING[padding],
        interactive && "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-4 flex items-center justify-between border-b border-gray-100 pb-3",
        className,
      )}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold text-gray-900", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3",
        className,
      )}
      {...rest}
    />
  );
}
