/**
 * GoopSpec CLI - Memory Command
 * Configure memory system (provider, vector search, distillation)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import pc from "picocolors";

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
import { detectAllDependencies, setupMemoryDependencies } from "../../features/setup/index.js";
import type { MemorySetupInput } from "../../features/setup/types.js";

function handleCancel<T>(value: T | symbol): asserts value is T {
  if (isCancel(value)) {
    cancel("Memory configuration cancelled.");
    process.exit(0);
  }
}

async function loadCurrentConfig(projectDir: string): Promise<Record<string, unknown>> {
  const configPath = join(projectDir, ".goopspec", "config.json");
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

async function saveConfig(projectDir: string, config: Record<string, unknown>): Promise<void> {
  const configPath = join(projectDir, ".goopspec", "config.json");
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export async function runMemory(): Promise<void> {
  try {
    const projectDir = process.cwd();

    showBanner();
    console.log();
    intro(pc.bold("Memory System Configuration"));

    const dependencySpinner = spinner();
    dependencySpinner.start("Detecting dependencies...");
    const deps = await detectAllDependencies();
    dependencySpinner.stop("Dependencies detected.");
    console.log();

    sectionHeader("Current Status", "🧠");

    if (deps.sqliteVec.available) {
      console.log(pc.green("  ✓ Vector search: available"));
    } else {
      console.log(pc.yellow("  ⚠ Vector search: not available"));
      console.log(pc.dim(`    Install: bun add sqlite-vec-${deps.platform.packageSuffix}`));
    }

    const hasLocalEmbeddings = deps.onnxRuntime.available && deps.transformers.available;
    if (hasLocalEmbeddings) {
      console.log(pc.green("  ✓ Local embeddings: available"));
    } else {
      console.log(pc.yellow("  ⚠ Local embeddings: not available"));
      const missing: string[] = [];
      if (!deps.onnxRuntime.available) {
        missing.push("onnxruntime-node");
      }
      if (!deps.transformers.available) {
        missing.push("@huggingface/transformers");
      }
      console.log(pc.dim(`    Install: bun add ${missing.join(" ")}`));
    }
    console.log();

    const action = await select({
      message: "What would you like to do?",
      options: [
        { value: "configure", label: "Configure memory settings" },
        { value: "install", label: "Install missing dependencies" },
        { value: "status", label: "Just view status (done)" },
      ],
      initialValue: "configure",
    });
    handleCancel(action);

    if (action === "status") {
      outro("Memory status shown above.");
      return;
    }

    if (action === "install") {
      const installVec =
        !deps.sqliteVec.available &&
        (await confirm({
          message: "Install sqlite-vec for vector search?",
          initialValue: true,
        }));
      handleCancel(installVec);

      const installEmbeddings =
        !hasLocalEmbeddings &&
        (await confirm({
          message: "Install local embedding dependencies?",
          initialValue: true,
        }));
      handleCancel(installEmbeddings);

      if (installVec || installEmbeddings) {
        const installSpinner = spinner();
        installSpinner.start("Installing dependencies...");

        const memoryConfig: MemorySetupInput = {
          enabled: true,
          embeddings: { provider: "local" },
        };

        const result = await setupMemoryDependencies(
          memoryConfig,
          true,
          {},
          "anthropic/claude-sonnet-4-6",
          true,
        );

        installSpinner.stop("Installation complete.");
        console.log();

        if (result.vectorSearch.enabled) {
          showSuccess("Vector search enabled.");
        } else if (result.vectorSearch.error) {
          showWarning(`Vector search: ${result.vectorSearch.error}`);
        }

        if (result.localEmbeddings.enabled) {
          showSuccess("Local embeddings enabled.");
        } else if (result.localEmbeddings.error) {
          showWarning(`Local embeddings: ${result.localEmbeddings.error}`);
        }

        if (result.degradedFeatures.length > 0) {
          console.log();
          for (const feature of result.degradedFeatures) {
            showWarning(feature);
          }
        }
      }

      outro("Done.");
      return;
    }

    sectionHeader("Memory Configuration", "⚙️");

    const enableMemory = await confirm({
      message: "Enable memory system?",
      initialValue: true,
    });
    handleCancel(enableMemory);

    if (!enableMemory) {
      const config = await loadCurrentConfig(projectDir);
      const existingMemory =
        config.memory && typeof config.memory === "object"
          ? (config.memory as Record<string, unknown>)
          : {};
      config.memory = {
        ...existingMemory,
        enabled: false,
      };
      await saveConfig(projectDir, config);
      showSuccess("Memory system disabled.");
      outro("Done.");
      return;
    }

    const provider = await select({
      message: "Embedding provider:",
      options: [
        { value: "local", label: "Local", hint: "Free, uses ONNX (requires install)" },
        { value: "openai", label: "OpenAI", hint: "Requires OPENAI_API_KEY" },
        { value: "ollama", label: "Ollama", hint: "Local Ollama server" },
      ],
      initialValue: hasLocalEmbeddings ? "local" : "openai",
    });
    handleCancel(provider);

    const enableDistillation = await confirm({
      message: "Enable session distillation (auto-extract learnings)?",
      initialValue: true,
    });
    handleCancel(enableDistillation);

    const config = await loadCurrentConfig(projectDir);
    const existingMemory =
      config.memory && typeof config.memory === "object"
        ? (config.memory as Record<string, unknown>)
        : {};
    const existingEmbeddings =
      existingMemory.embeddings && typeof existingMemory.embeddings === "object"
        ? (existingMemory.embeddings as Record<string, unknown>)
        : {};
    const existingCapture =
      existingMemory.capture && typeof existingMemory.capture === "object"
        ? (existingMemory.capture as Record<string, unknown>)
        : {};

    config.memory = {
      ...existingMemory,
      enabled: true,
      embeddings: {
        ...existingEmbeddings,
        provider,
      },
      capture: {
        ...existingCapture,
        enabled: enableDistillation,
      },
    };
    await saveConfig(projectDir, config);

    console.log();
    showSuccess("Memory configuration saved.");

    if (provider === "local" && !hasLocalEmbeddings) {
      showWarning("Local embeddings not available. Memory will use keyword search only.");
      showInfo("Install: bun add onnxruntime-node @huggingface/transformers");
    }

    outro("Memory configuration complete.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message, "Check file permissions and try again");
    process.exit(1);
  }
}
