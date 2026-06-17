/**
 * Feature Catalog Tests
 * @module features/setup/feature-catalog.test
 */

import { describe, it, expect } from "bun:test";
import {
  MEMORY_FEATURES,
  getFeature,
  getDefaultFeatures,
  isFeatureAvailable,
  formatAllFeatures,
  type FeatureInfo,
} from "./feature-catalog.js";
import type { AllDependencies, DependencyStatus } from "./dependencies.js";

// Helper to create mock dependencies
function createMockDeps(overrides: Partial<{
  sqliteVec: boolean;
  onnxRuntime: boolean;
  transformers: boolean;
}> = {}): AllDependencies {
  const makeDep = (name: string, available: boolean): DependencyStatus => ({
    name,
    available,
    feature: "test feature",
    error: available ? undefined : "not installed",
  });
  
  return {
    sqliteVec: makeDep("sqlite-vec", overrides.sqliteVec ?? false),
    onnxRuntime: makeDep("onnxruntime-node", overrides.onnxRuntime ?? false),
    transformers: makeDep("@huggingface/transformers", overrides.transformers ?? false),
    platform: {
      os: "linux",
      arch: "x64",
      runtime: "bun",
      packageSuffix: "linux-x64",
      description: "Linux x64",
    },
  };
}

describe("feature catalog", () => {
  describe("MEMORY_FEATURES", () => {
    it("contains expected features", () => {
      const featureIds = MEMORY_FEATURES.map(f => f.id);
      
      expect(featureIds).toContain("vector-search");
      expect(featureIds).toContain("local-embeddings");
      expect(featureIds).toContain("distillation");
    });

    it("all features have required fields", () => {
      for (const feature of MEMORY_FEATURES) {
        expect(feature.id).toBeDefined();
        expect(feature.name).toBeDefined();
        expect(feature.description).toBeDefined();
        expect(feature.benefits).toBeInstanceOf(Array);
        expect(feature.benefits.length).toBeGreaterThan(0);
        expect(feature.requirements).toBeInstanceOf(Array);
        expect(typeof feature.optional).toBe("boolean");
        expect(typeof feature.defaultEnabled).toBe("boolean");
      }
    });
  });

  describe("getFeature", () => {
    it("returns feature for valid id", () => {
      const feature = getFeature("vector-search");
      expect(feature).toBeDefined();
      expect(feature?.id).toBe("vector-search");
    });

    it("returns undefined for invalid id", () => {
      const feature = getFeature("nonexistent-feature");
      expect(feature).toBeUndefined();
    });
  });

  describe("getDefaultFeatures", () => {
    it("returns features with defaultEnabled=true", () => {
      const defaults = getDefaultFeatures();
      
      for (const feature of defaults) {
        expect(feature.defaultEnabled).toBe(true);
      }
    });

    it("returns at least one feature", () => {
      const defaults = getDefaultFeatures();
      expect(defaults.length).toBeGreaterThan(0);
    });
  });

  describe("isFeatureAvailable", () => {
    it("vector-search requires sqliteVec", () => {
      const feature = getFeature("vector-search")!;
      
      const withSqliteVec = createMockDeps({ sqliteVec: true });
      const withoutSqliteVec = createMockDeps({ sqliteVec: false });
      
      expect(isFeatureAvailable(feature, withSqliteVec)).toBe(true);
      expect(isFeatureAvailable(feature, withoutSqliteVec)).toBe(false);
    });

    it("local-embeddings requires both onnxRuntime and transformers", () => {
      const feature = getFeature("local-embeddings")!;
      
      const withBoth = createMockDeps({ onnxRuntime: true, transformers: true });
      const withOnlyOnnx = createMockDeps({ onnxRuntime: true, transformers: false });
      const withOnlyTransformers = createMockDeps({ onnxRuntime: false, transformers: true });
      const withNeither = createMockDeps({ onnxRuntime: false, transformers: false });
      
      expect(isFeatureAvailable(feature, withBoth)).toBe(true);
      expect(isFeatureAvailable(feature, withOnlyOnnx)).toBe(false);
      expect(isFeatureAvailable(feature, withOnlyTransformers)).toBe(false);
      expect(isFeatureAvailable(feature, withNeither)).toBe(false);
    });

    it("distillation is always available", () => {
      const feature = getFeature("distillation")!;
      const deps = createMockDeps();
      
      expect(isFeatureAvailable(feature, deps)).toBe(true);
    });
  });

  describe("formatAllFeatures", () => {
    it("returns markdown-formatted string", () => {
      const deps = createMockDeps();
      const explanation = formatAllFeatures(deps);
      
      expect(explanation).toContain("#");
      expect(explanation).toContain("Vector");
      expect(explanation).toContain("Embedding");
    });

    it("shows installed status for available features", () => {
      const deps = createMockDeps({ sqliteVec: true });
      const explanation = formatAllFeatures(deps);
      
      expect(explanation).toContain("Installed");
    });

    it("shows not installed status for unavailable features", () => {
      const deps = createMockDeps({ sqliteVec: false });
      const explanation = formatAllFeatures(deps);
      
      expect(explanation).toContain("Not installed");
    });
  });
});
