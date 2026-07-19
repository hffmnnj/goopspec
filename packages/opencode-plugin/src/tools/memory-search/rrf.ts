import type {
  CrossStoreSearchResult,
  FieldNoteSearchResult,
  MemorySearchResult,
} from "../../core/types.js";

const RRF_K = 60;

/**
 * Merge independently ranked memory and Field Note results without comparing
 * their incompatible native score scales.
 */
export function fuseSearchResults(
  memories: MemorySearchResult[],
  fieldNotes: FieldNoteSearchResult[],
): CrossStoreSearchResult[] {
  const results: CrossStoreSearchResult[] = [];

  for (const [index, result] of memories.entries()) {
    results.push({
      origin: "memory",
      entry: result.memory,
      score: 1 / (RRF_K + index + 1),
    });
  }

  for (const [index, note] of fieldNotes.entries()) {
    results.push({
      origin: "field_note",
      entry: note,
      score: 1 / (RRF_K + index + 1),
    });
  }

  return results.sort((left, right) => right.score - left.score);
}
