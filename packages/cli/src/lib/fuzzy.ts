import fuzzysort from "fuzzysort";
import type { ModelEntry } from "./models.js";

const MAX_RESULTS = 50;

export interface FuzzyResult {
  item: ModelEntry;
  score: number;
  /** The matched portion of the model name, highlighted with brackets. */
  highlight: string;
}

/**
 * Filter and rank models by a query string using fuzzysort.
 *
 * - Empty (or whitespace-only) query: returns all models in their original
 *   order, capped at MAX_RESULTS.
 * - Non-empty query: fuzzy-matches against both `name` and `id`, ranks by
 *   score, and returns up to MAX_RESULTS entries.
 *
 * Returns the bare ModelEntry list so callers can render directly. Use
 * {@link fuzzyRankModels} when score/highlight metadata is required.
 */
export function fuzzyFilterModels(models: ModelEntry[], query: string): ModelEntry[] {
  return fuzzyRankModels(models, query).map((result) => result.item);
}

/**
 * Like {@link fuzzyFilterModels} but returns ranked results carrying the
 * match score and a highlighted form of the matched name.
 */
export function fuzzyRankModels(models: ModelEntry[], query: string): FuzzyResult[] {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return models.slice(0, MAX_RESULTS).map((item) => ({
      item,
      score: 0,
      highlight: item.name,
    }));
  }

  const results = fuzzysort.go(trimmed, models, {
    keys: ["name", "id"],
    limit: MAX_RESULTS,
    threshold: 0,
  });

  return results.map((result) => {
    const nameMatch = result[0];
    const highlight = nameMatch?.target ? nameMatch.highlight("[", "]") : result.obj.name;

    return {
      item: result.obj,
      score: result.score,
      highlight,
    };
  });
}
