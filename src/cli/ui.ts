import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import pc from "picocolors";

export const TAGLINES = [
  "Spec-driven development, one command at a time.",
  "Because yolo-driven development has consequences.",
  "Your specs called. They want to be respected.",
  "Making AI agents do the paperwork since 2025.",
  "Ship with confidence, not crossed fingers.",
  "Structure your chaos, ship your dreams.",
  "Where specs become reality.",
  "Taming the chaos, one wave at a time.",
];

function randomTagline(): string {
  return TAGLINES[Math.floor(Math.random() * TAGLINES.length)] ?? TAGLINES[0];
}

export function showBanner(): void {
  console.log();
  console.log(pc.bold(pc.magenta("  🔮 GoopSpec CLI")) + pc.dim(" v0.2.5"));
  console.log(pc.dim("  ════════════════════════════"));
  console.log(pc.italic(pc.dim(`  ${randomTagline()}`)));
  console.log();
}

export function sectionHeader(title: string, emoji?: string): void {
  console.log(pc.bold(pc.cyan(`${emoji ?? "📋"} ${title}`)));
}

export function showError(message: string, suggestion?: string): void {
  console.log(pc.red(`  ✗ Error: ${message}`));
  if (suggestion) {
    console.log(pc.dim(`  → Try: ${suggestion}`));
  }
}

export function showSuccess(message: string): void {
  console.log(pc.green(`  ✓ ${message}`));
}

export function showWarning(message: string): void {
  console.log(pc.yellow(`  ⚠ ${message}`));
}

export function showInfo(message: string): void {
  console.log(pc.cyan(`  ℹ ${message}`));
}

export function showComplete(message: string): void {
  console.log();
  console.log(pc.bold(pc.green(`  ✨ ${message}`)));
  console.log();
}

export function formatTable(headers: string[], rows: string[][]): string {
  const columns = headers.length;
  const widths = headers.map((header, index) => {
    const cellWidths = rows.map((row) => row[index]?.length ?? 0);
    return Math.max(header.length, ...cellWidths);
  });

  const formatRow = (cells: string[]): string => {
    const padded = Array.from({ length: columns }, (_, index) => {
      const value = cells[index] ?? "";
      return value.padEnd(widths[index]);
    });
    return `| ${padded.join(" | ")} |`;
  };

  const divider = `+-${widths.map((width) => "-".repeat(width)).join("-+-")}-+`;
  const lines = [divider, formatRow(headers), divider];

  for (const row of rows) {
    lines.push(formatRow(row));
  }

  lines.push(divider);
  return lines.join("\n");
}

export { intro, outro, text, select, confirm, multiselect, spinner, isCancel, cancel };
