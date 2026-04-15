import { describe, it, expect } from "bun:test";
import { generateId, generateTimestampedId, deterministicId } from "./ids.js";

describe("generateId", () => {
  it("returns a 12-character hex string", () => {
    const id = generateId();
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("generates unique IDs across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("generateTimestampedId", () => {
  it("matches the expected format: {timestamp}-{hex}", () => {
    const id = generateTimestampedId();
    expect(id).toMatch(/^\d+-[0-9a-f]{12}$/);
  });

  it("starts with a recent timestamp", () => {
    const before = Date.now();
    const id = generateTimestampedId();
    const after = Date.now();

    const timestamp = Number(id.split("-")[0]);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it("generates unique IDs across calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateTimestampedId()));
    expect(ids.size).toBe(50);
  });
});

describe("deterministicId", () => {
  it("returns a 12-character hex string", async () => {
    const id = await deterministicId("test-input");
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("produces the same output for the same input", async () => {
    const a = await deterministicId("hello-world");
    const b = await deterministicId("hello-world");
    expect(a).toBe(b);
  });

  it("produces different output for different inputs", async () => {
    const a = await deterministicId("input-a");
    const b = await deterministicId("input-b");
    expect(a).not.toBe(b);
  });

  it("handles empty string input", async () => {
    const id = await deterministicId("");
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("handles unicode input", async () => {
    const id = await deterministicId("hello-");
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });
});
