/**
 * Credential path resolution for generate_image.
 *
 * Platform note: OpenCode uses xdg-basedir on Linux, macOS, AND Windows.
 * There is no ~/Library path and no %APPDATA% path. Do not add one.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { EXPIRY_MARGIN_MS, OAUTH_CLIENT_ID, OAUTH_TOKEN_ENDPOINT } from "./constants.js";
import type { AuthSource, NormalizedCredential } from "./types.js";

export interface ResolveAuthOptions {
  authFile?: string;
  env?: Record<string, string | undefined>;
  homeDir?: string;
  xdgDataHome?: string;
}

export interface ReadCredentialOptions extends ResolveAuthOptions {
  /** Allow a one-invocation refresh when the stored access token is stale. */
  allowRefresh?: boolean;
}

export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

const ENV_VAR_NAME = "GOOPSPEC_IMAGE_AUTH_FILE";

function getXdgDataAuthPath(homeDir: string, xdgDataHome?: string): string {
  const base = xdgDataHome ?? join(homeDir, ".local", "share");
  return join(base, "opencode", "auth.json");
}

/**
 * A caller-supplied `env` always wins. `process.env` is consulted only when no
 * `homeDir` was injected, because an injected home means resolution is being
 * sandboxed and an ambient XDG_DATA_HOME would redirect the chain back at the
 * real user home. An explicit `xdgDataHome` still applies either way.
 */
function resolveEnv(options?: ResolveAuthOptions): Record<string, string | undefined> {
  if (options?.env) {
    return options.env;
  }
  return options?.homeDir === undefined ? process.env : {};
}

/**
 * Return the ordered candidate chain for locating a credential file.
 * Priority order: explicit arg, GOOPSPEC_IMAGE_AUTH_FILE env var,
 * $XDG_DATA_HOME/opencode/auth.json (or ~/.local/share fallback),
 * ~/.codex/auth.json, ~/.gpt-image/auth.json.
 * Inject homeDir/xdgDataHome to keep tests away from the real home directory.
 * The explicit and env candidates are omitted when those inputs are absent, so
 * the chain shrinks rather than yielding empty paths.
 */
export function resolveAuthCandidates(options?: ResolveAuthOptions): AuthSource[] {
  const env = resolveEnv(options);
  const homeDir = options?.homeDir ?? homedir();
  const candidates: AuthSource[] = [];

  if (options?.authFile) {
    candidates.push({ kind: "explicit", path: options.authFile });
  }

  if (env[ENV_VAR_NAME]) {
    candidates.push({ kind: "env", path: env[ENV_VAR_NAME] });
  }

  candidates.push({
    kind: "xdg",
    path: getXdgDataAuthPath(homeDir, options?.xdgDataHome ?? env.XDG_DATA_HOME),
  });
  candidates.push({ kind: "codex", path: join(homeDir, ".codex", "auth.json") });
  candidates.push({ kind: "gpt-image", path: join(homeDir, ".gpt-image", "auth.json") });

  return candidates;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalEpochMilliseconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Convert either supported on-disk OAuth schema to the credential contract.
 * Codex and gpt-image credentials do not record expiry, so `expiresAtMs` is
 * undefined for that shape and expiry pre-flight checks are skipped.
 */
export function normalizeCredential(
  value: unknown,
  source: AuthSource,
): NormalizedCredential | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const openai = value.openai;
  if (isRecord(openai) && openai.type === "oauth") {
    const accessToken = nonEmptyString(openai.access);
    if (!accessToken) {
      return undefined;
    }

    return {
      accessToken,
      refreshToken: nonEmptyString(openai.refresh),
      expiresAtMs: optionalEpochMilliseconds(openai.expires),
      accountId: nonEmptyString(openai.accountId),
      source,
    };
  }

  const tokens = value.tokens;
  if (!isRecord(tokens)) {
    return undefined;
  }

  const accessToken = nonEmptyString(tokens.access_token);
  if (!accessToken) {
    return undefined;
  }

  return {
    accessToken,
    refreshToken: nonEmptyString(tokens.refresh_token),
    expiresAtMs: undefined,
    accountId: nonEmptyString(tokens.account_id),
    source,
  };
}

