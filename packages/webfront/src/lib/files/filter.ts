import type { FileEntry } from '$lib/api/types.js';

/**
 * Filter a (possibly nested) file tree by a case-insensitive name query.
 *
 * Behaviour:
 *  - An empty/whitespace query returns the tree unchanged.
 *  - A file is kept when its name contains the query.
 *  - A directory is kept when its own name matches OR it has at least one kept
 *    descendant; matching directories are returned with their matching subtree.
 *
 * NOTE (T7.1 seam): this is the baseline filter consumed by `FileTree.svelte`.
 * T7.2 owns this file's tests and may enhance the matching (e.g. fuzzy / path
 * matching) without changing the signature.
 */
export function filterTree(entries: FileEntry[], query: string): FileEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return filterEntries(entries, needle);
}

function filterEntries(entries: FileEntry[], needle: string): FileEntry[] {
  const result: FileEntry[] = [];

  for (const entry of entries) {
    const selfMatch = entry.name.toLowerCase().includes(needle);

    if (entry.type === 'file') {
      if (selfMatch) result.push(entry);
      continue;
    }

    const filteredChildren = entry.children ? filterEntries(entry.children, needle) : undefined;

    if (selfMatch) {
      result.push(entry);
    } else if (filteredChildren && filteredChildren.length > 0) {
      result.push({ ...entry, children: filteredChildren });
    }
  }

  return result;
}

/** Whether a query is "active" — i.e. it would actually narrow the tree. */
export function hasActiveQuery(query: string | undefined): boolean {
  return !!query && query.trim().length > 0;
}
