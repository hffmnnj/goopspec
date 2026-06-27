import { describe, expect, it } from 'bun:test';
// Svelte components can't be rendered in bun:test without heavy DOM setup, so we
// test the pure settings-parsing logic the voice section relies on. Relative
// import is used because bun has no $lib alias for value imports.
import { parseSettings } from '../../../lib/stores/settings.svelte.js';

describe('voice section settings parsing', () => {
  it('defaults voiceTtsEnabled to false', () => {
    const s = parseSettings({});
    expect(s.voiceTtsEnabled).toBe(false);
  });

  it('defaults voiceSttModel to tiny', () => {
    const s = parseSettings({});
    expect(s.voiceSttModel).toBe('tiny');
  });

  it('preserves valid voiceSttModel from storage', () => {
    expect(parseSettings({ voiceSttModel: 'base' }).voiceSttModel).toBe('base');
    expect(parseSettings({ voiceSttModel: 'tiny' }).voiceSttModel).toBe('tiny');
    expect(parseSettings({ voiceSttModel: 'invalid' }).voiceSttModel).toBe('tiny');
  });

  it('preserves boolean voiceTtsEnabled', () => {
    expect(parseSettings({ voiceTtsEnabled: true }).voiceTtsEnabled).toBe(true);
    expect(parseSettings({ voiceTtsEnabled: false }).voiceTtsEnabled).toBe(false);
    expect(parseSettings({ voiceTtsEnabled: 'yes' }).voiceTtsEnabled).toBe(false);
  });

  it('defaults voiceShortcut to mod+m', () => {
    expect(parseSettings({}).voiceShortcut).toBe('mod+m');
  });

  it('preserves a custom voiceShortcut from storage', () => {
    expect(parseSettings({ voiceShortcut: 'mod+shift+v' }).voiceShortcut).toBe('mod+shift+v');
  });
});
