import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  outro,
  password,
  select,
  spinner,
  text,
} from "@clack/prompts";

import { GOOPSPEC_VERSION } from "../core/version.js";
import {
  bold,
  dim,
  error as themeError,
  highlight,
  info as themeInfo,
  italic,
  primary,
  success as themeSuccess,
  warning as themeWarning,
} from "./theme.js";

// ---------------------------------------------------------------------------
// Taglines
// ---------------------------------------------------------------------------

export const TAGLINES = [
  "Spec-driven development, one command at a time.",
  "Because yolo-driven development has consequences.",
  "Your specs called. They want to be respected.",
  "Making AI agents do the paperwork since 2025.",
  "Ship with confidence, not crossed fingers.",
  "Structure your chaos, ship your dreams.",
  "Where specs become reality.",
  "Taming the chaos, one wave at a time.",
  "Turning vibes into verified deliverables.",
  "Plans are cheap. Specs are priceless.",
];

export function randomTagline(): string {
  return TAGLINES[Math.floor(Math.random() * TAGLINES.length)] ?? TAGLINES[0];
}

// ---------------------------------------------------------------------------
// Unicode / box-drawing support
// ---------------------------------------------------------------------------

/**
 * Detect if the terminal supports Unicode box-drawing characters.
 * Returns false on Windows CMD (no TERM_PROGRAM, no WT_SESSION, no ConEmuBuild).
 * Returns true on most modern terminals (macOS, Linux, Windows Terminal, VS Code).
 */
export function supportsUnicode(): boolean {
  // Non-Windows platforms almost always support Unicode
  if (process.platform !== "win32") {
    return true;
  }

  // Windows Terminal sets WT_SESSION
  if (process.env["WT_SESSION"]) {
    return true;
  }

  // ConEmu / Cmder sets ConEmuBuild
  if (process.env["ConEmuBuild"]) {
    return true;
  }

  // VS Code integrated terminal, Hyper, etc.
  if (process.env["TERM_PROGRAM"]) {
    return true;
  }

  // Fallback: plain Windows CMD — no Unicode
  return false;
}

/** Box-drawing character set (Unicode or ASCII depending on terminal) */
export interface BoxChars {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  dividerChar: string;
  corner: string;
  star: string;
}

function getBoxChars(): BoxChars {
  if (supportsUnicode()) {
    return {
      topLeft: "╔",
      topRight: "╗",
      bottomLeft: "╚",
      bottomRight: "╝",
      horizontal: "═",
      vertical: "║",
      dividerChar: "─",
      corner: "·",
      star: "✦",
    };
  }
  return {
    topLeft: "+",
    topRight: "+",
    bottomLeft: "+",
    bottomRight: "+",
    horizontal: "=",
    vertical: "|",
    dividerChar: "-",
    corner: ".",
    star: "*",
  };
}

/** Lazily resolved box-drawing characters */
export const BOX: BoxChars = new Proxy({} as BoxChars, {
  get(_target, prop: string) {
    return getBoxChars()[prop as keyof BoxChars];
  },
});

// ---------------------------------------------------------------------------
// Box-drawing utilities
// ---------------------------------------------------------------------------

/**
 * Strip ANSI escape codes to measure visible string width.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Create a box around content lines.
 *
 * @param title  - Box title (displayed in the top border)
 * @param lines  - Content lines to display inside the box
 * @param width  - Total box width (auto-calculated if omitted)
 */
export function box(title: string, lines: string[], width?: number): string {
  const chars = getBoxChars();

  // Calculate width from content if not specified
  const contentWidths = lines.map((l) => stripAnsi(l).length);
  const titleWidth = stripAnsi(title).length;
  const maxContent = Math.max(titleWidth + 4, ...contentWidths);
  const innerWidth = width ? width - 4 : maxContent + 2;

  // Top border with title
  const titlePadded = ` ${title} `;
  const titleLen = stripAnsi(titlePadded).length;
  const remainingTop = Math.max(0, innerWidth + 2 - titleLen);
  const topBorder =
    chars.topLeft +
    chars.horizontal +
    titlePadded +
    chars.horizontal.repeat(remainingTop) +
    chars.topRight;

  // Content lines
  const contentLines = lines.map((line) => {
    const visible = stripAnsi(line).length;
    const padding = Math.max(0, innerWidth - visible);
    return chars.vertical + " " + line + " ".repeat(padding) + " " + chars.vertical;
  });

  // Bottom border
  const bottomBorder =
    chars.bottomLeft + chars.horizontal.repeat(innerWidth + 2) + chars.bottomRight;

  return [topBorder, ...contentLines, bottomBorder].join("\n");
}

/**
 * Create a horizontal divider line.
 *
 * @param width - Divider width (default 40)
 * @param char  - Character to use (defaults to box divider char)
 */
