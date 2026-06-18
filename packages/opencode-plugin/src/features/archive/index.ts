/**
 * Archive subsystem for GoopSpec 1.0.0.
 *
 * Handles milestone completion lifecycle:
 * 1. Move completed workflow docs to `.goopspec/archive/<workflowId>-<timestamp>/`
 * 2. Generate a retrospective summary
 * 3. Extract learnings and persist them to memory via MemoryManager
 *
 * All functions accept explicit dependencies (projectDir, MemoryManager) for
 * testability — nothing is hard-wired to a real database or filesystem root.
 *
 * @module features/archive
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { GOOPSPEC_DIR } from "../../core/constants.js";
import type { MemoryManager, MemorySaveInput } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ArchiveEntry {
  id: string;
  name: string;
  archivedAt: string;
  path: string;
}

export interface ExtractedLearning {
  patterns: string[];
  decisions: string[];
  gotchas: string[];
  metrics: {
    taskCount: number;
    waveCount: number;
    durationDays: number;
  };
}

export interface ArchiveWorkflowOptions {
  projectDir: string;
  workflowId: string;
  retrospective?: string;
  memory?: MemoryManager;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARCHIVE_DIR = "archive";

/** Workflow document files eligible for archival. */
const WORKFLOW_DOC_FILES = [
  "SPEC.md",
  "BLUEPRINT.md",
  "CHRONICLE.md",
  "REQUIREMENTS.md",
  "HANDOFF.md",
  "RESEARCH.md",
  "ADL.md",
] as const;

const RETROSPECTIVE_FILE = "RETROSPECTIVE.md";
const LEARNINGS_FILE = "LEARNINGS.md";

// ---------------------------------------------------------------------------
// Core: archiveWorkflow
// ---------------------------------------------------------------------------

/**
 * Archive a completed workflow.
 *
 * Moves all workflow docs from `.goopspec/<workflowId>/` into
 * `.goopspec/archive/<workflowId>-<timestamp>/`, generates a retrospective,
 * extracts learnings, and optionally persists them to memory.
 *
 * For the "default" workflow, docs live at `.goopspec/` root — they are
 * *copied* (not moved) to avoid destroying the root directory.
 */
export async function archiveWorkflow(opts: ArchiveWorkflowOptions): Promise<ArchiveEntry> {
  const { projectDir, workflowId, retrospective, memory } = opts;

  const goopspecDir = join(projectDir, GOOPSPEC_DIR);
  const archiveRoot = join(goopspecDir, ARCHIVE_DIR);
  const workflowDir = workflowId === "default" ? goopspecDir : join(goopspecDir, workflowId);

  // Validate: workflow directory must exist and contain at least one doc
  if (!existsSync(workflowDir)) {
    throw new Error(`Workflow directory not found: ${workflowId}`);
  }

  const hasDoc = WORKFLOW_DOC_FILES.some((f) => existsSync(join(workflowDir, f)));
  if (!hasDoc) {
    throw new Error(`No workflow documents found for: ${workflowId}`);
  }

  // Build archive destination
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const archiveId = `${workflowId}-${timestamp}`;
  const destDir = join(archiveRoot, archiveId);
  mkdirSync(destDir, { recursive: true });

  // Read docs for learning extraction before moving
  const specContent = safeReadFile(join(workflowDir, "SPEC.md"));
  const chronicleContent = safeReadFile(join(workflowDir, "CHRONICLE.md"));

  // Move (or copy for default) workflow docs into archive
  for (const filename of WORKFLOW_DOC_FILES) {
    const src = join(workflowDir, filename);
    if (!existsSync(src)) continue;

    const dst = join(destDir, filename);
    if (workflowId === "default") {
      // Copy for default — don't destroy root .goopspec/ files
      writeFileSync(dst, readFileSync(src, "utf-8"), "utf-8");
    } else {
      safeMove(src, dst);
    }
  }

  // Generate retrospective
  const retrospectiveContent = retrospective || generateRetrospective(workflowId);
  atomicWrite(join(destDir, RETROSPECTIVE_FILE), retrospectiveContent);

  // Extract learnings
  const learnings = extractLearnings(specContent, chronicleContent, retrospectiveContent);
  const learningsMarkdown = formatLearningsMarkdown(workflowId, learnings);
  atomicWrite(join(destDir, LEARNINGS_FILE), learningsMarkdown);

  // Persist learnings to memory (non-blocking — failures are swallowed)
  if (memory) {
    await persistLearningsToMemory(memory, workflowId, archiveId, learnings);
  }

  // Clean up non-default workflow directory
  if (workflowId !== "default" && existsSync(workflowDir)) {
    try {
      rmSync(workflowDir, { recursive: true, force: true });
    } catch {
      // Non-critical: directory may be locked or cross-device
    }
  }

  return {
    id: archiveId,
    name: workflowId,
    archivedAt: new Date().toISOString(),
    path: destDir,
  };
}

