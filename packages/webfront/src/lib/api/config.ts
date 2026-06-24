export const DEFAULT_SERVER_URL = 'http://localhost:4096';

const STORAGE_KEY = 'goopspec-server-url';

function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function getStoredServerUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeServerUrl(stored) : undefined;
  } catch {
    return undefined;
  }
}

export function getServerUrl(): string {
  const stored = getStoredServerUrl();
  if (stored) return stored;

  const envUrl = import.meta.env.VITE_OPENCODE_SERVER_URL as string | undefined;
  if (envUrl?.trim()) return normalizeServerUrl(envUrl);

  return DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string): void {
  const normalized = normalizeServerUrl(url);
  if (!normalized) {
    throw new Error('Server URL cannot be empty');
  }

  try {
    new URL(normalized);
  } catch {
    throw new Error(`Invalid server URL: ${url}`);
  }

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // Ignore storage failures so private browsing and locked-down browsers can still connect.
  }
}
