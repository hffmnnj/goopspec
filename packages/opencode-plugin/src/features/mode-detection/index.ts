/**
 * Task mode detection subsystem.
 *
 * Analyzes a user prompt and suggests the most appropriate task mode
 * (quick | standard | comprehensive | milestone) using data-driven
 * heuristics: keyword pattern matching, word-count thresholds, and
 * depth-hint detection.
 */

import type { TaskMode, WorkflowDepth } from "../../core/constants.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ModeDetectionResult {
	mode: TaskMode;
	confidence: number; // 0.0 - 1.0
	reasoning: string[];
	alternatives: TaskMode[];
}

export interface DetectorOptions {
	defaultMode?: TaskMode;
	depthHint?: WorkflowDepth;
}

// ---------------------------------------------------------------------------
// Heuristic signal definition
// ---------------------------------------------------------------------------

interface HeuristicSignal {
	pattern: RegExp;
	mode: TaskMode;
	weight: number; // 0.0 - 1.0
	label: string;
}

// ---------------------------------------------------------------------------
// Word-count thresholds (data-driven)
// ---------------------------------------------------------------------------

const WORD_COUNT_RULES: ReadonlyArray<{
	mode: TaskMode;
	min: number;
	max: number;
	weight: number;
}> = [
	{ mode: "quick", min: 0, max: 30, weight: 0.4 },
	{ mode: "standard", min: 30, max: 100, weight: 0.3 },
	{ mode: "comprehensive", min: 100, max: 300, weight: 0.5 },
	{ mode: "milestone", min: 200, max: Number.POSITIVE_INFINITY, weight: 0.6 },
];

// ---------------------------------------------------------------------------
// Pattern signals (data-driven)
// ---------------------------------------------------------------------------

const SIGNALS: readonly HeuristicSignal[] = [
	// Quick
	{
		pattern: /\b(fix|bug|quick|small|tweak|hotfix)\b/,
		mode: "quick",
		weight: 0.8,
		label: "Quick-fix keywords",
	},
	{
		pattern: /\b(single file|one file|just|only)\b/,
		mode: "quick",
		weight: 0.7,
		label: "Single-file scope",
	},
	{
		pattern: /\b(rename|update|change|modify)\s+(a|the|this)\s+\w+/,
		mode: "quick",
		weight: 0.6,
		label: "Simple modification",
	},
	{
		pattern: /\b(typo|spelling|formatting|indent|whitespace)\b/,
		mode: "quick",
		weight: 0.9,
		label: "Trivial change",
	},

	// Standard
	{
		pattern: /\b(feature|add|implement|create|build|develop)\b/,
		mode: "standard",
		weight: 0.6,
		label: "Feature keywords",
	},
	{
		pattern: /\b(component|endpoint|page|route|api|service|util)\b/,
		mode: "standard",
		weight: 0.5,
		label: "Component keywords",
	},
	{
		pattern: /\b(new|another|additional)\s+(feature|component|page)\b/,
		mode: "standard",
		weight: 0.7,
		label: "New feature",
	},
	{
		pattern: /\b(form|modal|button|card|list|table|chart)\b/,
		mode: "standard",
		weight: 0.5,
		label: "UI component",
	},
	{
		pattern: /\b(authentication|validation|error handling|logging)\b/,
		mode: "standard",
		weight: 0.6,
		label: "Standard feature pattern",
	},

	// Comprehensive
	{
		pattern: /\b(system|architecture|refactor|redesign|overhaul|rewrite)\b/,
		mode: "comprehensive",
		weight: 0.7,
		label: "System-level keywords",
	},
	{
		pattern: /\b(across|multiple|all|entire|throughout|everywhere)\b/,
		mode: "comprehensive",
		weight: 0.5,
		label: "Broad scope",
	},
	{
		pattern: /\b(migrate|upgrade|modernize|restructure)\b/,
		mode: "comprehensive",
		weight: 0.8,
		label: "Large-scale change",
	},
	{
		pattern: /\b(codebase|project|application)\s+(wide|level)\b/,
		mode: "comprehensive",
		weight: 0.9,
		label: "Project-wide scope",
	},
	{
		pattern: /\b(framework|library|dependency)\s+(change|switch|upgrade)\b/,
		mode: "comprehensive",
		weight: 0.8,
		label: "Major dependency change",
	},

	// Milestone
	{
		pattern: /\bv\d+(\.\d+)*\b/,
		mode: "milestone",
		weight: 0.9,
		label: "Version reference",
	},
	{
		pattern: /\b(release|milestone|version)\b/,
		mode: "milestone",
		weight: 0.9,
		label: "Release keywords",
	},
	{
		pattern: /\b(mvp|beta|alpha|launch|ship|deploy)\b/,
		mode: "milestone",
		weight: 1.0,
		label: "Launch keywords",
	},
	{
		pattern: /\b(roadmap|phases|stages|iterations)\b/,
		mode: "milestone",
		weight: 0.7,
		label: "Multi-phase keywords",
	},
	{
		pattern: /\b(quarter|q\d|sprint|epic)\b/,
		mode: "milestone",
		weight: 0.6,
		label: "Project management",
	},
	{
		pattern: /\b(production|prod|go-live|rollout)\b/,
		mode: "milestone",
		weight: 0.7,
		label: "Production deployment",
	},
	{
		pattern: /\b(core features|multiple features|several features)\b/,
		mode: "milestone",
		weight: 0.6,
		label: "Multi-feature scope",
	},
];

