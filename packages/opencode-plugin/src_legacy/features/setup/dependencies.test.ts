/**
 * Dependency Detection Tests
 * @module features/setup/dependencies.test
 */

import { describe, it, expect } from "bun:test";
import {
  detectSqliteVec,
  detectOnnxRuntime,
  detectTransformers,
  detectAllDependencies,
} from "./dependencies.js";

describe("dependency detection", () => {
  describe("detectSqliteVec", () => {
    it("returns DependencyStatus structure", async () => {
      const status = await detectSqliteVec();
      
      expect(status).toBeDefined();
      expect(status.name).toBe("sqlite-vec");
      expect(typeof status.available).toBe("boolean");
      expect(status.feature).toBeDefined();
      expect(status.feature).toContain("Vector");
    });

    it("has error message when not available", async () => {
      const status = await detectSqliteVec();
      
      if (!status.available) {
        expect(status.error).toBeDefined();
        expect(typeof status.error).toBe("string");
      }
    });
  });

  describe("detectOnnxRuntime", () => {
    it("returns DependencyStatus structure", async () => {
      const status = await detectOnnxRuntime();
      
      expect(status).toBeDefined();
      expect(status.name).toBe("onnxruntime-node");
      expect(typeof status.available).toBe("boolean");
      expect(status.feature).toBeDefined();
      expect(status.feature).toContain("embedding");
    });
  });

  describe("detectTransformers", () => {
    it("returns DependencyStatus structure", async () => {
      const status = await detectTransformers();
      
      expect(status).toBeDefined();
      expect(status.name).toBe("@huggingface/transformers");
      expect(typeof status.available).toBe("boolean");
      expect(status.feature).toBeDefined();
    });
  });

  describe("detectAllDependencies", () => {
    it("returns AllDependencies structure with all fields", async () => {
      const deps = await detectAllDependencies();
      
      expect(deps).toBeDefined();
      expect(deps.sqliteVec).toBeDefined();
      expect(deps.onnxRuntime).toBeDefined();
      expect(deps.transformers).toBeDefined();
      expect(deps.platform).toBeDefined();
    });

    it("includes platform info", async () => {
      const deps = await detectAllDependencies();
      
      expect(deps.platform.os).toBeDefined();
      expect(deps.platform.arch).toBeDefined();
      expect(deps.platform.runtime).toBe("bun");
    });

    it("runs all detections in parallel", async () => {
      const start = Date.now();
      await detectAllDependencies();
      const duration = Date.now() - start;
      
      // Should complete quickly since detections run in parallel
      // This is a sanity check, not a strict performance test
      expect(duration).toBeLessThan(5000);
    });
  });
});
