import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { log, logError } from "./logger.js";

describe("log()", () => {
  const originalEnv = process.env.GOOPSPEC_DEBUG;
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
    if (originalEnv === undefined) {
      process.env.GOOPSPEC_DEBUG = undefined;
    } else {
      process.env.GOOPSPEC_DEBUG = originalEnv;
    }
  });

  it("is a no-op when GOOPSPEC_DEBUG is not set", () => {
    process.env.GOOPSPEC_DEBUG = undefined;
    log("test message");
    expect(spy).not.toHaveBeenCalled();
  });

  it("is a no-op when GOOPSPEC_DEBUG is not 'true'", () => {
    process.env.GOOPSPEC_DEBUG = "false";
    log("test message");
    expect(spy).not.toHaveBeenCalled();
  });

  it("emits when GOOPSPEC_DEBUG is 'true'", () => {
    process.env.GOOPSPEC_DEBUG = "true";
    log("hello");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("passes data argument when provided", () => {
    process.env.GOOPSPEC_DEBUG = "true";
    log("msg", { key: "val" });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("logError()", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("always emits regardless of GOOPSPEC_DEBUG", () => {
    process.env.GOOPSPEC_DEBUG = undefined;
    logError("failure");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("passes error argument when provided", () => {
    const err = new Error("boom");
    logError("something broke", err);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("works without error argument", () => {
    logError("just a message");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
