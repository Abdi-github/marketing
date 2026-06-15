// Tiny className combiner — no clsx/tailwind-merge dependency.
// Joins truthy class strings; ignores undefined/null/false.

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
