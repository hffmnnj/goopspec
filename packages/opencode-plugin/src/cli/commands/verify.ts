/**
 * GoopSpec CLI - Verify Command
 * Runs health checks on all GoopSpec systems
 */
import pc from "picocolors";

import { verifySetup } from "../../features/setup/index.js";
import { sectionHeader, showError, showSuccess, showWarning } from "../ui.js";

export async function runVerify(): Promise<void> {
  const projectDir = process.cwd();

  try {
    console.log(pc.dim("  Running health checks..."));
    console.log();

    const result = await verifySetup(projectDir);

    sectionHeader("Verification Results", "🔍");
    console.log();

    for (const check of result.checks) {
      const icon = check.passed ? pc.green("✓") : pc.red("✗");
      const name = check.passed ? check.name : pc.red(check.name);

      console.log(`  ${icon} ${name}`);
      console.log(pc.dim(`    ${check.message}`));

      if (!check.passed && check.suggestedFix) {
        console.log(pc.yellow(`    -> Fix: ${check.suggestedFix}`));
      }

      console.log();
    }

    sectionHeader("Summary", "📋");
    const { summary } = result;
    console.log(`  Total: ${summary.total}`);
    console.log(`  ${pc.green(`Passed: ${summary.passed}`)}`);

    if (summary.failed > 0) {
      console.log(`  ${pc.red(`Failed: ${summary.failed}`)}`);
    }

    if (summary.warnings > 0) {
      console.log(`  ${pc.yellow(`Warnings: ${summary.warnings}`)}`);
    }

    console.log();

    if (result.success) {
      showSuccess("All checks passed!");
      return;
    }

    showWarning("Some checks failed. See suggested fixes above.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message, "Check file permissions and try again");
    process.exit(1);
  }
}
