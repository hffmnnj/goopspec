import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { runMigrations } from "../db/migrations.js";
import { AuthService } from "./auth-service.js";

interface AuthRow {
  id: number;
  password_hash: string | null;
  jwt_secret: string;
}

describe("AuthService", () => {
  let db: Database;
  let service: AuthService;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    service = new AuthService(db);
  });

  afterEach(() => {
    db.close();
  });

  it("hasPassword returns false initially", () => {
    expect(service.hasPassword()).toBe(false);
  });

  it("setPassword stores bcrypt hash and enables hasPassword", async () => {
    await service.setPassword("correct-horse-battery-staple");

    expect(service.hasPassword()).toBe(true);

    const row = db.query("SELECT * FROM auth WHERE id = 1").get() as AuthRow | null;
    expect(row).not.toBeNull();
    expect(row?.password_hash).toBeString();
    expect(row?.password_hash).not.toBe("correct-horse-battery-staple");
  });

  it("verifyPassword returns true for correct password and false for wrong", async () => {
    await service.setPassword("test-password");

    expect(await service.verifyPassword("test-password")).toBe(true);
    expect(await service.verifyPassword("wrong-password")).toBe(false);
  });

  it("verifyPassword returns false when no password is set", async () => {
    expect(await service.verifyPassword("anything")).toBe(false);
  });

  it("getJwtSecret returns the same value across calls", () => {
    const first = service.getJwtSecret();
    const second = service.getJwtSecret();

    expect(first).toBe(second);
    expect(first.length).toBe(64);
  });

  it("regenerateJwtSecret returns a new secret", () => {
    const first = service.getJwtSecret();
    const second = service.regenerateJwtSecret();

    expect(second).not.toBe(first);
    expect(second.length).toBe(64);
  });

  it("initialize creates auth row when missing and remains idempotent", () => {
    db.query("DELETE FROM auth").run();

    service.initialize();
    service.initialize();

    const rows = db.query("SELECT id, jwt_secret, password_hash FROM auth").all() as AuthRow[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe(1);
    expect(rows[0]?.jwt_secret.length).toBe(64);
  });
});
