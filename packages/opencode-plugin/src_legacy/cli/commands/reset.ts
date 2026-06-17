/**
 * GoopSpec CLI - Reset Command
 * Reset GoopSpec configuration with confirmation
 */
import pc from "picocolors";

import { detectEnvironment, resetSetup } from "../../features/setup/index.js";
import { getGlobalConfigPath } from "../../shared/paths.js";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  outro,
  sectionHeader,
  select,
  showBanner,
  showError,
  showInfo,
  showSuccess,
  showWarning,
  spinner,
} from "../ui.js";

type ResetScope = "global" | "project" | "both";

function handleCancel<T>(value: T | symbol): asserts value is T {
  if (isCancel(value)) {
    cancel("Reset cancelled.");
    process.exit(0);
  }
}

export async function runReset(): Promise<void> {
  const projectDir = process.cwd();
  const globalConfigPath = getGlobalConfigPath();

  try {
    showBanner();
    console.log();
    intro(pc.bold("Reset GoopSpec Configuration"));

    const env = await detectEnvironment(projectDir);
    if (!env.hasGoopspecDir && !env.hasGlobalGoopSpecConfig && !env.hasProjectGoopSpecConfig) {
      showInfo("Nothing to reset - GoopSpec is not configured in this directory.");
      outro("Nothing to do.");
      return;
    }

    sectionHeader("Reset Scope", "📁");
    const scope = await select({
      message: "What do you want to reset?",
      options: [
        { value: "project", label: "Project config only", hint: ".goopspec/config.json" },
        { value: "global", label: "Global config only", hint: globalConfigPath },
        { value: "both", label: "Both", hint: "Global + project configs" },
      ],
      initialValue: "project",
    });
    handleCancel(scope);

    sectionHeader("Data Preservation", "💾");
    const preserveData = await confirm({
      message: "Preserve user data? (memories, history, checkpoints)",
      initialValue: true,
    });
    handleCancel(preserveData);

    console.log();
    showWarning("This will reset GoopSpec configuration to defaults.");
    if (!preserveData) {
      showWarning("User data (memories, history, checkpoints) will be deleted.");
    }

    const confirmReset = await confirm({
      message: pc.red("Are you sure you want to proceed?"),
      initialValue: false,
    });
    handleCancel(confirmReset);

    if (!confirmReset) {
      outro("Reset cancelled.");
      return;
    }

    const s = spinner();
    s.start("Resetting configuration...");

    const result = await resetSetup(projectDir, {
      scope: scope as ResetScope,
      preserveData,
      confirmed: true,
    });

    s.stop(result.success ? "Reset complete." : "Reset finished with errors.");
    console.log();

    if (result.reset.length > 0) {
      sectionHeader("Reset", "🗑️");
      for (const item of result.reset) {
        console.log(pc.dim(`  - ${item}`));
      }
      console.log();
    }

    if (result.preserved.length > 0) {
      sectionHeader("Preserved", "💾");
      for (const item of result.preserved) {
        console.log(pc.dim(`  + ${item}`));
      }
      console.log();
    }

    if (result.errors.length > 0) {
      sectionHeader("Errors", "❌");
      for (const error of result.errors) {
        showError(error);
      }
      console.log();
    }

    if (result.success) {
      showSuccess("Configuration reset successfully.");
      outro("GoopSpec has been reset. Run 'goopspec init' to reconfigure.");
      return;
    }

    outro(pc.red("Reset completed with errors."));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message, "Check file permissions and try again");
    process.exit(1);
  }
}