function reauthenticationMessage(): string {
  return "Sign in to OpenCode with ChatGPT OAuth again, then retry generate_image.";
}

function exhaustedCredentialsMessage(candidates: AuthSource[]): string {
  const paths = candidates.map((candidate) => candidate.path).join(", ");
  return `No usable ChatGPT OAuth credential was found. Tried: ${paths}. ${reauthenticationMessage()}`;
}

/**
 * Read candidates in priority order. An unreadable, malformed, or unrelated
 * file is a miss so fallback credential stores remain usable.
 */
export async function readCredential(
  options?: ReadCredentialOptions,
): Promise<NormalizedCredential> {
  const candidates = resolveAuthCandidates(options);

  for (const source of candidates) {
    try {
      const parsed = JSON.parse(await readFile(source.path, "utf-8")) as unknown;
      const credential = normalizeCredential(parsed, source);
      if (!credential) {
        continue;
      }

      if (!isExpired(credential)) {
        return credential;
      }

      if (!options?.allowRefresh) {
        throw new CredentialError(
          `The ChatGPT OAuth access token is expired. ${reauthenticationMessage()}`,
        );
      }

      return await refreshCredential(credential);
    } catch (error: unknown) {
      if (error instanceof CredentialError) {
        throw error;
      }
      // Files that cannot be read or parsed are deliberately treated as misses.
    }
  }

  throw new CredentialError(exhaustedCredentialsMessage(candidates));
}

/** Return whether a known expiry is inside the safety margin. */
export function isExpired(credential: NormalizedCredential): boolean {
  return (
    credential.expiresAtMs !== undefined && credential.expiresAtMs <= Date.now() + EXPIRY_MARGIN_MS
  );
}

function refreshedExpiryAtMs(value: Record<string, unknown>): number | undefined {
  const expiresInSeconds = value.expires_in;
  if (
    typeof expiresInSeconds !== "number" ||
    !Number.isFinite(expiresInSeconds) ||
    expiresInSeconds < 0
  ) {
    return undefined;
  }
  return Date.now() + expiresInSeconds * 1000;
}

/**
 * Refresh an expired credential for the current invocation only. This function
 * never persists the response because OpenAI refresh-token rotation could
 * invalidate OpenCode's stored session.
 */
export async function refreshCredential(
  credential: NormalizedCredential,
): Promise<NormalizedCredential> {
  if (!credential.refreshToken) {
    throw new CredentialError(
      `The ChatGPT OAuth access token is expired and cannot be refreshed. ${reauthenticationMessage()}`,
    );
  }

  let response: Response;
  try {
    response = await fetch(OAUTH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credential.refreshToken,
        client_id: OAUTH_CLIENT_ID,
      }),
    });
  } catch {
    throw new CredentialError(`ChatGPT OAuth refresh failed. ${reauthenticationMessage()}`);
  }

  if (!response.ok) {
    throw new CredentialError(
      `ChatGPT OAuth refresh failed with HTTP ${response.status}. ${reauthenticationMessage()}`,
    );
  }

  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new CredentialError(
      `ChatGPT OAuth refresh returned an invalid response. ${reauthenticationMessage()}`,
    );
  }

  if (!isRecord(body)) {
    throw new CredentialError(
      `ChatGPT OAuth refresh returned an invalid response. ${reauthenticationMessage()}`,
    );
  }

  const accessToken = nonEmptyString(body.access_token);
  if (!accessToken) {
    throw new CredentialError(
      `ChatGPT OAuth refresh returned an invalid response. ${reauthenticationMessage()}`,
    );
  }

  return {
    accessToken,
    refreshToken: nonEmptyString(body.refresh_token) ?? credential.refreshToken,
    expiresAtMs: refreshedExpiryAtMs(body),
    accountId: credential.accountId,
    source: credential.source,
  };
}

/**
 * Describe token material without retaining any token characters. The shape
 * and length support diagnostics but cannot be used to reconstruct a token.
 */
export function redact(value: string | undefined): string {
  if (value === undefined) {
    return "token[absent]";
  }

  const shape = value.length === 0 ? "empty" : value.includes(".") ? "dot-separated" : "opaque";
  return `token[length=${value.length},shape=${shape}]`;
}
