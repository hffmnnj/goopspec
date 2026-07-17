/**
 * Routing category definitions for intent-based agent dispatch.
 *
 * Each category maps a set of intent signals (keywords, phrases, patterns)
 * to the agent role that should handle matching tasks. Categories are
 * data-driven tables — no if/else walls.
 *
 * @module features/routing/categories
 */

import type { AgentRole, ExecutorTier } from "../../core/constants.js";

// ---------------------------------------------------------------------------
// Category definition
// ---------------------------------------------------------------------------

/**
 * A routing category describes a class of task intent and the agent
 * that should handle it.
 */
export interface RoutingCategory {
  /** Human-readable label for this category. */
  readonly label: string;
  /** The agent role dispatched to when this category wins. */
  readonly agent: AgentRole;
  /** Executor tier (only set for executor-* agents). */
  readonly tier?: ExecutorTier;
  /**
   * Single-word or multi-word signals that indicate this category.
   * Multi-word phrases get higher weight (more specific).
   * All matching is case-insensitive with word-boundary awareness.
   */
  readonly signals: readonly string[];
  /**
   * Negative signals — if any of these match, this category is penalised.
   * Useful for disambiguating overlapping keywords.
   */
  readonly antiSignals?: readonly string[];
  /** Base weight multiplier for this category (default 1.0). */
  readonly weight?: number;
}

// ---------------------------------------------------------------------------
// Specialist categories (non-executor agents)
// ---------------------------------------------------------------------------

const RESEARCHER: RoutingCategory = {
  label: "research",
  agent: "researcher",
  signals: [
    "research",
    "investigate options",
    "investigate and compare",
    "explore options",
    "compare alternatives",
    "compare providers",
    "compare approaches",
    "compare libraries",
    "compare frameworks",
    "compare tools",
    "evaluate approaches",
    "analyze tradeoffs",
    "trade-off analysis",
    "pros and cons",
    "which library",
    "which framework",
    "best approach",
    "feasibility study",
    "spike",
    "proof of concept",
    "poc",
  ],
  antiSignals: ["search codebase", "find file", "locate"],
  weight: 1.2,
};

const EXPLORER: RoutingCategory = {
  label: "explore",
  agent: "explorer",
  signals: [
    "find file",
    "find files",
    "locate",
    "search codebase",
    "map codebase",
    "trace code",
    "trace flow",
    "find usages",
    "who calls",
    "where is",
    "where defined",
    "how does",
    "code path",
    "call graph",
    "dependency graph",
  ],
  antiSignals: ["research", "compare"],
};

const DEBUGGER: RoutingCategory = {
  label: "debug",
  agent: "debugger",
  signals: [
    "debug",
    "fix bug",
    "fix error",
    "fix crash",
    "fix failing",
    "fix issue",
    "troubleshoot",
    "root cause",
    "why failing",
    "why broken",
    "why is it",
    "stack trace",
    "error message",
    "not working",
    "broken",
    "crash",
    "failing test",
    "regression",
    "investigate error",
    "investigate bug",
    "diagnose",
  ],
  weight: 1.2,
};

const TESTER: RoutingCategory = {
  label: "test",
  agent: "tester",
  signals: [
    "write test",
    "write tests",
    "add test",
    "add tests",
    "test coverage",
    "improve coverage",
    "unit test",
    "unit tests",
    "integration test",
    "integration tests",
    "e2e test",
    "e2e tests",
    "end-to-end test",
    "end-to-end tests",
    "test suite",
    "test plan",
    "snapshot test",
    "test harness",
    "mock",
    "assertion",
  ],
  antiSignals: ["implement", "build", "create feature"],
};

const WRITER: RoutingCategory = {
  label: "docs",
  agent: "writer",
  signals: [
    "write docs",
    "write documentation",
    "document",
    "readme",
    "api docs",
    "jsdoc",
    "tsdoc",
    "write guide",
    "changelog",
    "migration guide",
    "explain",
    "write tutorial",
  ],
  antiSignals: ["implement", "build", "code"],
};

const VERIFIER: RoutingCategory = {
  label: "verify",
  agent: "verifier",
  signals: [
    "verify",
    "audit",
    "validate",
    "compliance",
    "check spec",
    "check requirements",
    "security audit",
    "code review",
    "review code",
    "acceptance check",
    "quality gate",
  ],
};

const PLANNER: RoutingCategory = {
  label: "plan",
  agent: "planner",
  signals: [
    "plan",
    "architect",
    "design system",
    "blueprint",
    "task breakdown",
    "decompose",
    "wave structure",
    "roadmap",
    "strategy",
    "scope",
    "requirements",
    "specification",
  ],
  antiSignals: ["implement", "build", "write code", "test plan"],
};

// ---------------------------------------------------------------------------
// Executor categories (tiered by complexity)
// ---------------------------------------------------------------------------

