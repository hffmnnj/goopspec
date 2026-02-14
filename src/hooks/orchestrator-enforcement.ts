/**
 * Orchestrator Enforcement Hooks
 * Enforces GoopSpec workflow rules for the orchestrator agent
 * 
 * Enforcement Mechanisms:
 * - permission.ask: Deny file modifications for orchestrator on code files
 * - tool.execute.after: Inject direct task delegation guidance
 * 
 * @module hooks/orchestrator-enforcement
 */

import type { Part } from "@opencode-ai/sdk";
import type { PluginContext } from "../core/types.js";
import { log } from "../shared/logger.js";
import { basename, ensurePosixPath } from "../shared/platform.js";

// ============================================================================
// Types
// ============================================================================

interface PermissionInput {
  tool: string;
  sessionID: string;
  path?: string;
  paths?: string[];
  agent?: string;
}

interface PermissionOutput {
  status: "ask" | "deny" | "allow";
}

interface ToolExecuteAfterInput {
  tool: string;
  sessionID: string;
  callID: string;
}

interface ToolExecuteAfterOutput {
  title: string;
  output: string;
  metadata: unknown;
}

interface ChatMessageInput {
  sessionID: string;
  agent?: string;
  messageID?: string;
}

interface ChatMessageOutput {
  parts: Part[];
}

interface EnforcementConfig {
  /** Enable code blocking for orchestrator */
  codeBlockingEnabled: boolean;
  /** Enable delegation enforcement */
  delegationEnforcementEnabled: boolean;
  /** Enable research tool blocking */
  researchBlockingEnabled: boolean;
  /** Enable exploration nudges (non-blocking) */
  explorationNudgesEnabled: boolean;
  /** Paths that orchestrator CAN edit (e.g., planning files) */
  allowedPaths: string[];
  /** File extensions that are considered "code" */
  codeExtensions: string[];
  /** Implementation directories to protect */
  protectedDirs: string[];
}

export type BlockedToolCategory = "research" | "exploration";

export interface DelegationMapping {
  category: BlockedToolCategory;
  agent: string;
  guidance: string;
}

export type DetectedIntent = {
  type: "research" | "exploration" | null;
  pattern: string | null;
  confidence: "high" | "medium" | "low";
};

export interface FreeFormQuestionDetection {
  shouldEnforce: boolean;
  question: string | null;
  reason:
    | "short-question"
    | "yes-no"
    | "multi-choice"
    | "already-structured"
    | "rhetorical"
    | "contextual"
    | "none";
}

// Track blocked operations to inject guidance
interface BlockedOperation {
  tool: string;
  filePath: string;
  timestamp: number;
  sessionID: string;
}

