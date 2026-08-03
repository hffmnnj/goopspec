/**
 * Prompt-surface report runner.
 *
 * Usage: `bun run prompt-report` (from packages/opencode-plugin)
 *        or `bun run src/features/prompt-audit/report.ts`
 *
 * Prints a reproducible baseline report of chars, bytes, tokens,
 * absolute-language hits, and bold spans for agents/, commands/, references/.
 * Not imported from src/index.ts — excluded from the production bundle.
 *
 * @module prompt-audit/report
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { auditPromptSurfaces, type AuditReport } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "../../..");

function formatReport(report: AuditReport): string {
  const lines: string[] = [
    "Prompt-Surface Audit Report",
    `Measured: ${report.measuredAt}`,
    "",
    "Directory    Files   Chars      Bytes      Tokens    AbsHits  BoldSpans",
    "-----------  -----   ---------  ---------  --------  -------  ---------",
  ];

  let totalFiles = 0;
  let totalChars = 0;
  let totalBytes = 0;
  let totalTokens = 0;
  let totalAbs = 0;
  let totalBold = 0;

  for (const d of report.directories) {
    lines.push(
      `${d.directory.padEnd(12)}${String(d.files).padStart(5)}   ${String(d.chars).padStart(9)}  ${String(d.bytes).padStart(9)}  ${String(d.tokens).padStart(8)}  ${String(d.absoluteHits).padStart(7)}  ${String(d.boldSpans).padStart(9)}`,
    );
    totalFiles += d.files;
    totalChars += d.chars;
    totalBytes += d.bytes;
    totalTokens += d.tokens;
    totalAbs += d.absoluteHits;
    totalBold += d.boldSpans;
  }

  lines.push(
    "-----------  -----   ---------  ---------  --------  -------  ---------",
  );
  lines.push(
    `${"TOTAL".padEnd(12)}${String(totalFiles).padStart(5)}   ${String(totalChars).padStart(9)}  ${String(totalBytes).padStart(9)}  ${String(totalTokens).padStart(8)}  ${String(totalAbs).padStart(7)}  ${String(totalBold).padStart(9)}`,
  );

  lines.push("");
  lines.push("Per-file detail (sorted by chars descending):");
  lines.push("");

  for (const d of report.directories) {
    const sorted = [...d.perFile].sort((a, b) => b.chars - a.chars);
    for (const f of sorted) {
      lines.push(
        `  ${f.path.padEnd(42)} ${String(f.chars).padStart(7)} ch  ${String(f.bytes).padStart(7)} B  ${String(f.tokens).padStart(6)} tok  ${String(f.absoluteHits).padStart(4)} abs  ${String(f.boldSpans).padStart(4)} bold`,
      );
    }
  }

  return lines.join("\n");
}

if (import.meta.main) {
  const report = auditPromptSurfaces(packageRoot);
  console.log(formatReport(report));
}
