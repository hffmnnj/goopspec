const DEFAULT_SERVER_PORT = '4096';

export function getServerPort(serverUrl: string): string {
  try {
    const parsed = new URL(serverUrl);
    if (parsed.port) return parsed.port;
    if (parsed.protocol === 'http:') return '80';
    if (parsed.protocol === 'https:') return '443';
  } catch {
    // Fall through to the OpenCode default when the draft URL is invalid.
  }

  return DEFAULT_SERVER_PORT;
}

export function getStartServerCommand(serverUrl: string): string {
  return `opencode serve --port ${getServerPort(serverUrl)}`;
}

export async function copyStartServerCommand(serverUrl: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('Clipboard is not available');
  }

  await navigator.clipboard.writeText(getStartServerCommand(serverUrl));
}