// ---------------------------------------------------------------------------
// Depth-hint detection
// ---------------------------------------------------------------------------

const DEPTH_PATTERNS: ReadonlyArray<{ pattern: RegExp; depth: WorkflowDepth }> =
	[
		{
			pattern: /\b(deep|in-depth|thorough|detailed|exhaustive|deep dive)\b/i,
			depth: "deep",
		},
		{
			pattern: /\b(shallow|brief|lightweight|minimal|surface)\b/i,
			depth: "shallow",
		},
	];

function detectDepthHint(text: string): WorkflowDepth | null {
	for (const { pattern, depth } of DEPTH_PATTERNS) {
		if (pattern.test(text)) return depth;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

const DEFAULT_MODE: TaskMode = "standard";

export function detectTaskMode(
	prompt: string,
	options?: DetectorOptions,
): ModeDetectionResult {
	const normalized = prompt.toLowerCase().trim();

	if (!normalized) {
		return {
			mode: options?.defaultMode ?? DEFAULT_MODE,
			confidence: 0,
			reasoning: [
				`Empty prompt; defaulted to ${options?.defaultMode ?? DEFAULT_MODE}`,
			],
			alternatives: [],
		};
	}

	const wordCount = normalized.split(/\s+/).length;

	const scores: Record<TaskMode, number> = {
		quick: 0,
		standard: 0,
		comprehensive: 0,
		milestone: 0,
	};

	const reasoning: string[] = [];

	// 1. Depth hint (explicit option or inferred from text)
	const depth = options?.depthHint ?? detectDepthHint(normalized);
	if (depth) {
		const boost =
			depth === "deep"
				? { mode: "comprehensive" as const, v: 1.0 }
				: depth === "shallow"
					? { mode: "quick" as const, v: 1.0 }
					: { mode: "standard" as const, v: 0.4 };
		scores[boost.mode] += boost.v;
		reasoning.push(`Depth hint "${depth}" boosts ${boost.mode}`);
	}

	// 2. Word-count heuristics
	for (const rule of WORD_COUNT_RULES) {
		if (wordCount >= rule.min && wordCount <= rule.max) {
			scores[rule.mode] += rule.weight;
			reasoning.push(`Word count (${wordCount}) matches ${rule.mode} range`);
		}
	}

	// 3. Pattern signals
	for (const signal of SIGNALS) {
		if (signal.pattern.test(normalized)) {
			scores[signal.mode] += signal.weight;
			reasoning.push(signal.label);
		}
	}

	// 4. Rank modes by score
	const ranked = (Object.keys(scores) as TaskMode[]).sort(
		(a, b) => scores[b] - scores[a],
	);

	const topMode = ranked[0];
	const topScore = scores[topMode];

	if (topScore === 0) {
		return {
			mode: options?.defaultMode ?? DEFAULT_MODE,
			confidence: 0,
			reasoning:
				reasoning.length > 0
					? reasoning
					: [
							`No signals matched; defaulted to ${options?.defaultMode ?? DEFAULT_MODE}`,
						],
			alternatives: [],
		};
	}

	const secondScore = scores[ranked[1]];

	// 5. Confidence: weighted blend of absolute score strength + margin
	const scoreConfidence = Math.min(topScore / 3.0, 1.0);
	const marginConfidence = Math.min((topScore - secondScore) / 1.0, 1.0);
	const confidence = Math.max(
		0,
		Math.min(1, scoreConfidence * 0.6 + marginConfidence * 0.4),
	);

	// 6. Alternatives within 0.2 of top score
	const alternatives = ranked
		.slice(1)
		.filter((m) => topScore - scores[m] <= 0.2);

	return {
		mode: topMode,
		confidence,
		reasoning,
		alternatives,
	};
}

// ---------------------------------------------------------------------------
// Convenience: should the caller prompt the user to confirm?
// ---------------------------------------------------------------------------

export function shouldPromptForMode(result: ModeDetectionResult): boolean {
	if (result.confidence < 0.6) return true;
	if (result.alternatives.length >= 2) return true;
	return false;
}
