/**
 * Archive Manager for GoopSpec
 * Manages completed milestone archives and quick task history
 * 
 * @module features/archive/manager
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";
import { join, basename } from "path";
import { getProjectGoopspecDir, getWorkflowDir } from "../../shared/paths.js";
import { log, logError } from "../../shared/logger.js";
import { extractLearnings, formatLearningsMarkdown } from "./learnings.js";
import type { MemoryManager, MemoryInput, StateManager } from "../../core/types.js";
import type { ExtractedLearning } from "./learnings.js";

// ============================================================================
// Types
// ============================================================================

export interface ArchiveEntry {
  id: string;
  name: string;
  archivedAt: string;
  retrospectivePath: string;
  learningsPath: string;
}

export interface ArchiveManager {
  archiveMilestone(milestoneId: string, retrospective: string, workflowId?: string): Promise<ArchiveEntry>;
  archiveQuickTask(taskName: string, summary: string): Promise<string>;
  listArchived(): ArchiveEntry[];
  getArchivedMilestone(id: string): ArchiveEntry | null;
  generateArchiveIndex(): string;
  persistLearnings(milestoneId: string, learnings: ExtractedLearning): Promise<boolean>;
}

// ============================================================================
// Constants
// ============================================================================

const ARCHIVE_DIR = "archive";
const QUICK_DIR = "quick";
const ARCHIVE_INDEX = "index.md";
const RETROSPECTIVE_FILE = "RETROSPECTIVE.md";
const LEARNINGS_FILE = "LEARNINGS.md";
const SPEC_FILE = "SPEC.md";
const CHRONICLE_FILE = "CHRONICLE.md";
const SUMMARY_FILE = "SUMMARY.md";

/** Workflow document files to archive (matches WORKFLOW_SCOPED_FILES minus directories) */
const WORKFLOW_DOC_FILES = [
  "SPEC.md",
  "BLUEPRINT.md",
  "CHRONICLE.md",
  "REQUIREMENTS.md",
  "HANDOFF.md",
  "RESEARCH.md",
  "ADL.md",
] as const;

// ============================================================================
// Utilities
// ============================================================================

/**
 * Atomic write: write to temp file, then rename
 */
function atomicWriteFile(path: string, content: string): void {
  const tempPath = `${path}.tmp.${Date.now()}`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, path);
}

/**
 * Safe read file
 */
function safeReadFile(path: string): string | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path, "utf-8");
  } catch (error) {
    logError(`Failed to read file: ${path}`, error);
    return null;
  }
}

/**
 * Get next quick task number
 */
