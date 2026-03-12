import { createHash } from "node:crypto";

const SESSION_COOKIE_NAME = "goopspec-session";
const AUTH_CACHE_TTL_MS = 30_000;

const PUBLIC_PATHS = ["/login", "/auth/"];
const API_PATHS_PREFIX = [
  "/api/",
  "/health",
  "/_astro/",
  "/_image",
  "/favicon",
  "/assets/",
];

const authCache = new Map<string, { authenticated: boolean; expiresAt: number }>();

function hasFileExtension(pathname: string): boolean {
  const segment = pathname.split("/").pop() ?? "";
  return segment.includes(".");
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => {
    if (path.endsWith("/")) {
      return pathname.startsWith(path);
    }
    return pathname === path;
  });
}

function isBypassPath(pathname: string): boolean {
  return API_PATHS_PREFIX.some((prefix) => pathname.startsWith(prefix));
}

function extractSessionToken(cookieHeader: string): string | null {
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    if (!rawName || rawValueParts.length === 0) {
      continue;
    }

    if (rawName !== SESSION_COOKIE_NAME) {
      continue;
    }

    return rawValueParts.join("=");
  }

  return null;
}

function getCacheKey(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const token = extractSessionToken(cookieHeader);
  if (!token) {
    return null;
  }

  return createHash("sha256").update(token).digest("hex");
}

interface AuthStatusResponse {
  authenticated?: boolean;
  hasPassword?: boolean;
}

/**
 * Check auth status by forwarding cookie to daemon.
 * Returns true if authenticated, false if not, null if daemon is down (fail open).
 */
export async function checkAuthWithDaemon(
  cookieHeader: string | null,
  daemonUrl: string,
): Promise<boolean | null> {
  const now = Date.now();
  const cacheKey = getCacheKey(cookieHeader);

  if (cacheKey) {
    const cached = authCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.authenticated;
    }
  }

  try {
    const response = await fetch(`${daemonUrl}/auth/status`, {
      method: "GET",
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    });

    if (!response.ok) {
      return null;
    }

    const status = (await response.json()) as AuthStatusResponse;

    if (!status.hasPassword) {
      return true;
    }

    const authenticated = status.authenticated === true;

    if (cacheKey) {
      authCache.set(cacheKey, {
        authenticated,
        expiresAt: now + AUTH_CACHE_TTL_MS,
      });
    }

    return authenticated;
  } catch {
    return null;
  }
}

// getDaemonUrl is re-exported from config.ts for backward compatibility
export { getDaemonUrl } from "./config";

/** Check whether a pathname should be auth-guarded. */
export function requiresAuth(pathname: string): boolean {
  if (isPublicPath(pathname)) {
    return false;
  }

  if (isBypassPath(pathname)) {
    return false;
  }

  if (hasFileExtension(pathname)) {
    return false;
  }

  return true;
}
