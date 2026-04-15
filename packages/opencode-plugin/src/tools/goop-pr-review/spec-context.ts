/**
 * Spec Context Detection
 * Detects availability of .goopspec/SPEC.md and .goopspec/BLUEPRINT.md
 * to determine whether spec-alignment analysis should run.
 *
 * @module tools/goop-pr-review/spec-context
 */

import { existsSync } from "fs";
import { join } from "path";
import type { SpecAvailability } from "./types.js";

const GOOPSPEC_DIR = ".goopspec";
const SPEC_FILENAME = "SPEC.md";
const BLUEPRINT_FILENAME = "BLUEPRINT.md";

/**
 * Detect whether SPEC.md and BLUEPRINT.md exist in the project's .goopspec directory.
 *
 * @param projectDir - Root directory of the project (defaults to cwd)
 * @returns Spec availability state with paths and existence flags
 */
export function detectSpecContext(projectDir: string = process.cwd()): SpecAvailability {
  const specPath = join(projectDir, GOOPSPEC_DIR, SPEC_FILENAME);
  const blueprintPath = join(projectDir, GOOPSPEC_DIR, BLUEPRINT_FILENAME);

  return {
    specExists: existsSync(specPath),
    blueprintExists: existsSync(blueprintPath),
    specPath,
    blueprintPath,
  };
}

/**
 * Whether spec-alignment analysis should run.
 * Requires at least SPEC.md to be present.
 */
export function isSpecModeEnabled(availability: SpecAvailability): boolean {
  return availability.specExists;
}