interface BlockedResearchOperation {
  tool: string;
  category: BlockedToolCategory;
  timestamp: number;
  sessionID: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: EnforcementConfig = {
  codeBlockingEnabled: true,
  delegationEnforcementEnabled: true,
  researchBlockingEnabled: true,
  explorationNudgesEnabled: true,
  allowedPaths: [
    ".goopspec/",
    ".goopspec\\",
    "goopspec/",
    "SPEC.md",
    "BLUEPRINT.md",
    "CHRONICLE.md",
    "RESEARCH.md",
    "ADL.md",
    "README.md",
    "AGENTS.md",
    ".md",  // Allow all markdown
    ".json",  // Allow config files
    ".yaml",
    ".yml",
  ],
  codeExtensions: [
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".pyw",
    ".go",
    ".rs",
    ".java", ".kt", ".scala",
    ".c", ".cpp", ".cc", ".h", ".hpp",
    ".cs",
    ".rb",
    ".php",
    ".swift",
    ".vue", ".svelte",
  ],
  protectedDirs: [
    "src/", "src\\",
    "lib/", "lib\\",
    "app/", "app\\",
    "apps/", "apps\\",
    "packages/", "packages\\",
    "server/", "server\\",
    "client/", "client\\",
  ],
};

function resolveEnforcementConfig(level: PluginContext["config"]["enforcement"]): EnforcementConfig {
  if (level === "warn") {
    return {
      ...DEFAULT_CONFIG,
      codeBlockingEnabled: false,
      researchBlockingEnabled: false,
    };
  }

  return {
    ...DEFAULT_CONFIG,
  };
}

// Tools that require file permission
const FILE_TOOLS = ["edit", "mcp_edit", "write", "mcp_write"];

export const RESEARCH_TOOLS = [
  "exa_web_search_exa",
  "exa_company_research_exa",
  "exa_get_code_context_exa",
  "mcp_google_search",
  "google_search",
  "context7_resolve-library-id",
  "context7_query-docs",
  "mcp_context7_resolve-library-id",
  "mcp_context7_query-docs",
  "webfetch",
  "mcp_webfetch",
] as const;

export type ResearchTool = (typeof RESEARCH_TOOLS)[number];

export const EXPLORATION_TOOLS = [
  "mcp_grep",
  "mcp_glob",
  "grep",
  "glob",
] as const;

export type ExplorationTool = (typeof EXPLORATION_TOOLS)[number];

export const DELEGATION_MAPPINGS: Record<BlockedToolCategory, DelegationMapping> = {
  research: {
    category: "research",
    agent: "goop-researcher",
    guidance: "Research tasks should be delegated to goop-researcher",
  },
  exploration: {
    category: "exploration",
    agent: "goop-explorer",
    guidance: "Codebase exploration should be delegated to goop-explorer",
  },
};

export const RESEARCH_INTENT_PATTERNS = [
  /\bresearch\b/i,
  /\bcompare\b/i,
  /\bevaluate\b/i,
  /\binvestigate\b/i,
  /\bfind out about\b/i,
  /what is the best/i,
  /which library/i,
  /how does .+ compare/i,
  /\bpros and cons\b/i,
  /\brecommend\b/i,
] as const;

export const EXPLORATION_INTENT_PATTERNS = [
  /\bfind\b.*\b(where|file|function|class)\b/i,
  /where is\b/i,
  /how does .+ work/i,
  /\btrace\b/i,
  /\blocate\b/i,
  /what calls\b/i,
  /who uses\b/i,
  /show me .+ (code|implementation|file)/i,
  /\bwhere.*defined\b/i,
] as const;

const YES_NO_QUESTION_PATTERN = /^(should|can|could|would|will|do|does|did|is|are|was|were|have|has|had|am|may|might)\b/i;
const WH_QUESTION_PATTERN = /^(what|which|who|where|when|why|how)\b/i;
const MULTI_CHOICE_QUESTION_PATTERN = /(\bchoose\b|\bselect\b|\bprefer\b|\boption\b|\ba\)|\bb\)|\b1\)|\b2\)|\bor\b)/i;
const RHETORICAL_QUESTION_PATTERNS = [
  /^why this matters\??$/i,
  /^what this means\??$/i,
  /^who cares\??$/i,
  /^isn't it\??$/i,
  /^isnt it\??$/i,
] as const;
const CONTEXTUAL_QUESTION_PATTERNS = [
  /for example/i,
  /e\.g\./i,
  /i\.e\./i,
  /for instance/i,
  /in this section/i,
  /see (above|below)/i,
  /questions to consider/i,
] as const;

// Track blocked operations per session (for injection)
const blockedOperations = new Map<string, BlockedOperation>();

// Track blocked research operations per session (for guidance injection)
const blockedResearchOperations = new Map<string, BlockedResearchOperation>();

// Track exploration tool usage per session for pattern detection
interface ExplorationTracking {
  tools: string[];
  timestamps: number[];
  lastNudge: number;
}

const explorationTracking = new Map<string, ExplorationTracking>();

const EXPLORATION_THRESHOLD = 3;
const EXPLORATION_WINDOW_MS = 60000;
const NUDGE_COOLDOWN_MS = 120000;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file path is allowed for orchestrator to edit
 */
