/**
 * Shared visual design tokens for the GoopSpec CLI: palette, border styles, and
 * gradient config. Screens import from here instead of hardcoding styles.
 */

export const colors = {
  primary: "cyan",
  accent: "magenta",
  highlight: "yellowBright",
  success: "green",
  warning: "yellow",
  error: "red",
  muted: "gray",
  text: "white",
} as const;

export type ColorName = (typeof colors)[keyof typeof colors];

export const borders = {
  primary: "double",
  secondary: "round",
  subtle: "single",
} as const;

export type BorderStyleName = (typeof borders)[keyof typeof borders];

export const panelVariants = {
  primary: { borderStyle: borders.primary, borderColor: colors.primary },
  secondary: { borderStyle: borders.secondary, borderColor: colors.accent },
  subtle: { borderStyle: borders.subtle, borderColor: colors.muted },
  success: { borderStyle: borders.secondary, borderColor: colors.success },
  warning: { borderStyle: borders.secondary, borderColor: colors.warning },
  error: { borderStyle: borders.secondary, borderColor: colors.error },
} as const;

export type PanelVariant = keyof typeof panelVariants;

export const gradient = {
  colors: ["cyan", "magenta"] as string[],
  name: "mind" as const,
  // Per-character colors cycled by the ASCII fallback when ink-gradient is unavailable.
  fallback: ["cyan", "cyanBright", "magenta", "magentaBright"] as const,
} as const;

export const theme = {
  colors,
  borders,
  panelVariants,
  gradient,
} as const;

export type Theme = typeof theme;
