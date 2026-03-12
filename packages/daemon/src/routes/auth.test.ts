import type { Database } from "bun:sqlite";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { createTestDatabase } from "../db/index.js";
import { createAuthRoutes, type AuthServiceLike } from "./auth.js";

const SESSION_COOKIE_NAME = "goopspec-session";
const JWT_SECRET = "test-jwt-secret";

function createMockAuthService(initialHasPassword: boolean): {
  service: AuthServiceLike;
  setPasswordMock: ReturnType<typeof mock>;
  verifyPasswordMock: ReturnType<typeof mock>;
  hasPasswordMock: ReturnType<typeof mock>;
  getJwtSecretMock: ReturnType<typeof mock>;
} {
  const setPasswordMock = mock(async () => {});
  const verifyPasswordMock = mock(async (_password: string) => false);
  const hasPasswordMock = mock(() => initialHasPassword);
  const getJwtSecretMock = mock(() => JWT_SECRET);

  return {
    service: {
      hasPassword: hasPasswordMock,
      setPassword: setPasswordMock,
      verifyPassword: verifyPasswordMock,
      getJwtSecret: getJwtSecretMock,
    },
    setPasswordMock,
    verifyPasswordMock,
    hasPasswordMock,
    getJwtSecretMock,
  };
}

function createApp(service: AuthServiceLike, db: Database): Hono {
  const app = new Hono();
  app.route("/auth", createAuthRoutes(db, service));
  return app;
}

async function createToken(secret: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const exp = issuedAt + 86400;

  return new SignJWT({ sub: "goopspec-web-panel", iat: issuedAt, exp })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(secret));
}

describe("auth routes", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("POST /auth/login with correct password returns 200 and sets cookie", async () => {
    const { service, verifyPasswordMock } = createMockAuthService(true);
    verifyPasswordMock.mockResolvedValue(true);
    const app = createApp(service, db);

    const response = await app.request("http://example.com/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct-password" }),
    });

    expect(response.status).toBe(200);
    expect(verifyPasswordMock).toHaveBeenCalledWith("correct-password");

    const body = (await response.json()) as { authenticated: boolean };
    expect(body).toEqual({ authenticated: true });

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=86400");
    expect(setCookie).toContain("Secure");
  });

  it("POST /auth/login with wrong password returns 401", async () => {
    const { service, verifyPasswordMock } = createMockAuthService(true);
    verifyPasswordMock.mockResolvedValue(false);
    const app = createApp(service, db);

    const response = await app.request("http://localhost/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body).toEqual({ error: "Invalid password" });
  });

  it("POST /auth/login with no password configured returns noPasswordRequired", async () => {
    const { service, verifyPasswordMock } = createMockAuthService(false);
    const app = createApp(service, db);

    const response = await app.request("http://localhost/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "ignored" }),
    });

    expect(response.status).toBe(200);
    expect(verifyPasswordMock).not.toHaveBeenCalled();

    const body = (await response.json()) as {
      authenticated: boolean;
      noPasswordRequired: boolean;
    };
    expect(body).toEqual({ authenticated: true, noPasswordRequired: true });
  });

  it("POST /auth/logout returns 200 and clears cookie", async () => {
    const { service } = createMockAuthService(true);
    const app = createApp(service, db);

    const response = await app.request("http://localhost/auth/logout", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean };
    expect(body).toEqual({ success: true });

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/");
  });

  it("GET /auth/status with valid cookie returns authenticated true", async () => {
    const { service } = createMockAuthService(true);
    const app = createApp(service, db);
    const token = await createToken(JWT_SECRET);

    const response = await app.request("http://localhost/auth/status", {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      authenticated: boolean;
      hasPassword: boolean;
    };
    expect(body).toEqual({ authenticated: true, hasPassword: true });
  });

  it("GET /auth/status without cookie returns authenticated false", async () => {
    const { service } = createMockAuthService(true);
    const app = createApp(service, db);

    const response = await app.request("http://localhost/auth/status");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      authenticated: boolean;
      hasPassword: boolean;
    };
    expect(body).toEqual({ authenticated: false, hasPassword: true });
  });

  it("POST /auth/setup returns 200 and updates password via service", async () => {
    const { service, setPasswordMock } = createMockAuthService(false);
    const app = createApp(service, db);

    const response = await app.request("http://localhost/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "new-password" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean };
    expect(body).toEqual({ success: true });
    expect(setPasswordMock).toHaveBeenCalledWith("new-password");
  });
});
