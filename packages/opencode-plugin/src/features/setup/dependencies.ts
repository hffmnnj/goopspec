/**
 * Native Dependency Detection Module
 * Detects availability of optional native extensions for memory system
 * @module features/setup/dependencies
 */

import { detectPlatform, type PlatformInfo } from "./platform.js";

/**
 * Status of a single dependency
 */
export interface DependencyStatus {
  name: string;
  available: boolean;
  version?: string;
  error?: string;
  feature: string;
}

/**
 * Aggregated status of all memory system dependencies
 */
export interface AllDependencies {
  sqliteVec: DependencyStatus;
  onnxRuntime: DependencyStatus;
  transformers: DependencyStatus;
  platform: PlatformInfo;
}

/**
 * Check if sqlite-vec is available and working
 */
export async function detectSqliteVec(): Promise<DependencyStatus> {
  try {
    const sqliteVec = await import("sqlite-vec");
    
    // Try to get version if available
    const version = (sqliteVec as { version?: string }).version ?? "unknown";
    
    return {
      name: "sqlite-vec",
      available: true,
      version,
      feature: "Vector similarity search for semantic memory retrieval",
    };
  } catch (error) {
    return {
      name: "sqlite-vec",
      available: false,
      error: error instanceof Error ? error.message : String(error),
      feature: "Vector similarity search for semantic memory retrieval",
    };
  }
}

/**
 * Check if ONNX runtime is available
 */
export async function detectOnnxRuntime(): Promise<DependencyStatus> {
  try {
    // Try to import onnxruntime-node
    await import("onnxruntime-node");
    
    return {
      name: "onnxruntime-node",
      available: true,
      feature: "Local embedding generation (faster, no API calls)",
    };
  } catch (error) {
    return {
      name: "onnxruntime-node",
      available: false,
      error: error instanceof Error ? error.message : String(error),
      feature: "Local embedding generation (faster, no API calls)",
    };
  }
}

/**
 * Check if @huggingface/transformers is available
 */
export async function detectTransformers(): Promise<DependencyStatus> {
  try {
    const transformers = await import("@huggingface/transformers");
    
    // Try to get version if available
    const version = (transformers as { version?: string }).version ?? "unknown";
    
    return {
      name: "@huggingface/transformers",
      available: true,
      version,
      feature: "Local ML models for embedding generation",
    };
  } catch (error) {
    return {
      name: "@huggingface/transformers",
      available: false,
      error: error instanceof Error ? error.message : String(error),
      feature: "Local ML models for embedding generation",
    };
  }
}

/**
 * Detect all memory system dependencies at once
 */
export async function detectAllDependencies(): Promise<AllDependencies> {
  const [sqliteVec, onnxRuntime, transformers] = await Promise.all([
    detectSqliteVec(),
    detectOnnxRuntime(),
    detectTransformers(),
  ]);
  
  return {
    sqliteVec,
    onnxRuntime,
    transformers,
    platform: detectPlatform(),
  };
}

/**
 * Check if vector search is fully available
 */
export function isVectorSearchAvailable(deps: AllDependencies): boolean {
  return deps.sqliteVec.available;
}

/**
 * Check if local embeddings are fully available
 */
export function isLocalEmbeddingsAvailable(deps: AllDependencies): boolean {
  return deps.onnxRuntime.available && deps.transformers.available;
}

/**
 * Get a summary of what features are available/missing
 */
export function getDependencySummary(deps: AllDependencies): {
  vectorSearch: { available: boolean; reason?: string };
  localEmbeddings: { available: boolean; reason?: string };
} {
  const vectorSearch = {
    available: isVectorSearchAvailable(deps),
    reason: !deps.sqliteVec.available ? deps.sqliteVec.error : undefined,
  };
  
  const localEmbeddings = {
    available: isLocalEmbeddingsAvailable(deps),
    reason: !deps.onnxRuntime.available 
      ? deps.onnxRuntime.error 
      : !deps.transformers.available 
        ? deps.transformers.error 
        : undefined,
  };
  
  return { vectorSearch, localEmbeddings };
}

/**
 * Format dependency status for display
 */
export function formatDependencyStatus(deps: AllDependencies): string {
  const lines: string[] = [];
  
  const formatDep = (dep: DependencyStatus) => {
    const icon = dep.available ? "+" : "-";
    const version = dep.version ? ` (v${dep.version})` : "";
    const status = dep.available ? "Available" : `Not available`;
    return `[${icon}] ${dep.name}${version}: ${status}`;
  };
  
  lines.push("## Native Dependencies");
  lines.push("");
  lines.push(formatDep(deps.sqliteVec));
  lines.push(`    Feature: ${deps.sqliteVec.feature}`);
  if (deps.sqliteVec.error) {
    lines.push(`    Error: ${deps.sqliteVec.error}`);
  }
  lines.push("");
  lines.push(formatDep(deps.onnxRuntime));
  lines.push(`    Feature: ${deps.onnxRuntime.feature}`);
  if (deps.onnxRuntime.error) {
    lines.push(`    Error: ${deps.onnxRuntime.error}`);
  }
  lines.push("");
  lines.push(formatDep(deps.transformers));
  lines.push(`    Feature: ${deps.transformers.feature}`);
  if (deps.transformers.error) {
    lines.push(`    Error: ${deps.transformers.error}`);
  }
  
  return lines.join("\n");
}