const EXECUTOR_LOW: RoutingCategory = {
  label: "executor-low",
  agent: "executor-low",
  tier: "low",
  signals: [
    "scaffold",
    "boilerplate",
    "rename file",
    "rename files",
    "move file",
    "move files",
    "delete file",
    "delete files",
    "update config",
    "update configuration",
    "add dependency",
    "add dependencies",
    "install package",
    "update package",
    "bump version",
    "copy template",
    "create directory",
    "create directories",
    "gitignore",
    "env file",
    "dotfile",
  ],
};

const EXECUTOR_MEDIUM: RoutingCategory = {
  label: "executor-medium",
  agent: "executor-medium",
  tier: "medium",
  signals: [
    "business logic",
    "utility function",
    "helper function",
    "shared helper",
    "middleware",
    "data mapping",
    "data normalization",
    "refactor",
    "extract function",
    "extract module",
    "clean up",
    "simplify",
    "reduce duplication",
    "add validation",
    "add error handling",
    "type safety",
    "update tests",
    "fix tests",
    "maintenance",
    "small feature",
  ],
};

const EXECUTOR_HIGH: RoutingCategory = {
  label: "executor-high",
  agent: "executor-high",
  tier: "high",
  signals: [
    "implement",
    "build",
    "create feature",
    "add feature",
    "api endpoint",
    "api route",
    "database schema",
    "migration",
    "authentication",
    "authorization",
    "security",
    "encryption",
    "algorithm",
    "performance",
    "optimize",
    "architecture",
    "system design",
    "complex logic",
    "state machine",
    "event system",
    "plugin system",
    "sdk integration",
    "write code",
    "modify code",
  ],
  weight: 0.9,
};

const EXECUTOR_FRONTEND_LOW: RoutingCategory = {
  label: "executor-frontend-low",
  agent: "executor-frontend-low",
  tier: "frontend-low",
  signals: [
    "fix styling",
    "fix style",
    "update css",
    "update styles",
    "change color",
    "change font",
    "adjust spacing",
    "adjust padding",
    "adjust margin",
    "tweak ui",
    "tweak layout",
    "responsive fix",
    "icon swap",
    "text change",
    "copy change",
    "simple ui",
    "minor ui",
  ],
};

const EXECUTOR_FRONTEND_MEDIUM: RoutingCategory = {
  label: "executor-frontend-medium",
  agent: "executor-frontend-medium",
  tier: "frontend-medium",
  signals: [
    "wire component",
    "moderate ui refactor",
    "connect component to state",
    "standard component work",
    "build component",
    "component logic",
    "form component",
    "list component",
    "hook up component",
    "integrate component",
    "ui refactor",
    "component tests",
    "prop drilling",
    "lift state",
    "shared ui helper",
  ],
  antiSignals: ["design system", "complex form", "animation", "ux architecture"],
};

const EXECUTOR_FRONTEND_HIGH: RoutingCategory = {
  label: "executor-frontend-high",
  agent: "executor-frontend-high",
  tier: "frontend-high",
  signals: [
    "component",
    "ui component",
    "design system",
    "accessibility",
    "a11y",
    "ux architecture",
    "interactive",
    "animation",
    "transition",
    "form validation",
    "complex form",
    "data visualization",
    "chart",
    "dashboard",
    "layout system",
    "responsive design",
    "theme",
    "dark mode",
    "drag and drop",
    "virtualized list",
    "infinite scroll",
  ],
  antiSignals: ["fix styling", "tweak", "simple ui"],
};

// ---------------------------------------------------------------------------
// All categories in priority order (specialists first, then executors)
// ---------------------------------------------------------------------------

/**
 * All routing categories, ordered by evaluation priority.
 *
 * Specialists are checked first because their signals are more specific.
 * Among executors, frontend categories are checked before general ones
 * to avoid frontend tasks falling through to generic executor-high.
 */
export const ROUTING_CATEGORIES: readonly RoutingCategory[] = [
  // Specialists (high-specificity signals)
  RESEARCHER,
  DEBUGGER,
  EXPLORER,
  TESTER,
  WRITER,
  VERIFIER,
  PLANNER,
  // Frontend executors (before general executors)
  EXECUTOR_FRONTEND_HIGH,
  EXECUTOR_FRONTEND_MEDIUM,
  EXECUTOR_FRONTEND_LOW,
  // General executors (low → medium → high, high is the fallback)
  EXECUTOR_LOW,
  EXECUTOR_MEDIUM,
  EXECUTOR_HIGH,
] as const;

/**
 * The default agent role used when no category matches with sufficient
 * confidence. Falls through to executor-high as the most capable generalist.
 */
export const DEFAULT_AGENT: AgentRole = "executor-high";

/**
 * Default executor tier for the fallback agent.
 */
export const DEFAULT_TIER: ExecutorTier = "high";
