import { z } from "zod";

/**
 * Git branch name validation - blocks invalid refs and shell metacharacters.
 * Characters blocked: control chars (0x00-0x1f, 0x7f), ~^:?*[]\\, and shell metacharacters.
 */
export function isValidBranchName(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }

  if (/[~^:?*[\]\\;&|`$()]/.test(name)) return false;
  return true;
}

export const branchNameSchema = z
  .string()
  .min(1, "Branch name cannot be empty")
  .refine((name) => !name.startsWith("-"), {
    message: "Branch name cannot start with '-' (prevents option injection)",
  })
  .refine((name) => !name.startsWith("/") && !name.endsWith("/"), {
    message: "Branch name cannot start or end with '/'",
  })
  .refine((name) => !name.includes("//"), {
    message: "Branch name cannot contain '//'",
  })
  .refine((name) => !name.includes("@{"), {
    message: "Branch name cannot contain '@{' (git reflog syntax)",
  })
  .refine((name) => !name.includes(".."), {
    message: "Branch name cannot contain '..'",
  })
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Control character detection is intentional for security
  .refine((name) => !/[\x00-\x1f\x7f ~^:?*[\]\\]/.test(name), {
    message: "Branch name contains invalid characters",
  })
  .max(255, "Branch name too long")
  .refine((name) => isValidBranchName(name), "Contains invalid git ref characters")
  .refine((name) => !name.startsWith(".") && !name.endsWith("."), "Cannot start or end with dot")
  .refine((name) => !name.endsWith(".lock"), "Cannot end with .lock");

/**
 * Strip common branch prefixes and normalize to kebab-case workflow ID.
 */
export function inferWorkflowIdFromBranch(branchName: string): string {
  const prefixes = [
    "feat/",
    "feature/",
    "fix/",
    "bugfix/",
    "hotfix/",
    "chore/",
    "refactor/",
    "docs/",
    "test/",
    "release/",
  ];

  let name = branchName;
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
      break;
    }
  }

  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
