import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { log, logError } from "./logger.js";

describe("log", () => {
  const originalWrite = process.stderr.write;
  let output: string;

  beforeEach(() => {
    output = "";
    process.stderr.write = ((chunk: string) => {
      output += chunk;
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    process.env.GOOPSPEC_DEBUG = undefined;
  });

  it("does not emit when GOOPSPEC_DEBUG is not set", () => {
    process.env.GOOPSPEC_DEBUG = undefined;
    log("test message");
    expect(output).toBe("");
  });

  it("does not emit when GOOPSPEC_DEBUG is false", () => {
    process.env.GOOPSPEC_DEBUG = "false";
    log("test message");
    expect(output).toBe("");
  });

  it("emits to stderr when GOOPSPEC_DEBUG is true", () => {
    process.env.GOOPSPEC_DEBUG = "true";
    log("hello world");
    expect(output).toContain("[goopspec:pi]");
    expect(output).toContain("hello world");
    expect(output).toEndWith("\n");
  });

  it("includes JSON-serialized data when provided", () => {
    process.env.GOOPSPEC_DEBUG = "true";
    log("with data", { key: "value" });
    expect(output).toContain('{"key":"value"}');
  });

  it("omits data portion when data is undefined", () => {
    process.env.GOOPSPEC_DEBUG = "true";
    log("no data");
    expect(output).not.toContain("undefined");
  });
});

describe("logError", () => {
  const originalWrite = process.stderr.write;
  let output: string;

  beforeEach(() => {
    output = "";
    process.stderr.write = ((chunk: string) => {
      output += chunk;
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    process.env.GOOPSPEC_DEBUG = undefined;
  });

  it("always emits regardless of GOOPSPEC_DEBUG", () => {
    process.env.GOOPSPEC_DEBUG = undefined;
    logError("something broke");
    expect(output).toContain("[goopspec:pi:error]");
    expect(output).toContain("something broke");
  });

  it("includes Error message when an Error is provided", () => {
    logError("failed", new Error("bad input"));
    expect(output).toContain("bad input");
  });

  it("stringifies non-Error values", () => {
    logError("failed", 42);
    expect(output).toContain("42");
  });

  it("omits error portion when error is undefined", () => {
    logError("just a message");
    expect(output).toContain("just a message");
    expect(output).not.toContain("undefined");
  });
});
