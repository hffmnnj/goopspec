import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getGoopspecDir, getMemoryDbPath, getPackageRoot, getWorkflowDocPath } from "./paths.js";

describe("getGoopspecDir()", () => {
  it("appends .goopspec to the project directory", () => {
    expect(getGoopspecDir("/tmp/project")).toBe(join("/tmp/project", ".goopspec"));
  });
});

describe("getMemoryDbPath()", () => {
  it("returns the memory.db path inside .goopspec", () => {
    const result = getMemoryDbPath("/tmp/project");
    expect(result).toBe(join("/tmp/project", ".goopspec", "memory.db"));
  });
});

describe("getPackageRoot()", () => {
  it("returns a directory that contains a references/ folder", () => {
    const root = getPackageRoot();
    expect(typeof root).toBe("string");
    expect(root.length).toBeGreaterThan(0);
    // The package root should contain the references directory
    expect(existsSync(join(root, "references"))).toBe(true);
  });

  it("returns a directory that contains package.json", () => {
    const root = getPackageRoot();
    expect(existsSync(join(root, "package.json"))).toBe(true);
  });
});

describe("getWorkflowDocPath()", () => {
  it("builds the correct path for a named workflow", () => {
    const result = getWorkflowDocPath("/tmp/project", "feat-auth", "SPEC.md");
    expect(result).toBe(join("/tmp/project", ".goopspec", "feat-auth", "SPEC.md"));
  });

  it("builds the correct path for the default workflow", () => {
    const result = getWorkflowDocPath("/tmp/project", "default", "BLUEPRINT.md");
    expect(result).toBe(join("/tmp/project", ".goopspec", "default", "BLUEPRINT.md"));
  });
});