// ---------------------------------------------------------------------------
// Core: generateRetrospective
// ---------------------------------------------------------------------------

/**
 * Generate a retrospective markdown template for a completed workflow.
 */
export function generateRetrospective(workflowId: string): string {
  const timestamp = new Date().toISOString();

  return `# Retrospective: ${workflowId}

**Completed:** ${timestamp}

## What Went Well

- [Add what worked well]

## What Could Be Improved

- [Add areas for improvement]

## Key Decisions

- [Add important decisions made]

## Challenges Faced

- [Add challenges and how they were resolved]

## Learnings for Next Time

- [Add learnings to apply in future work]

---

*Generated at workflow completion.*
`;
}

// ---------------------------------------------------------------------------
// Core: extractLearnings
// ---------------------------------------------------------------------------

/**
 * Extract patterns, decisions, gotchas, and metrics from workflow documents.
 *
 * Uses simple regex heuristics against SPEC, CHRONICLE, and RETROSPECTIVE
 * content. Returns structured data suitable for memory persistence.
 */
export function extractLearnings(
  specContent: string,
  chronicleContent: string,
  retrospectiveContent: string,
): ExtractedLearning {
  const patterns = extractByKeywords(retrospectiveContent, [
    "pattern",
    "approach",
    "worked well",
    "success",
  ]);

  const decisions = dedup([
    ...extractByKeywords(specContent, ["decision", "chose", "selected", "using"]),
    ...extractByKeywords(retrospectiveContent, ["decision", "chose", "selected", "using"]),
  ]);

  const gotchas = extractByKeywords(retrospectiveContent, [
    "gotcha",
    "issue",
    "problem",
    "challenge",
    "tripped",
    "struggled",
  ]);

  const metrics = extractMetrics(chronicleContent, retrospectiveContent);

  return {
    patterns: patterns.length > 0 ? patterns : ["No specific patterns documented"],
    decisions: decisions.length > 0 ? decisions : ["No specific decisions documented"],
    gotchas: gotchas.length > 0 ? gotchas : ["No specific gotchas documented"],
    metrics,
  };
}

// ---------------------------------------------------------------------------
// Core: listArchived
// ---------------------------------------------------------------------------

/**
 * List all archived workflows for a project, sorted newest-first.
 */
export function listArchived(projectDir: string): ArchiveEntry[] {
  const archiveRoot = join(projectDir, GOOPSPEC_DIR, ARCHIVE_DIR);
  if (!existsSync(archiveRoot)) return [];

  try {
    const entries = readdirSync(archiveRoot);
    const results: ArchiveEntry[] = [];

    for (const entry of entries) {
      const entryPath = join(archiveRoot, entry);
      try {
        const stats = statSync(entryPath);
        if (!stats.isDirectory()) continue;

        results.push({
          id: entry,
          name: entry,
          archivedAt: stats.mtime.toISOString(),
          path: entryPath,
        });
      } catch {
        // Skip entries we can't stat
      }
    }

    results.sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());
    return results;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Memory persistence
// ---------------------------------------------------------------------------

/**
 * Persist extracted learnings to the memory system.
 *
 * Saves a main summary entry plus individual entries for patterns,
 * decisions, and gotchas (capped to avoid flooding memory).
 */
async function persistLearningsToMemory(
  memory: MemoryManager,
  workflowId: string,
  archiveId: string,
  learnings: ExtractedLearning,
): Promise<void> {
  const sourceFile = `archive/${archiveId}/${LEARNINGS_FILE}`;

  // Main summary entry
  const mainInput: MemorySaveInput = {
    type: "observation",
    title: `Milestone Complete: ${workflowId}`,
    content: formatLearningsForMemory(learnings),
    concepts: extractConcepts(learnings),
    facts: [...learnings.patterns, ...learnings.decisions].slice(0, 10),
    importance: 8,
    sourceFiles: [sourceFile],
  };

  try {
    await memory.save(mainInput);
  } catch {
    // Graceful degradation — don't block archival
  }

  // Individual patterns (up to 5)
  for (const pattern of learnings.patterns.slice(0, 5)) {
    if (pattern === "No specific patterns documented") continue;
    try {
      await memory.save({
        type: "observation",
        title: `Pattern: ${pattern.slice(0, 80)}`,
        content: pattern,
        concepts: ["pattern", "best-practice"],
        importance: 7,
        sourceFiles: [sourceFile],
      });
    } catch {
      // Continue with remaining entries
    }
  }

  // Individual decisions (up to 5)
  for (const decision of learnings.decisions.slice(0, 5)) {
    if (decision === "No specific decisions documented") continue;
    try {
      await memory.save({
        type: "decision",
        title: `Decision: ${decision.slice(0, 80)}`,
        content: decision,
        concepts: ["architecture", "decision"],
        importance: 7,
        sourceFiles: [sourceFile],
      });
    } catch {
      // Continue with remaining entries
    }
  }

  // Individual gotchas (up to 3)
  for (const gotcha of learnings.gotchas.slice(0, 3)) {
    if (gotcha === "No specific gotchas documented") continue;
    try {
      await memory.save({
        type: "note",
        title: `Gotcha: ${gotcha.slice(0, 80)}`,
        content: gotcha,
        concepts: ["pitfall", "warning", "gotcha"],
        importance: 7,
        sourceFiles: [sourceFile],
      });
    } catch {
      // Continue with remaining entries
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers: file I/O
// ---------------------------------------------------------------------------

function safeReadFile(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : "";
  } catch {
    return "";
  }
}

function atomicWrite(path: string, content: string): void {
  const tmp = `${path}.tmp.${Date.now()}`;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, path);
}

function safeMove(src: string, dst: string): void {
  try {
    renameSync(src, dst);
  } catch {
    // Cross-device fallback: copy then delete
    writeFileSync(dst, readFileSync(src, "utf-8"), "utf-8");
  }
}

// ---------------------------------------------------------------------------
// Helpers: text extraction
// ---------------------------------------------------------------------------

/**
 * Extract values from lines matching `keyword: value` patterns.
 */
function extractByKeywords(text: string, keywords: string[]): string[] {
  if (!text) return [];

  const pattern = new RegExp(`(?:${keywords.join("|")}):\\s*(.+)`, "gi");

  const results: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (value && value.length > 0) {
      results.push(value);
    }
  }
  return results;
}

function dedup(items: string[]): string[] {
  return [...new Set(items)];
}

function extractMetrics(
  chronicleContent: string,
  retrospectiveContent: string,
): ExtractedLearning["metrics"] {
  // Count tasks from chronicle markers (e.g. "- Task 1.1" or "- [x] Task 1.2")
  const taskMatches = chronicleContent.match(/(?:^|\n)[-*]\s+(?:Task|\[[ x]\]\s*Task)/gm);
  const taskCount = taskMatches?.length ?? 0;

  // Count waves from wave headers
  const waveMatches = chronicleContent.match(/(?:^|\n)##\s+Wave\s+\d+/gm);
  const waveCount = waveMatches?.length ?? 0;

  // Calculate duration from dates found in documents
  const allText = `${chronicleContent}\n${retrospectiveContent}`;
  const dateMatches = [...allText.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)];
  let durationDays = 0;

  if (dateMatches.length >= 2) {
    const timestamps = dateMatches
      .map((m) => new Date(m[1]).getTime())
      .filter((t) => !Number.isNaN(t));

    if (timestamps.length >= 2) {
      const earliest = Math.min(...timestamps);
      const latest = Math.max(...timestamps);
      durationDays = Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24));
    }
  }

  return { taskCount, waveCount, durationDays };
}