function getNextQuickTaskNumber(quickDir: string): number {
  if (!existsSync(quickDir)) {
    return 1;
  }
  
  try {
    const entries = readdirSync(quickDir);
    const numbers = entries
      .map(e => {
        const match = e.match(/^(\d+)-/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);
    
    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  } catch (error) {
    logError("Failed to get next quick task number", error);
    return 1;
  }
}

/**
 * Format quick task number with leading zeros
 */
function formatQuickTaskNumber(num: number): string {
  return num.toString().padStart(3, "0");
}

/**
 * Generate retrospective template
 */
function generateRetrospectiveTemplate(milestoneId: string): string {
  const timestamp = new Date().toISOString();
  
  return `# Retrospective: ${milestoneId}

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

- [Add learnings to apply in future phases]

---

*This retrospective was generated at milestone completion.*
`;
}

// ============================================================================
// Memory Integration
// ============================================================================

/**
 * Save learnings to memory system
 */
export async function persistLearningsToMemory(
  memoryManager: MemoryManager | undefined,
  milestoneId: string,
  milestoneName: string,
  learnings: ExtractedLearning
): Promise<boolean> {
  if (!memoryManager) {
    log("Memory manager not available, skipping learnings persistence");
    return false;
  }
  
  try {
    // Save main learnings entry
    const mainEntry: MemoryInput = {
      type: "observation",
      title: `Milestone Complete: ${milestoneName}`,
      content: formatLearningsForMemory(learnings),
      concepts: extractConcepts(learnings),
      facts: learnings.patterns.concat(learnings.decisions).slice(0, 10),
      importance: 0.8,  // Learnings are high-value
      sourceFiles: [`archive/${milestoneId}/LEARNINGS.md`],
    };
    
    await memoryManager.save(mainEntry);
    log("Saved milestone learnings to memory", { milestoneId });
    
    // Save individual patterns as separate memories for better search
    for (const pattern of learnings.patterns.slice(0, 5)) {
      const patternEntry: MemoryInput = {
        type: "observation",
        title: `Pattern: ${pattern.substring(0, 50)}`,
        content: pattern,
        concepts: ["pattern", "best-practice"],
        importance: 0.7,
        sourceFiles: [`archive/${milestoneId}/LEARNINGS.md`],
      };
      await memoryManager.save(patternEntry);
    }
    
    // Save key decisions
    for (const decision of learnings.decisions.slice(0, 5)) {
      const decisionEntry: MemoryInput = {
        type: "decision",
        title: `Decision: ${decision.substring(0, 50)}`,
        content: decision,
        concepts: ["architecture", "decision"],
        importance: 0.75,
        sourceFiles: [`archive/${milestoneId}/LEARNINGS.md`],
      };
      await memoryManager.save(decisionEntry);
    }
    
    // Save gotchas as notes
    for (const gotcha of learnings.gotchas.slice(0, 3)) {
      const gotchaEntry: MemoryInput = {
        type: "note",
        title: `Gotcha: ${gotcha.substring(0, 50)}`,
        content: gotcha,
        concepts: ["pitfall", "warning", "gotcha"],
        importance: 0.7,
        sourceFiles: [`archive/${milestoneId}/LEARNINGS.md`],
      };
      await memoryManager.save(gotchaEntry);
    }
    
    return true;
  } catch (error) {
    log("Failed to persist learnings to memory", { milestoneId, error });
    return false;
  }
}

/**
 * Format learnings for memory content
 */
function formatLearningsForMemory(learnings: ExtractedLearning): string {
  const sections: string[] = [];
  
  sections.push("## Patterns That Worked");
  if (learnings.patterns.length > 0) {
    sections.push(learnings.patterns.map(p => `- ${p}`).join("\n"));
  } else {
    sections.push("- No specific patterns noted");
  }
  
  sections.push("\n## Key Decisions");
  if (learnings.decisions.length > 0) {
    sections.push(learnings.decisions.map(d => `- ${d}`).join("\n"));
  } else {
    sections.push("- No specific decisions noted");
  }
  
  sections.push("\n## Gotchas & Pitfalls");
  if (learnings.gotchas.length > 0) {
    sections.push(learnings.gotchas.map(g => `- ${g}`).join("\n"));
  } else {
    sections.push("- No specific gotchas noted");
  }
  
  sections.push("\n## Metrics");
  sections.push(`- Tasks: ${learnings.metrics.taskCount}`);
  sections.push(`- Waves: ${learnings.metrics.waveCount}`);
  sections.push(`- Duration: ${learnings.metrics.durationDays} days`);
  
  return sections.join("\n");
}

/**
 * Extract concepts from learnings for semantic search
 */
function extractConcepts(learnings: ExtractedLearning): string[] {
  const concepts = new Set<string>();
  
  // Add base concepts
  concepts.add("milestone");
  concepts.add("learnings");
  concepts.add("retrospective");
  
  // Extract keywords from patterns and decisions
  const allText = [
    ...learnings.patterns,
    ...learnings.decisions,
    ...learnings.gotchas,
  ].join(" ").toLowerCase();
  
  // Common tech keywords to look for
  const techKeywords = [
    "api", "auth", "database", "frontend", "backend", "test", "deploy",
    "security", "performance", "ui", "ux", "typescript", "react", "node",
  ];
  
  for (const keyword of techKeywords) {
    if (allText.includes(keyword)) {
      concepts.add(keyword);
    }
  }
  
  return Array.from(concepts).slice(0, 10);
}

// ============================================================================
// Archive Manager Implementation
// ============================================================================

/**
 * Create an archive manager for a project
 */
export function createArchiveManager(
  projectDir: string,
  memoryManager?: MemoryManager,
  defaultWorkflowId?: string,
  stateManager?: StateManager,
): ArchiveManager {
  const goopspecDir = getProjectGoopspecDir(projectDir);
  const archiveDir = join(goopspecDir, ARCHIVE_DIR);
  const quickDir = join(goopspecDir, QUICK_DIR);

  /**
   * Ensure archive directory exists
   */
  function ensureArchiveDir(): void {
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }
  }

  /**
   * Ensure quick directory exists
   */
  function ensureQuickDir(): void {
    if (!existsSync(quickDir)) {
      mkdirSync(quickDir, { recursive: true });
    }
  }

  /**
   * Archive a completed milestone/workflow
   *
   * Sources workflow documents from the workflow-scoped directory and
   * archives them to `.goopspec/archive/<workflowId>-<timestamp>/`.
   * For the "default" workflow, sources from `.goopspec/` root.
   * Non-default workflow directories are cleaned up after archival.
   */
  async function archiveMilestone(
    milestoneId: string,
    retrospective: string,
    archiveWorkflowId?: string,
  ): Promise<ArchiveEntry> {
    ensureArchiveDir();

    const effectiveWorkflowId = archiveWorkflowId ?? defaultWorkflowId ?? "default";

    // Source: workflow directory (Wave 2 path routing)
    const workflowDir = getWorkflowDir(projectDir, effectiveWorkflowId);

    // Archive destination: .goopspec/archive/<workflowId>-<timestamp>/
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const archiveId = `${effectiveWorkflowId}-${timestamp}`;
    const destPath = join(archiveDir, archiveId);

    // Verify the workflow directory has at least one doc file
    const hasAnyDoc = WORKFLOW_DOC_FILES.some((filename) =>
      existsSync(join(workflowDir, filename)),
    );
    if (!hasAnyDoc && !existsSync(workflowDir)) {
      throw new Error(`Workflow directory not found: ${effectiveWorkflowId}`);
    }

    // Read workflow documents for learnings extraction
    const specContent = safeReadFile(join(workflowDir, SPEC_FILE)) ?? "";
    const chronicleContent = safeReadFile(join(workflowDir, CHRONICLE_FILE)) ?? "";

    // Use provided retrospective or generate template
    const retrospectiveContent = retrospective || generateRetrospectiveTemplate(milestoneId || effectiveWorkflowId);

    // Extract learnings
    const learnings = extractLearnings(specContent, chronicleContent, retrospectiveContent);
    const learningsMarkdown = formatLearningsMarkdown(learnings);

    // Copy workflow docs to archive
    mkdirSync(destPath, { recursive: true });

    for (const filename of WORKFLOW_DOC_FILES) {
      const src = join(workflowDir, filename);
      const dst = join(destPath, filename);
      if (existsSync(src)) {
        try {
          renameSync(src, dst);
        } catch {
          // Cross-device fallback: copy instead of move
          writeFileSync(dst, readFileSync(src, "utf-8"), "utf-8");
        }
      }
    }

    // Also move checkpoints/ and history/ directories if they exist
    const dirsToArchive = ["checkpoints", "history"];
    for (const dir of dirsToArchive) {
      const srcDir = join(workflowDir, dir);
      const dstDir = join(destPath, dir);
      if (existsSync(srcDir)) {
        try {
          renameSync(srcDir, dstDir);
        } catch {
          // Cross-device: skip for now (non-critical)
          log(`Could not move directory ${dir} to archive (cross-device), skipping`);
        }
      }
    }

    // Write retrospective and learnings to archive destination
    const retrospectivePath = join(destPath, RETROSPECTIVE_FILE);
    const learningsPath = join(destPath, LEARNINGS_FILE);

    atomicWriteFile(retrospectivePath, retrospectiveContent);
    atomicWriteFile(learningsPath, learningsMarkdown);

    // Clean up: remove the workflow directory if it's not "default"
    // (don't remove root .goopspec/ for default workflow)
    if (effectiveWorkflowId !== "default" && existsSync(workflowDir)) {
      try {
        rmSync(workflowDir, { recursive: true, force: true });
        log(`Cleaned up workflow directory: ${workflowDir}`);
      } catch (error) {
        logError(`Failed to clean up workflow dir: ${workflowDir}`, error);
      }
    }

    // Remove the workflow entry from state.json (skip for "default")
    if (effectiveWorkflowId !== "default" && stateManager) {
      try {
        stateManager.removeWorkflow(effectiveWorkflowId);
        log(`Removed workflow entry from state: ${effectiveWorkflowId}`);
      } catch (error) {
        logError(`Failed to remove workflow entry from state: ${effectiveWorkflowId}`, error);
      }
    }

    log(`Archived workflow: ${effectiveWorkflowId}`, {
      archiveId,
      patterns: learnings.patterns.length,
      decisions: learnings.decisions.length,
      gotchas: learnings.gotchas.length,
    });

    // Update archive index
    generateArchiveIndex();

    const archivedAt = new Date().toISOString();

    return {
      id: archiveId,
      name: milestoneId || effectiveWorkflowId,
      archivedAt,
      retrospectivePath,
      learningsPath,
    };
  }

  /**
   * Archive a quick task
   */
  async function archiveQuickTask(taskName: string, summary: string): Promise<string> {
    ensureQuickDir();
    
    const taskNumber = getNextQuickTaskNumber(quickDir);
    const formattedNumber = formatQuickTaskNumber(taskNumber);
    const taskDirName = `${formattedNumber}-${taskName.toLowerCase().replace(/\s+/g, "-")}`;
    const taskPath = join(quickDir, taskDirName);
    
    // Create task directory
    mkdirSync(taskPath, { recursive: true });
    
    // Write summary
    const summaryPath = join(taskPath, SUMMARY_FILE);
    const timestamp = new Date().toISOString();
    
    const summaryContent = `# Quick Task: ${taskName}

**Completed:** ${timestamp}

## Summary

${summary}

---

*This task was completed in quick mode.*
`;
    
    atomicWriteFile(summaryPath, summaryContent);
    
    log(`Archived quick task: ${taskDirName}`);
    
    return taskPath;
  }

  /**
   * List all archived milestones
   */
  function listArchived(): ArchiveEntry[] {
    if (!existsSync(archiveDir)) {
      return [];
    }
    
    try {
      const entries = readdirSync(archiveDir);
      const archived: ArchiveEntry[] = [];
      
      for (const entry of entries) {
        if (entry === ARCHIVE_INDEX) {
          continue;
        }
        
        const entryPath = join(archiveDir, entry);
        const stats = statSync(entryPath);
        
        if (!stats.isDirectory()) {
          continue;
        }
        
        const retrospectivePath = join(entryPath, RETROSPECTIVE_FILE);
        const learningsPath = join(entryPath, LEARNINGS_FILE);
        
        // Get archived date from retrospective or directory mtime
        let archivedAt = stats.mtime.toISOString();
        const retrospectiveContent = safeReadFile(retrospectivePath);
        if (retrospectiveContent) {
          const dateMatch = retrospectiveContent.match(/\*\*Completed:\*\*\s+(.+)/);
          if (dateMatch) {
            archivedAt = dateMatch[1].trim();
          }
        }
        
        archived.push({
          id: entry,
          name: entry,
          archivedAt,
          retrospectivePath,
          learningsPath,
        });
      }
      
      // Sort by archived date (newest first)
      archived.sort((a, b) => {
        return new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime();
      });
      
      return archived;
    } catch (error) {
      logError("Failed to list archived milestones", error);
      return [];
    }
  }

  /**
   * Get a specific archived milestone
   */
  function getArchivedMilestone(id: string): ArchiveEntry | null {
    const archived = listArchived();
    return archived.find(a => a.id === id) || null;
  }

  /**
   * Generate archive index
   */
  function generateArchiveIndex(): string {
    ensureArchiveDir();
    
    const archived = listArchived();
    const timestamp = new Date().toISOString();
    
    let indexContent = `# Archive Index

**Last Updated:** ${timestamp}

This directory contains completed milestones with retrospectives and learnings.

## Archived Milestones

`;
    
    if (archived.length === 0) {
      indexContent += "*No archived milestones yet.*\n";
    } else {
      for (const entry of archived) {
        const date = new Date(entry.archivedAt).toLocaleDateString();
        indexContent += `### ${entry.name}\n\n`;
        indexContent += `- **Archived:** ${date}\n`;
        indexContent += `- **Retrospective:** [View](${basename(entry.retrospectivePath)})\n`;
        indexContent += `- **Learnings:** [View](${basename(entry.learningsPath)})\n\n`;
      }
    }
    
    indexContent += `---

*This index is automatically generated when milestones are archived.*
`;
    
    const indexPath = join(archiveDir, ARCHIVE_INDEX);
    atomicWriteFile(indexPath, indexContent);
    
    log("Generated archive index", { count: archived.length });
    
    return indexContent;
  }

  /**
   * Persist learnings to memory system
   */
  async function persistLearnings(milestoneId: string, learnings: ExtractedLearning): Promise<boolean> {
    const entry = getArchivedMilestone(milestoneId);
    if (!entry) {
      return false;
    }
    return persistLearningsToMemory(memoryManager, milestoneId, entry.name, learnings);
  }

  return {
    archiveMilestone,
    archiveQuickTask,
    listArchived,
    getArchivedMilestone,
    generateArchiveIndex,
    persistLearnings,
  };
}
