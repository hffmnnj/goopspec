import { describe, it, expect } from 'bun:test';
import {
	filterTree,
	hasMatches,
	countMatches,
	hasActiveQuery,
	type FilterOptions
} from './filter.js';
import type { FileEntry } from '$lib/api/types.js';

const tree: FileEntry[] = [
	{
		name: 'src',
		path: 'src',
		type: 'directory',
		children: [
			{
				name: 'lib',
				path: 'src/lib',
				type: 'directory',
				children: [
					{ name: 'utils.ts', path: 'src/lib/utils.ts', type: 'file' },
					{ name: 'helpers.js', path: 'src/lib/helpers.js', type: 'file' }
				]
			},
			{ name: 'app.ts', path: 'src/app.ts', type: 'file' }
		]
	},
	{
		name: 'README.md',
		path: 'README.md',
		type: 'file'
	}
];

const emptyTree: FileEntry[] = [];

describe('filterTree', () => {
	it('returns all entries for an empty query', () => {
		expect(filterTree(tree, '')).toEqual(tree);
		expect(filterTree(tree, '   ')).toEqual(tree);
	});

	it('matches filenames case-insensitively', () => {
		const result = filterTree(tree, 'UTILS');
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('src');
		expect(result[0].type).toBe('directory');
		expect(result[0].children?.[0].name).toBe('lib');
		expect(result[0].children?.[0].children?.[0].name).toBe('utils.ts');
	});

	it('keeps ancestor directories of matching files', () => {
		const result = filterTree(tree, 'helpers');
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('src');
		expect(result[0].children?.[0].name).toBe('lib');
		expect(result[0].children?.[0].children?.map((c) => c.name)).toEqual(['helpers.js']);
	});

	it('matches directory names and preserves their subtree', () => {
		const result = filterTree(tree, 'lib');
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('src');
		expect(result[0].children?.[0].name).toBe('lib');
		expect(result[0].children?.[0].children?.map((c) => c.name)).toEqual([
			'utils.ts',
			'helpers.js'
		]);
	});

	it('handles deeply nested matches', () => {
		const result = filterTree(tree, 'app');
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('src');
		expect(result[0].children?.map((c) => c.name)).toContain('app.ts');
	});

	it('returns an empty array when nothing matches', () => {
		expect(filterTree(tree, 'xyz')).toEqual([]);
		expect(filterTree(emptyTree, 'file')).toEqual([]);
	});

	it('matches at the top level', () => {
		const result = filterTree(tree, 'readme');
		expect(result.map((e) => e.name)).toEqual(['README.md']);
	});

	it('ignores path and only matches name', () => {
		// Query matches path segment but not name -> no result.
		expect(filterTree(tree, 'src/lib')).toEqual([]);
	});

	it('does not mutate original entries', () => {
		const original = JSON.parse(JSON.stringify(tree));
		filterTree(tree, 'utils');
		expect(tree).toEqual(original);
	});
});

describe('fuzzy matching', () => {
	const options: FilterOptions = { mode: 'fuzzy' };

	it('matches subsequences in names', () => {
		const result = filterTree(tree, 'utl', options);
		expect(result).toHaveLength(1);
		expect(result[0].children?.[0].children?.[0].name).toBe('utils.ts');
	});

	it('does not match non-subsequences', () => {
		expect(filterTree(tree, 'tzu', options)).toEqual([]);
	});

	it('still preserves ancestors for fuzzy matches', () => {
		const result = filterTree(tree, 'hlprs', options);
		expect(result[0].children?.[0].children?.map((c) => c.name)).toEqual(['helpers.js']);
	});
});

describe('keepDescendantsOfMatch option', () => {
	it('keeps all descendants when a directory name matches', () => {
		const result = filterTree(tree, 'lib', { keepDescendantsOfMatch: true });
		expect(result[0].children?.[0].children?.map((c) => c.name)).toEqual([
			'utils.ts',
			'helpers.js'
		]);
	});

	it('still filters children when only a descendant matches', () => {
		const result = filterTree(tree, 'utils', { keepDescendantsOfMatch: true });
		expect(result[0].children?.[0].children?.map((c) => c.name)).toEqual(['utils.ts']);
	});
});

describe('hasMatches', () => {
	it('returns true when a match exists', () => {
		expect(hasMatches(tree, 'utils')).toBe(true);
	});

	it('returns false when no match exists', () => {
		expect(hasMatches(tree, 'nope')).toBe(false);
	});

	it('returns true for any non-empty tree with empty query', () => {
		expect(hasMatches(tree, '')).toBe(true);
	});

	it('returns false for empty tree even with empty query', () => {
		expect(hasMatches(emptyTree, '')).toBe(false);
	});
});

describe('countMatches', () => {
	it('counts matching directories plus their matching descendants', () => {
		// 'lib' matches only the directory itself; children do not match 'lib'.
		expect(countMatches(tree, 'lib')).toBe(1);
	});

	it('counts matching files without counting ancestor directories', () => {
		// 'utils' matches one file; ancestors are not counted.
		expect(countMatches(tree, 'utils')).toBe(1);
	});

	it('returns 0 when nothing matches', () => {
		expect(countMatches(tree, 'nope')).toBe(0);
	});

	it('counts all entries for empty query', () => {
		// src dir, lib dir, utils.ts, helpers.js, app.ts, README.md = 6
		expect(countMatches(tree, '')).toBe(6);
	});

	it('counts all descendants of a matching directory with keepDescendantsOfMatch', () => {
		// 'lib' matches the directory, plus both files under it.
		expect(countMatches(tree, 'lib', { keepDescendantsOfMatch: true })).toBe(3);
	});
});

describe('hasActiveQuery', () => {
	it('returns false for empty or whitespace-only queries', () => {
		expect(hasActiveQuery('')).toBe(false);
		expect(hasActiveQuery('   ')).toBe(false);
		expect(hasActiveQuery(undefined)).toBe(false);
	});

	it('returns true for non-empty queries', () => {
		expect(hasActiveQuery('a')).toBe(true);
		expect(hasActiveQuery(' search ')).toBe(true);
	});
});
