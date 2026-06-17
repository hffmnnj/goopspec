import { describe, expect, it } from "bun:test";
import {
  branchNameSchema,
  inferWorkflowIdFromBranch,
  isValidBranchName,
} from "./branch-name.js";

describe("worktree branch name", () => {
  it("accepts valid branch names", () => {
    const validNames = ["feat/my-feature", "fix-something", "main", "release/1.0.0"];
    for (const name of validNames) {
      expect(isValidBranchName(name)).toBe(true);
      expect(branchNameSchema.safeParse(name).success).toBe(true);
    }
  });

  it("rejects invalid branch names", () => {
    const invalidNames = [
      "feat;rm -rf /",
      "feat`cmd`",
      "feat$(evil)",
      "feat|pipe",
      "",
      "-starts-with-dash",
      "ends-with-slash/",
      "has//double-slash",
      "has@{reflog}",
      "has..dots",
      "ends-with.lock",
    ];

    for (const name of invalidNames) {
      expect(branchNameSchema.safeParse(name).success).toBe(false);
    }
  });

  it("returns validation messages for branchNameSchema failures", () => {
    const parsed = branchNameSchema.safeParse("-bad");
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.length).toBeGreaterThan(0);
      expect(parsed.error.issues[0]?.message).toBeTruthy();
    }
  });

  it("infers workflow IDs from branch names", () => {
    expect(inferWorkflowIdFromBranch("feat/my-feature")).toBe("my-feature");
    expect(inferWorkflowIdFromBranch("feature/dark-mode")).toBe("dark-mode");
    expect(inferWorkflowIdFromBranch("bugfix/login-issue")).toBe("login-issue");
    expect(inferWorkflowIdFromBranch("chore/update-deps")).toBe("update-deps");
    expect(inferWorkflowIdFromBranch("fix/null-pointer")).toBe("null-pointer");
    expect(inferWorkflowIdFromBranch("main")).toBe("main");
    expect(inferWorkflowIdFromBranch("feat/MY_FEATURE")).toBe("my-feature");
    expect(inferWorkflowIdFromBranch("release/1.0.0")).toBe("1-0-0");
  });
});
