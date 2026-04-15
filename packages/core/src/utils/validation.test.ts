import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  directoryExists,
  isGoopSpecProject,
  slugify,
  isValidSlug,
  isValidProjectName,
} from "./validation.js";

describe("directoryExists", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `goopspec-val-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns true for an existing directory", () => {
    expect(directoryExists(testDir)).toBe(true);
  });

  it("returns false for a non-existent path", () => {
    expect(directoryExists(join(testDir, "nope"))).toBe(false);
  });

  it("returns false for a file path", () => {
    const filePath = join(testDir, "file.txt");
    writeFileSync(filePath, "hello");
    expect(directoryExists(filePath)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(directoryExists("")).toBe(false);
  });
});

describe("isGoopSpecProject", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `goopspec-proj-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns true when .goopspec/ directory exists", () => {
    mkdirSync(join(testDir, ".goopspec"));
    expect(isGoopSpecProject(testDir)).toBe(true);
  });

  it("returns false when .goopspec/ does not exist", () => {
    expect(isGoopSpecProject(testDir)).toBe(false);
  });

  it("returns false when .goopspec is a file, not a directory", () => {
    writeFileSync(join(testDir, ".goopspec"), "not a dir");
    expect(isGoopSpecProject(testDir)).toBe(false);
  });

  it("returns false for a non-existent project path", () => {
    expect(isGoopSpecProject(join(testDir, "missing"))).toBe(false);
  });
});

describe("slugify", () => {
  it("converts to lowercase", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("my project name")).toBe("my-project-name");
  });

  it("strips special characters", () => {
    expect(slugify("hello@world!")).toBe("helloworld");
  });

  it("collapses multiple separators", () => {
    expect(slugify("a---b___c   d")).toBe("a-b-c-d");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("handles underscores by converting to hyphens", () => {
    expect(slugify("my_project_name")).toBe("my-project-name");
  });

  it("handles mixed separators", () => {
    expect(slugify("  My - Cool _ Project!  ")).toBe("my-cool-project");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty string for only special characters", () => {
    expect(slugify("@#$%")).toBe("");
  });

  it("preserves numbers", () => {
    expect(slugify("version 2.0")).toBe("version-20");
  });
});

describe("isValidSlug", () => {
  it("accepts simple lowercase slug", () => {
    expect(isValidSlug("hello")).toBe(true);
  });

  it("accepts hyphenated slug", () => {
    expect(isValidSlug("my-project")).toBe(true);
  });

  it("accepts slug with numbers", () => {
    expect(isValidSlug("v2-release")).toBe(true);
  });

  it("accepts numeric-only slug", () => {
    expect(isValidSlug("123")).toBe(true);
  });

  it("rejects uppercase characters", () => {
    expect(isValidSlug("Hello")).toBe(false);
  });

  it("rejects leading hyphen", () => {
    expect(isValidSlug("-hello")).toBe(false);
  });

  it("rejects trailing hyphen", () => {
    expect(isValidSlug("hello-")).toBe(false);
  });

  it("rejects consecutive hyphens", () => {
    expect(isValidSlug("hello--world")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(isValidSlug("hello world")).toBe(false);
  });

  it("rejects underscores", () => {
    expect(isValidSlug("hello_world")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });

  it("rejects special characters", () => {
    expect(isValidSlug("hello@world")).toBe(false);
  });
});

describe("isValidProjectName", () => {
  it("accepts a normal name", () => {
    expect(isValidProjectName("My Project")).toBe(true);
  });

  it("accepts a single character", () => {
    expect(isValidProjectName("a")).toBe(true);
  });

  it("accepts a name at 200 chars", () => {
    expect(isValidProjectName("a".repeat(200))).toBe(true);
  });

  it("rejects a name over 200 chars", () => {
    expect(isValidProjectName("a".repeat(201))).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidProjectName("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(isValidProjectName("   ")).toBe(false);
  });

  it("trims before checking length", () => {
    expect(isValidProjectName("  hello  ")).toBe(true);
  });
});
