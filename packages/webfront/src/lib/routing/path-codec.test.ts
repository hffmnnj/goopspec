import { describe, expect, it } from 'bun:test';
import { decodeProjectPath, encodeProjectPath } from './path-codec.js';

describe('project path base64url codec', () => {
  it('round-trips filesystem paths', () => {
    const path = '/home/james/Documents/goopspec';

    expect(decodeProjectPath(encodeProjectPath(path))).toBe(path);
  });

  it('emits URL-safe unpadded segments', () => {
    const encoded = encodeProjectPath('/tmp/path/with spaces/+symbols=');

    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('handles unicode paths correctly', () => {
    const path = '/Users/佐藤/プロジェクト/🚀';

    expect(decodeProjectPath(encodeProjectPath(path))).toBe(path);
  });

  it('decodes the documented OpenCode-style example', () => {
    expect(decodeProjectPath('L2hvbWUvamFtZXMvRG9jdW1lbnRzL2dvb3BzcGVj')).toBe(
      '/home/james/Documents/goopspec'
    );
  });

  it('rejects invalid input cleanly', () => {
    expect(() => decodeProjectPath('not+url/safe=')).toThrow(TypeError);
    expect(() => decodeProjectPath('a')).toThrow(TypeError);
  });
});
