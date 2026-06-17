/**
 * Native Dependency Installer
 * Installs optional native extensions with graceful degradation
 * @module features/setup/installer
 */

import { getSqliteVecPackage, getOnnxRuntimePackage, type PlatformInfo } from "./platform.js";
import { categorizeInstallError, type CategorizedError } from "./errors.js";

export interface InstallResult {
  success: boolean;
  package: string;
  error?: string;
  categorizedError?: CategorizedError;
  degradedFeatures?: string[];
}

export interface InstallOptions {
  global?: boolean;
  silent?: boolean;
  timeout?: number;
}

export interface BatchInstallResult {
  results: InstallResult[];
  allSucceeded: boolean;
  degradedFeatures: string[];
}

const DEFAULT_TIMEOUT = 120000; // 2 minutes

/**
 * Install a single package using bun
 */
export async function installDependency(
  packageName: string,
  options: InstallOptions = {}
): Promise<InstallResult> {
  const { global = false, silent = true, timeout = DEFAULT_TIMEOUT } = options;
  
  try {
    const args = ["add", packageName];
    if (global) args.push("--global");
    
    const proc = Bun.spawn(["bun", ...args], {
      stdout: silent ? "ignore" : "inherit",
      stderr: "pipe",
    });
    
    const result = await Promise.race([
      proc.exited,
      new Promise<number>((_, reject) => 
        setTimeout(() => {
          proc.kill();
          reject(new Error(`Install timeout after ${timeout}ms`));
        }, timeout)
      ),
    ]);
    
    if (result !== 0) {
      const stderr = await new Response(proc.stderr).text();
      const errorMsg = stderr.trim() || `Install failed with exit code ${result}`;
      return {
        success: false,
        package: packageName,
        error: errorMsg,
        categorizedError: categorizeInstallError(errorMsg),
      };
    }
    
    return { success: true, package: packageName };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      package: packageName,
      error: errorMsg,
      categorizedError: categorizeInstallError(errorMsg),
    };
  }
}

/**
 * Install sqlite-vec for vector search support
 */
export async function installSqliteVec(
  platform: PlatformInfo,
  options?: InstallOptions
): Promise<InstallResult> {
  const packageName = getSqliteVecPackage(platform);
  const result = await installDependency(packageName, { ...options, global: true });
  
  if (!result.success) {
    result.degradedFeatures = [
      "Vector similarity search disabled",
      "Memory search will use keyword matching only (FTS5)",
    ];
  }
  
  return result;
}

/**
 * Install ONNX runtime for local embeddings
 */
export async function installOnnxRuntime(
  platform: PlatformInfo,
  options?: InstallOptions
): Promise<InstallResult> {
  const packageName = getOnnxRuntimePackage(platform);
  const result = await installDependency(packageName, { ...options, global: true });
  
  if (!result.success) {
    result.degradedFeatures = [
      "Local embedding generation disabled",
      "Configure OpenAI API key for embeddings, or embeddings will be disabled",
    ];
  }
  
  return result;
}

/**
 * Install @huggingface/transformers for ML models
 */
export async function installTransformers(
  options?: InstallOptions
): Promise<InstallResult> {
  const result = await installDependency("@huggingface/transformers", { ...options, global: true });
  
  if (!result.success) {
    result.degradedFeatures = [
      "Local ML models disabled",
      "Embedding generation will require external API",
    ];
  }
  
  return result;
}

/**
 * Install all dependencies for local embeddings
 */
export async function installLocalEmbeddings(
  platform: PlatformInfo,
  options?: InstallOptions
): Promise<BatchInstallResult> {
  const results: InstallResult[] = [];
  const degradedFeatures: string[] = [];
  
  // Install ONNX runtime first
  const onnxResult = await installOnnxRuntime(platform, options);
  results.push(onnxResult);
  if (!onnxResult.success && onnxResult.degradedFeatures) {
    degradedFeatures.push(...onnxResult.degradedFeatures);
  }
  
  // Install transformers
  const transformersResult = await installTransformers(options);
  results.push(transformersResult);
  if (!transformersResult.success && transformersResult.degradedFeatures) {
    degradedFeatures.push(...transformersResult.degradedFeatures);
  }
  
  return {
    results,
    allSucceeded: results.every(r => r.success),
    degradedFeatures,
  };
}

/**
 * Install all optional memory system dependencies
 */
export async function installAllMemoryDependencies(
  platform: PlatformInfo,
  options?: InstallOptions
): Promise<BatchInstallResult> {
  const results: InstallResult[] = [];
  const degradedFeatures: string[] = [];
  
  // Install sqlite-vec for vector search
  const sqliteVecResult = await installSqliteVec(platform, options);
  results.push(sqliteVecResult);
  if (!sqliteVecResult.success && sqliteVecResult.degradedFeatures) {
    degradedFeatures.push(...sqliteVecResult.degradedFeatures);
  }
  
  // Install local embedding dependencies
  const embeddingsResult = await installLocalEmbeddings(platform, options);
  results.push(...embeddingsResult.results);
  degradedFeatures.push(...embeddingsResult.degradedFeatures);
  
  return {
    results,
    allSucceeded: results.every(r => r.success),
    degradedFeatures,
  };
}

/**
 * Format installation results for display
 */
export function formatInstallResults(results: BatchInstallResult): string {
  const lines: string[] = ["## Installation Results", ""];
  
  const categoryIcons: Record<string, string> = {
    network: "🌐",
    permission: "🔒",
    compatibility: "⚙️",
    "not-found": "🔍",
    timeout: "⏱️",
    unknown: "❓",
  };
  
  for (const result of results.results) {
    const icon = result.success ? "✅" : "❌";
    const status = result.success ? "Installed" : "Failed";
    lines.push(`${icon} **${result.package}**: ${status}`);
    
    if (!result.success) {
      // Use categorized error for better feedback
      if (result.categorizedError) {
        const catIcon = categoryIcons[result.categorizedError.category] ?? "❓";
        lines.push(`   ${catIcon} ${result.categorizedError.message}`);
        lines.push(`   💡 ${result.categorizedError.suggestion}`);
        if (result.categorizedError.retryable) {
          lines.push(`   *(This error may be temporary - retry may succeed)*`);
        }
      } else if (result.error) {
        // Fallback to raw error
        const errorMsg = result.error.length > 100 
          ? result.error.substring(0, 100) + "..." 
          : result.error;
        lines.push(`   Error: ${errorMsg}`);
      }
    }
    lines.push("");
  }
  
  if (results.degradedFeatures.length > 0) {
    lines.push("## Feature Degradation");
    lines.push("");
    results.degradedFeatures.forEach(f => lines.push(`- ${f}`));
  }
  
  return lines.join("\n");
}
