/**
 * Intent classifier for task routing.
 *
 * Scores each routing category against a task description using
 * keyword/phrase matching with word-boundary awareness. Returns
 * the best-matching agent with confidence and reasoning.
 *
 * @module features/routing/classifier
 */

import type { AgentRole, ExecutorTier } from "../../core/constants.js";
import {
	DEFAULT_AGENT,
	DEFAULT_TIER,
	ROUTING_CATEGORIES,
	type RoutingCategory,
} from "./categories.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result of classifying a task description. */
export interface ClassificationResult {
	/** The winning agent role. */
	readonly agent: AgentRole;
	/** Executor tier (only present for executor-* agents). */
	readonly tier: ExecutorTier | undefined;
	/** Normalised confidence in [0, 1]. */
	readonly confidence: number;
	/** Human-readable explanation of why this agent was chosen. */
	readonly reason: string;
	/** The category label that won. */
	readonly category: string;
	/** Keywords/phrases that matched. */
	readonly matchedSignals: readonly string[];
}

/** Options for the classifier. */
export interface ClassifierOptions {
	/** Minimum confidence to accept a match (default 0.15). */
	readonly confidenceThreshold?: number;
}

// ---------------------------------------------------------------------------
// Internal scoring
// ---------------------------------------------------------------------------

interface CategoryScore {
	readonly category: RoutingCategory;
	readonly rawScore: number;
	readonly matchedSignals: string[];
	readonly antiMatches: number;
}

/**
 * Score a single category against the normalised (lowercased) task text.
 */
function scoreCategory(category: RoutingCategory, text: string): CategoryScore {
	const matchedSignals: string[] = [];
	let rawScore = 0;

	for (const signal of category.signals) {
		const words = signal.toLowerCase().split(/\s+/);

		if (words.length > 1) {
			// Multi-word: all words must appear in order (with possible gaps).
			const pattern = words
				.map((w) => `\\b${escapeRegex(w)}\\b`)
				.join("[\\s\\S]*?");
			if (new RegExp(pattern, "i").test(text)) {
				rawScore += words.length; // multi-word = higher weight
				matchedSignals.push(signal);
			}
		} else {
			// Single word: word-boundary match.
			if (new RegExp(`\\b${escapeRegex(words[0])}\\b`, "i").test(text)) {
				rawScore += 1;
				matchedSignals.push(signal);
			}
		}
	}

	// Apply category weight multiplier.
	rawScore *= category.weight ?? 1.0;

	// Penalise for anti-signal matches.
	let antiMatches = 0;
	if (category.antiSignals) {
		for (const anti of category.antiSignals) {
			const antiWords = anti.toLowerCase().split(/\s+/);
			if (antiWords.length > 1) {
				const pattern = antiWords
					.map((w) => `\\b${escapeRegex(w)}\\b`)
					.join("[\\s\\S]*?");
				if (new RegExp(pattern, "i").test(text)) {
					antiMatches++;
				}
			} else {
				if (new RegExp(`\\b${escapeRegex(antiWords[0])}\\b`, "i").test(text)) {
					antiMatches++;
				}
			}
		}
		// Each anti-match reduces score by 1.5 (stronger than a single-word match).
		rawScore = Math.max(0, rawScore - antiMatches * 1.5);
	}

	return { category, rawScore, matchedSignals, antiMatches };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a task description and return the best-matching agent.
 *
 * Algorithm:
 * 1. Normalise the description to lowercase.
 * 2. Score every routing category via keyword/phrase matching.
 * 3. Apply category weights and anti-signal penalties.
 * 4. Pick the highest-scoring category above the confidence threshold.
 * 5. Fall back to executor-high if nothing matches.
 */
export function classify(
	description: string,
	options: ClassifierOptions = {},
): ClassificationResult {
	const threshold = options.confidenceThreshold ?? 0.15;
	const text = description.toLowerCase();

	// Score all categories.
	const scores: CategoryScore[] = ROUTING_CATEGORIES.map((cat) =>
		scoreCategory(cat, text),
	);

	// Sort descending by raw score.
	scores.sort((a, b) => b.rawScore - a.rawScore);

	const best = scores[0];

	// Normalise confidence: a raw score of 4+ is considered fully confident.
	const confidence = best ? Math.min(best.rawScore / 4, 1.0) : 0;

	// If below threshold, fall back to default.
	if (!best || confidence < threshold) {
		return {
			agent: DEFAULT_AGENT,
			tier: DEFAULT_TIER,
			confidence: 0,
			reason:
				"No category matched with sufficient confidence; defaulting to executor-high.",
			category: "fallback",
			matchedSignals: [],
		};
	}

	const { category, matchedSignals } = best;

	return {
		agent: category.agent,
		tier: category.tier,
		confidence,
		reason: `Matched "${category.label}" category via signals: ${matchedSignals.join(", ")}.`,
		category: category.label,
		matchedSignals,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
