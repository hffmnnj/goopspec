import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type MockFetchControls, setupTestEnvironment, withMockedFetch } from "../../test-utils.js";
import {
  CredentialError,
  type ReadCredentialOptions,
  isExpired,
  readCredential,
  redact,
  refreshCredential,
  resolveAuthCandidates,
} from "./auth.js";
import { OAUTH_CLIENT_ID, OAUTH_TOKEN_ENDPOINT } from "./constants.js";
import type { AuthSource, NormalizedCredential } from "./types.js";

// Platform note: OpenCode uses xdg-basedir on Linux, macOS, and Windows.
// There is no ~/Library and no %APPDATA% path in the credential chain,
// so there is deliberately no per-platform branch below.

// ============================================================================
// Fixtures
// ============================================================================

const OPENCODE_AUTH = JSON.stringify({
  openai: {
    type: "oauth",
    access: "opencode-access",
    refresh: "opencode-refresh",
    expires: 4102444800000,
    accountId: "account-opencode",
  },
});

const OPENCODE_AUTH_NO_OPENAI = JSON.stringify({
  github: {
    type: "oauth",
    access: "github-access",
  },
});

const OPENCODE_AUTH_WRONG_TYPE = JSON.stringify({
  openai: {
    type: "api_key",
    access: "opencode-api-key",
  },
});

const CODEX_AUTH = JSON.stringify({
  auth_mode: "web",
  last_refresh: "2026-01-01T00:00:00Z",
  tokens: {
    access_token: "codex-access",
    refresh_token: "codex-refresh",
    id_token: "codex-id",
    account_id: "account-codex",
  },
});

const GPT_IMAGE_AUTH = JSON.stringify({
  auth_mode: "web",
  last_refresh: "2026-01-01T00:00:00Z",
  tokens: {
    access_token: "gpt-image-access",
    refresh_token: "gpt-image-refresh",
    id_token: "gpt-image-id",
    account_id: "account-gpt-image",
  },
});