export function divider(width = 40, char?: string): string {
  const c = char ?? getBoxChars().dividerChar;
  return c.repeat(width);
}

/**
 * Create a section header with optional emoji.
 *
 * @param title - Header text
 * @param emoji - Optional leading emoji (defaults to 📋)
 */
export function header(title: string, emoji?: string): string {
  const prefix = emoji ? `${emoji} ` : "";
  return bold(themeInfo(`${prefix}${title}`));
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

/**
 * Render the GoopSpec CLI banner with crystal/constellation motif.
 * Compact (≤10 lines), distinctive, and cross-platform.
 */
export function showBanner(): void {
  const chars = getBoxChars();
  const v = dim(`v${GOOPSPEC_VERSION}`);
  const tag = italic(dim(randomTagline()));

  const line1 = `  ${dim(chars.corner)}  ${dim(chars.corner)} ${dim(chars.star)} ${dim(chars.corner)}  ${dim(chars.corner)}`;
  const line2 = `  ${dim(chars.corner)} ${dim(chars.star)}  ${primary("🔮")}  ${dim(chars.star)} ${dim(chars.corner)}    ${highlight("GoopSpec")} ${v}`;
  const line3 = `  ${dim(chars.corner)}  ${dim(chars.corner)} ${dim(chars.star)} ${dim(chars.corner)}  ${dim(chars.corner)}    ${dim("spec-driven development")}`;
  const line4 = `  ${dim(divider(24, chars.dividerChar))}`;
  const line5 = `  ${tag}`;

  console.log();
  console.log(line1);
  console.log(line2);
  console.log(line3);
  console.log(line4);
  console.log(line5);
  console.log();
}

/**
 * Render the banner as a string (for testing).
 */
export function renderBanner(): string {
  const chars = getBoxChars();
  const v = dim(`v${GOOPSPEC_VERSION}`);
  const tag = italic(dim(randomTagline()));

  const line1 = `  ${dim(chars.corner)}  ${dim(chars.corner)} ${dim(chars.star)} ${dim(chars.corner)}  ${dim(chars.corner)}`;
  const line2 = `  ${dim(chars.corner)} ${dim(chars.star)}  ${primary("🔮")}  ${dim(chars.star)} ${dim(chars.corner)}    ${highlight("GoopSpec")} ${v}`;
  const line3 = `  ${dim(chars.corner)}  ${dim(chars.corner)} ${dim(chars.star)} ${dim(chars.corner)}  ${dim(chars.corner)}    ${dim("spec-driven development")}`;
  const line4 = `  ${dim(divider(24, chars.dividerChar))}`;
  const line5 = `  ${tag}`;

  return ["", line1, line2, line3, line4, line5, ""].join("\n");
}

// ---------------------------------------------------------------------------
// Status output helpers (themed)
// ---------------------------------------------------------------------------

export function sectionHeader(title: string, emoji?: string): void {
  console.log(header(title, emoji));
}

export function showError(message: string, suggestion?: string): void {
  console.log(themeError(`  ✗ Error: ${message}`));
  if (suggestion) {
    console.log(dim(`  → Try: ${suggestion}`));
  }
}

export function showSuccess(message: string): void {
  console.log(themeSuccess(`  ✓ ${message}`));
}

export function showWarning(message: string): void {
  console.log(themeWarning(`  ⚠ ${message}`));
}

export function showInfo(message: string): void {
  console.log(themeInfo(`  ℹ ${message}`));
}

export function showComplete(message: string): void {
  console.log();
  console.log(bold(themeSuccess(`  ✨ ${message}`)));
  console.log();
}

// ---------------------------------------------------------------------------
// Table formatting
// ---------------------------------------------------------------------------

export function formatTable(headers: string[], rows: string[][]): string {
  const columns = headers.length;
  const widths = headers.map((h, index) => {
    const cellWidths = rows.map((row) => (row[index]?.length ?? 0));
    return Math.max(h.length, ...cellWidths);
  });

  const formatRow = (cells: string[]): string => {
    const padded = Array.from({ length: columns }, (_, index) => {
      const value = cells[index] ?? "";
      return value.padEnd(widths[index]);
    });
    return `| ${padded.join(" | ")} |`;
  };

  const tableDivider = `+-${widths.map((w) => "-".repeat(w)).join("-+-")}-+`;
  const lines = [tableDivider, formatRow(headers), tableDivider];

  for (const row of rows) {
    lines.push(formatRow(row));
  }

  lines.push(tableDivider);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Re-exports from @clack/prompts
// ---------------------------------------------------------------------------

export { intro, outro, text, select, confirm, multiselect, password, spinner, isCancel, cancel };
