/**
 * GoopSpec CLI Output Components
 *
 * Themed, consistent UI building blocks for CLI commands.
 * All components respect the theme.ts color system and NO_COLOR.
 * Components return strings — they never call console.log directly.
 */

import { spinner as clackSpinner } from "@clack/prompts";

import {
  bold,
  dim,
  error as errorColor,
  info as infoColor,
  isColorEnabled,
  primary,
  success as successColor,
  warning as warningColor,
} from "./theme.js";
import { formatTable } from "./ui.js";

// ---------------------------------------------------------------------------
// Status icons
// ---------------------------------------------------------------------------

/** Unicode status icons with ASCII fallbacks */
const STATUS_ICONS = {
  ok: { unicode: "✓", ascii: "+" },
  error: { unicode: "✗", ascii: "x" },
  warning: { unicode: "⚠", ascii: "!" },
  info: { unicode: "ℹ", ascii: "i" },
  pending: { unicode: "○", ascii: "o" },
} as const;

type StatusType = keyof typeof STATUS_ICONS;

/**
 * Detect whether the terminal supports Unicode output.
 * Falls back to ASCII on Windows CMD and other limited terminals.
 */
function isUnicodeSupported(): boolean {
  if (process.platform === "win32") {
    return (
      Boolean(process.env["WT_SESSION"]) || // Windows Terminal
      Boolean(process.env["TERMINUS_SUBLIME"]) || // Terminus
      process.env["ConEmuTask"] === "{cmd}" || // ConEmu
      process.env["TERM_PROGRAM"] === "Terminus-Sublime" ||
      process.env["TERM_PROGRAM"] === "vscode" ||
      process.env["TERM"] === "xterm-256color" ||
      process.env["TERM"] === "alacritty" ||
      process.env["TERMINAL_EMULATOR"] === "JetBrains-JediTerm"
    );
  }
  return process.env["TERM"] !== "linux"; // Linux console (not terminal emulator)
}

/**
 * Get the appropriate status icon for the current terminal.
 */
function getStatusIcon(status: StatusType): string {
  const icons = STATUS_ICONS[status];
  return isUnicodeSupported() ? icons.unicode : icons.ascii;
}

/**
 * Get the themed color function for a status type.
 */
function getStatusColor(status: StatusType): (text: string) => string {
  switch (status) {
    case "ok":
      return successColor;
    case "error":
      return errorColor;
    case "warning":
      return warningColor;
    case "info":
      return infoColor;
    case "pending":
      return dim;
  }
}

// ---------------------------------------------------------------------------
// themedSpinner
// ---------------------------------------------------------------------------

export interface SpinnerHandle {
  /** Stop the spinner with an optional success message. */
  stop: (finalMessage?: string) => void;
  /** Stop the spinner with a failure message. */
  fail: (message: string) => void;
}

/**
 * Start a themed spinner using @clack/prompts.
 * Returns a handle with `stop` and `fail` methods.
 *
 * Gracefully handles non-TTY environments — if the spinner cannot
 * render interactively, it still calls through without throwing.
 */
export function themedSpinner(message: string): SpinnerHandle {
  try {
    const s = clackSpinner();
    s.start(primary(message));

    return {
      stop(finalMessage?: string) {
        s.stop(finalMessage ? successColor(finalMessage) : undefined);
      },
      fail(msg: string) {
        s.stop(errorColor(msg));
      },
    };
  } catch {
    // Non-TTY or unsupported environment — return a no-op handle
    return {
      stop() {},
      fail() {},
    };
  }
}

// ---------------------------------------------------------------------------
// themedTable
// ---------------------------------------------------------------------------

/**
 * Render a themed table with header row and data rows.
 * Enhances the existing `formatTable` from ui.ts with theme colors
 * applied to the header row.
 */