function isAllowedPath(filePath: string, config: EnforcementConfig): boolean {
  if (!filePath) return true;
  
  const normalizedPath = ensurePosixPath(filePath).toLowerCase();
  
  // Check if path contains any allowed patterns
  for (const allowed of config.allowedPaths) {
    const normalizedAllowed = ensurePosixPath(allowed).toLowerCase();
    if (normalizedPath.includes(normalizedAllowed)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a file is a code file based on extension
 */
function isCodeFile(filePath: string, config: EnforcementConfig): boolean {
  if (!filePath) return false;
  
  const lowerPath = filePath.toLowerCase();
  return config.codeExtensions.some(ext => lowerPath.endsWith(ext));
}

/**
 * Check if file is in a protected implementation directory
 */
function isInProtectedDir(filePath: string, config: EnforcementConfig): boolean {
  if (!filePath) return false;
  
  const normalizedPath = ensurePosixPath(filePath).toLowerCase();
  return config.protectedDirs.some(dir => {
    const normalizedDir = ensurePosixPath(dir).toLowerCase();
    return normalizedPath.includes(normalizedDir);
  });
}

/**
 * Check if current agent is the GoopSpec orchestrator
 * Exported for use in other hooks and tests
 */
export function isOrchestrator(agentName: string | undefined): boolean {
  if (!agentName) return false;
  
  const lower = agentName.toLowerCase();
  return lower === "goopspec" || 
         lower.includes("orchestrator") ||
         lower === "goop-orchestrator";
}

/**
 * Check if a tool is a blocked research/search tool
 */
export function isBlockedTool(toolName: string): boolean {
  return (RESEARCH_TOOLS as readonly string[]).includes(toolName);
}

/**
 * Get the category of a blocked tool
 */
export function getToolCategory(toolName: string): BlockedToolCategory | null {
  if ((RESEARCH_TOOLS as readonly string[]).includes(toolName)) {
    return "research";
  }
  if ((EXPLORATION_TOOLS as readonly string[]).includes(toolName)) {
    return "exploration";
  }
  return null;
}

/**
 * Detect research or exploration intent from a message
 */
export function detectIntent(message: string): DetectedIntent {
  for (const pattern of RESEARCH_INTENT_PATTERNS) {
    if (pattern.test(message)) {
      return {
        type: "research",
        pattern: pattern.source,
        confidence: message.length < 50 ? "high" : "medium",
      };
    }
  }

  for (const pattern of EXPLORATION_INTENT_PATTERNS) {
    if (pattern.test(message)) {
      return {
        type: "exploration",
        pattern: pattern.source,
        confidence: message.length < 50 ? "high" : "medium",
      };
    }
  }

  return { type: null, pattern: null, confidence: "low" };
}

function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, " ");
}

function normalizeQuestionText(value: string): string {
  return value
    .replace(/^[-*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuestionCandidates(text: string): string[] {
  const stripped = stripCodeBlocks(text);
  const matches = stripped.match(/[^?\n]{4,}\?/g) ?? [];
  return matches
    .map(normalizeQuestionText)
    .filter(candidate => candidate.length > 0);
}

function isAlreadyStructuredQuestion(text: string): boolean {
  return /\bmcp_question\b|\bquestion\s*\(|\boptions\s*:/i.test(text);
}

/**
 * Detect likely non-compliant short free-form questions.
 * Used to nudge orchestrator output toward mcp_question usage.
 */
export function detectFreeFormQuestion(text: string): FreeFormQuestionDetection {
  if (!text || text.trim().length === 0) {
    return { shouldEnforce: false, question: null, reason: "none" };
  }

  if (isAlreadyStructuredQuestion(text)) {
    return { shouldEnforce: false, question: null, reason: "already-structured" };
  }

  const candidates = extractQuestionCandidates(text);
  if (candidates.length === 0) {
    return { shouldEnforce: false, question: null, reason: "none" };
  }

  for (const candidate of candidates) {
    const wordCount = candidate.split(/\s+/).filter(Boolean).length;

    if (wordCount < 3 || wordCount > 24 || candidate.length > 160) {
      continue;
    }

    if (CONTEXTUAL_QUESTION_PATTERNS.some(pattern => pattern.test(candidate))) {
      return { shouldEnforce: false, question: candidate, reason: "contextual" };
    }

    if (RHETORICAL_QUESTION_PATTERNS.some(pattern => pattern.test(candidate))) {
      return { shouldEnforce: false, question: candidate, reason: "rhetorical" };
    }

    if (YES_NO_QUESTION_PATTERN.test(candidate)) {
      return { shouldEnforce: true, question: candidate, reason: "yes-no" };
    }

    if (MULTI_CHOICE_QUESTION_PATTERN.test(candidate)) {
      return { shouldEnforce: true, question: candidate, reason: "multi-choice" };
    }

    if (WH_QUESTION_PATTERN.test(candidate)) {
      return { shouldEnforce: true, question: candidate, reason: "short-question" };
    }
  }

  return { shouldEnforce: false, question: null, reason: "none" };
}

/**
 * Track exploration tool usage
 */
function trackExplorationTool(sessionId: string, toolName: string): void {
  const now = Date.now();
  let tracking = explorationTracking.get(sessionId);

  if (!tracking) {
    tracking = { tools: [], timestamps: [], lastNudge: 0 };
    explorationTracking.set(sessionId, tracking);
  }

  const windowStart = now - EXPLORATION_WINDOW_MS;
  const validIndices = tracking.timestamps
    .map((ts, i) => (ts > windowStart ? i : -1))
    .filter(i => i >= 0);

  tracking.tools = validIndices.map(i => tracking!.tools[i]);
  tracking.timestamps = validIndices.map(i => tracking!.timestamps[i]);

  tracking.tools.push(toolName);
  tracking.timestamps.push(now);
}

/**
 * Check if exploration pattern is detected
 */
function isExplorationPattern(sessionId: string): boolean {
  const tracking = explorationTracking.get(sessionId);
  if (!tracking) return false;

  const now = Date.now();
  if (now - tracking.lastNudge < NUDGE_COOLDOWN_MS) return false;

  return tracking.tools.length >= EXPLORATION_THRESHOLD;
}

/**
 * Mark that a nudge was shown
 */
function markNudgeShown(sessionId: string): void {
  const tracking = explorationTracking.get(sessionId);
  if (tracking) {
    tracking.lastNudge = Date.now();
    tracking.tools = [];
    tracking.timestamps = [];
  }
}

/**
 * Generate instructive message for blocked code operations
 */
function generateDelegationGuidance(toolName: string, filePath: string): string {
  return `

---

## 🎭 Orchestrator Reminder: Delegate Code Changes

You attempted to use \`${toolName}\` on \`${filePath}\`.

As the orchestrator, delegate implementation work to **the appropriate goop-executor-{tier}** (low/medium/high/frontend):

\`\`\`
task({
  subagent_type: "goop-executor-high",
  description: "Implement Task: update ${basename(filePath)}",
  prompt: \`
    ## Task Intent
    Implement the requested code change in ${filePath}.

    ## Expected Output
    Return a concise implementation summary, modified files, verification results, and handoff.

    ## Required Context
    - SPEC must-have(s): [e.g., MH2, MH3]
    - BLUEPRINT task: [e.g., Wave 1 Task 1.2]
    - Current wave/task state from .goopspec
    - Relevant memory search findings

    ## Constraints
    - Follow existing project conventions and ESM .js import rules
    - Keep changes atomic and scoped to the requested files
    - Preserve existing safeguards; do not remove enforcement protections

    ## Verification
    - Run targeted tests for touched modules
    - Report pass/fail evidence for each command
  \`
})
\`\`\`

**Why?** Your context is precious. Subagents have fresh 200k context for implementation.
`;
}

/**
 * Generate guidance for blocked research tool operations
 */
function generateResearchDelegationGuidance(
  toolName: string,
  category: BlockedToolCategory
): string {
  const mapping = DELEGATION_MAPPINGS[category];
  const categoryLabel = category === "research" ? "Research" : "Exploration";
  const description = category === "research" ? "Research task" : "Explore codebase";
  const promptBody = category === "research"
    ? `## Task Intent
    Research the requested topic and produce actionable recommendations.

    ## Expected Output
    Findings with sources, tradeoffs, and recommendation.

    ## Required Context
    - Related SPEC/BLUEPRINT scope
    - Relevant memory findings

    ## Constraints
    - Focus on the stated scope only
    - Cite concrete sources

    ## Verification
    - Include evidence links and confidence level`
    : `## Task Intent
    Explore the codebase to answer the request.

    ## Expected Output
    Relevant file paths, key code locations, and concise flow explanation.

    ## Required Context
    - Related SPEC/BLUEPRINT scope
    - Current wave/task

    ## Constraints
    - Prefer high-signal files first
    - Avoid speculative conclusions

    ## Verification
    - Reference exact files and symbols used as evidence`;

  return `

---

## 🎭 Orchestrator Reminder: Delegate ${categoryLabel} Tasks

You attempted to use \`${toolName}\` directly.

As the orchestrator, delegate ${category} work to **${mapping.agent}**:

\`\`\`
task({
  subagent_type: "${mapping.agent}",
  description: "${description}",
  prompt: \`
    ${promptBody}
  \`
})
\`\`\`

**Why?** ${mapping.guidance}. Subagents have specialized tools and fresh context.
`;
}

/**
 * Generate guidance for exploration tool delegation (future use)
 */
export function generateExplorationDelegationGuidance(toolName: string): string {
  const mapping = DELEGATION_MAPPINGS.exploration;

  return `

---

## 💡 Suggestion: Consider Delegating Exploration

You're using \`${toolName}\` for exploration.

For extensive codebase exploration, consider delegating to **${mapping.agent}**:

\`\`\`
task({
  subagent_type: "${mapping.agent}",
  description: "Explore codebase",
  prompt: \`
    Find: [What you're looking for]
    
    Return relevant file paths and code locations.
  \`
})
\`\`\`

This is a suggestion, not a block. Continue if this is a quick lookup.
`;
}

/**
 * Generate intent-based delegation suggestion
 */
export function generateIntentSuggestion(intent: DetectedIntent): string {
  if (!intent.type) return "";

  const mapping = DELEGATION_MAPPINGS[intent.type];
  const label = intent.type === "research" ? "Research" : "Exploration";
  const description = intent.type === "research" ? "Research task" : "Explore codebase";
  const promptLabel = intent.type === "research" ? "research" : "exploration";
  const confidenceNote = intent.confidence === "high"
    ? "**High confidence** — This strongly matches a delegation pattern."
    : "**Medium confidence** — Consider whether delegation is appropriate.";

  return `

---

## 💡 Detected ${label} Intent

Based on your message, this looks like a ${intent.type} task.

**Suggested delegation to ${mapping.agent}:**

\`\`\`
task({
  subagent_type: "${mapping.agent}",
  description: "${description}",
  prompt: \`
    ## Task Intent
    [Your specific ${promptLabel} request]

    ## Expected Output
    [What the subagent must return]

    ## Required Context
    - SPEC/BLUEPRINT references
    - Current wave/task
    - Relevant memory search findings

    ## Constraints
    - Scope boundaries and quality requirements

    ## Verification
    - Required checks/evidence to include
  \`
})
\`\`\`

${confidenceNote}
`;
}

/**
 * Generate guidance for short free-form question correction.
 */
export function generateQuestionToolGuidance(questionText: string): string {
  const normalizedQuestion = questionText.trim();

  return `

---

## 🧭 Structured Question Guidance

Detected a short free-form question:

> ${normalizedQuestion}

For short-answer interactions, prefer **\`mcp_question\`** with concise options and custom input.

\`\`\`
await mcp_question({
  header: "Quick Decision",
  question: "${normalizedQuestion}",
  options: [
    "Option 1",
    "Option 2",
    "Type your own answer"
  ]
});
\`\`\`

Use free-form prompts only when multi-paragraph detail is required.
`;
}

// ============================================================================
// Hook Factory
// ============================================================================

/**
 * Create orchestrator enforcement hooks
 * 
 * Returns hooks for:
 * - permission.ask: Deny code file permissions for orchestrator
 * - tool.execute.after: Inject delegation instructions
 */
export function createOrchestratorEnforcementHooks(ctx: PluginContext) {
  const config = resolveEnforcementConfig(ctx.config.enforcement);

  return {
    /**
     * permission.ask - Deny file modifications on code files for orchestrator
     * 
     * This hook can modify output.status to "deny" to block operations
     */
    "permission.ask": async (
      input: PermissionInput,
      output: PermissionOutput
    ): Promise<void> => {
      // Only enforce for orchestrator agent
      if (!isOrchestrator(input.agent)) {
        return;
      }

      // === RESEARCH TOOL BLOCKING ===
      if (config.researchBlockingEnabled && isBlockedTool(input.tool)) {
        const category = getToolCategory(input.tool);
        if (!category) {
          return;
        }
        
        log("Blocking research tool for orchestrator", {
          tool: input.tool,
          category,
          sessionID: input.sessionID,
          agent: input.agent,
        });
        
        // Store blocked operation for later guidance injection
        blockedResearchOperations.set(input.sessionID, {
          tool: input.tool,
          category,
          timestamp: Date.now(),
          sessionID: input.sessionID,
        });
        
        // Log to ADL
        ctx.stateManager.appendADL({
          timestamp: new Date().toISOString(),
          type: "deviation",
          description: "Orchestrator research tool blocked",
          action: `Denied ${input.tool}. Should delegate to ${DELEGATION_MAPPINGS[category].agent}.`,
          rule: 4,
          files: [],
        });
        
        // DENY the permission
        output.status = "deny";
        return;
      }

      // === EXISTING CODE FILE BLOCKING ===
      // Only check file modification tools
      if (!config.codeBlockingEnabled || !FILE_TOOLS.includes(input.tool)) {
        return;
      }
      
      // Get file path from input
      const filePath = input.path || input.paths?.[0];
      if (!filePath) {
        return;
      }
      
      // Check if this is a protected code file
      if (isCodeFile(filePath, config) && 
          !isAllowedPath(filePath, config) && 
          isInProtectedDir(filePath, config)) {
        
        log("Blocking code modification for orchestrator", {
          tool: input.tool,
          filePath,
          sessionID: input.sessionID,
          agent: input.agent,
        });
        
        // Store blocked operation for later injection
        blockedOperations.set(input.sessionID, {
          tool: input.tool,
          filePath,
          timestamp: Date.now(),
          sessionID: input.sessionID,
        });
        
        // Log to ADL
        ctx.stateManager.appendADL({
          timestamp: new Date().toISOString(),
          type: "deviation",
          description: "Orchestrator code modification blocked",
          action: `Denied ${input.tool} on ${filePath}. Should delegate to the appropriate executor tier.`,
          rule: 4,
          files: [filePath],
        });
        
        // DENY the permission
        output.status = "deny";
      }
    },

    /**
     * tool.execute.after - Inject delegation guidance
     */
    "tool.execute.after": async (
      input: ToolExecuteAfterInput,
      output: ToolExecuteAfterOutput
    ): Promise<void> => {
      // === Check for blocked operation and inject guidance ===
      const blocked = blockedOperations.get(input.sessionID);
      if (blocked && Date.now() - blocked.timestamp < 5000) {
        // Recent block - inject delegation guidance
        blockedOperations.delete(input.sessionID);
        
        // Append guidance to output
        output.output = (output.output || "") + generateDelegationGuidance(blocked.tool, blocked.filePath);
        
        log("Injected delegation guidance after blocked operation", {
          tool: blocked.tool,
          sessionID: input.sessionID,
        });
      }

      // === Check for blocked RESEARCH operation and inject guidance ===
      const blockedResearch = blockedResearchOperations.get(input.sessionID);
      if (blockedResearch && Date.now() - blockedResearch.timestamp < 5000) {
        blockedResearchOperations.delete(input.sessionID);

        output.output = (output.output || "") + generateResearchDelegationGuidance(
          blockedResearch.tool,
          blockedResearch.category
        );

        log("Injected research delegation guidance after blocked operation", {
          tool: blockedResearch.tool,
          category: blockedResearch.category,
          sessionID: input.sessionID,
        });
      }

      // === EXPLORATION PATTERN DETECTION ===
      if (config.explorationNudgesEnabled &&
          (EXPLORATION_TOOLS as readonly string[]).includes(input.tool)) {
        trackExplorationTool(input.sessionID, input.tool);

        if (isExplorationPattern(input.sessionID)) {
          markNudgeShown(input.sessionID);

          output.output = (output.output || "") + generateExplorationDelegationGuidance(input.tool);

          log("Injected exploration nudge after pattern detected", {
            tool: input.tool,
            sessionID: input.sessionID,
          });
        }
      }
      
      if (input.tool === "task" || input.tool === "mcp_task") {
        clearExplorationTracking(input.sessionID);
      }

      // === FREE-FORM SHORT QUESTION DETECTION ===
      const existingOutput = output.output || "";
      const questionDetection = detectFreeFormQuestion(existingOutput);
      if (questionDetection.shouldEnforce && questionDetection.question) {
        output.output = existingOutput + generateQuestionToolGuidance(questionDetection.question);

        log("Injected question-tool guidance for likely short free-form question", {
          tool: input.tool,
          sessionID: input.sessionID,
          reason: questionDetection.reason,
        });
      }
    },

    /**
     * chat.message - intentionally no-op to avoid output mutation
     */
    "chat.message": async (
      _input: ChatMessageInput,
      _output: ChatMessageOutput
    ): Promise<void> => {
      return;
    },
  };
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Check if there's a pending delegation that wasn't followed through
 */
export function hasPendingDelegation(sessionId: string): boolean {
  void sessionId;
  return false;
}

/**
 * Get pending delegation details
 */
export function getPendingDelegation(sessionId: string): undefined {
  void sessionId;
  return undefined;
}

/**
 * Clear pending delegation (for testing or manual cleanup)
 */
export function clearPendingDelegation(sessionId: string): void {
  void sessionId;
}

/**
 * Clear exploration tracking
 */
export function clearExplorationTracking(sessionId: string): void {
  explorationTracking.delete(sessionId);
}

/**
 * Check if code blocking would apply to a path
 * Exported for testing
 */
export function wouldBlockPath(filePath: string): boolean {
  const config = DEFAULT_CONFIG;
  return isCodeFile(filePath, config) && 
         !isAllowedPath(filePath, config) && 
         isInProtectedDir(filePath, config);
}
