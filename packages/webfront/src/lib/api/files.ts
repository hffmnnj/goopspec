import type { FileEntry, OpenCodeClient } from './types.js';

/** Read the textual contents of a single workspace file. */
export async function readFile(client: OpenCodeClient, path: string): Promise<string> {
  return client.readFile(path);
}

/**
 * List the immediate children of a directory. Entries arrive already
 * normalized and sorted (directories first, then alphabetical) by the adapter.
 */
export async function listDirectory(client: OpenCodeClient, path: string): Promise<FileEntry[]> {
  return client.listDirectory(path);
}

/** Map a filename to a coarse file-type bucket used for icon selection. */
export type FileKind =
  | 'directory'
  | 'code'
  | 'image'
  | 'text';

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'svelte', 'vue', 'json', 'jsonc',
  'css', 'scss', 'less', 'html', 'htm', 'py', 'rs', 'go', 'rb', 'java', 'kt',
  'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'swift', 'sh', 'bash', 'zsh', 'sql',
  'yml', 'yaml', 'toml', 'xml', 'graphql', 'gql', 'dart', 'lua', 'r'
]);

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp'
]);

/** Lowercased extension without the dot, or '' when there is none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function fileKind(entry: Pick<FileEntry, 'name' | 'type'>): FileKind {
  if (entry.type === 'directory') return 'directory';
  const ext = extensionOf(entry.name);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  return 'text';
}
