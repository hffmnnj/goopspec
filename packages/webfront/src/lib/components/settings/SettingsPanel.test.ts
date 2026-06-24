import { afterEach, describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { copyStartServerCommand, getStartServerCommand } from './server-command.js';

const settingsPanelSource = readFileSync(new URL('./SettingsPanel.svelte', import.meta.url), 'utf8');

describe('SettingsPanel server command helper', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).navigator;
  });

  it('renders the Start Server copy-command section', () => {
    expect(settingsPanelSource).toContain('Start Server');
    expect(settingsPanelSource).toContain('Run this command to start the OpenCode server:');
    expect(settingsPanelSource).toContain('aria-label="Copy start server command"');
  });

  it('includes the configured server URL port in the command', () => {
    expect(settingsPanelSource).toContain('Port: {serverPort}');
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
