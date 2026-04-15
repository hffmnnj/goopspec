import type { Database } from "bun:sqlite";
import { SignJWT, jwtVerify } from "jose";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { AuthService } from "../services/auth-service.js";

const SESSION_COOKIE_NAME = "goopspec-session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

export interface AuthServiceLike {
  hasPassword(): boolean;
  setPassword(plaintext: string): Promise<void>;
  verifyPassword(plaintext: string): Promise<boolean>;
  getJwtSecret(): string;
}

function parsePasswordBody(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const value = (body as { password?: unknown }).password;
  if (typeof value !== "string") {
    return null;
  }

  const password = value.trim();
  return password.length > 0 ? password : null;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function shouldUseSecureCookie(url: URL): boolean {
  return !isLocalHost(url.hostname);
}

function encodeJwtSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

async function createSessionToken(secret: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const exp = issuedAt + SESSION_MAX_AGE_SECONDS;

  return new SignJWT({ sub: "goopspec-web-panel", exp, iat: issuedAt })
    .setProtectedHeader({ alg: "HS256" })
    .sign(encodeJwtSecret(secret));
}

export function createAuthRoutes(
  db: Database,
  service: AuthServiceLike = new AuthService(db),
): Hono {
  const router = new Hono();

  router.post("/login", async (c) => {
    if (!service.hasPassword()) {
      return c.json({ authenticated: true, noPasswordRequired: true });
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const password = parsePasswordBody(body);
    if (!password) {
      return c.json({ error: "Password is required" }, 400);
    }

    const isValid = await service.verifyPassword(password);
    if (!isValid) {
      return c.json({ error: "Invalid password" }, 401);
    }

    const token = await createSessionToken(service.getJwtSecret());
    const secure = shouldUseSecureCookie(new URL(c.req.url));

    setCookie(c, SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return c.json({ authenticated: true });
  });

  router.post("/logout", (c) => {
    const secure = shouldUseSecureCookie(new URL(c.req.url));

    deleteCookie(c, SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: 0,
    });

    return c.json({ success: true });
  });

  router.get("/status", async (c) => {
    const hasPassword = service.hasPassword();
    const token = getCookie(c, SESSION_COOKIE_NAME);

    if (!token) {
      return c.json({ authenticated: false, hasPassword });
    }

    try {
      await jwtVerify(token, encodeJwtSecret(service.getJwtSecret()), {
        algorithms: ["HS256"],
      });
      return c.json({ authenticated: true, hasPassword });
    } catch {
      return c.json({ authenticated: false, hasPassword });
    }
  });

  router.post("/setup", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const password = parsePasswordBody(body);
    if (!password) {
      return c.json({ error: "Password is required" }, 400);
    }

    await service.setPassword(password);
    return c.json({ success: true });
  });

  return router;
}