export function themedTable(
  headers: string[],
  rows: string[][],
  options?: {
    headerColor?: (s: string) => string;
    maxWidth?: number;
  },
): string {
  const colorFn = options?.headerColor ?? bold;

  if (!isColorEnabled()) {
    return formatTable(headers, rows);
  }

  // Apply color to headers for display, but use plain headers for width calculation
  const coloredHeaders = headers.map((h) => colorFn(h));

  // We need to build the table manually to apply color only to the header text
  // while keeping column widths based on plain-text lengths.
  const columns = headers.length;
  const widths = headers.map((header, index) => {
    const cellWidths = rows.map((row) => (row[index] ?? "").length);
    return Math.max(header.length, ...cellWidths);
  });

  // Clamp to maxWidth if specified
  if (options?.maxWidth) {
    const totalWidth = widths.reduce((sum, w) => sum + w, 0) + columns * 3 + 1;
    if (totalWidth > options.maxWidth) {
      const excess = totalWidth - options.maxWidth;
      const widestIndex = widths.indexOf(Math.max(...widths));
      widths[widestIndex] = Math.max(4, widths[widestIndex] - excess);
    }
  }

  const formatRow = (cells: string[], colored?: string[]): string => {
    const padded = Array.from({ length: columns }, (_, index) => {
      const display = colored ? (colored[index] ?? "") : (cells[index] ?? "");
      const plainLen = (cells[index] ?? "").length;
      const padding = Math.max(0, widths[index] - plainLen);
      return display + " ".repeat(padding);
    });
    return `| ${padded.join(" | ")} |`;
  };

  const divider = `+-${widths.map((w) => "-".repeat(w)).join("-+-")}-+`;
  const lines = [divider, formatRow(headers, coloredHeaders), divider];

  for (const row of rows) {
    lines.push(formatRow(row));
  }

  lines.push(divider);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// statusLine
// ---------------------------------------------------------------------------

/**
 * Render a status line with icon, label, and value.
 *
 * Format: `  ✓ label    value`
 */
export function statusLine(
  label: string,
  value: string,
  status: StatusType = "info",
): string {
  const icon = getStatusIcon(status);
  const color = getStatusColor(status);
  return `  ${color(icon)} ${label}  ${value}`;
}

// ---------------------------------------------------------------------------
// sectionBox
// ---------------------------------------------------------------------------

/**
 * Render a boxed section with title and content lines.
 * Uses simple box-drawing characters with ASCII fallback.
 */
export function sectionBox(title: string, lines: string[]): string {
  const unicode = isUnicodeSupported();
  const chars = unicode
    ? { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" }
    : { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" };

  // Calculate width based on content
  const contentWidths = [title.length + 2, ...lines.map((l) => l.length + 2)];
  const innerWidth = Math.max(40, ...contentWidths);

  const top = `${chars.tl}${chars.h} ${bold(title)} ${chars.h.repeat(Math.max(0, innerWidth - title.length - 3))}${chars.tr}`;
  const bottom = `${chars.bl}${chars.h.repeat(innerWidth)}${chars.br}`;

  const body = lines.map(
    (line) =>
      `${chars.v} ${line}${" ".repeat(Math.max(0, innerWidth - line.length - 2))} ${chars.v}`,
  );

  return [top, ...body, bottom].join("\n");
}

// ---------------------------------------------------------------------------
// keyValue
// ---------------------------------------------------------------------------

/**
 * Render a key-value pair with aligned formatting.
 *
 * Format: `  key:  value`
 */
export function keyValue(key: string, value: string, indent = 2): string {
  const pad = " ".repeat(indent);
  return `${pad}${dim(key + ":")}  ${value}`;
}

// ---------------------------------------------------------------------------
// bulletList
// ---------------------------------------------------------------------------

/**
 * Render a list of items with bullet characters.
 */
export function bulletList(items: string[], bullet = "•"): string {
  const icon = isUnicodeSupported() ? bullet : "-";
  return items.map((item) => `  ${dim(icon)} ${item}`).join("\n");
}

// ---------------------------------------------------------------------------
// commandExample
// ---------------------------------------------------------------------------

/**
 * Render a command example with `$` prefix.
 *
 * Format: `  $ goopspec register`
 * With description: `  $ goopspec register  — Register project with daemon`
 */
export function commandExample(cmd: string, description?: string): string {
  const prefix = `  ${dim("$")} ${infoColor(cmd)}`;
  if (description) {
    return `${prefix}  ${dim("—")} ${dim(description)}`;
  }
  return prefix;
}

// ---------------------------------------------------------------------------
// stepProgress
// ---------------------------------------------------------------------------

/**
 * Render a step progress indicator.
 *
 * Format: `[1/3] Step description`
 */
export function stepProgress(
  current: number,
  total: number,
  description: string,
): string {
  const counter = dim(`[${current}/${total}]`);
  return `${counter} ${description}`;
}
