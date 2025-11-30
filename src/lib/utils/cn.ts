/**
 * Utility for conditionally joining classNames together
 * Minimal alternative to clsx/classnames
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

