/**
 * Feature Catalog
 * Explanations and prompts for optional memory system features
 * @module features/setup/feature-catalog
 */

import type { AllDependencies } from "./dependencies.js";

export interface FeatureInfo {
  id: string;
  name: string;
  description: string;
  benefits: string[];
  requirements: string[];
  packages: string[];
  optional: boolean;
  defaultEnabled: boolean;
}

/**
 * Catalog of all optional memory system features
 */
export const MEMORY_FEATURES: FeatureInfo[] = [
  {
    id: "vector-search",
    name: "Vector Similarity Search",
    description: "Enables semantic search across memories using embeddings",
    benefits: [
      "Find related memories even with different wording",
      "Better context retrieval for LLM prompts",
      "Hybrid search combining keywords and meaning",
    ],
    requirements: [
      "sqlite-vec native extension",
      "~50MB disk space for extension",
    ],
    packages: ["sqlite-vec-{platform}"],
    optional: true,
    defaultEnabled: true,
  },
  {
    id: "local-embeddings",
    name: "Local Embedding Generation",
    description: "Generate embeddings locally without API calls",
    benefits: [
      "No API costs for embedding generation",
      "Works offline",
      "Faster for bulk operations",
    ],
    requirements: [
      "ONNX Runtime native bindings",
      "@huggingface/transformers library",
      "~200MB for model download on first use",
    ],
    packages: ["onnxruntime-node", "@huggingface/transformers"],
    optional: true,
    defaultEnabled: true,
  },
  {
    id: "distillation",
    name: "Session Distillation",
    description: "Automatically extract key learnings at end of session",
    benefits: [
      "Captures decisions and observations automatically",
      "Builds knowledge base over time",
      "Reduces manual memory management",
    ],
    requirements: [
      "LLM access (uses configured agent model)",
      "Memory system enabled",
    ],
    packages: [],
    optional: true,
    defaultEnabled: true,
  },
];

/**
 * Get feature by ID
 */
export function getFeature(id: string): FeatureInfo | undefined {
  return MEMORY_FEATURES.find(f => f.id === id);
}

/**
 * Get all features that are enabled by default
 */
export function getDefaultFeatures(): FeatureInfo[] {
  return MEMORY_FEATURES.filter(f => f.defaultEnabled);
}

/**
 * Check if a feature is available based on dependencies
 */
export function isFeatureAvailable(
  feature: FeatureInfo,
  deps: AllDependencies
): boolean {
  switch (feature.id) {
    case "vector-search":
      return deps.sqliteVec.available;
    case "local-embeddings":
      return deps.onnxRuntime.available && deps.transformers.available;
    case "distillation":
      return true; // Always available if memory is enabled
    default:
      return false;
  }
}

/**
 * Get features that need installation
 */
export function getMissingFeatures(deps: AllDependencies): FeatureInfo[] {
  return MEMORY_FEATURES.filter(f => !isFeatureAvailable(f, deps));
}

/**
 * Format feature info for display
 */
export function formatFeatureInfo(feature: FeatureInfo): string {
  const lines: string[] = [];
  
  lines.push(`## ${feature.name}`);
  lines.push(feature.description);
  lines.push("");
  
  lines.push("**Benefits:**");
  feature.benefits.forEach(b => lines.push(`- ${b}`));
  lines.push("");
  
  lines.push("**Requirements:**");
  feature.requirements.forEach(r => lines.push(`- ${r}`));
  
  return lines.join("\n");
}

/**
 * Format all features for display
 */
export function formatAllFeatures(deps?: AllDependencies): string {
  const lines: string[] = ["# Optional Memory Features", ""];
  
  for (const feature of MEMORY_FEATURES) {
    const available = deps ? isFeatureAvailable(feature, deps) : false;
    const status = available ? "Installed" : "Not installed";
    
    lines.push(`## ${feature.name} [${status}]`);
    lines.push(feature.description);
    lines.push("");
    
    lines.push("**Benefits:**");
    feature.benefits.forEach(b => lines.push(`- ${b}`));
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format feature selection summary
 */
export function formatFeatureSelection(
  selectedIds: string[],
  deps: AllDependencies
): string {
  const lines: string[] = ["## Selected Features", ""];
  
  for (const id of selectedIds) {
    const feature = getFeature(id);
    if (!feature) continue;
    
    const available = isFeatureAvailable(feature, deps);
    const icon = available ? "+" : "~";
    const status = available ? "Already available" : "Will be installed";
    
    lines.push(`[${icon}] ${feature.name}: ${status}`);
  }
  
  const notSelected = MEMORY_FEATURES
    .filter(f => !selectedIds.includes(f.id))
    .map(f => f.name);
  
  if (notSelected.length > 0) {
    lines.push("");
    lines.push("**Not selected:**");
    notSelected.forEach(name => lines.push(`- ${name}`));
  }
  
  return lines.join("\n");
}
