import { afterEach, describe, expect, it, mock } from 'bun:test';
import { copyStartServerCommand, getStartServerCommand } from './server-command.js';

describe('server-command helpers', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).navigator;
  });

  it('includes the configured server URL port in the command', () => {
    expect(getStartServerCommand('http://localhost:5222')).toBe('opencode serve --port 5222');
  });

  it('copies the parameterized command to the clipboard', async () => {
    const writeText = mock(() => Promise.resolve());
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: { clipboard: { writeText } },
    });
    await copyStartServerCommand('http://localhost:5222');
    expect(writeText).toHaveBeenCalledWith('opencode serve --port 5222');
  });
});
