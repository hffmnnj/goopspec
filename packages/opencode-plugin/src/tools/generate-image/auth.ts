/**
 * Credential path resolution for generate_image.
 *
 * Reading, normalization, expiry, refresh, and redaction are intentionally
 * absent here — they are handled by Task 1.2.
 *
 * Platform note: OpenCode uses xdg-basedir on Linux, macOS, AND Windows.
 * There is no ~/Library path and no %APPDATA% path. Do not add one.
 */

import { join } from "node:path";

import type { AuthSource } from "./types.js";

export interface ResolveAuthOptions {
  authFile?: string;
  env?: Record<string, string | undefined>;
  homeDir?: string;
  xdgDataHome?: string;
}

const ENV_VAR_NAME = "GOOPSPEC_IMAGE_AUTH_FILE";

function getXdgDataAuthPath(homeDir: string, xdgDataHome?: string): string {
  const base = xdgDataHome ?? join(homeDir, ".local", "share");
  return join(base, "opencode", "auth.json");
}

/**
 * Return the ordered candidate chain for locating a credential file.
 * Priority order: explicit arg, GOOPSPEC_IMAGE_AUTH_FILE env var,
 * $XDG_DATA_HOME/opencode/auth.json (or ~/.local/share fallback),
 * ~/.codex/auth.json, ~/.gpt-image/auth.json.
 * Inject homeDir/xdgDataHome to keep tests away from the real home directory.
 */
export function resolveAuthCandidates(options?: ResolveAuthOptions): AuthSource[] {
  const env = options?.env ?? process.env;
  const homeDir = options?.homeDir;
  const candidates: AuthSource[] = [];

  if (options?.authFile) {
    candidates.push({ kind: "explicit", path: options.authFile });
  }

  if (env[ENV_VAR_NAME]) {
    candidates.push({ kind: "env", path: env[ENV_VAR_NAME] });
  }

  if (homeDir) {
    candidates.push({ kind: "xdg", path: getXdgDataAuthPath(homeDir, options?.xdgDataHome) });
    candidates.push({ kind: "codex", path: join(homeDir, ".codex", "auth.json") });
    candidates.push({ kind: "gpt-image", path: join(homeDir, ".gpt-image", "auth.json") });
  }

  return candidates;
}