const EXPIRED_OPENCODE_AUTH = JSON.stringify({
  openai: {
    type: "oauth",
    access: "expired-access",
    refresh: "expired-refresh",
    expires: 0,
    accountId: "account-expired",
  },
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Injected alongside every `homeDir` so no case can fall back to `process.env`.
 * This machine's real XDG_DATA_HOME would otherwise point the chain at the
 * developer's own auth.json instead of the temp sandbox.
 */
const NO_ENV: Record<string, string | undefined> = {};

function writeAuth(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

function sourceKinds(candidates: AuthSource[]): string[] {
  return candidates.map((candidate) => candidate.kind);
}

function restoreEnvVar(name: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = original;
  }
}

// ============================================================================
// Resolution priority
// ============================================================================

describe("resolveAuthCandidates", () => {
  let homeDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("auth-resolution");
    homeDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("returns the five sources in priority order when every input is supplied", () => {
    const candidates = resolveAuthCandidates({
      homeDir,
      authFile: `${homeDir}/explicit.json`,
      env: { GOOPSPEC_IMAGE_AUTH_FILE: `${homeDir}/env.json` },
    });
    expect(sourceKinds(candidates)).toEqual(["explicit", "env", "xdg", "codex", "gpt-image"]);
  });

  it("shrinks the chain when neither an explicit arg nor the env var is supplied", () => {
    const candidates = resolveAuthCandidates({ homeDir, env: NO_ENV });
    expect(sourceKinds(candidates)).toEqual(["xdg", "codex", "gpt-image"]);
  });

  it("honours an explicit authFile first", () => {
    const explicit = `${homeDir}/explicit.json`;
    const candidates = resolveAuthCandidates({ homeDir, env: NO_ENV, authFile: explicit });
    expect(candidates[0]).toEqual({ kind: "explicit", path: explicit });
  });

  it("honours GOOPSPEC_IMAGE_AUTH_FILE env when no explicit arg is given", () => {
    const envPath = `${homeDir}/env.json`;
    const candidates = resolveAuthCandidates({
      homeDir,
      xdgDataHome: `${homeDir}/xdg-data`,
      env: { GOOPSPEC_IMAGE_AUTH_FILE: envPath },
    });
    expect(candidates[0]).toEqual({ kind: "env", path: envPath });
  });

  it("prefers explicit arg over env var", () => {
    const explicit = `${homeDir}/explicit.json`;
    const envPath = `${homeDir}/env.json`;
    const candidates = resolveAuthCandidates({
      homeDir,
      authFile: explicit,
      env: { GOOPSPEC_IMAGE_AUTH_FILE: envPath },
    });
    expect(candidates[0]).toEqual({ kind: "explicit", path: explicit });
    expect(candidates[1]).toEqual({ kind: "env", path: envPath });
  });

  it("uses XDG_DATA_HOME/opencode/auth.json when set", () => {
    const xdg = `${homeDir}/xdg-data`;
    const candidates = resolveAuthCandidates({ homeDir, env: NO_ENV, xdgDataHome: xdg });
    const xdgCandidate = candidates.find((c) => c.kind === "xdg");
    expect(xdgCandidate?.path).toBe(`${xdg}/opencode/auth.json`);
  });

  it("falls back to ~/.local/share/opencode/auth.json when XDG_DATA_HOME is unset", () => {
    const candidates = resolveAuthCandidates({ homeDir, env: NO_ENV });
    const xdgCandidate = candidates.find((c) => c.kind === "xdg");
    expect(xdgCandidate?.path).toBe(`${homeDir}/.local/share/opencode/auth.json`);
  });

  it("uses env XDG_DATA_HOME when xdgDataHome option is not provided", () => {
    const xdg = `${homeDir}/from-env`;
    const candidates = resolveAuthCandidates({
      homeDir,
      env: { XDG_DATA_HOME: xdg },
    });
    const xdgCandidate = candidates.find((c) => c.kind === "xdg");
    expect(xdgCandidate?.path).toBe(`${xdg}/opencode/auth.json`);
  });

  it("prefers explicit xdgDataHome option over env XDG_DATA_HOME", () => {
    const xdgOption = `${homeDir}/xdg-option`;
    const xdgEnv = `${homeDir}/xdg-env`;
    const candidates = resolveAuthCandidates({
      homeDir,
      xdgDataHome: xdgOption,
      env: { XDG_DATA_HOME: xdgEnv },
    });
    const xdgCandidate = candidates.find((c) => c.kind === "xdg");
    expect(xdgCandidate?.path).toBe(`${xdgOption}/opencode/auth.json`);
  });

  it("ignores the ambient environment when homeDir is injected without env", () => {
    const originalXdg = process.env.XDG_DATA_HOME;
    const originalAuthFile = process.env.GOOPSPEC_IMAGE_AUTH_FILE;
    process.env.XDG_DATA_HOME = `${homeDir}/ambient-xdg`;
    process.env.GOOPSPEC_IMAGE_AUTH_FILE = `${homeDir}/ambient-env.json`;

    try {
      const candidates = resolveAuthCandidates({ homeDir });
      expect(sourceKinds(candidates)).toEqual(["xdg", "codex", "gpt-image"]);
      expect(candidates[0].path).toBe(`${homeDir}/.local/share/opencode/auth.json`);
    } finally {
      restoreEnvVar("XDG_DATA_HOME", originalXdg);
      restoreEnvVar("GOOPSPEC_IMAGE_AUTH_FILE", originalAuthFile);
    }
  });

  it("still honours an explicit xdgDataHome when the ambient environment is ignored", () => {
    const originalXdg = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = `${homeDir}/ambient-xdg`;

    try {
      const candidates = resolveAuthCandidates({ homeDir, xdgDataHome: `${homeDir}/explicit-xdg` });
      expect(candidates[0].path).toBe(`${homeDir}/explicit-xdg/opencode/auth.json`);
    } finally {
      restoreEnvVar("XDG_DATA_HOME", originalXdg);
    }
  });
});

// ============================================================================
// Read credential
// ============================================================================

describe("readCredential", () => {
  let homeDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("auth-read");
    homeDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("uses explicit arg when present and ignores lower-priority files", async () => {
    const explicit = `${homeDir}/explicit.json`;
    writeAuth(explicit, OPENCODE_AUTH);
    writeAuth(`${homeDir}/.codex/auth.json`, CODEX_AUTH);

    const credential = await readCredential({ homeDir, env: NO_ENV, authFile: explicit });
    expect(credential.accessToken).toBe("opencode-access");
    expect(credential.source.kind).toBe("explicit");
  });

  it("falls through env var to codex when env file is missing", async () => {
    const envPath = `${homeDir}/env.json`;
    writeAuth(`${homeDir}/.codex/auth.json`, CODEX_AUTH);

    const credential = await readCredential({
      homeDir,
      env: { GOOPSPEC_IMAGE_AUTH_FILE: envPath },
    });
    expect(credential.accessToken).toBe("codex-access");
    expect(credential.source.kind).toBe("codex");
  });

  it("resolves xdg source when nothing higher is present", async () => {
    const xdg = `${homeDir}/xdg-data`;
    writeAuth(`${xdg}/opencode/auth.json`, OPENCODE_AUTH);

    const credential = await readCredential({ homeDir, env: NO_ENV, xdgDataHome: xdg });
    expect(credential.accessToken).toBe("opencode-access");
    expect(credential.source.kind).toBe("xdg");
  });

  it("normalizes codex and gpt-image shapes identically apart from source", async () => {
    writeAuth(`${homeDir}/.codex/auth.json`, CODEX_AUTH);
    writeAuth(`${homeDir}/.gpt-image/auth.json`, GPT_IMAGE_AUTH);

    const credential = await readCredential({ homeDir, env: NO_ENV });
    expect(credential.accessToken).toBe("codex-access");
    expect(credential.refreshToken).toBe("codex-refresh");
    expect(credential.accountId).toBe("account-codex");
    expect(credential.expiresAtMs).toBeUndefined();
    expect(credential.source.kind).toBe("codex");
  });

  it("normalizes opencode shape preserving expiry", async () => {
    const xdg = `${homeDir}/xdg-data`;
    writeAuth(`${xdg}/opencode/auth.json`, OPENCODE_AUTH);

    const credential = await readCredential({ homeDir, env: NO_ENV, xdgDataHome: xdg });
    expect(credential.accessToken).toBe("opencode-access");
    expect(credential.refreshToken).toBe("opencode-refresh");
    expect(credential.accountId).toBe("account-opencode");
    expect(credential.expiresAtMs).toBe(4102444800000);
    expect(credential.source.kind).toBe("xdg");
  });

  it("falls through when auth.json has no openai entry", async () => {
    const xdg = `${homeDir}/xdg-data`;
    writeAuth(`${xdg}/opencode/auth.json`, OPENCODE_AUTH_NO_OPENAI);
    writeAuth(`${homeDir}/.codex/auth.json`, CODEX_AUTH);

    const credential = await readCredential({ homeDir, env: NO_ENV, xdgDataHome: xdg });
    expect(credential.accessToken).toBe("codex-access");
    expect(credential.source.kind).toBe("codex");
  });

  it("falls through when openai entry has a non-oauth type", async () => {
    const xdg = `${homeDir}/xdg-data`;
    writeAuth(`${xdg}/opencode/auth.json`, OPENCODE_AUTH_WRONG_TYPE);
    writeAuth(`${homeDir}/.gpt-image/auth.json`, GPT_IMAGE_AUTH);

    const credential = await readCredential({ homeDir, env: NO_ENV, xdgDataHome: xdg });
    expect(credential.accessToken).toBe("gpt-image-access");
    expect(credential.source.kind).toBe("gpt-image");
  });

  it("throws an actionable error naming every path tried when chain is exhausted", async () => {
    const options: ReadCredentialOptions = { homeDir, env: NO_ENV };

    await expect(readCredential(options)).rejects.toThrow(CredentialError);

    try {
      await readCredential(options);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(CredentialError);
      const message = (error as CredentialError).message;
      expect(message).toContain("No usable ChatGPT OAuth credential was found");
      const candidates = resolveAuthCandidates(options);
      expect(candidates).not.toBeEmpty();
      for (const candidate of candidates) {
        expect(message).toContain(candidate.path);
        expect(candidate.path.startsWith(homeDir)).toBeTrue();
      }
      expect(message).toContain("Sign in to OpenCode with ChatGPT OAuth again");
    }
  });

  it("does not read the real home directory when homeDir is injected", async () => {
    writeAuth(`${homeDir}/.codex/auth.json`, CODEX_AUTH);

    const credential = await readCredential({ homeDir });
    expect(credential.source.path.startsWith(homeDir)).toBeTrue();
  });
});

// ============================================================================
// Expiry gating
// ============================================================================

describe("isExpired", () => {
  it("returns true for an expiry inside the safety margin", () => {
    const credential: NormalizedCredential = {
      accessToken: "access",
      expiresAtMs: Date.now() - 1000,
      source: { kind: "codex", path: "/dev/null" },
    };
    expect(isExpired(credential)).toBeTrue();
  });

  it("returns false for an expiry well in the future", () => {
    const credential: NormalizedCredential = {
      accessToken: "access",
      expiresAtMs: Date.now() + 24 * 60 * 60 * 1000,
      source: { kind: "codex", path: "/dev/null" },
    };
    expect(isExpired(credential)).toBeFalse();
  });

  it("returns false when expiry is unknown", () => {
    const credential: NormalizedCredential = {
      accessToken: "access",
      source: { kind: "codex", path: "/dev/null" },
    };
    expect(isExpired(credential)).toBeFalse();
  });
});

describe("readCredential expiry gating", () => {
  let homeDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("auth-expiry");
    homeDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("throws a re-authentication message when credential is expired and refresh is not allowed", async () => {
    writeAuth(`${homeDir}/.codex/auth.json`, EXPIRED_OPENCODE_AUTH);

    await expect(readCredential({ homeDir, env: NO_ENV })).rejects.toThrow(CredentialError);

    try {
      await readCredential({ homeDir, env: NO_ENV });
    } catch (error: unknown) {
      const message = (error as CredentialError).message;
      expect(message).toContain("expired");
      expect(message).toContain("Sign in to OpenCode with ChatGPT OAuth again");
      expect(message).not.toContain("opencode-access");
      expect(message).not.toContain("expired-access");
      expect(message).not.toContain("expired-refresh");
    }
  });

  it("refreshes when allowRefresh is true", async () => {
    writeAuth(`${homeDir}/.codex/auth.json`, EXPIRED_OPENCODE_AUTH);

    await withMockedFetch(
      [
        {
          body: {
            access_token: "refreshed-access",
            refresh_token: "refreshed-refresh",
            expires_in: 3600,
          },
        },
      ],
      async (controls: MockFetchControls) => {
        const credential = await readCredential({ homeDir, env: NO_ENV, allowRefresh: true });

        expect(credential.accessToken).toBe("refreshed-access");
        expect(credential.refreshToken).toBe("refreshed-refresh");
        expect(credential.expiresAtMs).toBeGreaterThan(Date.now());
        expect(credential.source.kind).toBe("codex");

        expect(controls.requests).toHaveLength(1);
        const request = controls.requests[0];
        expect(request.method).toBe("POST");
        expect(request.url).toBe(OAUTH_TOKEN_ENDPOINT);
        expect(request.headers["content-type"]).toContain("application/x-www-form-urlencoded");

        const params = new URLSearchParams(request.body);
        expect(params.get("grant_type")).toBe("refresh_token");
        expect(params.get("refresh_token")).toBe("expired-refresh");
        expect(params.get("client_id")).toBe(OAUTH_CLIENT_ID);
      },
    );
  });

  it("does not write any auth file during refresh", async () => {
    const codexPath = `${homeDir}/.codex/auth.json`;
    writeAuth(codexPath, EXPIRED_OPENCODE_AUTH);
    const originalContent = readFileSync(codexPath, "utf-8");

    await withMockedFetch(
      [
        {
          body: {
            access_token: "refreshed-access",
            refresh_token: "refreshed-refresh",
            expires_in: 3600,
          },
        },
      ],
      async () => {
        await readCredential({ homeDir, env: NO_ENV, allowRefresh: true });
      },
    );

    expect(readFileSync(codexPath, "utf-8")).toBe(originalContent);
  });
});

// ============================================================================
// Refresh credential
// ============================================================================

describe("refreshCredential", () => {
  it("throws when refresh token is absent", async () => {
    const credential: NormalizedCredential = {
      accessToken: "access",
      source: { kind: "codex", path: "/dev/null" },
    };

    await expect(refreshCredential(credential)).rejects.toThrow(CredentialError);
  });

  it("returns the original refresh token when response omits one", async () => {
    const credential: NormalizedCredential = {
      accessToken: "access",
      refreshToken: "original-refresh",
      source: { kind: "codex", path: "/dev/null" },
    };

    await withMockedFetch(
      [
        {
          body: {
            access_token: "new-access",
            expires_in: 3600,
          },
        },
      ],
      async () => {
        const refreshed = await refreshCredential(credential);
        expect(refreshed.accessToken).toBe("new-access");
        expect(refreshed.refreshToken).toBe("original-refresh");
      },
    );
  });

  it("throws on non-ok HTTP responses", async () => {
    const credential: NormalizedCredential = {
      accessToken: "access",
      refreshToken: "refresh",
      source: { kind: "codex", path: "/dev/null" },
    };

    await withMockedFetch([{ status: 401, body: { error: "invalid_grant" } }], async () => {
      await expect(refreshCredential(credential)).rejects.toThrow(CredentialError);
    });
  });

  it("throws on invalid JSON response", async () => {
    const credential: NormalizedCredential = {
      accessToken: "access",
      refreshToken: "refresh",
      source: { kind: "codex", path: "/dev/null" },
    };

    await withMockedFetch([{ body: "not-json" }], async () => {
      await expect(refreshCredential(credential)).rejects.toThrow(CredentialError);
    });
  });

  it("throws when response lacks access_token", async () => {
    const credential: NormalizedCredential = {
      accessToken: "access",
      refreshToken: "refresh",
      source: { kind: "codex", path: "/dev/null" },
    };

    await withMockedFetch([{ body: { expires_in: 3600 } }], async () => {
      await expect(refreshCredential(credential)).rejects.toThrow(CredentialError);
    });
  });
});

// ============================================================================
// Redaction
// ============================================================================

describe("redact", () => {
  it("describes an absent token without leaking material", () => {
    expect(redact(undefined)).toBe("token[absent]");
  });

  it("describes an empty token", () => {
    expect(redact("")).toBe("token[length=0,shape=empty]");
  });

  it("describes a dot-separated token", () => {
    expect(redact("abc.def.ghi")).toBe("token[length=11,shape=dot-separated]");
  });

  it("describes an opaque token", () => {
    expect(redact("opaquevalue")).toBe("token[length=11,shape=opaque]");
  });

  it("does not retain any token characters", () => {
    const value = "this-is-a-fake-token-value";
    const redacted = redact(value);
    expect(redacted).not.toContain("this-is-a");
    expect(redacted).not.toContain("fake-token");
    expect(redacted).not.toContain("value");
  });
});
