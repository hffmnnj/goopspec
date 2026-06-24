import type { FileEntry } from '$lib/api/types.js';

export type MatchMode = 'substring' | 'fuzzy';

export interface FilterOptions {
	/** Matching strategy. `substring` is case-insensitive containment; `fuzzy` is case-insensitive subsequence. */
	mode?: MatchMode;
	/**
	 * When a directory's own name matches, include all of its descendants
	 * rather than re-applying the filter to its children.
	 */
	keepDescendantsOfMatch?: boolean;
}

export interface FilterResult {
	/** The filtered top-level entries. */
	entries: FileEntry[];
	/** Total number of matching leaf files and explicitly matched directories. */
	matchCount: number;
	/** Whether the query matched anything. */
	hasMatches: boolean;
}

/**
 * Filter a (possibly nested) file tree by a case-insensitive name query.
 *
 * Behaviour:
 *  - An empty/whitespace query returns the tree unchanged.
 *  - A file is kept when its name matches the query.
 *  - A directory is kept when its own name matches OR it has at least one kept
 *    descendant; matching directories are returned with their matching subtree.
 *  - With `keepDescendantsOfMatch: true`, a matching directory is returned with
 *    its full (already-loaded) `children` preserved.
 */
export function filterTree(
	entries: FileEntry[],
	query: string,
	options: FilterOptions = {}
): FileEntry[] {
	const result = filterTreeWithStats(entries, query, options);
	return result.entries;
}

/**
 * Filter a tree and return statistics about the result in one pass.
 */
export function filterTreeWithStats(
	entries: FileEntry[],
	query: string,
	options: FilterOptions = {}
): FilterResult {
	const needle = query.trim().toLowerCase();
	if (!needle) {
		return {
			entries: entries,
			matchCount: countAll(entries),
			hasMatches: entries.length > 0
		};
	}

	const { entries: filtered, matchCount } = filterEntries(entries, needle, options);
	return { entries: filtered, matchCount, hasMatches: matchCount > 0 };
}

/** Whether the query matches any entry in the tree. */
export function hasMatches(entries: FileEntry[], query: string, options?: FilterOptions): boolean {
	return filterTreeWithStats(entries, query, options).hasMatches;
}

/** Count matching leaf files and explicitly matched directories. */
export function countMatches(
	entries: FileEntry[],
	query: string,
	options?: FilterOptions
): number {
	return filterTreeWithStats(entries, query, options).matchCount;
}

/** Whether a query is "active" — i.e. it would actually narrow the tree. */
export function hasActiveQuery(query: string | undefined): boolean {
	return !!query && query.trim().length > 0;
}

interface FilterPassResult {
	entries: FileEntry[];
	matchCount: number;
}

function filterEntries(
	entries: FileEntry[],
	needle: string,
	options: FilterOptions
): FilterPassResult {
	const result: FileEntry[] = [];
	let matchCount = 0;

	for (const entry of entries) {
		const selfMatch = matchesName(entry.name, needle, options.mode ?? 'substring');

		if (entry.type === 'file') {
			if (selfMatch) {
				result.push(entry);
				matchCount += 1;
			}
			continue;
		}

		if (selfMatch && options.keepDescendantsOfMatch) {
			// Keep the entire already-loaded subtree of a matching directory.
			result.push(entry);
			matchCount += 1 + countAll(entry.children);
			continue;
		}

		const filteredChildren = entry.children
			? filterEntries(entry.children, needle, options)
			: undefined;
		const childMatches = filteredChildren?.matchCount ?? 0;

		if (selfMatch) {
			// A matching directory still filters its children unless keepDescendantsOfMatch.
			const childrenToKeep =
				filteredChildren && filteredChildren.entries.length > 0
					? filteredChildren.entries
					: entry.children;
			result.push(childrenToKeep === entry.children ? entry : { ...entry, children: childrenToKeep });
			matchCount += 1 + childMatches;
		} else if (filteredChildren && filteredChildren.entries.length > 0) {
			result.push({ ...entry, children: filteredChildren.entries });
			matchCount += childMatches;
		}
	}

	return { entries: result, matchCount };
}

function matchesName(name: string, needle: string, mode: MatchMode): boolean {
	const haystack = name.toLowerCase();
	if (mode === 'substring') return haystack.includes(needle);
	return isSubsequence(needle, haystack);
}

function isSubsequence(needle: string, haystack: string): boolean {
	if (needle.length === 0) return true;
	let i = 0;
	for (const char of haystack) {
		if (char === needle[i]) {
			i += 1;
			if (i === needle.length) return true;
		}
	}
	return false;
}

function countAll(entries: FileEntry[] | undefined): number {
	if (!entries) return 0;
	let count = 0;
	for (const entry of entries) {
		if (entry.type === 'file') {
			count += 1;
		} else {
			count += 1 + countAll(entry.children);
		}
	}
	return count;
}