// ---------------------------------------------------------------------------
// Helpers: memory formatting
// ---------------------------------------------------------------------------

function formatLearningsForMemory(learnings: ExtractedLearning): string {
  const sections: string[] = [];

  sections.push("## Patterns That Worked");
  sections.push(learnings.patterns.map((p) => `- ${p}`).join("\n"));

  sections.push("\n## Key Decisions");
  sections.push(learnings.decisions.map((d) => `- ${d}`).join("\n"));

  sections.push("\n## Gotchas");
  sections.push(learnings.gotchas.map((g) => `- ${g}`).join("\n"));

  sections.push("\n## Metrics");
  sections.push(`- Tasks: ${learnings.metrics.taskCount}`);
  sections.push(`- Waves: ${learnings.metrics.waveCount}`);
  sections.push(`- Duration: ${learnings.metrics.durationDays} days`);

  return sections.join("\n");
}

function extractConcepts(learnings: ExtractedLearning): string[] {
  const concepts = new Set<string>(["milestone", "learnings", "retrospective"]);

  const allText = [...learnings.patterns, ...learnings.decisions, ...learnings.gotchas]
    .join(" ")
    .toLowerCase();

  const techKeywords = [
    "api",
    "auth",
    "database",
    "frontend",
    "backend",
    "test",
    "deploy",
    "security",
    "performance",
    "ui",
    "typescript",
    "react",
  ];

  for (const kw of techKeywords) {
    if (allText.includes(kw)) {
      concepts.add(kw);
    }
  }

  return [...concepts].slice(0, 10);
}

function formatLearningsMarkdown(workflowId: string, learnings: ExtractedLearning): string {
  const timestamp = new Date().toISOString();

  return `# Learnings: ${workflowId}

**Generated:** ${timestamp}

## Metrics

- **Tasks Completed:** ${learnings.metrics.taskCount}
- **Waves Executed:** ${learnings.metrics.waveCount}
- **Duration:** ${learnings.metrics.durationDays} days

## Patterns That Worked

${learnings.patterns.map((p) => `- ${p}`).join("\n")}

## Key Decisions

${learnings.decisions.map((d) => `- ${d}`).join("\n")}

## Gotchas & Challenges

${learnings.gotchas.map((g) => `- ${g}`).join("\n")}

---

*Generated from milestone artifacts at workflow completion.*
`;
}
