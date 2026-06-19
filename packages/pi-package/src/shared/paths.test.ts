import { describe, expect, it } from "bun:test";
import path from "node:path";
import {
  getDbPath,
  getDefaultWorkflowId,
  getGoopspecDir,
  getWorkflowDocDir,
  getWorkflowDocPath,
} from "./paths.js";

describe("getGoopspecDir", () => {
  it("returns .goopspec under the project directory", () => {
    expect(getGoopspecDir("/project")).toBe(path.join("/project", ".goopspec"));
  });
});

describe("getDbPath", () => {
  it("returns goopspec.db inside the .goopspec directory", () => {
    expect(getDbPath("/project")).toBe(path.join("/project", ".goopspec", "goopspec.db"));
  });
});

describe("getWorkflowDocDir", () => {
  it("returns the workflow subdirectory under .goopspec", () => {
    expect(getWorkflowDocDir("/project", "my-workflow")).toBe(
      path.join("/project", ".goopspec", "my-workflow"),
    );
  });
});

describe("getWorkflowDocPath", () => {
  it("converts doc type to uppercase filename", () => {
    expect(getWorkflowDocPath("/project", "wf-1", "spec")).toBe(
      path.join("/project", ".goopspec", "wf-1", "SPEC.md"),
    );
  });

  it("converts adl doc type correctly", () => {
    expect(getWorkflowDocPath("/project", "wf-1", "adl")).toBe(
      path.join("/project", ".goopspec", "wf-1", "ADL.md"),
    );
  });

  it("converts blueprint doc type correctly", () => {
    expect(getWorkflowDocPath("/project", "default", "blueprint")).toBe(
      path.join("/project", ".goopspec", "default", "BLUEPRINT.md"),
    );
  });

  it("converts handoff doc type correctly", () => {
    expect(getWorkflowDocPath("/project", "wf-1", "handoff")).toBe(
      path.join("/project", ".goopspec", "wf-1", "HANDOFF.md"),
    );
  });
});

describe("getDefaultWorkflowId", () => {
  it("returns 'default'", () => {
    expect(getDefaultWorkflowId()).toBe("default");
  });
});
